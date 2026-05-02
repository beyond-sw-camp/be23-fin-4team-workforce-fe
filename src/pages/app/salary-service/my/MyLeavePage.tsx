/** /app/leave — 휴가 계획 관리 (직원)
 *
 *  - 상단: 연도 선택 + 휴가 신청 버튼
 *  - KPI: 촉진 대상
 *  - 휴가 정책 안내 카드
 *  - 이월 동의
 *  - 받은 촉진 통보 (연도 필터 적용, 인라인 회신)
 *  - 휴가 계획 내역 (연도 필터 적용)
 */
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Empty,
  InputNumber,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  DollarCircleOutlined,
  FileTextOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { approvalApi } from '@/features/approvals/api/approvalApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type {
  CompanyLeaveType,
  LeavePromotionMy,
  LeaveRequest,
  PromotionLogStatusCode,
  PromotionStageCode,
} from '@/features/salary-service/types';
import { PromotionResponseModal } from './components/PromotionResponseModal';

const ACCRUAL_KO: Record<string, string> = {
  FISCAL: '회계연도',
  HIRE_DATE: '입사일',
};

// 결재 상태 한글 + 색상
const APPROVAL_STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
};
const APPROVAL_STATUS_COLOR: Record<string, string> = {
  PENDING: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
};

// 잔여 차감 잔액 유형 한글 (참고용)
const BALANCE_TYPE_KO: Record<string, string> = {
  ANNUAL: '당해 연차',
  MONTHLY: '월차',
  CARRYOVER: '이월 연차',
};

// 휴가 계획 내역 표 행 - LeaveRequest + 휴가종류명 + 묶음 표시용 필드
// 연속된 평일 휴가(주말/공휴일 제외)는 한 행으로 그룹화 (시작일~종료일, 일수 합산)
type LeavePlanRow = LeaveRequest & {
  rowNo: number;
  leaveTypeName: string;
  /** 그룹 시작일 (groupedRange 표시용) */
  groupStartDate?: string;
  /** 그룹 종료일 (groupedRange 표시용) */
  groupEndDate?: string;
  /** 그룹에 포함된 LeaveRequest 개수 */
  groupCount?: number;
  /** 그룹 합산 일수 */
  groupTotalDays?: number;
};

/**
 * 두 휴가일 사이가 모두 비업무일(주말 OR 회사 공휴일) 이면 인접으로 판정.
 * 예: 12/24(목) -> 12/28(월) 사이가 12/25(금:공휴일) + 12/26(토) + 12/27(일) 이면 인접 OK.
 * 사이 길이는 보통 1~5일이라 O(k) 단순 순회로 충분.
 */
function isAdjacentBusinessDay(
  prevEnd: string,
  nextStart: string,
  holidays: Set<string>,
): boolean {
  const prev = dayjs(prevEnd);
  const next = dayjs(nextStart);
  if (!prev.isValid() || !next.isValid()) return false;
  const diff = next.diff(prev, 'day');
  if (diff <= 0) return false;
  if (diff === 1) return true;
  // 사이의 모든 날이 주말이거나 공휴일이어야 인접
  let cursor = prev.add(1, 'day');
  while (cursor.isBefore(next, 'day')) {
    const dow = cursor.day();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = holidays.has(cursor.format('YYYY-MM-DD'));
    if (!isWeekend && !isHoliday) return false; // 평일+비공휴일 끼어 있으면 끊김
    cursor = cursor.add(1, 'day');
  }
  return true;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD') : String(iso);
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(iso);
}

const STAGE_KO: Record<string, string> = { FIRST: '1차', SECOND: '2차' };

function promotionStatusTag(status: PromotionLogStatusCode, stage?: PromotionStageCode) {
  if (status === 'ACKNOWLEDGED') return <Tag color="green">회신 완료</Tag>;
  if (status === 'DESIGNATED') return <Tag color="red">회사 자동 지정</Tag>;
  if (stage === 'SECOND') {
    // 2차 + SENT - 자동 지정 트리거 실패 또는 처리 직전 상태
    return (
      <Tooltip title="2차 발송 직후 회사 자동 지정이 실행되어야 하나, 현재 SENT 상태로 남아 있습니다. 잠시 후 새로고침하거나 관리자에게 문의해주세요.">
        <Tag color="volcano">자동 지정 대기</Tag>
      </Tooltip>
    );
  }
  return <Tag color="orange">회신 필요</Tag>;
}

