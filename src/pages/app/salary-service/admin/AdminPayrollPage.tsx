/** /app/payroll/admin — 회사 월 단위 급여대장 관리 (시스템 관리자)
 *
 *  메인: 회사 전체 그 달 급여대장 행 (KPI + 필터 + 다중 선택 + 일괄 액션)
 *  보조: 직원별 이력 조회 탭
 *  버튼: 엑셀 다운로드 / 재계산 / 누락 직원 추가
 */
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  Typography,
} from 'antd';
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { memberApi } from '@/features/member/api/memberApi';
import { SalaryTab } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';
import type {
  Payroll,
  PayrollAdminListItem,
  PayrollStatusCode,
} from '@/features/salary-service/types';

const STATUS_KO: Record<string, string> = {
  DRAFT: '작성중',
  CONFIRMED: '확정',
  PAID: '지급완료',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  CONFIRMED: 'blue',
  PAID: 'green',
};

const PAYROLL_TYPE_KO: Record<string, string> = {
  REGULAR_MONTHLY: '정기급여',
  PERFORMANCE_BONUS: '성과급',
  SPECIAL_BONUS: '특별상여',
  RETROACTIVE: '소급분',
};

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
}: { name?: string; label?: string; required?: boolean }) {
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
          debounced.trim().length < 1
            ? <span className="tw-text-slate-500">한 글자 이상 입력하세요</span>
            : isFetching ? '검색 중…' : '검색 결과 없음'
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
    tab?: 'company' | 'member' | 'salary';
  };
  const activeTab = search?.tab ?? 'company';
  const setActiveTab = (key: string) => {
    void navigate({
      to: '/app/payroll/admin',
      search: { tab: key as 'company' | 'member' | 'salary' },
    });
  };

  const [yearMonth, setYearMonth] = useState<dayjs.Dayjs>(() => dayjs());
  const ym = yearMonth.format('YYYY-MM');

  /* ── 회사 전체 그 달 목록 (메인) ── */
  const listQ = useQuery({
    queryKey: ['salary', 'payroll', 'admin-list', ym],
    queryFn: () => salaryApi.payroll.listByCompanyMonth(ym),
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

  /* ── 부서 옵션 (필터) ── */
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.organizationName) set.add(r.organizationName);
    }
    return Array.from(set).sort().map((d) => ({ value: d, label: d }));
  }, [rows]);

  /* ── 필터 상태 ── */
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<PayrollStatusCode | 'ALL'>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string | 'ALL'>('ALL');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.payrollStatus !== statusFilter) return false;
      if (departmentFilter !== 'ALL' && r.organizationName !== departmentFilter) return false;
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
  }, [rows, statusFilter, departmentFilter, keyword]);

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

  /* ── 재계산 모달 ── */
  const onRecalculateClick = () => {
    let chosen: dayjs.Dayjs | null = null;
    modal.confirm({
      title: '회사 급여대장을 재계산할까요?',
      content: (
        <Space direction="vertical" size="small" className="tw-w-full">
          <Typography.Text type="secondary" className="!tw-text-xs">
            정산 연월일을 지정하거나 비워두면 정책 기준으로 자동 산정됩니다.
          </Typography.Text>
          <DatePicker
            className="tw-w-full"
            placeholder="정산일 (선택)"
            onChange={(d) => { chosen = d; }}
          />
        </Space>
      ),
      okText: '재계산',
      okButtonProps: { type: 'primary' },
      onOk: () => recalculateM.mutateAsync(chosen ? chosen.format('YYYY-MM-DD') : undefined),
    });
  };

  /* ── 메인 테이블 컬럼 ── */
  const columns: ColumnsType<PayrollAdminListItem> = useMemo(
    () => [
      { title: '사번', dataIndex: 'sabun', key: 'sabun', width: 90, render: (v) => v ?? '—' },
      { title: '이름', dataIndex: 'name', key: 'name', width: 110, render: (v) => v ?? '—' },
      { title: '부서', dataIndex: 'organizationName', key: 'organizationName', width: 130, render: (v) => v ?? '—' },
      {
        title: '귀속일',
        dataIndex: 'payrollYearMonthDay',
        key: 'payrollYearMonthDay',
        width: 120,
        sorter: (a, b) => (a.payrollYearMonthDay ?? '').localeCompare(b.payrollYearMonthDay ?? ''),
      },
      {
        title: '상태',
        dataIndex: 'payrollStatus',
        key: 'payrollStatus',
        width: 100,
        render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_KO[s] ?? s}</Tag>,
      },
      { title: '총지급', dataIndex: 'totalPayment', key: 'totalPayment', width: 130, align: 'right',
        render: (v) => formatWon(v),
        sorter: (a, b) => (a.totalPayment ?? 0) - (b.totalPayment ?? 0),
      },
      { title: '총공제', dataIndex: 'totalDeduction', key: 'totalDeduction', width: 130, align: 'right',
        render: (v) => formatWon(v),
      },
      { title: '실수령', dataIndex: 'netPay', key: 'netPay', width: 140, align: 'right',
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
              <Button type="link" size="small" danger className="!tw-p-0">삭제</Button>
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
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          급여 정산 관리
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            매월 배치로 자동 생성된 급여대장을 검증·확정·지급 처리합니다.
          </Typography.Paragraph>
        </div>
        <Space wrap size="middle">
          <DatePicker.MonthPicker
            value={yearMonth}
            onChange={(d) => d && setYearMonth(d)}
            format="YYYY-MM"
            allowClear={false}
          />
          <Button icon={<DownloadOutlined />} onClick={handleExport} loading={exporting}>
            엑셀 다운로드
          </Button>
          <Button icon={<ReloadOutlined />} onClick={onRecalculateClick} loading={recalculateM.isPending}>
            재계산
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => {
            createForm.resetFields();
            createForm.setFieldsValue({ payrollYearMonthDay: dayjs() });
            setCreateOpen(true);
          }}>
            누락 직원 추가
          </Button>
        </Space>
      </div>

      {/* KPI 4장 */}
      <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3">
        <Card size="small"><Statistic title="대상 직원" value={kpi.total} suffix="명" /></Card>
        <Card size="small"><Statistic title="작성중" value={kpi.draft} suffix="명" valueStyle={{ color: '#64748b' }} /></Card>
        <Card size="small"><Statistic title="확정 대기" value={kpi.confirmed} suffix="명" valueStyle={{ color: '#2563eb' }} /></Card>
        <Card size="small"><Statistic title="지급 완료" value={kpi.paid} suffix="명" valueStyle={{ color: '#16a34a' }} /></Card>
      </div>

      {/* 탭 */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'company',
            label: '이번달 정산',
            children: (
              <Card>
                {/* 필터 + 일괄 액션 */}
                <Space wrap className="tw-mb-3 tw-w-full tw-justify-between">
                  <Space wrap>
                    <Input.Search
                      placeholder="이름·사번·부서 검색"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      style={{ width: 240 }}
                      allowClear
                    />
                    <Select
                      value={statusFilter}
                      onChange={setStatusFilter}
                      style={{ width: 130 }}
                      options={[
                        { value: 'ALL', label: '상태 전체' },
                        { value: 'DRAFT', label: '작성중' },
                        { value: 'CONFIRMED', label: '확정' },
                        { value: 'PAID', label: '지급완료' },
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
                  </Space>
                </Space>

                <Table<PayrollAdminListItem>
                  rowKey={(r) => r.payrollId}
                  loading={listQ.isLoading}
                  dataSource={filtered}
                  columns={columns}
                  pagination={{ pageSize: 20, showSizeChanger: true }}
                  rowSelection={{
                    selectedRowKeys: selectedKeys,
                    onChange: setSelectedKeys,
                  }}
                  locale={{ emptyText: '해당 월의 급여대장이 없습니다. 우측 상단 [재계산] 버튼으로 생성하세요.' }}
                  onRow={(r) => ({
                    onClick: () => navigate({ to: '/app/payroll/admin/$payrollId', params: { payrollId: r.payrollId }, search: { tab: 'company' } }),
                    style: { cursor: 'pointer' },
                  })}
                  size="middle"
                />
              </Card>
            ),
          },
          {
            key: 'member',
            label: '정산 이력',
            children: <CompanyHistoryTab />,
          },
          {
            key: 'salary',
            label: '직원 급여 관리',
            children: <SalaryTab />,
          },
        ]}
      />

      {/* 누락 직원 추가 모달 */}
      <Modal
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createM.isPending}
        okText="생성"
        cancelText="취소"
        title="누락 직원 급여대장 생성"
        destroyOnClose
        width={520}
      >
        <Typography.Paragraph type="secondary" className="!tw-text-xs">
          신규 입사 자동 생성 누락 / 베이스 시기 등 예외 케이스 시 수동으로 1건 생성합니다.
        </Typography.Paragraph>
        <Form<CreateForm> form={createForm} layout="vertical" onFinish={(v) => createM.mutate(v)}>
          <MemberSearchSelect />
          <Form.Item
            label="정산 연월일"
            name="payrollYearMonthDay"
            rules={[{ required: true }]}
          >
            <DatePicker className="tw-w-full" format="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

