/**
 * /app/payroll/admin/allowances
 * 관리자 수당 관리
 *
 * - 신규 부여: 신규 입사자에게 자격수당/직책수당 등 개인 차등 수당을 즉시 적용 (autoGrant — AUTO 상태)
 * - 부여 현황: 회사 전체의 수당 부여 상태(승인/대기/반려/자동) 모니터링
 * - 직원별 활성 수당 조회: 특정 직원의 현재 적용 중인 수당 목록
 *
 * 백엔드 API (gateway predicate `/salary/**`):
 *  POST /salary/admin/allowances/auto-grant
 *  GET  /salary/admin/allowances?status=...
 *  GET  /salary/admin/allowances/members/{memberId}/active?date=YYYY-MM-DD
 */
import {
  useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { AppSearchBar } from '@/shared/ui';
import { AppDataTable } from '@/shared/ui/AppDataTable';

import type {
  AllowanceApprovalStatusCode,
  AllowanceMonthlyEntry,
  MemberAllowance,
  SalaryItemTemplate,
} from '@/features/salary-service/types';

/** 디바운스 훅 — 직원 검색 keyword 디바운싱 */
function useDebounced<T>(value: T, delay = 320): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  AUTO: { label: '관리자 즉시 부여', color: 'blue' },
  APPROVED: { label: '승인', color: 'green' },
  PENDING: { label: '대기', color: 'orange' },
  REJECTED: { label: '반려', color: 'red' },
  CANCELLED: { label: '취소', color: 'default' },
};

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 적용 기간 + 만료/임박 상태 판정 */
type AllowanceLifecycle = 'active' | 'soon' | 'expired';
function evalLifecycle(effectiveTo?: string | null): AllowanceLifecycle {
  if (!effectiveTo) return 'active';
  const end = dayjs(effectiveTo).startOf('day');
  const today = dayjs().startOf('day');
  if (end.isBefore(today)) return 'expired';
  if (end.diff(today, 'day') <= 30) return 'soon';
  return 'active';
}

function renderEffectivePeriod(from?: string | null, to?: string | null) {
  const lc = evalLifecycle(to);
  const text = (
    <span className={lc === 'expired' ? 'tw-text-slate-400' : ''}>
      {from ?? '—'} ~ {to ?? '진행중'}
    </span>
  );
  if (lc === 'expired') {
    return (
      <Space size={6}>
        {text}
        <Tag color="default">만료</Tag>
      </Space>
    );
  }
  // 종료 임박 30일 내 주황 태그 노출 안 함 - 만료/진행 중 두 상태만 사용
  return text;
}

/** 직원 검색 기반 select — value 는 memberId */
function MemberSearchSelect({
  value,
  onChange,
  placeholder = '이름·사번·이메일로 검색',
  width = 260,
  setMemberMeta,
}: {
  value?: string;
  onChange?: (memberId: string | undefined) => void;
  placeholder?: string;
  width?: number | string;
  setMemberMeta?: (meta: { name?: string; email?: string } | null) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const debounced = useDebounced(keyword, 320);
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['member', 'search', 'allowance-admin', debounced],
    queryFn: () => memberApi.searchMembersLookup({ keyword: debounced.trim(), page: 0, size: 30 }),
    enabled: debounced.trim().length >= 1,
  });
  return (
    <Select
      showSearch
      allowClear
      style={{ width }}
      value={value}
      placeholder={placeholder}
      filterOption={false}
      onSearch={setKeyword}
      onChange={(v) => {
        const picked = rows.find((r) => r.memberId === v);
        setMemberMeta?.(picked ? { name: picked.name, email: picked.email } : null);
        onChange?.(v as string | undefined);
      }}
      loading={isFetching}
      options={rows.map((m) => ({
        value: m.memberId,
        label: `${m.name ?? '이름 없음'} · ${m.email ?? '—'}`,
      }))}
      notFoundContent={debounced ? '결과 없음' : '키워드 입력'}
    />
  );
}

