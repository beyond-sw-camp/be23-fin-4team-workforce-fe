import { AppDataTable } from '@/shared/ui/AppDataTable';
/** /app/payroll/admin — 회사 월 단위 급여대장 관리 (시스템 관리자)
 *
 *  메인: 회사 전체 그 달 급여대장 행 (KPI + 필터 + 다중 선택 + 일괄 액션)
 *  보조: 직원별 이력 조회 탭
 *  버튼: 엑셀 다운로드 / 재계산 / 누락 직원 추가
 */
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { DeleteOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import React, { useMemo, useState } from 'react';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { AppSearchBar } from '@/shared/ui';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { memberApi } from '@/features/member/api/memberApi';
import { SalaryTab } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';
import { SalaryRegisterTab } from '@/pages/app/salary-service/admin/SalaryRegisterTab';
import { AdminMemberAllowancePage } from '@/pages/app/salary-service/admin/AdminMemberAllowancePage';
import { AdminRetirementSettlementPage } from '@/pages/app/salary-service/admin/AdminRetirementSettlementPage';
import { AdminBonusBatchTab } from '@/pages/app/salary-service/admin/AdminBonusBatchTab';
import type {
  Payroll,
  PayrollAdminListItem,
  PayrollStatusCode,
} from '@/features/salary-service/types';

const STATUS_KO: Record<string, string> = {
  DRAFT: '검토 전',
  CONFIRMED: '지급 대기',
  PAID: '지급 완료',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  CONFIRMED: 'blue',
  PAID: 'green',
};

const PAYROLL_TYPE_KO: Record<string, string> = {
  REGULAR_MONTHLY: '정기급여',
  PERFORMANCE_BONUS: '성과급',
  SPECIAL_BONUS: '정기·명절상여',
  RETROACTIVE: '소급분',
  RETIREMENT_SETTLEMENT: '퇴직정산',
};

// 급여 종류별 시각 구분 색깔 - 행/필터 태그 공통 사용
const PAYROLL_TYPE_COLOR: Record<string, string> = {
  REGULAR_MONTHLY: 'blue',
  PERFORMANCE_BONUS: 'green',
  SPECIAL_BONUS: 'gold',
  RETROACTIVE: 'purple',
  RETIREMENT_SETTLEMENT: 'volcano',
};

const PAYROLL_PANEL_CARD_CLASS =
  'tw-overflow-hidden tw-rounded-2xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)] [&_.ant-card-body]:tw-px-5 [&_.ant-card-body]:tw-pb-8 [&_.ant-card-body]:tw-pt-6 sm:[&_.ant-card-body]:tw-px-7';

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

/* ===== 직원 검색 자동완성 (재사용 가능) ===== */
function useDebounced<T>(value: T, delayMs: number): T {
  const [v, setV] = useState(value);
  useMemo(() => {
    const id = window.setTimeout(() => setV(value), delayMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return v;
}

function MemberSearchSelect({
  name = 'memberId',
  label = '구성원',
  required = true,
}: {
  name?: string;
  label?: string;
  required?: boolean;
}) {
  const [keyword, setKeyword] = useState('');
  const debounced = useDebounced(keyword, 320);
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['member', 'search', 'payroll-admin', debounced],
    queryFn: () => memberApi.searchMembersLookup({ keyword: debounced.trim(), page: 0, size: 30 }),
    enabled: debounced.trim().length >= 1,
  });
  const options = rows.map((m) => ({
    value: m.memberId,
    label: `${m.name ?? '이름 없음'} · ${m.email ?? '—'}`,
  }));
  return (
    <Form.Item
      name={name}
      label={label}
      rules={required ? [{ required: true, message: '구성원을 검색·선택하세요' }] : undefined}
    >
      <Select
        showSearch
        allowClear
        placeholder="이름·이메일·사번으로 검색"
        filterOption={false}
        searchValue={keyword}
        onSearch={setKeyword}
        onClear={() => setKeyword('')}
        notFoundContent={
          debounced.trim().length < 1 ? (
            <span className="tw-text-slate-500">한 글자 이상 입력하세요</span>
          ) : isFetching ? (
            '검색 중…'
          ) : (
            '검색 결과 없음'
          )
        }
        options={options}
        loading={isFetching}
      />
    </Form.Item>
  );
}

/* ===== 메인 페이지 ===== */

type CreateForm = {
  memberId: string;
  payrollYearMonthDay: dayjs.Dayjs;
};

export function AdminPayrollPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // 활성 탭을 URL search params 와 동기화 — 상세 화면에서 뒤로가기 시 같은 탭 유지
  const search = useSearch({ strict: false }) as {
    tab?: 'company' | 'member' | 'register' | 'bonus' | 'retirement' | 'salary' | 'allowances';
    /** 직원 상세/생성 직후 deep-link 로 들어오면 SalaryTab 이 해당 직원으로 prefill 된 등록 모달을 자동으로 띄운다. */
    createForMemberId?: string;
    /** 이번달 정산 조회 월 (YYYY-MM) — 상여 발행 후 자동 이동 등 */
    month?: string;
  };
  const activeTab = search?.tab ?? 'company';
  const setActiveTab = (key: string) => {
    void navigate({
      to: '/app/payroll/admin',
      // 탭 전환 시 deep-link 파라미터(createForMemberId)는 1회성이라 함께 비운다.
      search: {
        tab: key as
          | 'company'
          | 'member'
          | 'register'
          | 'bonus'
          | 'retirement'
          | 'salary'
          | 'allowances',
      },
    });
  };

  // URL search 의 month 우선 (상여 발행 후 해당 월로 이동 등) - 없으면 오늘
  const [yearMonth, setYearMonth] = useState<dayjs.Dayjs>(() =>
    search?.month ? dayjs(search.month + '-01') : dayjs(),
  );
  const ym = yearMonth.format('YYYY-MM');

  // URL month 변경 (외부 navigate) -> 내부 state 동기화
  React.useEffect(() => {
    if (search?.month) {
      const d = dayjs(search.month + '-01');
      if (d.isValid() && d.format('YYYY-MM') !== ym) {
        setYearMonth(d);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.month]);

  /* ── 정산 처리 탭 메인 - 시간 무관 + 처리 필요(DRAFT/CONFIRMED) 행 ── */
  const listQ = useQuery({
    queryKey: ['salary', 'payroll', 'pending'],
    queryFn: () => salaryApi.payroll.listPendingByCompany(),
  });

  /* ── 활성 직원 목록 - 누락자 검증용 ── */
  const activeMembersQ = useQuery({
    queryKey: ['member', 'list', 'all'],
    queryFn: () => memberApi.listMembersForApprovals(),
    staleTime: 60_000,
  });

  /* ── 활성 SalaryPolicy - 누락자 추가 시 정산 연월일 자동 계산용 (그 달 + payDay) ── */
  const salaryPoliciesQ = useQuery({
    queryKey: ['salary', 'salary-policies'],
    queryFn: () => salaryApi.salaryPolicy.list(),
    staleTime: 60_000,
  });
  const activePayDay = useMemo<number | null>(() => {
    const list = salaryPoliciesQ.data ?? [];
    // 가장 최근 활성 정책 1건 (effectiveTo 가 null 이거나 미래)
    const today = dayjs();
    const active = list.find(
      (p) =>
        (!p.effectiveTo || dayjs(p.effectiveTo).isAfter(today, 'day')) &&
        p.effectiveFrom &&
        !dayjs(p.effectiveFrom).isAfter(today, 'day'),
    );
    return active?.payDay ?? null;
  }, [salaryPoliciesQ.data]);

  /* ── 급여대장 사전 검증 — 정산 시작 전 가드 알림에 사용 ── */
  const precheckQ = useQuery({
    queryKey: ['salary', 'salaries', 'precheck'],
    queryFn: () => salaryApi.salary.precheck(),
    staleTime: 60_000,
  });

  const rows = listQ.data ?? [];

  /* ── KPI ── */
  const kpi = useMemo(() => {
    const total = rows.length;
    const draft = rows.filter((r) => r.payrollStatus === 'DRAFT').length;
    const confirmed = rows.filter((r) => r.payrollStatus === 'CONFIRMED').length;
    const paid = rows.filter((r) => r.payrollStatus === 'PAID').length;
    return { total, draft, confirmed, paid };
  }, [rows]);

  /* ── 이번 달 누락자 자동 검증 ──
  /* ── 부서 옵션 (필터) ── */
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.organizationName) set.add(r.organizationName);
    }
    return Array.from(set)
      .sort()
      .map((d) => ({ value: d, label: d }));
  }, [rows]);

  /* ── 필터 상태 ── */
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<PayrollStatusCode | 'ALL'>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.payrollStatus !== statusFilter) return false;
      if (departmentFilter !== 'ALL' && r.organizationName !== departmentFilter) return false;
      if (typeFilter !== 'ALL' && r.payrollType !== typeFilter) return false;
      if (keyword.trim()) {
        const k = keyword.trim().toLowerCase();
        const hits =
          (r.name?.toLowerCase().includes(k) ?? false) ||
          (r.sabun?.toLowerCase().includes(k) ?? false) ||
          (r.organizationName?.toLowerCase().includes(k) ?? false);
        if (!hits) return false;
      }
      return true;
    });
  }, [rows, statusFilter, departmentFilter, typeFilter, keyword]);

  // 급여구분별 합산 KPI - 정기/퇴직/상여/성과/소급분 분리 + 총합
  const breakdown = useMemo(() => {
    const groups: Record<string, { count: number; payment: number; net: number }> = {
      REGULAR_MONTHLY: { count: 0, payment: 0, net: 0 },
      RETIREMENT_SETTLEMENT: { count: 0, payment: 0, net: 0 },
      PERFORMANCE_BONUS: { count: 0, payment: 0, net: 0 },
      SPECIAL_BONUS: { count: 0, payment: 0, net: 0 },
      RETROACTIVE: { count: 0, payment: 0, net: 0 },
    };
    let totalPayment = 0;
    let totalDeduction = 0;
    let totalNet = 0;
    for (const r of filtered) {
      const t = r.payrollType ?? 'REGULAR_MONTHLY';
      if (!groups[t]) groups[t] = { count: 0, payment: 0, net: 0 };
      groups[t].count++;
      groups[t].payment += r.totalPayment ?? 0;
      groups[t].net += r.netPay ?? 0;
      totalPayment += r.totalPayment ?? 0;
      totalDeduction += r.totalDeduction ?? 0;
      totalNet += r.netPay ?? 0;
    }
    return { groups, totalPayment, totalDeduction, totalNet };
  }, [filtered]);

  /* ── 다중 선택 ── */
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  const selectedDraftIds = useMemo(
    () =>
      filtered
        .filter((r) => selectedKeys.includes(r.payrollId) && r.payrollStatus === 'DRAFT')
        .map((r) => r.payrollId),
    [filtered, selectedKeys],
  );

  const selectedConfirmedIds = useMemo(
    () =>
      filtered
        .filter((r) => selectedKeys.includes(r.payrollId) && r.payrollStatus === 'CONFIRMED')
        .map((r) => r.payrollId),
    [filtered, selectedKeys],
  );

  // 삭제 가능 - PAID 제외 (지급 완료된 명세서는 삭제 차단)
  const selectedDeletableIds = useMemo(
    () =>
      filtered
        .filter((r) => selectedKeys.includes(r.payrollId) && r.payrollStatus !== 'PAID')
        .map((r) => r.payrollId),
    [filtered, selectedKeys],
  );

  /* ── 액션 mutations ── */
  const recalculateM = useMutation({
    mutationFn: (settlementDate?: string) =>
      salaryApi.payroll.recalculate({ settlementDate: settlementDate ?? null }),
    onSuccess: (r) => {
      message.success(
        `재계산 완료 — 생성 ${r.created}, 중복스킵 ${r.duplicateSkip}, 기본급없음 ${r.noSalary}, 예외 ${r.badRequest + r.fail}`,
      );
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
    },
    onError: (e: Error) => message.error(e.message || '재계산 실패'),
  });

  const bulkConfirmM = useMutation({
    mutationFn: (ids: string[]) => salaryApi.payroll.bulkConfirm(ids),
    onSuccess: (r) => {
      message.success(`일괄 확정 — 성공 ${r.success}, 실패 ${r.fail}`);
      if (r.fail > 0 && r.failures?.length) {
        Modal.warning({
          title: '일부 실패',
          content: <pre className="tw-text-xs">{r.failures.join('\n')}</pre>,
        });
      }
      setSelectedKeys([]);
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
    },
    onError: (e: Error) => message.error(e.message || '일괄 확정 실패'),
  });

  const bulkPayM = useMutation({
    mutationFn: (ids: string[]) => salaryApi.payroll.bulkPay(ids),
    onSuccess: (r) => {
      message.success(`일괄 지급 — 성공 ${r.success}, 실패 ${r.fail}`);
      if (r.fail > 0 && r.failures?.length) {
        Modal.warning({
          title: '일부 실패',
          content: <pre className="tw-text-xs">{r.failures.join('\n')}</pre>,
        });
      }
      setSelectedKeys([]);
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
    },
    onError: (e: Error) => message.error(e.message || '일괄 지급 실패'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.payroll.delete(id),
    onSuccess: () => {
      message.success('삭제 완료');
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제 실패'),
  });

  // 일괄 삭제 - 선택된 N건 순차 delete - 부분 실패 허용
  const bulkDeleteM = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => salaryApi.payroll.delete(id)),
      );
      const success = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - success;
      return { success, fail };
    },
    onSuccess: (r) => {
      message.success(`일괄 삭제 - 성공 ${r.success}, 실패 ${r.fail}`);
      setSelectedKeys([]);
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
    },
    onError: (e: Error) => message.error(e.message || '일괄 삭제 실패'),
  });

  /* ── 신규 생성 모달 ── */
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateForm>();

  const createM = useMutation({
    mutationFn: (v: CreateForm) =>
      salaryApi.payroll.create({
        memberId: v.memberId,
        payrollYearMonthDay: v.payrollYearMonthDay.format('YYYY-MM-DD'),
      }),
    onSuccess: () => {
      message.success('급여대장이 생성되었습니다.');
      setCreateOpen(false);
      createForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'payroll'] });
    },
    onError: (e: Error) => message.error(e.message || '생성 실패'),
  });

  /* ── 엑셀 다운로드 ── */
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await salaryApi.payroll.exportXlsx(ym);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll_${ym}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success(`${ym} 엑셀이 다운로드되었습니다.`);
    } catch (e: unknown) {
      const err = e as { message?: string };
      message.error(err?.message ?? '엑셀 다운로드 실패');
    } finally {
      setExporting(false);
    }
  };

  /* ── 명세서 생성·재산출 모달 ── */
  // 정산일 입력 받지 않고 회사 급여 정책의 정산일 기반 자동 산정
  // 시나리오 - 자동 배치 미실행, 신규 입사자 누락, 급여 정책 변경 후 재반영 등
  const onRecalculateClick = () => {
    modal.confirm({
      title: '이번 회차 급여 명세서를 생성/재산출할까요?',
      content: (
        <Space direction="vertical" size="small" className="tw-w-full">
          <Typography.Text className="!tw-text-xs">
            회사의 급여 정책에 따라 정산일을 자동 산출하고, 누락된 직원의 명세서를 일괄 생성합니다.
          </Typography.Text>
          <Typography.Text type="secondary" className="!tw-text-xs">
            • 이번 달 자동 배치 전이거나 명세서가 아직 안 만들어진 경우<br />
            • 신규 입사자나 누락 직원이 있는 경우<br />
            • 급여 정책/수당이 변경되어 다시 반영해야 하는 경우<br />
            (이미 만들어진 명세서는 중복 생성하지 않고 건너뜁니다)
          </Typography.Text>
        </Space>
      ),
      okText: '명세서 생성',
      okButtonProps: { type: 'primary' },
      onOk: () => recalculateM.mutateAsync(undefined),
    });
  };

  /* ── 메인 테이블 컬럼 ── */
  const columns: ColumnsType<PayrollAdminListItem> = useMemo(
    () => [
      { title: '사번', dataIndex: 'sabun', key: 'sabun', width: 90, render: (v) => v ?? '—' },
      { title: '이름', dataIndex: 'name', key: 'name', width: 110, render: (v) => v ?? '—' },
      {
        title: '부서',
        dataIndex: 'organizationName',
        key: 'organizationName',
        width: 130,
        render: (v) => v ?? '—',
      },
      {
        // 급여 종류 - 정기급여/정기상여/명절상여/성과급/퇴직정산/소급분 시각 구분
        title: '급여 종류',
        dataIndex: 'payrollType',
        key: 'payrollType',
        width: 110,
        render: (t: string) => {
          const color = PAYROLL_TYPE_COLOR[t] ?? 'default';
          return <Tag color={color}>{PAYROLL_TYPE_KO[t] ?? t}</Tag>;
        },
      },
      {
        title: '정산 대상',
        key: 'targetYearMonth',
        width: 170,
        sorter: (a, b) => (a.payrollYearMonthDay ?? '').localeCompare(b.payrollYearMonthDay ?? ''),
        render: (_, r) => {
          const ym = r.targetYearMonth;
          const day = r.payrollYearMonthDay;
          const monthLabel = ym ? `${parseInt(ym.split('-')[1] ?? '0', 10)}월분` : '-';
          return (
            <span>
              <Tag color="geekblue">{monthLabel}</Tag>
              <span className="tw-text-slate-500 tw-text-xs">{day ?? ''}</span>
            </span>
          );
        },
      },
      {
        title: '상태',
        dataIndex: 'payrollStatus',
        key: 'payrollStatus',
        width: 100,
        render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_KO[s] ?? s}</Tag>,
      },
      {
        title: '총지급',
        dataIndex: 'totalPayment',
        key: 'totalPayment',
        width: 130,
        align: 'right',
        render: (v) => formatWon(v),
        sorter: (a, b) => (a.totalPayment ?? 0) - (b.totalPayment ?? 0),
      },
      {
        title: '총공제',
        dataIndex: 'totalDeduction',
        key: 'totalDeduction',
        width: 130,
        align: 'right',
        render: (v) => formatWon(v),
      },
      {
        title: '실수령',
        dataIndex: 'netPay',
        key: 'netPay',
        width: 140,
        align: 'right',
        render: (v) => formatWon(v),
        sorter: (a, b) => (a.netPay ?? 0) - (b.netPay ?? 0),
      },
      {
        title: '액션',
        key: 'actions',
        width: 160,
        render: (_, r) => (
          <Space size="small" wrap>
            <Link
              to="/app/payroll/admin/$payrollId"
              params={{ payrollId: r.payrollId }}
              search={{ tab: 'company' }}
              className="tw-text-[#2563EB]"
            >
              상세
            </Link>
            <Popconfirm
              title="삭제할까요?"
              okText="삭제"
              cancelText="취소"
              onConfirm={() => deleteM.mutate(r.payrollId)}
            >
              <Tooltip title="삭제">
                <Button
                  type="link"
                  size="small"
                  danger
                  className="!tw-inline-flex !tw-h-7 !tw-w-7 !tw-items-center !tw-justify-center !tw-p-0"
                  icon={<DeleteOutlined />}
                  aria-label="급여대장 삭제"
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteM],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      {/* 상단 헤더 */}
      <AppWorkspacePageTitle
        eyebrow="PAYROLL"
        title="급여 정산 관리"
        subtitle="급여 검증과 지급처리를 하고, 등록, 정산 이력 확인을 합니다."
        extra={
          <Space wrap size="middle">
            <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>
              엑셀 다운로드
            </Button>
            <Tooltip title="이번 달 명세서를 일괄 생성하거나, 정책/수당 변경 사항을 반영해 다시 산출합니다.">
              <Button
                icon={<ReloadOutlined />}
                onClick={onRecalculateClick}
                loading={recalculateM.isPending}
              >
                명세서 생성
              </Button>
            </Tooltip>
          </Space>
        }
      />

      {/* 탭 */}
      <Card variant="borderless" className={PAYROLL_PANEL_CARD_CLASS}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'company',
              label: '정산 처리',
              children: (
                <Space direction="vertical" className="tw-w-full" size={14}>
                  {/* 이번 달 정기급여 누락자 검증 - 0건일 땐 안내 숨김, 누락 없음일 때만 success 표기 */}
                  {(() => {
                    const thisMonth = dayjs().format('YYYY-MM');
                    const thisMonthRegularRows = rows.filter(
                      (r) => r.payrollType === 'REGULAR_MONTHLY' && r.targetYearMonth === thisMonth,
                    );
                    if (thisMonthRegularRows.length === 0) return null;
                    return (
                      <Alert
                        type="success"
                        showIcon
                        message={`이번 달(${thisMonth}) 정기급여 대상 ${thisMonthRegularRows.length}명 — 누락 없음`}
                      />
                    );
                  })()}

                  {/* KPI 상태 3장 - 처리 필요 행만 표시하므로 지급 완료는 [지급 이력] 탭으로 분리 */}
                  <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-3 tw-gap-3">
                    <div className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-slate-50/60 tw-p-4">
                      <Statistic title="처리 대상" value={kpi.total} suffix="건" />
                    </div>
                    <div className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-slate-50/60 tw-p-4">
                      <Statistic
                        title="검토 전"
                        value={kpi.draft}
                        suffix="건"
                        valueStyle={{ color: '#64748b' }}
                      />
                    </div>
                    <div className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-slate-50/60 tw-p-4">
                      <Statistic
                        title="지급 대기"
                        value={kpi.confirmed}
                        suffix="건"
                        valueStyle={{ color: '#2563eb' }}
                      />
                    </div>
                  </div>

                  {/* 급여구분별 합산 - 정기/퇴직/상여/성과 분리 + 총합 */}
                  <section className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-slate-50/60 tw-p-4">
                    <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-3 lg:tw-grid-cols-6 tw-gap-3">
                      <div className="tw-pr-3 tw-border-r tw-border-slate-200">
                        <Typography.Text type="secondary" className="!tw-text-xs">
                          정기급여
                        </Typography.Text>
                        <div className="tw-mt-1">
                          <Typography.Text strong>
                            {formatWon(breakdown.groups.REGULAR_MONTHLY?.payment)}
                          </Typography.Text>
                          <Typography.Text type="secondary" className="!tw-text-xs tw-ml-1">
                            ({breakdown.groups.REGULAR_MONTHLY?.count ?? 0}건)
                          </Typography.Text>
                        </div>
                      </div>
                      <div className="tw-pr-3 tw-border-r tw-border-slate-200">
                        <Typography.Text type="secondary" className="!tw-text-xs">
                          퇴직정산
                        </Typography.Text>
                        <div className="tw-mt-1">
                          <Typography.Text strong>
                            {formatWon(breakdown.groups.RETIREMENT_SETTLEMENT?.payment)}
                          </Typography.Text>
                          <Typography.Text type="secondary" className="!tw-text-xs tw-ml-1">
                            ({breakdown.groups.RETIREMENT_SETTLEMENT?.count ?? 0}건)
                          </Typography.Text>
                        </div>
                      </div>
                      <div className="tw-pr-3 tw-border-r tw-border-slate-200">
                        <Typography.Text type="secondary" className="!tw-text-xs">
                          상여/성과
                        </Typography.Text>
                        <div className="tw-mt-1">
                          <Typography.Text strong>
                            {formatWon(
                              (breakdown.groups.PERFORMANCE_BONUS?.payment ?? 0) +
                                (breakdown.groups.SPECIAL_BONUS?.payment ?? 0),
                            )}
                          </Typography.Text>
                          <Typography.Text type="secondary" className="!tw-text-xs tw-ml-1">
                            (
                            {(breakdown.groups.PERFORMANCE_BONUS?.count ?? 0) +
                              (breakdown.groups.SPECIAL_BONUS?.count ?? 0)}
                            건)
                          </Typography.Text>
                        </div>
                      </div>
                      <div className="tw-pr-3 tw-border-r tw-border-slate-200">
                        <Typography.Text type="secondary" className="!tw-text-xs">
                          총지급
                        </Typography.Text>
                        <div className="tw-mt-1">
                          <Typography.Text strong className="!tw-text-blue-600">
                            {formatWon(breakdown.totalPayment)}
                          </Typography.Text>
                        </div>
                      </div>
                      <div className="tw-pr-3 tw-border-r tw-border-slate-200">
                        <Typography.Text type="secondary" className="!tw-text-xs">
                          총공제
                        </Typography.Text>
                        <div className="tw-mt-1">
                          <Typography.Text strong className="!tw-text-red-600">
                            {formatWon(breakdown.totalDeduction)}
                          </Typography.Text>
                        </div>
                      </div>
                      <div>
                        <Typography.Text type="secondary" className="!tw-text-xs">
                          실수령 합계
                        </Typography.Text>
                        <div className="tw-mt-1">
                          <Typography.Text strong className="!tw-text-emerald-600 !tw-text-base">
                            {formatWon(breakdown.totalNet)}
                          </Typography.Text>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-white tw-p-4">
                    {/* 필터 + 일괄 액션 */}
                    <Space wrap className="tw-mb-3 tw-w-full tw-justify-between">
                      <Space wrap>
                        <AppSearchBar
                          placeholder="이름·사번·부서 검색"
                          value={keyword}
                          onValueChange={setKeyword}
                          onSearch={setKeyword}
                          ariaLabel="급여대장 검색"
                          className="tw-w-full tw-flex-none sm:tw-w-[300px]"
                        />
                        <Select
                          value={statusFilter}
                          onChange={setStatusFilter}
                          style={{ width: 130 }}
                          options={[
                            { value: 'ALL', label: '상태 전체' },
                            { value: 'DRAFT', label: '검토 전' },
                            { value: 'CONFIRMED', label: '지급 대기' },
                            { value: 'PAID', label: '지급 완료' },
                          ]}
                        />
                        <Select
                          value={typeFilter}
                          onChange={setTypeFilter}
                          style={{ width: 140 }}
                          options={[
                            { value: 'ALL', label: '급여구분 전체' },
                            { value: 'REGULAR_MONTHLY', label: '정기급여' },
                            { value: 'RETIREMENT_SETTLEMENT', label: '퇴직정산' },
                            { value: 'PERFORMANCE_BONUS', label: '성과급' },
                            { value: 'SPECIAL_BONUS', label: '정기·명절상여' },
                            { value: 'RETROACTIVE', label: '소급분' },
                          ]}
                        />
                        <Select
                          value={departmentFilter}
                          onChange={setDepartmentFilter}
                          style={{ width: 160 }}
                          options={[{ value: 'ALL', label: '부서 전체' }, ...departmentOptions]}
                        />
                      </Space>
                      <Space wrap>
                        <Popconfirm
                          title={`선택 ${selectedDraftIds.length}건을 일괄 확정할까요?`}
                          okText="확정"
                          cancelText="취소"
                          disabled={selectedDraftIds.length === 0}
                          onConfirm={() => bulkConfirmM.mutate(selectedDraftIds)}
                        >
                          <Button
                            type="primary"
                            disabled={selectedDraftIds.length === 0}
                            loading={bulkConfirmM.isPending}
                          >
                            일괄 확정 ({selectedDraftIds.length})
                          </Button>
                        </Popconfirm>
                        <Popconfirm
                          title={`선택 ${selectedConfirmedIds.length}건을 일괄 지급 처리할까요?`}
                          okText="지급"
                          cancelText="취소"
                          disabled={selectedConfirmedIds.length === 0}
                          onConfirm={() => bulkPayM.mutate(selectedConfirmedIds)}
                        >
                          <Button
                            disabled={selectedConfirmedIds.length === 0}
                            loading={bulkPayM.isPending}
                          >
                            일괄 지급 ({selectedConfirmedIds.length})
                          </Button>
                        </Popconfirm>
                        <Popconfirm
                          title={`선택 ${selectedDeletableIds.length}건을 일괄 삭제할까요? (지급 완료 건은 제외)`}
                          okText="삭제"
                          okButtonProps={{ danger: true }}
                          cancelText="취소"
                          disabled={selectedDeletableIds.length === 0}
                          onConfirm={() => bulkDeleteM.mutate(selectedDeletableIds)}
                        >
                          <Button
                            danger
                            disabled={selectedDeletableIds.length === 0}
                            loading={bulkDeleteM.isPending}
                          >
                            일괄 삭제 ({selectedDeletableIds.length})
                          </Button>
                        </Popconfirm>
                      </Space>
                    </Space>

                    <AppDataTable<PayrollAdminListItem>
                      rowKey={(r) => r.payrollId}
                      loading={listQ.isLoading}
                      dataSource={filtered}
                      columns={columns}
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                      rowSelection={{
                        selectedRowKeys: selectedKeys,
                        onChange: setSelectedKeys,
                      }}
                      locale={{
                        emptyText:
                          '해당 월의 급여대장이 없습니다. 우측 상단 [재계산] 버튼으로 생성하세요.',
                      }}
                      size="middle"
                    />
                  </section>
                </Space>
              ),
            },
            {
              key: 'member',
              label: '지급 이력',
              children: <CompanyHistoryTab />,
            },
            {
              key: 'register',
              label: '급여 등록',
              children: <SalaryRegisterTab createForMemberId={search?.createForMemberId} />,
            },
            {
              key: 'bonus',
              label: '상여금 지급',
              children: <AdminBonusBatchTab />,
            },
            {
              key: 'retirement',
              label: '퇴직 정산',
              children: <AdminRetirementSettlementPage embedded />,
            },
            {
              key: 'salary',
              label: '급여 변동 이력',
              children: <SalaryTab createForMemberId={search?.createForMemberId} />,
            },
            {
              key: 'allowances',
              label: '수당 관리',
              children: <AdminMemberAllowancePage />,
            },
          ]}
        />
      </Card>

      {/* 월급 누락자 - 개별 추가 모달 (배너의 [개별 추가] 진입) */}
      <AppDoubleActionModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onConfirm={() => {
          // 정산 연월일 자동 - 화면 월 + 활성 정책 payDay
          const day = activePayDay ?? dayjs().date();
          const payDate = yearMonth.date(Math.min(day, yearMonth.daysInMonth()));
          createForm.setFieldsValue({ payrollYearMonthDay: payDate });
          createForm.submit();
        }}
        confirmLoading={createM.isPending}
        confirmText="추가"
        cancelText="취소"
        title="월급 누락자 추가"
        destroyOnHidden
        width={520}
      >
        <div className="tw-px-5 tw-py-4">
          <Typography.Paragraph type="secondary" className="!tw-text-xs">
            신규 입사·복귀 등으로 자동 정산에서 빠진 직원을 1명씩 추가합니다.
          </Typography.Paragraph>
          <Form<CreateForm> form={createForm} layout="vertical" onFinish={(v) => createM.mutate(v)}>
            <MemberSearchSelect />
            <Form.Item label="정산 연월일" className="!tw-mb-0">
              <Input
                disabled
                value={
                  activePayDay
                    ? `${ym}-${String(Math.min(activePayDay, yearMonth.daysInMonth())).padStart(2, '0')} (정책 월급일 자동 적용)`
                    : `${ym}-${String(dayjs().date()).padStart(2, '0')} (월급일 미설정 - 오늘 날짜로)`
                }
              />
            </Form.Item>
            {/* 실제 전송용 hidden field */}
            <Form.Item name="payrollYearMonthDay" hidden>
              <DatePicker />
            </Form.Item>
          </Form>
        </div>
      </AppDoubleActionModal>

    </Space>
  );
}