export function MyLeavePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const qc = useQueryClient();

  // 연도 필터 - 받은 통보(sentOn) / 휴가 계획 내역(startDate) 기준
  const [year, setYear] = useState<number>(() => dayjs().year());

  // 촉진 회신 모달 대상
  const [promotionTarget, setPromotionTarget] = useState<LeavePromotionMy | null>(null);

  // 전자결재 휴가신청서 문서 양식 조회 deep link 용
  const approvalDocsQ = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });

  // 휴가/연차 신청서 양식 docId 조회 (BE 기본 양식명: "연차신청서")
  const leaveRequestDocId = useMemo(() => {
    const docs = approvalDocsQ.data ?? [];
    // 정확 일치 우선
    const exactCandidates = ['휴가 신청서', '연차신청서', '연차 신청서', '휴가신청서'];
    for (const name of exactCandidates) {
      const hit = docs.find((d) => d.documentName.trim() === name);
      if (hit) return hit.documentId;
    }
    // fuzzy - "휴가" 또는 "연차" + "신청"
    const fuzzy = docs.find(
      (d) =>
        (d.documentName.includes('휴가') || d.documentName.includes('연차')) &&
        d.documentName.includes('신청'),
    );
    return fuzzy?.documentId;
  }, [approvalDocsQ.data]);

  // 휴가신청 버튼 핸들러 전자결재 휴가신청서 양식으로 이동
  const handleNewLeaveRequest = () => {
    if (leaveRequestDocId) {
      void navigate({
        to: '/app/approvals',
        search: {
          tab: 'compose',
          docId: leaveRequestDocId,
        },
      });
      return;
    }
    if (approvalDocsQ.isLoading) {
      message.info('결재 양식을 불러오는 중입니다 잠시 후 다시 시도해 주세요');
      return;
    }
    // 양식이 등록되지 않은 경우 결재 작성 화면으로만 이동 사용자가 양식 직접 선택
    message.warning('휴가 신청서 양식이 등록되지 않았습니다 전자결재에서 직접 선택해 주세요');
    void navigate({
      to: '/app/approvals',
      search: {},
    });
  };

  const balanceQ = useQuery({
    queryKey: ['salary', 'member-balance', 'mine'],
    queryFn: () => attendanceApi.memberBalance.listMine(),
  });

  const policyQ = useQuery({
    queryKey: ['salary', 'leave-policies'],
    queryFn: () => attendanceApi.leavePolicy.list(),
  });

  // 휴가 계획 회신 응답 받지 못한 또는 진행 중인 촉진 건수
  const promotionQ = useQuery({
    queryKey: ['salary', 'leave-promotion', 'mine'],
    queryFn: () => attendanceApi.leavePromotion.listMy(),
  });

  // 페이지 진입 시 viewedAt이 null 인 통보를 일괄 markViewed
  // 한 번 호출된 promotionLogId 는 세션 내에서 재호출 안 함 (중복 네트워크 방지)
  const viewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const list = promotionQ.data ?? [];
    const targets = list.filter((p) => !p.viewedAt && !viewedRef.current.has(p.promotionLogId));
    if (targets.length === 0) return;
    targets.forEach((p) => viewedRef.current.add(p.promotionLogId));
    Promise.all(
      targets.map((p) =>
        attendanceApi.leavePromotion.markViewed(p.promotionLogId).catch(() => undefined),
      ),
    ).then(() => {
      // 표시되는 viewedAt 갱신용 - 캐시 invalidate
      void qc.invalidateQueries({ queryKey: ['salary', 'leave-promotion', 'mine'] });
    });
  }, [promotionQ.data, qc]);

  // 촉진 회신 mutation
  const respondM = useMutation({
    mutationFn: ({ id, dates }: { id: string; dates: string[] }) =>
      attendanceApi.leavePromotion.respond(id, { plannedDates: dates }),
    onSuccess: () => {
      message.success('회신이 완료되었습니다');
      setPromotionTarget(null);
      void qc.invalidateQueries({ queryKey: ['salary', 'leave-promotion', 'mine'] });
    },
    onError: (e: Error) => message.error(e.message || '회신 처리에 실패했습니다'),
  });

  // 이월 동의 / 철회 mutation - 에러 메시지 노출 + 캐시 갱신
  const carryoverConsentM = useMutation({
    mutationFn: ({ id, agree }: { id: string; agree: boolean }) =>
      agree
        ? attendanceApi.memberBalance.agreeCarryover(id)
        : attendanceApi.memberBalance.revokeCarryoverConsent(id),
    onSuccess: (_, vars) => {
      message.success(vars.agree ? '이월 동의가 접수되었습니다' : '이월 동의가 철회되었습니다');
      void balanceQ.refetch();
    },
    onError: (e: Error) => message.error(e.message || '처리에 실패했습니다'),
  });

  // 휴가 종류 마스터 휴가 신청 행에 휴가종류명 매핑
  const leaveTypesQ = useQuery({
    queryKey: ['attendance', 'company-leave-types'],
    queryFn: () => attendanceApi.companyLeaveType.list(),
  });

  // 휴가 계획 신청 내용 (내 LeaveRequest 이력)
  const requestsQ = useQuery({
    queryKey: ['salary', 'leave-requests', 'my'],
    queryFn: () => attendanceApi.leaveRequest.listMyHistory({ page: 0, size: 100 }),
  });

  // 회사 공휴일 - 휴가 그룹화 시 공휴일 점프(예: 12/24 -> 12/28) 인접 판정에 사용
  const companyHolidaysQ = useQuery({
    queryKey: ['attendance', 'company-holidays'],
    queryFn: () => attendanceApi.companyHoliday.list(),
    staleTime: 5 * 60_000,
  });
  const holidaySet = useMemo(() => {
    const s = new Set<string>();
    (companyHolidaysQ.data ?? []).forEach((h) => {
      const d = (h as unknown as { holidayDate?: string }).holidayDate;
      if (d) s.add(d);
    });
    return s;
  }, [companyHolidaysQ.data]);

  const balances = balanceQ.data ?? [];

  // 연도 필터된 받은 통보 (sentOn 기준)
  const promotionsOfYear = useMemo(() => {
    return (promotionQ.data ?? []).filter((p) => {
      const d = dayjs(p.sentOn);
      return d.isValid() && d.year() === year;
    });
  }, [promotionQ.data, year]);

  // 같은 만료일에 2차 통보가 이미 있는지 (1차 회신 버튼 비활성화 조건)
  const expirationsWithSecond = useMemo(() => {
    const set = new Set<string>();
    promotionsOfYear.forEach((r) => {
      if (r.stage === 'SECOND' && r.balanceExpirationDate) set.add(r.balanceExpirationDate);
    });
    return set;
  }, [promotionsOfYear]);

  // 촉진 대상 분해 - 같은 만료일 잔고 단위로 집계
  // scope = 잔여 - 이월 동의분 (촉진 가능 총량)
  // planned = 회신한 plannedDates + 자동 지정 designatedDates (사용 계획 확정분)
  // unplanned = scope - planned (아직 계획 미정인 일수, 회사 강제 지정 잠재 대상)
  const promotionBreakdown = useMemo<{
    scope: number; // 촉진 가능 총량
    planned: number; // 회신 + 자동지정 합
    unplanned: number; // 미계획
  }>(() => {
    const policy = (policyQ.data ?? []).find((p) => p.policyId);
    const carryCap = policy?.isCarryoverYn === 'Y' ? policy?.carryoverDays ?? 0 : 0;

    // expirationDate -> consented 여부 매핑
    const consentedByExp = new Map<string, boolean>();
    balances.forEach((b) => {
      if (b.balanceType !== 'ANNUAL') return;
      if (!b.expirationDate) return;
      consentedByExp.set(b.expirationDate, b.carryoverConsentYn === 'Y');
    });

    // 잔고별 집계 (key = balanceExpirationDate)
    const byBalance = new Map<string, { scope: number; planned: number }>();
    promotionsOfYear.forEach((p) => {
      const key = p.balanceExpirationDate ?? p.promotionLogId;
      if (!byBalance.has(key)) {
        const raw = p.remainingDays ?? 0;
        const consented = p.balanceExpirationDate
          ? consentedByExp.get(p.balanceExpirationDate) === true
          : false;
        const scope = consented ? Math.max(raw - Math.min(raw, carryCap), 0) : raw;
        byBalance.set(key, { scope, planned: 0 });
      }
      const slot = byBalance.get(key)!;
      // 같은 잔고 내 1차(ACK) + 2차(DESIG) 일수는 비중복이라 합산
      const ackCount = p.status === 'ACKNOWLEDGED' ? p.plannedDates?.length ?? 0 : 0;
      const desCount = p.status === 'DESIGNATED' ? p.designatedDates?.length ?? 0 : 0;
      slot.planned += ackCount + desCount;
    });

    let scope = 0, planned = 0;
    byBalance.forEach((v) => {
      scope += v.scope;
      planned += Math.min(v.planned, v.scope);
    });
    return {
      scope,
      planned,
      unplanned: Math.max(scope - planned, 0),
    };
  }, [promotionsOfYear, balances, policyQ.data]);
  // 호환용 - 기존 변수명 유지
  const totalPromoted = promotionBreakdown.unplanned;

  // 계획 신청 기한 - 가장 임박한 1차 SENT 의 2차 발송 예정일 (= balance.expirationDate - promotion2ndBeforeDays)
  // 1차 미회신 + 2차 미발송 인 잔고가 회신 가능한 마감일
  const planSubmitDeadline = useMemo<string | null>(() => {
    const policy = (policyQ.data ?? []).find((p) => p.policyId);
    const second = policy?.promotion2ndBeforeDays;
    if (!second || second <= 0) return null;
    const candidates: string[] = [];
    promotionsOfYear.forEach((p) => {
      if (p.stage !== 'FIRST' || p.status !== 'SENT') return;
      if (!p.balanceExpirationDate) return;
      // 같은 만료일에 2차 이미 발송됐으면 회신 마감 종료
      if (expirationsWithSecond.has(p.balanceExpirationDate)) return;
      const d = dayjs(p.balanceExpirationDate).subtract(second, 'day');
      if (d.isValid()) candidates.push(d.format('YYYY-MM-DD'));
    });
    if (candidates.length === 0) return null;
    candidates.sort();
    return candidates[0] ?? null;
  }, [promotionsOfYear, policyQ.data, expirationsWithSecond]);

  // 촉진 안내 수신 - 가장 최근 단계 + 열람 여부 보조 표시
  const promotionReceiveStatus = useMemo<{
    label: string;
    tone: 'red' | 'orange' | 'blue' | 'gray';
    sub?: string;
  }>(() => {
    if (promotionsOfYear.length === 0) return { label: '미수신', tone: 'gray' };
    const hasSecond = promotionsOfYear.some((p) => p.stage === 'SECOND');
    const hasAck = promotionsOfYear.some((p) => p.status === 'ACKNOWLEDGED');
    const hasDesignated = promotionsOfYear.some((p) => p.status === 'DESIGNATED');
    // 열람 여부 - 가장 최근 단계 통보의 viewedAt 기준
    const latestStageRows = promotionsOfYear
      .filter((p) => (hasSecond ? p.stage === 'SECOND' : p.stage === 'FIRST'))
      .sort((a, b) => (b.sentOn ?? '').localeCompare(a.sentOn ?? ''));
    const latest = latestStageRows[0];
    const sub = latest?.viewedAt
      ? `열람 ${dayjs(latest.viewedAt).format('YYYY-MM-DD HH:mm')}`
      : '미열람';
    if (hasDesignated) return { label: '2차 자동 지정', tone: 'red', sub };
    if (hasSecond) return { label: '2차 수신', tone: 'orange', sub };
    if (hasAck) return { label: '1차 회신 완료', tone: 'blue', sub };
    return { label: '1차 수신', tone: 'orange', sub };
  }, [promotionsOfYear]);

  const activePolicy = useMemo(
    () => (policyQ.data ?? []).find((p) => p.policyId),
    [policyQ.data],
  );

  const leaveTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    (leaveTypesQ.data ?? []).forEach((t: CompanyLeaveType) => {
      if (t.companyLeaveTypeId) map.set(t.companyLeaveTypeId, t.name ?? '—');
    });
    return map;
  }, [leaveTypesQ.data]);

  // 휴가 계획 내역 - 연속된 평일 휴가를 한 행으로 그룹화 (성능 O(n))
  // 같은 휴가종류 + 같은 결재상태 + 같은 사유 + 평일 인접(주말 점프 허용) 조건 충족 시 묶음
  // 연도 필터 적용 - startDate 의 연도가 선택 연도와 일치하는 항목만
  const planRows: LeavePlanRow[] = useMemo(() => {
    const items = (requestsQ.data?.content ?? []).filter((r) => {
      const d = dayjs(r.startDate);
      return d.isValid() && d.year() === year;
    });
    if (items.length === 0) return [];

    // 1. 시작일 오름차순 정렬 (그룹화 위해)
    const ascSorted = [...items].sort((a, b) =>
      (a.startDate ?? '').localeCompare(b.startDate ?? ''),
    );

    // 2. O(n) 한 번 순회로 그룹 생성
    type Group = {
      first: LeaveRequest;
      lastEnd: string;
      count: number;
      totalDays: number;
    };
    const groups: Group[] = [];
    for (const cur of ascSorted) {
      const last = groups[groups.length - 1];
      const sameMeta =
        last &&
        last.first.companyLeaveTypeId === cur.companyLeaveTypeId &&
        last.first.approvalStatus === cur.approvalStatus &&
        (last.first.reason ?? '') === (cur.reason ?? '');
      const adjacent =
        last && cur.startDate && isAdjacentBusinessDay(last.lastEnd, cur.startDate, holidaySet);
      if (sameMeta && adjacent) {
        last.lastEnd = cur.endDate ?? cur.startDate ?? last.lastEnd;
        last.count += 1;
        last.totalDays += cur.usageDays ?? 0;
      } else {
        groups.push({
          first: cur,
          lastEnd: cur.endDate ?? cur.startDate ?? '',
          count: 1,
          totalDays: cur.usageDays ?? 0,
        });
      }
    }

    // 3. 최근 시작일 위로 정렬 + LeavePlanRow 매핑
    const desc = [...groups].sort((a, b) =>
      (b.first.startDate ?? '').localeCompare(a.first.startDate ?? ''),
    );
    return desc.map((g, idx) => ({
      ...g.first,
      rowNo: idx + 1,
      leaveTypeName: g.first.companyLeaveTypeId
        ? leaveTypeMap.get(g.first.companyLeaveTypeId) ?? '—'
        : '—',
      groupStartDate: g.first.startDate,
      groupEndDate: g.lastEnd,
      groupCount: g.count,
      groupTotalDays: g.totalDays,
    }));
  }, [requestsQ.data, leaveTypeMap, holidaySet, year]);

  const planColumns: ColumnsType<LeavePlanRow> = [
    {
      title: 'No',
      dataIndex: 'rowNo',
      key: 'rowNo',
      width: 60,
      align: 'center',
    },
    {
      title: '상태',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 90,
      align: 'center',
      render: (s?: string) => {
        const code = s ?? 'PENDING';
        return (
          <Tag color={APPROVAL_STATUS_COLOR[code] ?? 'default'}>
            {APPROVAL_STATUS_KO[code] ?? code}
          </Tag>
        );
      },
    },
    {
      title: '휴가 종류',
      dataIndex: 'leaveTypeName',
      key: 'leaveTypeName',
      width: 140,
      render: (v: string) => <strong>{v}</strong>,
    },
    {
      title: '기간',
      key: 'range',
      width: 200,
      align: 'center',
      render: (_: unknown, r: LeavePlanRow) => {
        const start = r.groupStartDate ?? r.startDate;
        const end = r.groupEndDate ?? r.endDate;
        if (!start) return <Typography.Text type="secondary">—</Typography.Text>;
        if (!end || start === end) return formatDate(start);
        return `${formatDate(start)} ~ ${formatDate(end)}`;
      },
    },
    {
      title: '일수',
      key: 'days',
      width: 90,
      align: 'right',
      render: (_: unknown, r: LeavePlanRow) => {
        const total = r.groupTotalDays ?? r.usageDays ?? 0;
        if (total <= 0) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <span>
            {total}일
            {(r.groupCount ?? 1) > 1 && (
              <Typography.Text type="secondary" className="!tw-ml-1 !tw-text-[11px]">
                ({r.groupCount}건 묶음)
              </Typography.Text>
            )}
          </span>
        );
      },
    },
    {
      title: '차감 잔액',
      dataIndex: 'deductedBalanceType',
      key: 'deductedBalanceType',
      width: 110,
      render: (v?: string | null) =>
        v ? BALANCE_TYPE_KO[v] ?? v : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '비고',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      render: (v?: string | null) =>
        v && v.length > 0 ? (
          v
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={2} className="!tw-m-0 !tw-text-slate-900">
            휴가 계획 관리
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            연도별 촉진 통보 / 휴가 계획 / 이월 동의를 한 곳에서 관리합니다.
          </Typography.Paragraph>
        </div>
        <Space size="small" wrap>
          <Space size={4}>
            <Typography.Text type="secondary" className="!tw-text-xs">근무년도</Typography.Text>
            <InputNumber
              size="small"
              min={2020}
              max={2100}
              value={year}
              onChange={(v) => typeof v === 'number' && setYear(v)}
              style={{ width: 90 }}
            />
          </Space>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleNewLeaveRequest}
            loading={approvalDocsQ.isLoading}
          >
            휴가 신청
          </Button>
          {user?.isSystemAdmin && (
            <Link to="/app/leave/policies" className="tw-font-medium tw-text-[#2563EB]">
              연차 정책
            </Link>
          )}
        </Space>
      </div>

      {/* 상단 KPI - 이월 동의 / 촉진 대상 / 계획 신청 기한 / 촉진 안내 수신 */}
      <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3">
        {/* 이월 동의 - 회사 정책 ON 일 때만 표시. 잔고별 동의 버튼 인라인 */}
        {activePolicy?.isCarryoverConsentYn === 'Y' && (() => {
          const carryRows = balances.filter((b) => b.balanceType === 'ANNUAL' && (b.remaining ?? 0) > 0);
          // 만료년도 - 가장 빠른 만료일 기준 (보통 잔고 1개)
          const expYear = carryRows
            .map((b) => (b.expirationDate ? dayjs(b.expirationDate).year() : null))
            .filter((y): y is number => y != null)
            .sort()[0];
          const cap = activePolicy.isCarryoverYn === 'Y' ? activePolicy.carryoverDays ?? 0 : 0;
          return (
            <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-4 tw-py-3">
              <div className="tw-text-[13px] tw-text-slate-500">
                {expYear ? `${expYear}년 연차 이월 동의` : '연차 이월 동의'}
                {cap > 0 && (
                  <span className="!tw-ml-1 tw-text-slate-400">(최대 {cap}일)</span>
                )}
              </div>
              <div className="tw-mt-1.5 tw-flex tw-flex-col tw-gap-1">
                {carryRows.length === 0 ? (
                  <span className="tw-text-slate-400 tw-text-sm">—</span>
                ) : (
                  carryRows.map((b) => {
                    const consented = b.carryoverConsentYn === 'Y';
                    return (
                      <div key={b.memberBalanceId} className="tw-flex tw-items-center tw-gap-1.5">
                        <span className="tw-text-base tw-font-semibold tw-text-slate-800">{b.remaining}일</span>
                        {consented && (
                          <Tag color="green" className="!tw-m-0 !tw-text-[11px] !tw-leading-4 !tw-px-1.5">동의</Tag>
                        )}
                        <Button
                          size="small"
                          type={consented ? 'default' : 'primary'}
                          danger={consented}
                          loading={carryoverConsentM.isPending}
                          onClick={() => {
                            if (!b.memberBalanceId) return;
                            carryoverConsentM.mutate({ id: b.memberBalanceId, agree: !consented });
                          }}
                          className="!tw-text-xs !tw-h-6 !tw-px-2 !tw-ml-auto"
                        >
                          {consented ? '철회' : '동의'}
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}
        <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-4 tw-py-3">
          <div className="tw-text-[13px] tw-text-slate-500">{year}년 촉진 대상</div>
          <div className="tw-mt-1.5 tw-flex tw-flex-wrap tw-items-baseline tw-gap-x-3 tw-gap-y-0.5">
            <span className="tw-text-base">
              <span className="tw-text-slate-500">계획 </span>
              <span className="tw-text-emerald-600 tw-font-bold">{promotionBreakdown.planned}일</span>
            </span>
            <span className="tw-text-base">
              <span className="tw-text-slate-500">미정 </span>
              <span className={`tw-font-bold ${totalPromoted > 0 ? 'tw-text-[#dc2626]' : 'tw-text-slate-400'}`}>{totalPromoted}일</span>
            </span>
            <span className="tw-text-sm tw-text-slate-400">/ 총 {promotionBreakdown.scope}일</span>
          </div>
        </div>
        <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-4 tw-py-3">
          <div className="tw-text-[13px] tw-text-slate-500">계획 신청 기한</div>
          <div className="tw-mt-1.5 tw-text-lg tw-font-bold tw-text-slate-800">
            {planSubmitDeadline ? (
              <>
                {planSubmitDeadline}
                <span className="tw-ml-2 tw-text-sm tw-font-normal tw-text-slate-500">까지</span>
              </>
            ) : (
              <span className="tw-text-slate-400">—</span>
            )}
          </div>
        </div>
        <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-4 tw-py-3">
          <div className="tw-text-[13px] tw-text-slate-500">촉진 안내 수신</div>
          <div className="tw-mt-1.5">
            <Tag
              color={
                promotionReceiveStatus.tone === 'red' ? 'red'
                  : promotionReceiveStatus.tone === 'orange' ? 'orange'
                  : promotionReceiveStatus.tone === 'blue' ? 'blue'
                  : 'default'
              }
              className="!tw-text-sm !tw-px-2 !tw-py-0.5"
            >
              {promotionReceiveStatus.label}
            </Tag>
            {promotionReceiveStatus.sub && (
              <div className="tw-mt-1 tw-text-[12px] tw-text-slate-500">{promotionReceiveStatus.sub}</div>
            )}
          </div>
        </div>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="휴가 정책 안내" size="small">
        {activePolicy ? (
          <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3">
            {/* 발생 기준 */}
            <div className="tw-flex tw-items-start tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/50 tw-px-3 tw-py-2.5">
              <CalendarOutlined className="!tw-text-blue-500 tw-text-base tw-mt-0.5" />
              <div className="tw-flex tw-flex-col tw-leading-tight">
                <span className="tw-text-[11px] tw-text-slate-500">발생 기준</span>
                <span className="tw-text-sm tw-font-semibold tw-text-slate-800">
                  {ACCRUAL_KO[activePolicy.accrualBase ?? ''] ?? activePolicy.accrualBase ?? '-'}
                </span>
              </div>
            </div>
            {/* 기본 연차 */}
            <div className="tw-flex tw-items-start tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/50 tw-px-3 tw-py-2.5">
              <FileTextOutlined className="!tw-text-emerald-500 tw-text-base tw-mt-0.5" />
              <div className="tw-flex tw-flex-col tw-leading-tight">
                <span className="tw-text-[11px] tw-text-slate-500">기본 연차</span>
                <span className="tw-text-sm tw-font-semibold tw-text-slate-800">
                  {activePolicy.defaultAnnualDays ?? 0}일
                </span>
              </div>
            </div>
            {/* 이월 */}
            <div className="tw-flex tw-items-start tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/50 tw-px-3 tw-py-2.5">
              <SwapOutlined className="!tw-text-amber-500 tw-text-base tw-mt-0.5" />
              <div className="tw-flex tw-flex-col tw-leading-tight">
                <span className="tw-text-[11px] tw-text-slate-500">이월</span>
                <span className="tw-text-sm tw-font-semibold tw-text-slate-800">
                  {activePolicy.isCarryoverYn === 'Y'
                    ? `가능 · ${activePolicy.carryoverDays ?? 0}일`
                    : '불가'}
                </span>
              </div>
            </div>
            {/* 정산 지급 */}
            <div className="tw-flex tw-items-start tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/50 tw-px-3 tw-py-2.5">
              <DollarCircleOutlined className="!tw-text-violet-500 tw-text-base tw-mt-0.5" />
              <div className="tw-flex tw-flex-col tw-leading-tight">
                <span className="tw-text-[11px] tw-text-slate-500">정산 지급</span>
                <span className="tw-text-sm tw-font-semibold tw-text-slate-800">
                  {activePolicy.isPayoutYn === 'Y' ? '가능' : '불가'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Typography.Text type="secondary">등록된 연차 정책이 없습니다.</Typography.Text>
        )}
      </Card>


      {/* 촉진 알림 내역 - 인라인 회신 (구 휴가 계획 회신 페이지 통합) */}
      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        size="small"
        title={
          <Space>
            <span>촉진 알림 내역</span>
            <Typography.Text type="secondary" className="tw-text-xs">
              {year}년 / 목록 {promotionsOfYear.length} 건
            </Typography.Text>
          </Space>
        }
      >
        <Table<LeavePromotionMy>
          rowKey={(r) => r.promotionLogId}
          loading={promotionQ.isLoading}
          size="small"
          dataSource={promotionsOfYear}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description={`${year}년 받은 통보가 없습니다`} /> }}
          columns={[
            {
              title: '단계',
              dataIndex: 'stage',
              key: 'stage',
              width: 70,
              align: 'center',
              render: (s: PromotionStageCode) => (
                <Tag color={s === 'FIRST' ? 'blue' : 'volcano'}>{STAGE_KO[s] ?? s}</Tag>
              ),
            },
            {
              title: '상태',
              dataIndex: 'status',
              key: 'status',
              width: 110,
              align: 'center',
              render: (_: PromotionLogStatusCode, r) => promotionStatusTag(r.status, r.stage),
            },
            {
              title: '잔여 연차',
              dataIndex: 'remainingDays',
              key: 'remainingDays',
              width: 100,
              align: 'right',
              render: (n: number | null | undefined) =>
                typeof n === 'number' ? `${n}일` : '—',
            },
            {
              title: '만료일',
              dataIndex: 'balanceExpirationDate',
              key: 'balanceExpirationDate',
              width: 120,
              align: 'center',
              render: (d?: string | null) => formatDate(d),
            },
            {
              title: '발송일',
              dataIndex: 'sentOn',
              key: 'sentOn',
              width: 120,
              align: 'center',
              render: (d?: string | null) => formatDate(d),
            },
            {
              title: '열람 시각',
              dataIndex: 'viewedAt',
              key: 'viewedAt',
              width: 150,
              render: (d?: string | null) =>
                d ? (
                  formatDateTime(d)
                ) : (
                  <Typography.Text type="secondary" className="!tw-text-xs">미열람</Typography.Text>
                ),
            },
            {
              title: '회신 시각',
              dataIndex: 'acknowledgedAt',
              key: 'acknowledgedAt',
              width: 150,
              render: (d?: string | null) => formatDateTime(d),
            },
            {
              title: '진행',
              key: 'actions',
              width: 170,
              render: (_, r) => {
                if (r.status === 'SENT' && r.stage === 'FIRST') {
                  const supersededBySecond = r.balanceExpirationDate
                    ? expirationsWithSecond.has(r.balanceExpirationDate)
                    : false;
                  if (supersededBySecond) {
                    return (
                      <Typography.Text type="secondary" className="!tw-text-xs">
                        회신 기간 종료 (2차 발송)
                      </Typography.Text>
                    );
                  }
                  return (
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => setPromotionTarget(r)}
                    >
                      회신하기
                    </Button>
                  );
                }
                if (r.status === 'ACKNOWLEDGED') {
                  return <Typography.Text type="secondary" className="!tw-text-xs">회신 완료</Typography.Text>;
                }
                if (r.status === 'DESIGNATED') {
                  return <Typography.Text type="secondary" className="!tw-text-xs">회사 자동 지정 완료</Typography.Text>;
                }
                return <Typography.Text type="secondary" className="!tw-text-xs">자동 지정 처리중</Typography.Text>;
              },
            },
          ]}
        />
      </Card>

      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        title={
          <Space>
            <span>휴가 계획 내역</span>
            <Typography.Text type="secondary" className="tw-text-xs">
              {year}년 / 목록 {planRows.length} 건
            </Typography.Text>
          </Space>
        }
      >
        <Table<LeavePlanRow>
          rowKey={(r) => r.leaveRequestId ?? `${r.rowNo}`}
          loading={requestsQ.isLoading || leaveTypesQ.isLoading}
          columns={planColumns}
          dataSource={planRows}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          size="small"
          locale={{ emptyText: '조회 결과가 없습니다.' }}
        />
      </Card>

      <PromotionResponseModal
        target={promotionTarget}
        confirmLoading={respondM.isPending}
        onCancel={() => setPromotionTarget(null)}
        onSubmit={(dates) =>
          promotionTarget && respondM.mutate({ id: promotionTarget.promotionLogId, dates })
        }
      />
    </Space>
  );
}
