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
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { memberApi } from '@/features/member/api/memberApi';
import { membersApi } from '@/features/members/api/membersApi';
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
  // 종료일이 오늘 이전 OR 오늘 = expired (오늘 자로 종료된 행은 현재 부여 현황에서 제외)
  if (end.isBefore(today) || end.isSame(today)) return 'expired';
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

/**
 * 일괄 부여 모달 패널
 * - 상단: 시작일 / 항목 select / 금액 input
 * - 하단: 회사 직원 list (검색·부서 필터 + 체크박스 다중선택)
 * - 항목 선택 시 그 항목을 받지 않는 직원만 자동 노출
 */
function BulkGrantPanel({
  templates,
  allMembers,
  historyRows,
  tplId,
  onTplIdChange,
  amount,
  onAmountChange,
  effectiveFrom,
  onEffectiveFromChange,
  selectedIds,
  onSelectedIdsChange,
  keyword,
  onKeywordChange,
  department,
  onDepartmentChange,
}: {
  templates: SalaryItemTemplate[];
  allMembers: { id: string; name: string; department: string; grade: string }[];
  historyRows: MemberAllowance[];
  tplId?: string;
  onTplIdChange: (v: string | undefined) => void;
  amount?: number;
  onAmountChange: (v: number | undefined) => void;
  effectiveFrom: dayjs.Dayjs;
  onEffectiveFromChange: (v: dayjs.Dayjs) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  keyword: string;
  onKeywordChange: (v: string) => void;
  department: string | 'ALL';
  onDepartmentChange: (v: string | 'ALL') => void;
}) {
  // 선택된 항목을 이미 받고 있는 직원 ID set - 그 외 직원만 노출 대상
  const grantedMemberIds = useMemo(() => {
    if (!tplId) return new Set<string>();
    const s = new Set<string>();
    for (const a of historyRows) {
      if (a.salaryItemTemplateId !== tplId) continue;
      if (evalLifecycle(a.effectiveTo) === 'expired') continue;
      if (a.memberId) s.add(a.memberId);
    }
    return s;
  }, [historyRows, tplId]);

  // 부서 옵션 - 회사 전체 직원 기준 distinct, 회사명(법인 prefix) 제외
  // 일부 직원 organizationName 이 회사명("(주)..." 등)으로 폴백돼 부서 dropdown 에 섞여 들어옴
  const departmentOptions = useMemo(() => {
    const COMPANY_PREFIX = /^(\(주\)|\(유\)|\(재\)|\(사\)|주식회사|유한회사|사단법인|재단법인)/;
    const set = new Set<string>();
    allMembers.forEach((m) => {
      const d = m.department?.trim();
      if (!d) return;
      if (COMPANY_PREFIX.test(d)) return;
      set.add(d);
    });
    return [...set].sort();
  }, [allMembers]);

  // 노출 대상 직원 = 항목 미부여 + 키워드 + 부서 필터
  const filteredMembers = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return allMembers.filter((m) => {
      if (tplId && grantedMemberIds.has(m.id)) return false;
      if (department !== 'ALL' && m.department !== department) return false;
      if (k) {
        const hay = `${m.name} ${m.department} ${m.grade}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
  }, [allMembers, tplId, grantedMemberIds, department, keyword]);

  const tpl = templates.find((t) => t.salaryItemTemplateId === tplId);
  const lockAmount = tpl?.fixedAmountYn === 'Y';

  return (
    <Space direction="vertical" size={16} className="tw-w-full">
      {/* 1단계 - 부여할 항목·금액·시작일 입력 */}
      <Card
        size="small"
        title={
          <Space size={6}>
            <Tag color="blue" className="!tw-mr-0">1</Tag>
            <Typography.Text strong>부여할 항목과 금액 입력</Typography.Text>
          </Space>
        }
        className="!tw-bg-blue-50/40"
      >
        <Row gutter={12}>
          <Col span={10}>
            <Typography.Text type="secondary" className="!tw-text-xs">
              수당 항목 *
            </Typography.Text>
            <Select
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              placeholder="수당 항목 선택"
              value={tplId}
              onChange={(v) => onTplIdChange(v)}
              options={templates.map((t) => ({
                value: t.salaryItemTemplateId!,
                label: t.fixedAmountYn === 'Y' ? `${t.itemName} (회사공통·고정)` : t.itemName!,
              }))}
            />
          </Col>
          <Col span={8}>
            <Typography.Text type="secondary" className="!tw-text-xs">
              금액 (원) *{' '}
              {lockAmount && <Tag color="blue">고정</Tag>}
              {tplId && !lockAmount && <Tag color="orange">직접 입력</Tag>}
            </Typography.Text>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={10000}
              disabled={lockAmount}
              value={amount}
              onChange={(v) => onAmountChange(v == null ? undefined : Number(v))}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => Number((v ?? '').replace(/,/g, '')) as 0}
              placeholder={tplId && !lockAmount ? '차등 항목 - 금액 입력' : undefined}
              status={tplId && !lockAmount && (amount == null || amount <= 0) ? 'warning' : undefined}
            />
          </Col>
          <Col span={6}>
            <Typography.Text type="secondary" className="!tw-text-xs">
              적용 시작일 *
            </Typography.Text>
            <DatePicker
              style={{ width: '100%' }}
              value={effectiveFrom}
              onChange={(d) => d && onEffectiveFromChange(d)}
              allowClear={false}
            />
          </Col>
        </Row>
      </Card>

      {/* 2단계 - 부여할 직원 선택 */}
      <Card
        size="small"
        title={
          <Space size={6} wrap>
            <Tag color="blue" className="!tw-mr-0">2</Tag>
            <Typography.Text strong>부여할 직원 선택</Typography.Text>
            {tplId && (
              <Typography.Text type="secondary" className="!tw-text-xs">
                (이미 받고 있는 {grantedMemberIds.size}명은 자동 제외)
              </Typography.Text>
            )}
          </Space>
        }
      >
        <Space wrap className="tw-mb-3">
          <AppSearchBar
            placeholder="이름·부서·직급 검색"
            value={keyword}
            onValueChange={onKeywordChange}
            onSearch={onKeywordChange}
            ariaLabel="일괄 부여 직원 검색"
            className="tw-w-[260px]"
          />
          <Select
            style={{ width: 180 }}
            value={department}
            onChange={(v) => onDepartmentChange(v)}
            placeholder="부서"
            options={[
              { value: 'ALL', label: '전체 부서' },
              ...departmentOptions.map((d) => ({ value: d, label: d })),
            ]}
          />
          <Typography.Text type="secondary" className="!tw-text-xs">
            대상 {filteredMembers.length}명 · 선택 {selectedIds.length}명
          </Typography.Text>
          {filteredMembers.length > 0 && (
            <Button
              size="small"
              onClick={() => onSelectedIdsChange(filteredMembers.map((m) => m.id))}
            >
              전체 선택
            </Button>
          )}
          {selectedIds.length > 0 && (
            <Button size="small" onClick={() => onSelectedIdsChange([])}>
              선택 해제
            </Button>
          )}
        </Space>

        <Table
          size="small"
          rowKey={(r) => r.id}
          dataSource={filteredMembers}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ y: 320 }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => onSelectedIdsChange(keys as string[]),
            preserveSelectedRowKeys: true,
          }}
          columns={[
            { title: '이름', dataIndex: 'name', key: 'name', width: 140 },
            { title: '부서', dataIndex: 'department', key: 'dept', width: 160 },
            { title: '직급', dataIndex: 'grade', key: 'grade', width: 120 },
          ]}
          locale={{
            emptyText: tplId
              ? '대상 직원이 없습니다. (모두 이미 부여 받고 있음)'
              : '위에서 수당 항목을 먼저 선택하세요.',
          }}
        />
      </Card>
      <Typography.Text type="secondary" className="!tw-text-xs">
        * 직원별 차등 금액이 필요하면 모달을 닫고 각 직원 행의 [수당 부여] 버튼으로 개별 부여하세요.
      </Typography.Text>
    </Space>
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
      (t) => t.itemType === 'EARNING' && !NON_ALLOWANCE_ITEMS.has(t.itemName ?? ''),
    );
  }, [tplQ.data, NON_ALLOWANCE_ITEMS]);

  /** 필터 dropdown 용 - 진짜 수당 (식대/직책수당/자녀수당 등) 만 노출 */
  const allFilterableTemplates = useMemo<SalaryItemTemplate[]>(() => {
    const list = tplQ.data ?? [];
    return list.filter(
      (t) => t.itemType === 'EARNING' && !NON_ALLOWANCE_ITEMS.has(t.itemName ?? ''),
    );
  }, [tplQ.data, NON_ALLOWANCE_ITEMS]);

  /** 회사 공통 자동 적용 항목 - fixedAmountYn='Y' + defaultAmount 있는 EARNING */
  const commonAllowanceTemplates = useMemo<SalaryItemTemplate[]>(() => {
    const list = tplQ.data ?? [];
    return list.filter(
      (t) =>
        t.itemType === 'EARNING' &&
        !NON_ALLOWANCE_ITEMS.has(t.itemName ?? '') &&
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
  const [memberKeyword, setMemberKeyword] = useState(''); // 직원 이름 검색
  const [departmentFilter, setDepartmentFilter] = useState<string | 'ALL'>('ALL'); // 부서 select
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

  /* ── 3) 직원 이름 매핑 — 회사 직원 list 1회 조회로 N+1 회피 ──
   *    useMemberDisplayNames 가 내부적으로 membersApi.list({pageSize:500}) 한 번 호출 + 5분 캐시. */
  const memberIdList = useMemo(
    () => (listQ.data ?? []).map((a) => a.memberId).filter((id): id is string => Boolean(id)),
    [listQ.data],
  );
  const { labelFor } = useMemberDisplayNames(memberIdList);

  // 직급/부서 매핑 - 정렬·필터·표시용 (membersApi.list 결과 5분 캐시)
  const memberInfoQ = useQuery({
    queryKey: ['members', 'allowance-info-map'],
    queryFn: () => membersApi.list({ page: 1, pageSize: 2000 }),
    staleTime: 5 * 60_000,
  });
  const memberInfoMap = useMemo(() => {
    const map = new Map<string, { name: string; department: string; grade: string }>();
    (memberInfoQ.data?.items ?? []).forEach((m) => {
      if (!m.id) return;
      map.set(m.id, {
        name: m.name ?? '',
        department: m.department ?? '',
        grade: m.jobGradeName ?? '',
      });
    });
    return map;
  }, [memberInfoQ.data]);
  const gradeFor = useCallback(
    (id: string) => memberInfoMap.get(id)?.grade ?? '—',
    [memberInfoMap],
  );
  const departmentFor = useCallback(
    (id: string) => memberInfoMap.get(id)?.department ?? '',
    [memberInfoMap],
  );

  // 부서 select 옵션 - 회사명 prefix 제외 (organizationName 폴백 노이즈 차단)
  const departmentOptions = useMemo(() => {
    const COMPANY_PREFIX = /^(\(주\)|\(유\)|\(재\)|\(사\)|주식회사|유한회사|사단법인|재단법인)/;
    const set = new Set<string>();
    memberInfoMap.forEach((info) => {
      const d = info.department?.trim();
      if (!d || COMPANY_PREFIX.test(d)) return;
      set.add(d);
    });
    return [...set].sort();
  }, [memberInfoMap]);

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
    if (departmentFilter !== 'ALL') {
      rows = rows.filter((e) => departmentFor(e.memberId) === departmentFilter);
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
  }, [monthlyAllowanceQ.data, memberKeyword, departmentFilter, templateFilter, labelFor, departmentFor, allFilterableTemplates]);

  /* ── 5) 신규 부여 모달 - 다중 행 (직원 × 수당 항목 자유 조합) ── */
  type GrantRow = {
    memberId?: string;
    salaryItemTemplateId?: string;
    amount?: number;
  };
  const [grantOpen, setGrantOpen] = useState(false);
  // 단건 부여 모드 - 직원 ID 가 set 되면 모달의 직원 추가/복사 버튼 숨김 + 행 직원 lock
  const [grantSingleMember, setGrantSingleMember] = useState<string | null>(null);
  const [grantForm] = Form.useForm<{
    rows: GrantRow[];
    effectiveFrom: dayjs.Dayjs;
  }>();

  // 모달 떠있는 동안 AntD 가 body 에 추가하는 overflow:hidden 해제 - 외부 휠 스크롤 허용
  useEffect(() => {
    if (!grantOpen) return;
    const id = window.setInterval(() => {
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [grantOpen]);

  // 일괄 부여 모드 state - grantSingleMember == null 일 때만 사용
  const [bulkTplId, setBulkTplId] = useState<string | undefined>(undefined);
  const [bulkAmount, setBulkAmount] = useState<number | undefined>(undefined);
  const [bulkEffectiveFrom, setBulkEffectiveFrom] = useState<dayjs.Dayjs>(
    () => dayjs().startOf('month'),
  );
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkKeyword, setBulkKeyword] = useState('');
  const [bulkDept, setBulkDept] = useState<string | 'ALL'>('ALL');

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
        setGrantSingleMember(null);
        grantForm.resetFields();
      } else if (ok === 0) {
        void message.error(`${fail}건 모두 실패했습니다. 입력을 확인해주세요.`);
      } else {
        void message.warning(`${ok}건 성공 / ${fail}건 실패. 실패한 행은 다시 부여해주세요.`);
      }
      // prefix invalidate - history / monthly / list / active-by-member 모두 갱신
      // refetchType: 'active' 로 화면에 보이는 쿼리는 즉시 refetch
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin'], refetchType: 'active' });
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'], refetchType: 'active' });
    } catch {
      // form invalid - antd 가 표시
    }
  };

  /** 일괄 부여 - 선택된 직원들에게 같은 항목·금액·시작일로 N건 동시 발행 */
  const onBulkGrant = async () => {
    if (!bulkTplId) {
      void message.warning('수당 항목을 선택하세요.');
      return;
    }
    if (bulkAmount == null || bulkAmount < 0) {
      void message.warning('금액을 입력하세요.');
      return;
    }
    if (bulkSelectedIds.length === 0) {
      void message.warning('직원을 1명 이상 선택하세요.');
      return;
    }
    setBulkSubmitting(true);
    const effectiveFromStr = bulkEffectiveFrom.format('YYYY-MM-DD');
    const results = await Promise.allSettled(
      bulkSelectedIds.map((memberId) =>
        autoGrantMut.mutateAsync({
          memberId,
          salaryItemTemplateId: bulkTplId,
          amount: bulkAmount,
          effectiveFrom: effectiveFromStr,
        }),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    setBulkSubmitting(false);
    if (fail === 0) {
      void message.success(`${ok}명에게 일괄 부여 완료`);
      setGrantOpen(false);
      setBulkSelectedIds([]);
      setBulkTplId(undefined);
      setBulkAmount(undefined);
    } else if (ok === 0) {
      void message.error(`${fail}건 모두 실패. 입력을 확인해주세요.`);
    } else {
      void message.warning(`${ok}명 성공 / ${fail}명 실패`);
    }
    void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin'], refetchType: 'active' });
    void qc.invalidateQueries({ queryKey: ['salary', 'payroll'], refetchType: 'active' });
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

  /* ── 6.5) 보기 모드 - current: 현재 부여 현황(활성만) / monthly: 지급 이력(월별) ── */
  const [viewMode, setViewMode] = useState<'current' | 'monthly'>('current');

  /* 전체 이력 query - 현재 부여 현황 표시 + 일괄 부여 모달의 "안 받는 직원만" 필터에 사용 */
  const historyQ = useQuery({
    queryKey: ['salary', 'allowance', 'admin', 'history'],
    queryFn: () => salaryApi.memberAllowanceAdmin.listAllHistory(),
    enabled: viewMode === 'current' || grantOpen,
    staleTime: 30_000,
  });

  /**
   * "현재 부여 현황" 모드용 entries - 오늘 시점 활성 MemberAllowance 만 직원별 그룹.
   * - 월 무관 (listMonth 안 씀)
   * - filteredMonthlyAllowances (지급 이력) 와 같은 AllowanceMonthlyEntry 모양으로 변환
   *   → 표 컬럼 재사용
   */
  const currentActiveEntries = useMemo<AllowanceMonthlyEntry[]>(() => {
    const rows = (historyQ.data ?? []).filter(
      (a) => evalLifecycle(a.effectiveTo) !== 'expired',
    );
    const map = new Map<string, MemberAllowance[]>();
    for (const a of rows) {
      if (!a.memberId) continue;
      if (!map.has(a.memberId)) map.set(a.memberId, []);
      map.get(a.memberId)!.push(a);
    }
    // 템플릿 lookup - id -> 객체 (tplMap 은 아래에서 선언되므로 TDZ 회피 위해 인라인 빌드)
    const tplById = new Map<string, SalaryItemTemplate>();
    (tplQ.data ?? []).forEach((t) => {
      if (t.salaryItemTemplateId) tplById.set(t.salaryItemTemplateId, t);
    });
    const out: AllowanceMonthlyEntry[] = [];
    for (const [memberId, list] of map.entries()) {
      const k = memberKeyword.trim().toLowerCase();
      if (k && !labelFor(memberId).toLowerCase().includes(k)) continue;
      if (departmentFilter !== 'ALL' && departmentFor(memberId) !== departmentFilter) continue;
      const items = list
        .filter((a) => {
          if (templateFilter !== 'ALL' && a.salaryItemTemplateId !== templateFilter) return false;
          return (a.amount ?? 0) > 0;
        })
        .map((a) => {
          const tpl = tplById.get(a.salaryItemTemplateId ?? '');
          return {
            payrollItemId: undefined,
            memberAllowanceId: a.memberAllowanceId ?? undefined,
            itemName: tpl?.itemName ?? '—',
            amount: a.amount ?? 0,
            effectiveTo: a.effectiveTo ?? null,
            isCommon: tpl?.fixedAmountYn === 'Y',
            isTaxFree: tpl?.isTaxableYn === 'N',
          };
        });
      if (items.length === 0) continue;
      out.push({
        memberId,
        items,
        totalAmount: items.reduce((s, it) => s + it.amount, 0),
        // 현재 부여 현황 모드 - 명세서 상태 무관, DRAFT 표기 (상태 컬럼은 monthly 모드에서만 노출하므로 화면에 안 보임)
        payrollStatus: 'DRAFT' as const,
      });
    }
    return out.sort((a, b) => labelFor(a.memberId).localeCompare(labelFor(b.memberId)));
  // tplMap 은 useMemo 최종 결과로 hoisting 되므로 deps 안 잡혀도 lint 무시 (페이지 내부 const)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyQ.data, tplQ.data, memberKeyword, departmentFilter, templateFilter, labelFor, departmentFor]);

  /** 상세 모드용 - 활성 + 종료 모두 직원별 그룹 (효력일 역순) */
  const groupedHistoryByMember = useMemo(() => {
    // current 모드 - 활성 부여 행만 직원별 그룹
    const rows = (historyQ.data ?? []).filter(
      (a) => evalLifecycle(a.effectiveTo) !== 'expired',
    );
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
        const activeSum = sorted.reduce((s, i) => s + (i.amount ?? 0), 0);
        return {
          memberId,
          label: memberId === '__none__' ? '직원 미상' : labelFor(memberId),
          items: sorted,
          activeCount: sorted.length,
          historyCount: 0,
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
          <Button
            type="primary"
            onClick={() => {
              setGrantSingleMember(null);
              // 일괄 모드 state 초기화
              setBulkTplId(undefined);
              setBulkAmount(undefined);
              setBulkEffectiveFrom(dayjs().startOf('month'));
              setBulkSelectedIds([]);
              setBulkKeyword('');
              setBulkDept('ALL');
              setGrantOpen(true);
            }}
          >
            + 일괄 수당 부여
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
          <Space size={8} wrap>
            <Typography.Text strong>
              {viewMode === 'monthly'
                ? `직원별 ${listMonthYm} 수당 지급 현황`
                : '직원별 현재 부여 현황 (활성)'}
            </Typography.Text>
            <Typography.Text type="secondary" className="!tw-text-xs">
              {viewMode === 'monthly'
                ? '정산 명세서 기준 - 회사 공통 + 개인 차등 모두 포함'
                : '지금 적용 중인 수당만 표시. 종료된 라인은 [지급 이력 (월별)] 에서 확인'}
            </Typography.Text>
          </Space>
        }
        extra={
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as 'current' | 'monthly')}
            options={[
              { label: '현재 부여 현황', value: 'current' },
              { label: '지급 이력 (월별)', value: 'monthly' },
            ]}
          />
        }
        loading={monthlyAllowanceQ.isLoading || (viewMode === 'current' && historyQ.isLoading)}
      >
        {/* 필터 - 조회월(monthly 모드만) / 항목 / 직원 검색 */}
        <Space wrap className="tw-mb-3">
          {viewMode === 'monthly' && (
            <>
              <Typography.Text type="secondary">조회 월:</Typography.Text>
              <DatePicker.MonthPicker
                value={listMonth}
                onChange={(d) => d && setListMonth(d)}
                format="YYYY-MM"
                allowClear={false}
                disabledDate={(current) => current && current.isAfter(dayjs(), 'month')}
              />
            </>
          )}
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
          <Typography.Text type="secondary">부서:</Typography.Text>
          <Select
            style={{ width: 160 }}
            value={departmentFilter}
            onChange={(v) => setDepartmentFilter(v)}
            placeholder="부서"
            options={[
              { value: 'ALL', label: '전체 부서' },
              ...departmentOptions.map((d) => ({ value: d, label: d })),
            ]}
          />
          <Typography.Text type="secondary">이름:</Typography.Text>
          <AppSearchBar
            placeholder="직원 이름 검색"
            value={memberKeyword}
            onValueChange={setMemberKeyword}
            onSearch={setMemberKeyword}
            ariaLabel="수당 직원 이름 검색"
            className="tw-w-full tw-flex-none sm:tw-w-[220px]"
          />
          <Typography.Text type="secondary">
            {viewMode === 'current'
              ? `${currentActiveEntries.length}명 활성`
              : `${filteredMonthlyAllowances.length}건 / 전체 ${(monthlyAllowanceQ.data ?? []).length}건`}
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

        {(viewMode === 'current' ? currentActiveEntries : filteredMonthlyAllowances).length > 0 ? (
          <Table
            rowKey={(r) => r.memberId}
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: true }}
            dataSource={viewMode === 'current' ? currentActiveEntries : filteredMonthlyAllowances}
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
              // 상태 컬럼 - 지급 이력(월별) 모드에서만 의미 있음. 현재 부여 현황은 항상 활성이라 숨김
              ...(viewMode === 'monthly'
                ? [
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
                  ]
                : []),
              {
                title: '수당 항목',
                key: 'items',
                render: (_: unknown, e: AllowanceMonthlyEntry) => {
                  const isPaid = e.payrollStatus === 'PAID';
                  return (
                    <Space size={[6, 6]} wrap>
                      {e.items.map((it, i) => {
                        // PAID 명세서 라인은 영구 종료 X 노출 X (이미 지급 완료된 라인이라 삭제 의미 없음)
                        const canCloseForever = !!it.memberAllowanceId && !isPaid;
                        const closable = canCloseForever;
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
                              if (!canCloseForever) {
                                modal.warning({
                                  title: `${labelFor(e.memberId)} - ${it.itemName}`,
                                  content:
                                    '회사 공통 자동 항목은 [급여 정책 > 급여 항목]에서 회사 단위로 항목 자체를 끄세요.',
                                });
                                return;
                              }
                              modal.confirm({
                                title: `${labelFor(e.memberId)} - ${it.itemName} 수당을 종료할까요?`,
                                width: 520,
                                content: (
                                  <Space direction="vertical" size={8} className="tw-w-full">
                                    <Typography.Text>
                                      오늘부로 수당 부여를 종료합니다.
                                    </Typography.Text>
                                    <Typography.Text type="secondary" className="!tw-text-xs">
                                      · 미지급(정산 전·DRAFT) 명세서 라인은 함께 제거됩니다.<br />
                                      · 이미 지급된(CONFIRMED·PAID) 명세서는 보존됩니다.<br />
                                      · 다음 정산부터 자동 적용되지 않습니다.
                                    </Typography.Text>
                                  </Space>
                                ),
                                okText: '영구 종료',
                                okButtonProps: { danger: true },
                                cancelText: '취소',
                                onOk: () => {
                                  if (!it.memberAllowanceId) return;
                                  closeOneMut.mutate(it.memberAllowanceId);
                                },
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
              // 관리 컬럼 - "현재 부여 현황" 모드에서만 노출, "지급 이력 (월별)" 모드에서는 숨김
              ...(viewMode === 'current'
                ? [
                    {
                      title: '관리',
                      key: 'grant-action',
                      width: 110,
                      align: 'center' as const,
                      render: (_: unknown, e: AllowanceMonthlyEntry) => (
                        <Button
                          size="small"
                          type="primary"
                          ghost
                          onClick={() => {
                            // 단건 부여 모드 - 이 직원 prefill + lock
                            setGrantSingleMember(e.memberId);
                            grantForm.resetFields();
                            grantForm.setFieldsValue({
                              effectiveFrom: dayjs().startOf('month'),
                              rows: [
                                {
                                  memberId: e.memberId,
                                  salaryItemTemplateId: undefined,
                                  amount: undefined,
                                },
                              ],
                            });
                            setGrantOpen(true);
                          }}
                        >
                          수당 부여
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        ) : viewMode === 'monthly' && (monthlyAllowanceQ.data ?? []).length === 0 ? (
          <Typography.Text type="secondary" className="!tw-text-xs">
            {listMonthYm} 정산 명세서가 아직 만들어지지 않았습니다. [급여 정산 관리 &gt; 명세서 생성]을 먼저 실행해 주세요.
          </Typography.Text>
        ) : viewMode === 'current' && (historyQ.data ?? []).length === 0 ? (
          <Empty description="현재 부여 중인 수당이 없습니다." />
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
          <Typography.Text type="secondary">부서:</Typography.Text>
          <Select
            style={{ width: 160 }}
            value={departmentFilter}
            onChange={(v) => setDepartmentFilter(v)}
            placeholder="부서"
            options={[
              { value: 'ALL', label: '전체 부서' },
              ...departmentOptions.map((d) => ({ value: d, label: d })),
            ]}
          />
          <Typography.Text type="secondary">이름:</Typography.Text>
          <AppSearchBar
            placeholder="직원 이름 검색"
            value={memberKeyword}
            onValueChange={setMemberKeyword}
            onSearch={setMemberKeyword}
            ariaLabel="수당 직원 이름 검색"
            className="tw-w-full tw-flex-none sm:tw-w-[220px]"
          />
          <Typography.Text type="secondary">
            {filteredAllowances.length}건 / 전체 {(listQ.data ?? []).length}건
          </Typography.Text>
        </Space>
        {isFutureMonth && viewMode === 'monthly' ? (
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

        {viewMode === 'monthly' ? (
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
          <Empty description="현재 부여 현황 불러오는 중..." />
        ) : groupedHistoryByMember.length === 0 ? (
          <Empty description="현재 부여 중인 수당이 없습니다." />
        ) : (
          <Space direction="vertical" className="tw-w-full" size={12}>
            <Typography.Text type="secondary" className="!tw-text-xs">
              직원별 현재 부여 중인 수당 (활성 라인만, 효력일 역순)
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
                  </Space>
                  <Space size={12}>
                    <Typography.Text strong className="!tw-text-blue-600">
                      합계 {formatWon(g.activeSum)}
                    </Typography.Text>
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      onClick={() => {
                        // 단건 부여 모드 - 해당 직원 prefill + 직원 변경 lock
                        if (g.memberId === '__none__') return;
                        setGrantSingleMember(g.memberId);
                        grantForm.resetFields();
                        grantForm.setFieldsValue({
                          effectiveFrom: dayjs().startOf('month'),
                          rows: [
                            {
                              memberId: g.memberId,
                              salaryItemTemplateId: undefined,
                              amount: undefined,
                            },
                          ],
                        });
                        setGrantOpen(true);
                      }}
                    >
                      수당 부여
                    </Button>
                  </Space>
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

      {/* 신규 부여 모달 - 단건 모드 / 일괄 모드 분기 */}
      <Modal
        title={grantSingleMember ? `수당 부여 - ${labelFor(grantSingleMember)}` : '일괄 수당 부여'}
        open={grantOpen}
        onCancel={() => {
          setGrantOpen(false);
          setGrantSingleMember(null);
        }}
        onOk={grantSingleMember ? onSubmitGrant : onBulkGrant}
        confirmLoading={bulkSubmitting}
        okText={
          grantSingleMember
            ? '부여'
            : bulkSelectedIds.length > 0
              ? `선택한 ${bulkSelectedIds.length}명에게 일괄 부여`
              : '일괄 부여'
        }
        okButtonProps={{
          disabled: !grantSingleMember && (
            !bulkTplId || bulkAmount == null || bulkAmount <= 0 || bulkSelectedIds.length === 0
          ),
          // 비활성 사유 호버로 안내 (button 자체가 disabled 라 title 은 wrapper 로 전달)
          title: !grantSingleMember
            ? !bulkTplId
              ? '수당 항목을 선택하세요'
              : bulkAmount == null || bulkAmount <= 0
                ? '금액을 입력하세요 (1원 이상)'
                : bulkSelectedIds.length === 0
                  ? '직원을 1명 이상 선택하세요'
                  : undefined
            : undefined,
        }}
        cancelText="취소"
        destroyOnHidden
        width={grantSingleMember ? 760 : 960}
        // mask 는 보이되 휠/클릭은 통과 - 모달 떠있는 동안 뒤 페이지 스크롤 가능
        styles={{ mask: { pointerEvents: 'none' } }}
      >
        {!grantSingleMember && (
          <BulkGrantPanel
            templates={allowanceTemplates}
            allMembers={(memberInfoQ.data?.items ?? [])
              .filter((m) => !!m.id)
              .map((m) => ({
                id: m.id!,
                name: m.name ?? '이름 없음',
                department: m.department ?? '',
                grade: m.jobGradeName ?? '',
              }))}
            historyRows={historyQ.data ?? []}
            tplId={bulkTplId}
            onTplIdChange={(id) => {
              setBulkTplId(id);
              // 항목이 고정 금액 + defaultAmount 있으면 자동 채움
              const tpl = allowanceTemplates.find((t) => t.salaryItemTemplateId === id);
              if (tpl?.fixedAmountYn === 'Y' && tpl.defaultAmount != null) {
                setBulkAmount(tpl.defaultAmount);
              }
              // 항목 바뀌면 선택 초기화 (받지 않는 직원 풀이 달라짐)
              setBulkSelectedIds([]);
            }}
            amount={bulkAmount}
            onAmountChange={setBulkAmount}
            effectiveFrom={bulkEffectiveFrom}
            onEffectiveFromChange={setBulkEffectiveFrom}
            selectedIds={bulkSelectedIds}
            onSelectedIdsChange={setBulkSelectedIds}
            keyword={bulkKeyword}
            onKeywordChange={setBulkKeyword}
            department={bulkDept}
            onDepartmentChange={setBulkDept}
          />
        )}
        {grantSingleMember && (
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
                  <Typography.Text strong>
                    {grantSingleMember ? '추가할 수당 항목' : `부여 행 (${fields.length}건)`}
                  </Typography.Text>
                  {!grantSingleMember && (
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
                  )}
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
                    {grantSingleMember ? (
                      <>
                        {/* form 값은 hidden 으로 등록, 시각 표시는 별도 Input - Form.Item 이 value 를 덮어쓰는 문제 회피 */}
                        <Form.Item name={[field.name, 'memberId']} hidden noStyle>
                          <Input />
                        </Form.Item>
                        <Input
                          value={labelFor(grantSingleMember)}
                          disabled
                          className="!tw-bg-slate-50 !tw-text-slate-700"
                        />
                      </>
                    ) : (
                      <Form.Item
                        name={[field.name, 'memberId']}
                        rules={[{ required: true, message: '직원 선택' }]}
                        className="!tw-mb-0"
                      >
                        <MemberSearchSelect width="100%" placeholder="이름·이메일" />
                      </Form.Item>
                    )}

                    <Form.Item
                      shouldUpdate={(prev, cur) =>
                        prev?.rows?.[field.name]?.memberId !==
                        cur?.rows?.[field.name]?.memberId
                      }
                      noStyle
                    >
                      {({ getFieldValue }) => {
                        const memberId = getFieldValue([
                          'rows',
                          field.name,
                          'memberId',
                        ]) as string | undefined;

                        // 그 직원의 활성 부여 항목 + 현재 금액 매핑
                        const memberFixedGrantedIds = new Set<string>();
                        const memberAmountByTpl = new Map<string, number>();
                        if (memberId) {
                          for (const a of (listQ.data ?? [])) {
                            if (a.memberId !== memberId) continue;
                            if (evalLifecycle(a.effectiveTo) === 'expired') continue;
                            if (!a.salaryItemTemplateId) continue;
                            memberAmountByTpl.set(a.salaryItemTemplateId, a.amount ?? 0);
                            const tpl = allowanceTemplates.find(
                              (t) => t.salaryItemTemplateId === a.salaryItemTemplateId,
                            );
                            // 고정 수당이면 미부여만 노출하기 위해 마킹
                            if (tpl?.fixedAmountYn === 'Y') {
                              memberFixedGrantedIds.add(a.salaryItemTemplateId);
                            }
                          }
                        }

                        // 옵션 필터 - 직원 미선택이면 전체, 선택이면 (미부여 고정 OR 차등 수당)
                        const filteredTpls = memberId
                          ? allowanceTemplates.filter((t) => {
                              if (!t.salaryItemTemplateId) return false;
                              const isFixed = t.fixedAmountYn === 'Y';
                              if (isFixed && memberFixedGrantedIds.has(t.salaryItemTemplateId)) {
                                return false;
                              }
                              return true;
                            })
                          : allowanceTemplates;

                        // 옵션을 두 그룹으로 분리: 이미 받는 항목(금액 변경) / 새로 부여 가능
                        const grantedTpls = filteredTpls.filter(
                          (t) => t.salaryItemTemplateId && memberAmountByTpl.has(t.salaryItemTemplateId),
                        );
                        const newTpls = filteredTpls.filter(
                          (t) => !(t.salaryItemTemplateId && memberAmountByTpl.has(t.salaryItemTemplateId)),
                        );
                        const renderLabel = (t: SalaryItemTemplate) => {
                          const isCommon = t.fixedAmountYn === 'Y';
                          const isRetirement = RETIREMENT_AUTO_ITEMS.has(t.itemName ?? '');
                          const tags: string[] = [];
                          if (isCommon) tags.push('회사공통');
                          if (isRetirement) tags.push('사직서 승인 후');
                          const suffix = tags.length ? ` (${tags.join(' / ')})` : '';
                          return `${t.itemName ?? ''}${suffix}`;
                        };
                        const groupedOptions = [];
                        if (grantedTpls.length > 0) {
                          groupedOptions.push({
                            label: (
                              <span className="tw-text-amber-700 tw-font-semibold">
                                ▸ 이미 받는 항목 (금액 변경)
                              </span>
                            ),
                            options: grantedTpls.map((t) => {
                              const cur = memberAmountByTpl.get(t.salaryItemTemplateId!) ?? 0;
                              return {
                                value: t.salaryItemTemplateId!,
                                label: (
                                  <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                                    <span>{renderLabel(t)}</span>
                                    <span className="tw-text-xs tw-text-amber-700">
                                      현재 {cur.toLocaleString('ko-KR')}원
                                    </span>
                                  </div>
                                ),
                              };
                            }),
                          });
                        }
                        if (newTpls.length > 0) {
                          groupedOptions.push({
                            label: (
                              <span className="tw-text-slate-600 tw-font-semibold">
                                ▸ 새로 부여
                              </span>
                            ),
                            options: newTpls.map((t) => ({
                              value: t.salaryItemTemplateId!,
                              label: renderLabel(t),
                            })),
                          });
                        }
                        return (
                          <Form.Item
                            name={[field.name, 'salaryItemTemplateId']}
                            rules={[{ required: true, message: '항목 선택' }]}
                            className="!tw-mb-0"
                          >
                            <Select
                              loading={tplQ.isLoading}
                              placeholder={memberId ? '항목 선택' : '직원 먼저 선택'}
                              disabled={!memberId}
                              popupMatchSelectWidth={360}
                              options={groupedOptions}
                              onChange={(val: string) => {
                                const tpl = allowanceTemplates.find(
                                  (t) => t.salaryItemTemplateId === val,
                                );
                                let nextAmount: number | undefined;
                                if (tpl?.fixedAmountYn === 'Y') {
                                  // 고정 수당 - 템플릿 기본 금액
                                  nextAmount = tpl.defaultAmount ?? undefined;
                                } else {
                                  // 차등 수당 - 그 직원이 받고 있는 금액 (있으면)
                                  nextAmount = memberAmountByTpl.get(val);
                                }
                                // 항목 변경 시 amount 항상 리셋 후 새 항목 기본/기존 금액으로 채움 (이전 항목 금액 잔존 방지)
                                const rows = (grantForm.getFieldValue('rows') ?? []) as GrantRow[];
                                rows[field.name] = {
                                  ...rows[field.name],
                                  amount: nextAmount ?? undefined,
                                };
                                grantForm.setFieldValue('rows', [...rows]);
                              }}
                            />
                          </Form.Item>
                        );
                      }}
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

                    {!grantSingleMember && (
                      <Button
                        size="small"
                        danger
                        type="text"
                        disabled={fields.length === 1}
                        onClick={() => remove(field.name)}
                      >
                        ✕
                      </Button>
                    )}
                    {grantSingleMember && <div />}
                  </div>
                ))}
              </div>
            )}
          </Form.List>

          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-3 !tw-text-xs">
            * 관리자가 부여할시에 별도 결재 없이 즉시 활성화됩니다.
          </Typography.Paragraph>
        </Form>
        )}
      </Modal>
    </Space>
  );
}

export default AdminMemberAllowancePage;