export function AdminMemberAllowancePage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();

  /* ── 1) 모든 수당 항목 템플릿 — 개인 차등 수당으로 부여 가능한 EARNING 항목.
   *    템플릿은 자주 안 바뀌므로 staleTime 5분. */
  const tplQ = useQuery({
    queryKey: ['salary', 'salary-item-templates', 'allowance'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
    staleTime: 5 * 60_000,
  });
  // 퇴직 정산 cascade 가 자동 생성하는 항목들 - 사직서 승인된 직원에게만 수동 부여 허용
  const RETIREMENT_AUTO_ITEMS = useMemo(
    () => new Set(['퇴직금', '퇴직월 일할 급여', '미사용 연차 수당']),
    [],
  );
  // 수당 관리 탭에 노출 안 할 항목 - 기본급/퇴직성/상여 (수당 성격 아님)
  // 퇴직금, 퇴직월 일할 급여, 미사용 연차 수당 - 퇴직 정산에서 자동 생성
  // 정기상여/성과급/명절상여 - 보너스 정책으로 별도 관리
  const NON_ALLOWANCE_ITEMS = useMemo(
    () =>
      new Set([
        '기본급',
        '퇴직금',
        '퇴직월 일할 급여',
        '미사용 연차 수당',
        '정기상여',
        '성과급',
        '명절상여',
      ]),
    [],
  );
  const allowanceTemplates = useMemo<SalaryItemTemplate[]>(() => {
    const list = tplQ.data ?? [];
    return list.filter(
      (t) => t.itemType === 'EARNING' && !NON_ALLOWANCE_ITEMS.has(t.itemName),
    );
  }, [tplQ.data, NON_ALLOWANCE_ITEMS]);

  /** 필터 dropdown 용 - 진짜 수당 (식대/직책수당/자녀수당 등) 만 노출 */
  const allFilterableTemplates = useMemo<SalaryItemTemplate[]>(() => {
    const list = tplQ.data ?? [];
    return list.filter(
      (t) => t.itemType === 'EARNING' && !NON_ALLOWANCE_ITEMS.has(t.itemName),
    );
  }, [tplQ.data, NON_ALLOWANCE_ITEMS]);

  /** 회사 공통 자동 적용 항목 - fixedAmountYn='Y' + defaultAmount 있는 EARNING */
  const commonAllowanceTemplates = useMemo<SalaryItemTemplate[]>(() => {
    const list = tplQ.data ?? [];
    return list.filter(
      (t) =>
        t.itemType === 'EARNING' &&
        !NON_ALLOWANCE_ITEMS.has(t.itemName) &&
        t.fixedAmountYn === 'Y' &&
        t.defaultAmount != null &&
        t.defaultAmount > 0,
    );
  }, [tplQ.data, NON_ALLOWANCE_ITEMS]);

  /* ── 2) 부여 현황 — 연월 + 상태 + 직원 + 항목 필터 ──
   *    백엔드는 [yearMonth] 의 어느 시점이라도 active 였던 행을 반환 (overlap 체크).
   *    상태는 백엔드 파라미터, 직원/항목은 프론트에서 필터링 (전체 받아온 후 추려서 표시). */
  const [statusFilter, setStatusFilter] = useState<AllowanceApprovalStatusCode | 'ALL'>('ALL');
  const [listMonth, setListMonth] = useState<dayjs.Dayjs>(() => dayjs());
  const [memberKeyword, setMemberKeyword] = useState(''); // 직원 이름 검색 (한 글자 이상이면 필터 동작)
  const [templateFilter, setTemplateFilter] = useState<string | 'ALL'>('ALL');
  const listMonthYm = listMonth.format('YYYY-MM');
  const listQ = useQuery({
    queryKey: ['salary', 'allowance', 'admin', 'list', listMonthYm, statusFilter],
    queryFn: () =>
      salaryApi.memberAllowanceAdmin.listByCompany({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        yearMonth: listMonthYm,
      }),
  });

  // 그 월 회사 PayrollItem 기반 수당 집계 - 회사 공통 + 개인 차등 모두 포함
  // 정산 명세서 PAID = 지급 완료, DRAFT/CONFIRMED = 지급 중
  const monthlyAllowanceQ = useQuery({
    queryKey: ['salary', 'allowance', 'admin', 'monthly', listMonthYm],
    queryFn: () => salaryApi.payroll.findMonthlyAllowance(listMonthYm),
  });

  // PayrollItem 라인 단위 삭제 - DRAFT/CONFIRMED 명세서만 가능 (PAID 차단은 BE도 검증)
  const deletePayrollItemMut = useMutation({
    mutationFn: (payrollItemId: string) => salaryApi.payroll.deleteItem(payrollItemId),
    onSuccess: () => {
      void message.success('수당 라인이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'monthly'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '수당 라인 삭제 실패');
    },
  });

  /* ── 3) 직원 이름 매핑 — 회사 직원 list 1회 조회로 N+1 회피 ──
   *    useMemberDisplayNames 가 내부적으로 membersApi.list({pageSize:500}) 한 번 호출 + 5분 캐시. */
  const memberIdList = useMemo(
    () => (listQ.data ?? []).map((a) => a.memberId).filter((id): id is string => Boolean(id)),
    [listQ.data],
  );
  const { labelFor } = useMemberDisplayNames(memberIdList);

  // 직급/부서 매핑 - 정렬·필터·표시용 (membersApi.list 결과 캐싱)
  const memberInfoQ = useQuery({
    queryKey: ['members', 'allowance-info-map'],
    queryFn: async () => {
      const res = await memberApi.searchMembersLookup({ keyword: '', page: 0, size: 2000 });
      return res;
    },
    staleTime: 5 * 60_000,
  });
  const memberInfoMap = useMemo(() => {
    const map = new Map<string, { name: string; department: string; grade: string }>();
    const items = (memberInfoQ.data as { items?: { id?: string; memberId?: string; name?: string;
      department?: string; jobGradeName?: string }[] } | undefined)?.items ?? [];
    items.forEach((m) => {
      const id = m.id ?? m.memberId;
      if (id) {
        map.set(id, {
          name: m.name ?? '',
          department: m.department ?? '',
          grade: m.jobGradeName ?? '',
        });
      }
    });
    return map;
  }, [memberInfoQ.data]);
  const gradeFor = useCallback(
    (id: string) => memberInfoMap.get(id)?.grade ?? '—',
    [memberInfoMap],
  );

  // 직원/항목 필터 적용된 월 수당 집계 - labelFor 정의 이후로 위치
  // amount=0 인 라인은 제외 (지급 안 받는 항목 노출 X)
  const filteredMonthlyAllowances = useMemo(() => {
    let rows = (monthlyAllowanceQ.data ?? [])
      .map((e) => {
        const items = e.items.filter((it) => (it.amount ?? 0) > 0);
        return {
          ...e,
          items,
          totalAmount: items.reduce((s, it) => s + (it.amount ?? 0), 0),
        };
      })
      .filter((e) => e.items.length > 0);
    const k = memberKeyword.trim().toLowerCase();
    if (k) {
      rows = rows.filter((e) => labelFor(e.memberId).toLowerCase().includes(k));
    }
    if (templateFilter !== 'ALL') {
      const tplName = allFilterableTemplates.find(
        (t) => t.salaryItemTemplateId === templateFilter,
      )?.itemName;
      if (tplName) {
        rows = rows
          .map((e) => {
            const items = e.items.filter((it) => it.itemName === tplName);
            return {
              ...e,
              items,
              totalAmount: items.reduce((s, it) => s + it.amount, 0),
            };
          })
          .filter((e) => e.items.length > 0);
      }
    }
    return rows;
  }, [monthlyAllowanceQ.data, memberKeyword, templateFilter, labelFor, allFilterableTemplates]);

  /* ── 5) 신규 부여 모달 - 다중 행 (직원 × 수당 항목 자유 조합) ── */
  type GrantRow = {
    memberId?: string;
    salaryItemTemplateId?: string;
    amount?: number;
  };
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantForm] = Form.useForm<{
    rows: GrantRow[];
    effectiveFrom: dayjs.Dayjs;
  }>();

  // 단건 mutation - 다중 행 부여 시 Promise.all 로 N번 호출
  const autoGrantMut = useMutation({
    mutationFn: (payload: {
      memberId: string;
      salaryItemTemplateId: string;
      amount: number;
      effectiveFrom: string;
    }) => salaryApi.memberAllowanceAdmin.autoGrant(payload),
  });

  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const onSubmitGrant = async () => {
    try {
      const v = await grantForm.validateFields();
      const effectiveFromStr = v.effectiveFrom.format('YYYY-MM-DD');
      const rows = (v.rows ?? []).filter(
        (r) => r.memberId && r.salaryItemTemplateId && r.amount != null,
      );
      if (rows.length === 0) {
        void message.warning('최소 1행 이상 입력해주세요.');
        return;
      }
      setBulkSubmitting(true);
      const results = await Promise.allSettled(
        rows.map((r) =>
          autoGrantMut.mutateAsync({
            memberId: r.memberId!,
            salaryItemTemplateId: r.salaryItemTemplateId!,
            amount: r.amount!,
            effectiveFrom: effectiveFromStr,
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      setBulkSubmitting(false);
      if (fail === 0) {
        void message.success(`${ok}건 즉시 적용 완료`);
        setGrantOpen(false);
        grantForm.resetFields();
      } else if (ok === 0) {
        void message.error(`${fail}건 모두 실패했습니다. 입력을 확인해주세요.`);
      } else {
        void message.warning(`${ok}건 성공 / ${fail}건 실패. 실패한 행은 다시 부여해주세요.`);
      }
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'list'] });
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'active-by-member'] });
    } catch {
      // form invalid - antd 가 표시
    }
  };

  /* ── 6) 직원/항목 클라이언트 필터링 + 디바운스 ──
   *    직원 검색은 labelFor("이름 · 부서") 텍스트 매칭. labelFor 는 query.data 가 로드되면 stable. */
  const debouncedMemberKeyword = useDebounced(memberKeyword, 250);
  // 미래 월 차단 - 정산 전 월은 지급 데이터 없음, 빈 목록 + 안내 표시
  const isFutureMonth = useMemo(() => {
    return listMonth.startOf('month').isAfter(dayjs().startOf('month'));
  }, [listMonth]);
  const filteredAllowances = useMemo(() => {
    if (isFutureMonth) return [];
    const rows = listQ.data ?? [];
    const k = debouncedMemberKeyword.trim().toLowerCase();
    return rows.filter((a) => {
      if (templateFilter !== 'ALL' && a.salaryItemTemplateId !== templateFilter) return false;
      if (k) {
        if (!a.memberId) return false;
        const label = labelFor(a.memberId).toLowerCase();
        if (!label.includes(k)) return false;
      }
      return true;
    });
  }, [listQ.data, templateFilter, debouncedMemberKeyword, labelFor, isFutureMonth]);

  /* ── 6.5) 보기 모드 - flat 행 형태로 복원 (직원당 한 줄 + 활성 수당 태그) ── */
  const [viewMode] = useState<'flat' | 'byMember'>('flat');

  /* 전체 이력 query - 상세 모드 진입 시에만 fetch */
  const historyQ = useQuery({
    queryKey: ['salary', 'allowance', 'admin', 'history'],
    queryFn: () => salaryApi.memberAllowanceAdmin.listAllHistory(),
    enabled: viewMode === 'byMember',
    staleTime: 30_000,
  });

  /** 상세 모드용 - 활성 + 종료 모두 직원별 그룹 (효력일 역순) */
  const groupedHistoryByMember = useMemo(() => {
    const rows = historyQ.data ?? [];
    const map = new Map<string, MemberAllowance[]>();
    for (const a of rows) {
      const key = a.memberId ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return [...map.entries()]
      .map(([memberId, items]) => {
        const sorted = items.sort((a, b) =>
          (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? ''),
        );
        const activeSum = sorted
          .filter((i) => evalLifecycle(i.effectiveTo) !== 'expired')
          .reduce((s, i) => s + (i.amount ?? 0), 0);
        return {
          memberId,
          label: memberId === '__none__' ? '직원 미상' : labelFor(memberId),
          items: sorted,
          activeCount: sorted.filter((i) => evalLifecycle(i.effectiveTo) !== 'expired').length,
          historyCount: sorted.filter((i) => evalLifecycle(i.effectiveTo) === 'expired').length,
          activeSum,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [historyQ.data, labelFor]);

  /**
   * 그 월 PayrollItem 기반 통계 (회사 공통 + 개인 차등 모두 포함)
   * - 총 지급 = 모든 직원의 수당 totalAmount 합
   * - 총 공제 = 과세 수당 합 × 0.15 추정 (정산 시 4대보험·소득세에 반영되는 부분)
   * - 실수령 = 총 지급 - 총 공제 추정
   */
  const TAX_DEDUCTION_RATE = 0.15;
  const kpis = useMemo(() => {
    let totalPay = 0;
    let taxableSum = 0;
    let memberCount = 0;
    let paidCount = 0;
    let pendingCount = 0;
    for (const e of monthlyAllowanceQ.data ?? []) {
      memberCount++;
      if (e.payrollStatus === 'PAID') paidCount++;
      else pendingCount++;
      for (const line of e.items) {
        totalPay += line.amount;
        if (!line.isTaxFree) taxableSum += line.amount;
      }
    }
    const totalDeduct = Math.round(taxableSum * TAX_DEDUCTION_RATE);
    const netPay = totalPay - totalDeduct;
    return {
      memberCount,
      paidCount,
      pendingCount,
      totalPay,
      totalDeduct,
      netPay,
      // 기존 키 호환 - 부여 기반 카운트는 더 이상 사용 안 하지만 다른 부분 호환용
      activeCount: 0,
      memberSum: memberCount,
      monthlySum: totalPay,
    };
  }, [monthlyAllowanceQ.data]);

  /** 직원별 그룹화 - byMember 뷰용 */
  const groupedByMember = useMemo(() => {
    const map = new Map<string, MemberAllowance[]>();
    for (const a of filteredAllowances) {
      const key = a.memberId ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    // 직원 라벨 기준 정렬
    return [...map.entries()]
      .map(([memberId, items]) => ({
        memberId,
        label: memberId === '__none__' ? '직원 미상' : labelFor(memberId),
        items,
        activeSum: items
          .filter((i) => evalLifecycle(i.effectiveTo) !== 'expired')
          .reduce((s, i) => s + (i.amount ?? 0), 0),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredAllowances, labelFor]);

  /* ── 7) 컬럼 ── */
  const tplMap = useMemo(() => {
    const map = new Map<string, SalaryItemTemplate>();
    (tplQ.data ?? []).forEach((t) => {
      if (t.salaryItemTemplateId) map.set(t.salaryItemTemplateId, t);
    });
    return map;
  }, [tplQ.data]);

  const listColumns: ColumnsType<MemberAllowance> = useMemo(
    () => [
      {
        title: '직원',
        key: 'member',
        render: (_, r) => {
          if (!r.memberId) return <Typography.Text type="secondary">—</Typography.Text>;
          // labelFor 는 "이름 · 부서" 형태 또는 폴백 "이름 미확인" / "…" 반환
          return <Typography.Text strong>{labelFor(r.memberId)}</Typography.Text>;
        },
      },
      {
        title: '수당 항목',
        dataIndex: 'salaryItemTemplateId',
        key: 'tpl',
        render: (id: string) =>
          tplMap.get(id)?.itemName ?? <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: '금액',
        dataIndex: 'amount',
        key: 'amount',
        align: 'right' as const,
        render: (v: number) => formatWon(v),
        sorter: (a, b) => (a.amount ?? 0) - (b.amount ?? 0),
      },
      {
        title: '적용 기간',
        key: 'eff',
        render: (_, r) => renderEffectivePeriod(r.effectiveFrom, r.effectiveTo),
      },
      {
        title: '상태',
        dataIndex: 'approvalStatus',
        key: 'status',
        render: (s: string) => {
          const m = STATUS_LABEL[s] ?? { label: s, color: 'default' };
          return <Tag color={m.color}>{m.label}</Tag>;
        },
      },
      {
        title: '사유 / 메모',
        dataIndex: 'reason',
        key: 'reason',
        ellipsis: true,
      },
      {
        title: '관리',
        key: 'action',
        width: 90,
        render: (_, r) => {
          // 과거 종료된 행은 history 보존을 위해 삭제 불가 (effectiveTo 가 오늘 이전)
          const isPast =
            !!r.effectiveTo && dayjs(r.effectiveTo).startOf('day').isBefore(dayjs().startOf('day'));
          if (isPast) {
            return (
              <Typography.Text type="secondary" className="!tw-text-xs">
                이력
              </Typography.Text>
            );
          }
          return (
            <Button
              size="small"
              disabled={!r.memberAllowanceId}
              onClick={() =>
                modal.confirm({
                  title: '수당 종료',
                  content:
                    '오늘 자로 종료 처리합니다 (이전 정산 이력 보존). 다음 달부터 합산 안 됨.',
                  okText: '종료',
                  cancelText: '취소',
                  onOk: () => closeOneMut.mutateAsync(r.memberAllowanceId!),
                })
              }
            >
              종료
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tplMap, labelFor, modal],
  );

  /* 단건 종료 mutation - effectiveTo set, 이력 보존 */
  const closeOneMut = useMutation({
    mutationFn: (id: string) => salaryApi.memberAllowanceAdmin.closeOne(id),
    onSuccess: () => {
      void message.success('수당이 종료되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '종료에 실패했습니다.');
    },
  });

  /* 단건 완전 삭제 mutation - 이력 X (실수 정정용) */
  const deleteOneMut = useMutation({
    mutationFn: (id: string) => salaryApi.memberAllowanceAdmin.deleteOne(id),
    onSuccess: () => {
      void message.success('수당이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '삭제에 실패했습니다.');
    },
  });

  /* orphan 수당 정리 - Salary 가 없는 직원의 잔여 수당을 일괄 소프트 삭제 */
  const cleanupOrphansMut = useMutation({
    mutationFn: () => salaryApi.memberAllowanceAdmin.cleanupOrphans(),
    onSuccess: (closed) => {
      if (closed === 0) {
        void message.success('정리 대상 없음 - 모든 수당이 활성 직원에 연결되어 있습니다.');
      } else {
        void message.success(`orphan 수당 ${closed}건 정리 완료`);
        void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin'] });
      }
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      void message.error(e?.response?.data?.message ?? '정리에 실패했습니다.');
    },
  });

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {/* 상단 액션 — 헤더 Title 은 외부 탭 라벨 [수당 관리] 와 중복이라 제거 */}
      <div className="tw-flex tw-justify-between tw-items-center">
        <Typography.Text type="secondary" className="!tw-text-sm">
          자격수당·직책수당 등 개인 차등 수당을 즉시 부여하고 직원별 적용 현황을 조회합니다.
        </Typography.Text>
        <Space>
          <Button type="primary" onClick={() => setGrantOpen(true)}>
            + 수당 부여
          </Button>
        </Space>
      </div>

      {/* 상단 통계 - 그 월 정산 명세서 PayrollItem 기반 (회사 공통 + 개인 차등) */}
      <Card variant="borderless" className="!tw-bg-slate-50">
        <Row gutter={[16, 16]} align="middle">
          <Col flex="1">
            <Statistic
              title="대상 직원"
              value={kpis.memberCount}
              suffix="명"
              valueStyle={{ fontSize: 22 }}
            />
          </Col>
          <Col flex="1">
            <Statistic
              title="지급 완료 / 지급 중"
              value={`${kpis.paidCount} / ${kpis.pendingCount}`}
              valueStyle={{ fontSize: 22 }}
            />
          </Col>
          <Col flex="1">
            <Statistic
              title="총 지급 (수당 합계)"
              value={kpis.totalPay}
              suffix="원"
              valueStyle={{ fontSize: 22, color: '#1d4ed8' }}
              formatter={(v) => Number(v).toLocaleString('ko-KR')}
            />
          </Col>
          <Col flex="1">
            <Statistic
              title="총 공제 (추정)"
              value={kpis.totalDeduct}
              suffix="원"
              valueStyle={{ fontSize: 22, color: '#dc2626' }}
              formatter={(v) => Number(v).toLocaleString('ko-KR')}
            />
          </Col>
          <Col flex="1">
            <Statistic
              title="실수령 합계 (추정)"
              value={kpis.netPay}
              suffix="원"
              valueStyle={{ fontSize: 22, color: '#16a34a' }}
              formatter={(v) => Number(v).toLocaleString('ko-KR')}
            />
          </Col>
        </Row>
        <Typography.Text type="secondary" className="!tw-mt-2 tw-block !tw-text-xs">
          * 공제·실수령은 과세 수당 기준 추정치(약 15%)이며 실제 값은 정산 시 확정됩니다.
        </Typography.Text>
      </Card>

      {/* 직원별 그 달 수당 (정산 기준) - 회사 공통 + 개인 차등 모두 PayrollItem 기반 */}
      <Card
        title={
          <Space size={8}>
            <Typography.Text strong>직원별 {listMonthYm} 수당 지급 현황</Typography.Text>
            <Typography.Text type="secondary" className="!tw-text-xs">
              정산 명세서 기준 - 회사 공통 + 개인 차등 모두 포함
            </Typography.Text>
          </Space>
        }
        loading={monthlyAllowanceQ.isLoading}
      >
        {/* 필터 - 조회월 / 항목 / 직원 검색 */}
        <Space wrap className="tw-mb-3">
          <Typography.Text type="secondary">조회 월:</Typography.Text>
          <DatePicker.MonthPicker
            value={listMonth}
            onChange={(d) => d && setListMonth(d)}
            format="YYYY-MM"
            allowClear={false}
          />
          <Typography.Text type="secondary">항목:</Typography.Text>
          <Select
            style={{ width: 220 }}
            value={templateFilter}
            onChange={(v) => setTemplateFilter(v)}
            showSearch
            optionFilterProp="label"
            placeholder="항목 검색"
            options={[
              { value: 'ALL', label: '전체' },
              ...allFilterableTemplates.map((t) => ({
                value: t.salaryItemTemplateId!,
                label:
                  t.fixedAmountYn === 'Y' ? `${t.itemName ?? '-'} (고정 금액)` : (t.itemName ?? '-'),
              })),
            ]}
          />
          <Typography.Text type="secondary">직원:</Typography.Text>
          <AppSearchBar
            placeholder="이름·부서 검색"
            value={memberKeyword}
            onValueChange={setMemberKeyword}
            onSearch={setMemberKeyword}
            ariaLabel="수당 직원 검색"
            className="tw-w-full tw-flex-none sm:tw-w-[280px]"
          />
          <Typography.Text type="secondary">
            {filteredMonthlyAllowances.length}건 / 전체 {(monthlyAllowanceQ.data ?? []).length}건
          </Typography.Text>
        </Space>

        {/* 범례 */}
        <div className="tw-mb-2 tw-flex tw-flex-wrap tw-items-center tw-gap-3">
          <Typography.Text type="secondary" className="!tw-text-xs">
            태그 색상으로 항목 성격 구분
          </Typography.Text>
          <Space size={6}>
            <Tag color="cyan" className="!tw-mr-0">청록</Tag>
            <Typography.Text type="secondary" className="!tw-text-xs">회사 공통</Typography.Text>
            <Tag color="blue" className="!tw-mr-0">파랑</Tag>
            <Typography.Text type="secondary" className="!tw-text-xs">개인 차등</Typography.Text>
          </Space>
        </div>

        {filteredMonthlyAllowances.length > 0 ? (
          <Table
            rowKey={(r) => r.memberId}
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: true }}
            dataSource={filteredMonthlyAllowances}
            columns={[
              {
                title: '직원',
                dataIndex: 'memberId',
                key: 'member',
                width: 180,
                render: (id: string) => labelFor(id),
                sorter: (a: AllowanceMonthlyEntry, b: AllowanceMonthlyEntry) =>
                  labelFor(a.memberId).localeCompare(labelFor(b.memberId)),
              },
              {
                title: '직급',
                key: 'grade',
                width: 100,
                render: (_: unknown, e: AllowanceMonthlyEntry) => gradeFor(e.memberId),
                sorter: (a: AllowanceMonthlyEntry, b: AllowanceMonthlyEntry) =>
                  gradeFor(a.memberId).localeCompare(gradeFor(b.memberId)),
              },
              {
                title: '상태',
                dataIndex: 'payrollStatus',
                key: 'status',
                width: 110,
                render: (s: string | null | undefined) =>
                  s === 'PAID' ? (
                    <Tag color="green">지급 완료</Tag>
                  ) : s === 'CONFIRMED' ? (
                    <Tag color="blue">지급 대기</Tag>
                  ) : s === 'DRAFT' ? (
                    <Tag>검토 전</Tag>
                  ) : (
                    <Tag color="orange">정산 전 (예정)</Tag>
                  ),
                sorter: (a: AllowanceMonthlyEntry, b: AllowanceMonthlyEntry) =>
                  String(a.payrollStatus ?? '').localeCompare(String(b.payrollStatus ?? '')),
              },
              {
                title: '수당 항목',
                key: 'items',
                render: (_: unknown, e: AllowanceMonthlyEntry) => {
                  const isPaid = e.payrollStatus === 'PAID';
                  return (
                    <Space size={[6, 6]} wrap>
                      {e.items.map((it, i) => {
                        const canRemoveOnce = !isPaid && !!it.payrollItemId;
                        const canCloseForever = !!it.memberAllowanceId;
                        const closable = canRemoveOnce || canCloseForever;
                        // 종료된 라인 색상 분기:
                        // PAID + 종료됨 = 주황 (마지막 지급 달)
                        // 그 외 종료됨 = 회색 (지급 전 종료)
                        // 활성 = 회사 공통 cyan / 개인 차등 blue
                        const today = dayjs().startOf('day');
                        const isEnded = it.effectiveTo
                          ? dayjs(it.effectiveTo).startOf('day').isBefore(today)
                          : false;
                        const tagColor = isEnded
                          ? (isPaid ? 'orange' : 'default')
                          : (it.isCommon ? 'cyan' : 'blue');
                        const endedLabel = isEnded
                          ? (isPaid
                              ? ` · 마지막 지급 (${dayjs(it.effectiveTo!).format('M/D')} 종료)`
                              : ` · 지급 전 종료 (${dayjs(it.effectiveTo!).format('M/D')})`)
                          : '';
                        return (
                          <Tag
                            key={it.payrollItemId ?? it.memberAllowanceId ?? `${it.itemName}-${i}`}
                            color={tagColor}
                            className="!tw-px-2 !tw-py-0.5 !tw-text-sm"
                            closable={closable && !isEnded}
                            onClose={(ev) => {
                              ev.preventDefault();
                              const m = modal.confirm({
                                title: `${labelFor(e.memberId)} - ${it.itemName}`,
                                width: 520,
                                content: (
                                  <Space direction="vertical" size={12} className="tw-w-full">
                                    <Typography.Text>이 수당을 어떻게 처리할까요?</Typography.Text>
                                    <Space wrap>
                                      <Button
                                        danger
                                        disabled={!canRemoveOnce}
                                        onClick={() => {
                                          if (!it.payrollItemId) return;
                                          deletePayrollItemMut.mutate(it.payrollItemId);
                                          m.destroy();
                                        }}
                                      >
                                        이번 달만 빼기
                                      </Button>
                                      <Button
                                        danger
                                        type="primary"
                                        disabled={!canCloseForever}
                                        onClick={() => {
                                          if (!it.memberAllowanceId) return;
                                          closeOneMut.mutate(it.memberAllowanceId);
                                          m.destroy();
                                        }}
                                      >
                                        이 수당 영구 종료
                                      </Button>
                                    </Space>
                                    <Typography.Text type="secondary" className="!tw-text-xs">
                                      ① 이번 달 명세서에서만 라인 제거 (다음 달부턴 다시 자동 적용)
                                      <br />
                                      ② 오늘부로 수당 부여 종료 (이번 달 명세서는 유지, 다음 정산부터 미반영)
                                    </Typography.Text>
                                    {!canRemoveOnce && (
                                      <Typography.Text type="warning" className="!tw-text-xs">
                                        {isPaid
                                          ? '* 지급 완료된 명세서라 ①(이번 달 빼기) 불가'
                                          : '* 이번 달 정산 명세서가 아직 만들어지지 않아 ①(이번 달 빼기) 불가 - ②(영구 종료) 또는 [수당 부여]에서 효력 시작일 조정으로 처리'}
                                      </Typography.Text>
                                    )}
                                    {!canCloseForever && (
                                      <Typography.Text type="warning" className="!tw-text-xs">
                                        * 회사 공통 자동 항목은 ②(영구 종료) 불가 — [급여 정책 &gt; 급여 항목]에서 회사 단위로 항목 자체를 끄세요
                                      </Typography.Text>
                                    )}
                                  </Space>
                                ),
                                okButtonProps: { style: { display: 'none' } },
                                cancelText: '닫기',
                              });
                            }}
                          >
                            {it.itemName} {it.amount.toLocaleString('ko-KR')}원
                            {it.isTaxFree ? ' · 비과세' : ''}
                            {endedLabel}
                          </Tag>
                        );
                      })}
                    </Space>
                  );
                },
              },
              {
                title: '합계',
                dataIndex: 'totalAmount',
                key: 'total',
                width: 130,
                align: 'right' as const,
                render: (v: number) => (
                  <Typography.Text strong>
                    {(v ?? 0).toLocaleString('ko-KR')}원
                  </Typography.Text>
                ),
                sorter: (a: AllowanceMonthlyEntry, b: AllowanceMonthlyEntry) =>
                  (a.totalAmount ?? 0) - (b.totalAmount ?? 0),
                defaultSortOrder: 'descend' as const,
              },
            ]}
          />
        ) : (monthlyAllowanceQ.data ?? []).length === 0 ? (
          <Typography.Text type="secondary" className="!tw-text-xs">
            {listMonthYm} 정산 명세서가 아직 만들어지지 않았습니다. [급여 정산 관리 &gt; 명세서 생성]을 먼저 실행해 주세요.
          </Typography.Text>
        ) : (
          <Empty description="조건에 맞는 수당이 없습니다." />
        )}
      </Card>

      {false && (
      <Card
        title={
          <Space size={8}>
            <Typography.Text strong>개인 차등 부여 관리</Typography.Text>
            <Typography.Text type="secondary" className="!tw-text-xs">
              직책수당·자녀수당 등 개인별 차등 수당의 부여/종료를 관리합니다. (회사 공통은 위 표 참고)
            </Typography.Text>
          </Space>
        }
      >
        <Space wrap className="tw-mb-3">
          <Typography.Text type="secondary">조회 월:</Typography.Text>
          <DatePicker.MonthPicker
            value={listMonth}
            onChange={(d) => d && setListMonth(d)}
            format="YYYY-MM"
            allowClear={false}
          />
          <Typography.Text type="secondary">상태:</Typography.Text>
          <Select
            style={{ width: 150 }}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: 'ALL', label: '전체' },
              { value: 'AUTO', label: '관리자 즉시' },
              { value: 'APPROVED', label: '승인' },
              { value: 'PENDING', label: '대기' },
              { value: 'REJECTED', label: '반려' },
              { value: 'CANCELLED', label: '취소' },
            ]}
          />
          <Typography.Text type="secondary">항목:</Typography.Text>
          <Select
            style={{ width: 220 }}
            value={templateFilter}
            onChange={(v) => setTemplateFilter(v)}
            showSearch
            optionFilterProp="label"
            placeholder="항목 검색"
            options={[
              { value: 'ALL', label: '전체' },
              ...allFilterableTemplates.map((t) => ({
                value: t.salaryItemTemplateId!,
                label:
                  t.fixedAmountYn === 'Y' ? `${t.itemName ?? '-'} (고정 금액)` : (t.itemName ?? '-'),
              })),
            ]}
          />
          <Typography.Text type="secondary">직원:</Typography.Text>
          <AppSearchBar
            placeholder="이름·부서 검색"
            value={memberKeyword}
            onValueChange={setMemberKeyword}
            onSearch={setMemberKeyword}
            ariaLabel="수당 직원 검색"
            className="tw-w-full tw-flex-none sm:tw-w-[280px]"
          />
          <Typography.Text type="secondary">
            {filteredAllowances.length}건 / 전체 {(listQ.data ?? []).length}건
          </Typography.Text>
        </Space>
        {isFutureMonth && viewMode === 'flat' ? (
          <div className="tw-mb-2 tw-rounded-md tw-bg-amber-50 tw-px-3 tw-py-2 tw-text-xs tw-text-amber-800">
            선택한 월({listMonthYm})은 아직 정산 전이라 지급 내역이 없습니다. [전체 이력] 모드로 전환하면 부여된 수당의 적용 기간을 확인할 수 있습니다.
          </div>
        ) : null}
        <div className="tw-flex tw-justify-between tw-items-center tw-mb-2 tw-flex-wrap tw-gap-2">
          <Space size={12} wrap>
            <Typography.Text type="secondary" className="!tw-text-xs">
              선택한 월의 어느 시점이라도 활성이었던 직원별 수당 부여 행을 표시합니다.
              {listMonth.isSame(dayjs(), 'month') ? (
                <span className="tw-ml-1 tw-text-amber-700">
                  (이번 달은 정산 전 - 부여 상태일 뿐 실제 지급 완료 아님)
                </span>
              ) : null}
            </Typography.Text>
            <Space size={6}>
              <Tag color="blue" className="!tw-mr-0">
                파랑
              </Tag>
              <Typography.Text type="secondary" className="!tw-text-xs">
                부여 중
              </Typography.Text>
              <Tag className="!tw-mr-0">
                회색
              </Tag>
              <Typography.Text type="secondary" className="!tw-text-xs">
                부여 완료
              </Typography.Text>
            </Space>
          </Space>
        </div>

        {viewMode === 'flat' ? (
          groupedByMember.length === 0 ? (
            <Empty description="조건에 맞는 수당이 없습니다." />
          ) : (
            <AppDataTable
              rowKey={(g) => g.memberId}
              dataSource={groupedByMember}
              pagination={false}
              size="middle"
              columns={[
                {
                  title: '직원',
                  key: 'member',
                  width: 200,
                  render: (_, g) => <Typography.Text strong>{g.label}</Typography.Text>,
                },
                {
                  title: '수당 항목',
                  key: 'items',
                  render: (_, g) => (
                    <Space size={[6, 6]} wrap>
                      {g.items.map((it) => {
                        const lc = evalLifecycle(it.effectiveTo);
                        const itemName = tplMap.get(it.salaryItemTemplateId ?? '')?.itemName ?? '—';
                        // 활성/임박 = 파랑(부여 중), 종료 = 회색(부여 완료)
                        const tagColor = lc === 'expired' ? 'default' : 'blue';
                        const endedLabel =
                          lc === 'expired' && it.effectiveTo
                            ? ` · 부여 완료 (${dayjs(it.effectiveTo).format('M/D')})`
                            : '';
                        const tooltipContent = (
                          <div className="tw-text-xs">
                            <div>
                              {it.effectiveFrom ?? '—'} ~ {it.effectiveTo ?? '진행중'}
                            </div>
                            {it.reason && <div className="tw-mt-1">{it.reason}</div>}
                          </div>
                        );
                        return (
                          <Tooltip
                            key={it.memberAllowanceId ?? `${itemName}-${it.effectiveFrom}`}
                            title={tooltipContent}
                          >
                            <Tag
                              color={tagColor}
                              className="!tw-px-2 !tw-py-0.5 !tw-text-sm"
                              closable={!!it.memberAllowanceId && lc !== 'expired'}
                              onClose={(e) => {
                                e.preventDefault();
                                modal.confirm({
                                  title: `${g.label} - ${itemName} (${formatWon(it.amount ?? 0)})`,
                                  width: 480,
                                  content:
                                    '오늘 자로 종료 처리합니다. 이전 정산 이력은 그대로 보존됩니다.',
                                  okText: '종료',
                                  cancelText: '취소',
                                  onOk: () => closeOneMut.mutateAsync(it.memberAllowanceId!),
                                });
                              }}
                            >
                              {itemName} {formatWon(it.amount ?? 0)}
                              {endedLabel}
                            </Tag>
                          </Tooltip>
                        );
                      })}
                    </Space>
                  ),
                },
                {
                  title: '월 합계',
                  key: 'sum',
                  width: 140,
                  align: 'right' as const,
                  render: (_, g) => (
                    <Typography.Text strong className="!tw-text-blue-600">
                      {formatWon(g.activeSum)}
                    </Typography.Text>
                  ),
                  sorter: (a, b) => a.activeSum - b.activeSum,
                },
              ]}
            />
          )
        ) : historyQ.isLoading ? (
          <Empty description="이력 불러오는 중..." />
        ) : groupedHistoryByMember.length === 0 ? (
          <Empty description="이력이 없습니다." />
        ) : (
          <Space direction="vertical" className="tw-w-full" size={12}>
            <Typography.Text type="secondary" className="!tw-text-xs">
              직원별 수당 이력 (활성 + 종료 모두, 효력일 역순). 종료된 수당은 회색으로 표시됩니다.
            </Typography.Text>
            {groupedHistoryByMember.map((g) => (
              <section
                key={g.memberId}
                className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-white tw-p-4"
              >
                <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                  <Space>
                    <Typography.Text strong>{g.label}</Typography.Text>
                    <Tag color="blue">활성 {g.activeCount}건</Tag>
                    {g.historyCount > 0 && <Tag>이력 {g.historyCount}건</Tag>}
                  </Space>
                  <Typography.Text strong className="!tw-text-blue-600">
                    현재 월 합계 {formatWon(g.activeSum)}
                  </Typography.Text>
                </div>
                <AppDataTable<MemberAllowance>
                  rowKey={(r) =>
                    r.memberAllowanceId ??
                    `${r.memberId}-${r.salaryItemTemplateId}-${r.effectiveFrom}`
                  }
                  dataSource={g.items}
                  columns={listColumns.slice(1)}
                  pagination={false}
                  size="small"
                  rowClassName={(r) =>
                    evalLifecycle(r.effectiveTo) === 'expired'
                      ? '!tw-bg-slate-50/60 tw-text-slate-400'
                      : ''
                  }
                />
              </section>
            ))}
          </Space>
        )}
      </Card>
      )}

      {/* 신규 부여 모달 - 다중 행 일괄 부여 */}
      <Modal
        title="수당 부여 (여러 직원 / 여러 항목 한꺼번에)"
        open={grantOpen}
        onCancel={() => setGrantOpen(false)}
        onOk={onSubmitGrant}
        confirmLoading={bulkSubmitting}
        okText="일괄 부여"
        cancelText="취소"
        destroyOnHidden
        width={1100}
      >
        <Form
          form={grantForm}
          layout="vertical"
          initialValues={{
            // 실무 관행: 수당은 월 1일 기준으로 적용. 26일 같이 늦게 입력하면 다음 달 1일로 조정 권장.
            effectiveFrom: dayjs().startOf('month'),
            rows: [{ memberId: undefined, salaryItemTemplateId: undefined, amount: undefined }],
          }}
        >
          <Form.Item
            label="공통 적용 시작일"
            name="effectiveFrom"
            rules={[{ required: true, message: '적용 시작일을 선택해주세요.' }]}
            extra="모든 행에 동일하게 적용됩니다. 선택일부터 정산 시 자동 합산."
          >
            <DatePicker style={{ width: 240 }} />
          </Form.Item>

          <Form.List name="rows">
            {(fields, { add, remove }) => (
              <div>
                <div className="tw-mb-2 tw-flex tw-items-center tw-justify-between">
                  <Typography.Text strong>부여 행 ({fields.length}건)</Typography.Text>
                  <Space>
                    <Button
                      size="small"
                      onClick={() =>
                        add({
                          memberId: undefined,
                          salaryItemTemplateId: undefined,
                          amount: undefined,
                        })
                      }
                    >
                      + 직원 추가
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        const rows = (grantForm.getFieldValue('rows') ?? []) as GrantRow[];
                        const last = rows[rows.length - 1];
                        if (!last) {
                          add({
                            memberId: undefined,
                            salaryItemTemplateId: undefined,
                            amount: undefined,
                          });
                        } else {
                          add({
                            memberId: undefined,
                            salaryItemTemplateId: last.salaryItemTemplateId,
                            amount: last.amount,
                          });
                        }
                      }}
                    >
                      + 같은 항목·금액 복사
                    </Button>
                  </Space>
                </div>

                {/* 헤더 */}
                <div className="tw-grid tw-grid-cols-[1fr_1fr_180px_180px_40px] tw-gap-2 tw-px-2 tw-py-1 tw-text-xs tw-text-slate-500 tw-bg-slate-50 tw-rounded">
                  <div>대상 직원 *</div>
                  <div>수당 항목 *</div>
                  <div>금액 (원) *</div>
                  <div>비과세 한도</div>
                  <div></div>
                </div>

                {/* 행들 */}
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="tw-grid tw-grid-cols-[1fr_1fr_180px_180px_40px] tw-gap-2 tw-items-start tw-px-2 tw-py-2 tw-border-b tw-border-slate-100"
                  >
                    <Form.Item
                      name={[field.name, 'memberId']}
                      rules={[{ required: true, message: '직원 선택' }]}
                      className="!tw-mb-0"
                    >
                      <MemberSearchSelect width="100%" placeholder="이름·이메일" />
                    </Form.Item>

                    <Form.Item
                      name={[field.name, 'salaryItemTemplateId']}
                      rules={[{ required: true, message: '항목 선택' }]}
                      className="!tw-mb-0"
                    >
                      <Select
                        loading={tplQ.isLoading}
                        placeholder="항목 선택"
                        options={allowanceTemplates.map((t) => {
                          const isCommon = t.fixedAmountYn === 'Y';
                          const isRetirement = RETIREMENT_AUTO_ITEMS.has(t.itemName ?? '');
                          const tags: string[] = [];
                          if (isCommon) tags.push('회사공통');
                          if (isRetirement) tags.push('사직서 승인 후');
                          const suffix = tags.length ? ` (${tags.join(' / ')})` : '';
                          return {
                            value: t.salaryItemTemplateId!,
                            label: `${t.itemName ?? ''}${suffix}`,
                          };
                        })}
                        onChange={(val: string) => {
                          // 템플릿 선택 시 default 금액 자동 채움
                          const tpl = allowanceTemplates.find(
                            (t) => t.salaryItemTemplateId === val,
                          );
                          if (tpl?.defaultAmount != null) {
                            const rows = (grantForm.getFieldValue('rows') ?? []) as GrantRow[];
                            rows[field.name] = { ...rows[field.name], amount: tpl.defaultAmount };
                            grantForm.setFieldValue('rows', [...rows]);
                          }
                        }}
                      />
                    </Form.Item>

                    <Form.Item
                      shouldUpdate={(prev, cur) => {
                        const p = prev?.rows?.[field.name]?.salaryItemTemplateId;
                        const c = cur?.rows?.[field.name]?.salaryItemTemplateId;
                        return p !== c;
                      }}
                      noStyle
                    >
                      {({ getFieldValue }) => {
                        const tplId = getFieldValue([
                          'rows',
                          field.name,
                          'salaryItemTemplateId',
                        ]) as string | undefined;
                        const tpl = allowanceTemplates.find(
                          (t) => t.salaryItemTemplateId === tplId,
                        );
                        // 고정 금액 항목은 금액 수정 불가 - defaultAmount 그대로
                        const lockAmount = tpl?.fixedAmountYn === 'Y';
                        return (
                          <Form.Item
                            name={[field.name, 'amount']}
                            rules={[
                              { required: true, message: '금액 입력' },
                              { type: 'number', min: 0, message: '0원 이상' },
                            ]}
                            className="!tw-mb-0"
                            extra={
                              lockAmount ? (
                                <Typography.Text type="secondary" className="!tw-text-xs">
                                  회사 공통 - 고정 금액
                                </Typography.Text>
                              ) : null
                            }
                          >
                            <InputNumber
                              style={{ width: '100%' }}
                              min={0}
                              step={10000}
                              disabled={lockAmount}
                              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                              parser={(v) => Number((v ?? '').replace(/,/g, '')) as 0}
                            />
                          </Form.Item>
                        );
                      }}
                    </Form.Item>

                    {/* 비과세 한도 표시 */}
                    <Form.Item shouldUpdate noStyle>
                      {({ getFieldValue }) => {
                        const tplId = getFieldValue([
                          'rows',
                          field.name,
                          'salaryItemTemplateId',
                        ]) as string | undefined;
                        const tpl = allowanceTemplates.find(
                          (t) => t.salaryItemTemplateId === tplId,
                        );
                        if (!tpl || tpl.monthlyNonTaxableLimit == null) {
                          return (
                            <Typography.Text type="secondary" className="!tw-text-xs">
                              —
                            </Typography.Text>
                          );
                        }
                        return (
                          <Typography.Text type="secondary" className="!tw-text-xs">
                            월 {tpl.monthlyNonTaxableLimit.toLocaleString('ko-KR')}원
                          </Typography.Text>
                        );
                      }}
                    </Form.Item>

                    <Button
                      size="small"
                      danger
                      type="text"
                      disabled={fields.length === 1}
                      onClick={() => remove(field.name)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Form.List>

          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-3 !tw-text-xs">
            * 관리자가 부여할시에 별도 결재 없이 즉시 활성화됩니다.
            <br />* 같은 직원에게 여러 항목 부여하려면 [+ 직원 추가], 같은 항목을 여러 직원에게 차등
            금액으로 부여하려면 [+ 같은 항목·금액 복사] 후 직원만 변경하세요.
          </Typography.Paragraph>
        </Form>
      </Modal>
    </Space>
  );
}

export default AdminMemberAllowancePage;