/* ===== 정산 이력 탭 — 월별로 모든 직원 정산 결과 조회 (조회 전용) ===== */

function CompanyHistoryTab() {
  const navigate = useNavigate();
  const [historyMonth, setHistoryMonth] = useState<dayjs.Dayjs>(() => dayjs());
  const ym = historyMonth.format('YYYY-MM');

  const listQ = useQuery({
    queryKey: ['salary', 'payroll', 'history', ym],
    queryFn: () => salaryApi.payroll.listByCompanyMonth(ym),
  });
  const rows = listQ.data ?? [];

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.organizationName) set.add(r.organizationName);
    }
    return Array.from(set).sort().map((d) => ({ value: d, label: d }));
  }, [rows]);

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<PayrollStatusCode | 'ALL'>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string | 'ALL'>('ALL');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.payrollStatus !== statusFilter) return false;
      if (departmentFilter !== 'ALL' && r.organizationName !== departmentFilter) return false;
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
  }, [rows, statusFilter, departmentFilter, keyword]);

  const cols: ColumnsType<PayrollAdminListItem> = useMemo(
    () => [
      { title: '사번', dataIndex: 'sabun', key: 'sabun', width: 90, render: (v) => v ?? '—' },
      { title: '이름', dataIndex: 'name', key: 'name', width: 110, render: (v) => v ?? '—' },
      { title: '부서', dataIndex: 'organizationName', key: 'organizationName', width: 130, render: (v) => v ?? '—' },
      {
        title: '귀속일',
        dataIndex: 'payrollYearMonthDay',
        key: 'payrollYearMonthDay',
        width: 130,
      },
      {
        title: '급여구분',
        dataIndex: 'payrollType',
        key: 'payrollType',
        width: 110,
        render: (v?: string) => PAYROLL_TYPE_KO[v ?? ''] ?? v ?? '—',
      },
      {
        title: '상태',
        dataIndex: 'payrollStatus',
        key: 'payrollStatus',
        width: 100,
        render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_KO[s] ?? s}</Tag>,
      },
      { title: '총지급', dataIndex: 'totalPayment', key: 'totalPayment', width: 130, align: 'right',
        render: (v: number) => formatWon(v) },
      { title: '총공제', dataIndex: 'totalDeduction', key: 'totalDeduction', width: 130, align: 'right',
        render: (v: number) => formatWon(v) },
      { title: '실수령', dataIndex: 'netPay', key: 'netPay', width: 140, align: 'right',
        render: (v: number) => formatWon(v) },
      {
        title: '지급일',
        dataIndex: 'paidAt',
        key: 'paidAt',
        width: 120,
        render: (v?: string | null) => v ?? '—',
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
              search={{ tab: 'member' }}
              className="tw-text-[#2563EB]"
              onClick={(e) => e.stopPropagation()}
            >
              상세보기
            </Link>
          ) : null,
      },
    ],
    [],
  );

  return (
    <Card>
      <Space wrap className="tw-mb-3">
        <DatePicker.MonthPicker
          value={historyMonth}
          onChange={(d) => d && setHistoryMonth(d)}
          allowClear={false}
          format="YYYY-MM"
          style={{ width: 140 }}
        />
        <Input.Search
          placeholder="이름·사번·부서 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 130 }}
          options={[
            { value: 'ALL', label: '상태 전체' },
            { value: 'DRAFT', label: '작성중' },
            { value: 'CONFIRMED', label: '확정' },
            { value: 'PAID', label: '지급완료' },
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

      <Table<PayrollAdminListItem>
        rowKey={(r) => r.payrollId}
        loading={listQ.isLoading}
        dataSource={filtered}
        columns={cols}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        locale={{ emptyText: '해당 월의 정산 이력이 없습니다.' }}
        onRow={(r) => ({
          onClick: () =>
            navigate({ to: '/app/payroll/admin/$payrollId', params: { payrollId: r.payrollId }, search: { tab: 'member' } }),
          style: { cursor: 'pointer' },
        })}
        size="middle"
      />
    </Card>
  );
}