/* ===== 정산 이력 탭 — 월별로 모든 직원 정산 결과 조회 (조회 전용) ===== */

function CompanyHistoryTab() {
  const navigate = useNavigate();
  // URL search 의 ym 우선 (상세 -> 목록 복귀 시 보존),
  // 없으면 직전 월 (월별 정산 결과는 보통 지난달이 최신 지급분이라 직전달이 기본)
  const search = useSearch({ strict: false }) as { ym?: string };
  const initialMonth = search?.ym ? dayjs(search.ym + '-01') : dayjs().subtract(1, 'month');
  const [historyMonth, setHistoryMonth] = useState<dayjs.Dayjs>(() => initialMonth);
  const ym = historyMonth.format('YYYY-MM');

  // 사용자가 월 변경 시 URL 동기화 - 상세보기 진입 후 돌아왔을 때도 그대로 유지
  const handleMonthChange = (d: dayjs.Dayjs | null) => {
    if (!d) return;
    setHistoryMonth(d);
    void navigate({
      to: '/app/payroll/admin',
      search: { tab: 'member', ym: d.format('YYYY-MM') },
      replace: true,
    });
  };

  const listQ = useQuery({
    queryKey: ['salary', 'payroll', 'history', ym],
    queryFn: () => salaryApi.payroll.listByCompanyMonth(ym),
  });
  // 월별 정산 결과 = 과거 지급 이력 - PAID 만 노출 (작성중/확정 대기는 이번달 정산 탭에서 처리)
  const rows = useMemo(
    () => (listQ.data ?? []).filter((r) => r.payrollStatus === 'PAID'),
    [listQ.data],
  );

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.organizationName) set.add(r.organizationName);
    }
    return Array.from(set)
      .sort()
      .map((d) => ({ value: d, label: d }));
  }, [rows]);

  const [keyword, setKeyword] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (departmentFilter !== 'ALL' && r.organizationName !== departmentFilter) return false;
      if (typeFilter !== 'ALL' && r.payrollType !== typeFilter) return false;
      if (keyword.trim()) {
        const k = keyword.trim().toLowerCase();
        const hits =
          (r.name?.toLowerCase().includes(k) ?? false) ||
          (r.sabun?.toLowerCase().includes(k) ?? false) ||
          (r.organizationName?.toLowerCase().includes(k) ?? false);
        if (!hits) return false;
      }
      return true;
    });
  }, [rows, departmentFilter, typeFilter, keyword]);

  // 급여구분별 합산 - 정기/퇴직/상여/성과 분리 + 총합
  const breakdown = useMemo(() => {
    const groups: Record<string, { count: number; payment: number; net: number }> = {
      REGULAR_MONTHLY: { count: 0, payment: 0, net: 0 },
      RETIREMENT_SETTLEMENT: { count: 0, payment: 0, net: 0 },
      PERFORMANCE_BONUS: { count: 0, payment: 0, net: 0 },
      SPECIAL_BONUS: { count: 0, payment: 0, net: 0 },
      RETROACTIVE: { count: 0, payment: 0, net: 0 },
    };
    let totalPayment = 0;
    let totalDeduction = 0;
    let totalNet = 0;
    for (const r of filtered) {
      const t = r.payrollType ?? 'REGULAR_MONTHLY';
      if (!groups[t]) groups[t] = { count: 0, payment: 0, net: 0 };
      groups[t].count++;
      groups[t].payment += r.totalPayment ?? 0;
      groups[t].net += r.netPay ?? 0;
      totalPayment += r.totalPayment ?? 0;
      totalDeduction += r.totalDeduction ?? 0;
      totalNet += r.netPay ?? 0;
    }
    return { groups, totalPayment, totalDeduction, totalNet };
  }, [filtered]);

  const cols: ColumnsType<PayrollAdminListItem> = useMemo(
    () => [
      { title: '사번', dataIndex: 'sabun', key: 'sabun', width: 90, render: (v) => v ?? '—' },
      { title: '이름', dataIndex: 'name', key: 'name', width: 110, render: (v) => v ?? '—' },
      {
        title: '부서',
        dataIndex: 'organizationName',
        key: 'organizationName',
        width: 130,
        render: (v) => v ?? '—',
      },
      {
        title: '정산 대상',
        key: 'targetYearMonth',
        width: 180,
        render: (_, r) => {
          const ym = r.targetYearMonth;
          const day = r.payrollYearMonthDay;
          const monthLabel = ym ? `${parseInt(ym.split('-')[1] ?? '0', 10)}월분` : '-';
          return (
            <span>
              <Tag color="geekblue">{monthLabel}</Tag>
              <span className="tw-text-slate-500 tw-text-xs">{day ?? ''}</span>
            </span>
          );
        },
      },
      {
        title: '급여구분',
        dataIndex: 'payrollType',
        key: 'payrollType',
        width: 130,
        render: (v?: string) => {
          const color = PAYROLL_TYPE_COLOR[v ?? ''] ?? 'default';
          return <Tag color={color}>{PAYROLL_TYPE_KO[v ?? ''] ?? v ?? '—'}</Tag>;
        },
      },
      // 지급 이력은 PAID 만 노출하므로 상태 컬럼 제거 (모두 지급 완료)
      {
        title: '총지급',
        dataIndex: 'totalPayment',
        key: 'totalPayment',
        width: 130,
        align: 'right',
        render: (v: number) => formatWon(v),
      },
      {
        title: '총공제',
        dataIndex: 'totalDeduction',
        key: 'totalDeduction',
        width: 130,
        align: 'right',
        render: (v: number) => formatWon(v),
      },
      {
        title: '실수령',
        dataIndex: 'netPay',
        key: 'netPay',
        width: 140,
        align: 'right',
        render: (v: number) => formatWon(v),
      },
      {
        title: '지급일',
        key: 'paidAt',
        width: 160,
        render: (_, r) => {
          // 실제 지급된 날(paidAt) 우선, 없으면 정산 일 기반 예정/미지급 표시
          // 토/일은 직전 금요일로 보정 (BEFORE 실무 표준)
          if (r.paidAt) return r.paidAt;
          if (!r.payrollYearMonthDay) return <Typography.Text type="secondary">—</Typography.Text>;
          const d = dayjs(r.payrollYearMonthDay);
          const dow = d.day();
          const shifted = dow === 0 ? d.subtract(2, 'day') : dow === 6 ? d.subtract(1, 'day') : d;
          const today = dayjs().startOf('day');
          const isFuture = shifted.isAfter(today);
          return (
            <span>
              <Typography.Text type="secondary">{shifted.format('YYYY-MM-DD')}</Typography.Text>{' '}
              <Typography.Text type={isFuture ? 'secondary' : 'warning'} className="tw-text-xs">
                ({isFuture ? '예정' : '미지급'})
              </Typography.Text>
            </span>
          );
        },
      },
      {
        title: '액션',
        key: 'actions',
        width: 90,
        render: (_, r) =>
          r.payrollId ? (
            <Link
              to="/app/payroll/admin/$payrollId"
              params={{ payrollId: r.payrollId }}
              search={{ tab: 'member', ym }}
              className="tw-text-[#2563EB]"
              onClick={(e) => e.stopPropagation()}
            >
              상세보기
            </Link>
          ) : null,
      },
    ],
    [ym],
  );

  return (
    <Card>
      {/* 급여구분별 합산 KPI - 필터된 결과 기준 */}
      <div className="tw-mb-3 tw-grid tw-grid-cols-2 md:tw-grid-cols-3 lg:tw-grid-cols-6 tw-gap-2 tw-rounded-md tw-bg-slate-50 tw-px-3 tw-py-2.5">
        <div className="tw-pr-2 tw-border-r tw-border-slate-200">
          <Typography.Text type="secondary" className="!tw-text-xs">
            정기급여
          </Typography.Text>
          <div className="tw-mt-0.5">
            <Typography.Text strong>
              {formatWon(breakdown.groups.REGULAR_MONTHLY?.payment)}
            </Typography.Text>
            <Typography.Text type="secondary" className="!tw-text-xs tw-ml-1">
              ({breakdown.groups.REGULAR_MONTHLY?.count ?? 0}건)
            </Typography.Text>
          </div>
        </div>
        <div className="tw-pr-2 tw-border-r tw-border-slate-200">
          <Typography.Text type="secondary" className="!tw-text-xs">
            퇴직정산
          </Typography.Text>
          <div className="tw-mt-0.5">
            <Typography.Text strong>
              {formatWon(breakdown.groups.RETIREMENT_SETTLEMENT?.payment)}
            </Typography.Text>
            <Typography.Text type="secondary" className="!tw-text-xs tw-ml-1">
              ({breakdown.groups.RETIREMENT_SETTLEMENT?.count ?? 0}건)
            </Typography.Text>
          </div>
        </div>
        <div className="tw-pr-2 tw-border-r tw-border-slate-200">
          <Typography.Text type="secondary" className="!tw-text-xs">
            상여/성과
          </Typography.Text>
          <div className="tw-mt-0.5">
            <Typography.Text strong>
              {formatWon(
                (breakdown.groups.PERFORMANCE_BONUS?.payment ?? 0) +
                  (breakdown.groups.SPECIAL_BONUS?.payment ?? 0),
              )}
            </Typography.Text>
            <Typography.Text type="secondary" className="!tw-text-xs tw-ml-1">
              (
              {(breakdown.groups.PERFORMANCE_BONUS?.count ?? 0) +
                (breakdown.groups.SPECIAL_BONUS?.count ?? 0)}
              건)
            </Typography.Text>
          </div>
        </div>
        <div className="tw-pr-2 tw-border-r tw-border-slate-200">
          <Typography.Text type="secondary" className="!tw-text-xs">
            총지급
          </Typography.Text>
          <div className="tw-mt-0.5">
            <Typography.Text strong className="!tw-text-blue-600">
              {formatWon(breakdown.totalPayment)}
            </Typography.Text>
          </div>
        </div>
        <div className="tw-pr-2 tw-border-r tw-border-slate-200">
          <Typography.Text type="secondary" className="!tw-text-xs">
            총공제
          </Typography.Text>
          <div className="tw-mt-0.5">
            <Typography.Text strong className="!tw-text-red-600">
              {formatWon(breakdown.totalDeduction)}
            </Typography.Text>
          </div>
        </div>
        <div>
          <Typography.Text type="secondary" className="!tw-text-xs">
            실수령 합계
          </Typography.Text>
          <div className="tw-mt-0.5">
            <Typography.Text strong className="!tw-text-emerald-600">
              {formatWon(breakdown.totalNet)}
            </Typography.Text>
          </div>
        </div>
      </div>

      <Space wrap className="tw-mb-3">
        <DatePicker.MonthPicker
          value={historyMonth}
          onChange={handleMonthChange}
          allowClear={false}
          format="YYYY-MM"
          style={{ width: 140 }}
        />
        <AppSearchBar
          placeholder="이름·사번·부서 검색"
          value={keyword}
          onValueChange={setKeyword}
          onSearch={setKeyword}
          ariaLabel="급여 이력 검색"
          className="tw-w-full tw-flex-none sm:tw-w-[300px]"
        />
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          style={{ width: 140 }}
          options={[
            { value: 'ALL', label: '급여구분 전체' },
            { value: 'REGULAR_MONTHLY', label: '정기급여' },
            { value: 'RETIREMENT_SETTLEMENT', label: '퇴직정산' },
            { value: 'PERFORMANCE_BONUS', label: '성과급' },
            { value: 'SPECIAL_BONUS', label: '정기·명절상여' },
            { value: 'RETROACTIVE', label: '소급분' },
          ]}
        />
        <Select
          value={departmentFilter}
          onChange={setDepartmentFilter}
          style={{ width: 160 }}
          options={[{ value: 'ALL', label: '부서 전체' }, ...departmentOptions]}
        />
        <Typography.Text type="secondary" className="!tw-text-xs">
          총 {filtered.length}건
        </Typography.Text>
      </Space>

      <AppDataTable<PayrollAdminListItem>
        rowKey={(r) => r.payrollId}
        loading={listQ.isLoading}
        dataSource={filtered}
        columns={cols}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        locale={{ emptyText: '해당 월의 정산 이력이 없습니다.' }}
        size="middle"
      />
    </Card>
  );
}
