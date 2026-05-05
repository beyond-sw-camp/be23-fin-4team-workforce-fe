/** /app/salary/settings — 급여 정책·템플릿·직원 급여·세율 등 (시스템 관리자) */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { hasActivePayGradeSalaryPolicy } from '@/features/salary-service/lib/salaryPolicyAccess';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { memberApi } from '@/features/member/api/memberApi';
import { AdminPayGradeTablePage } from '@/pages/app/salary-service/admin/AdminPayGradeTablePage';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import type {
  ComprehensiveOvertimeStatus,
  Salary,
  SalaryPolicy,
  SalaryItemTemplate,
  TaxRate,
  WageSystemTypeCode,
  PeriodStartTypeCode,
  PeriodEndTypeCode,
  PayDayShiftRuleCode,
  ProrationMethodCode,
  TaxTypeCode,
  ItemTypeCode,
} from '@/features/salary-service/types';
import { TAX_CAP_SUPPORTED_TYPES } from '@/features/salary-service/types';

/* ─── 공통 한글 맵 ─── */

const WAGE_SYS_KO: Record<string, string> = { COMPREHENSIVE: '포괄', NON_COMPREHENSIVE: '비포괄' };
const TAX_TYPE_KO: Record<string, string> = {
  NATIONAL_PENSION: '국민연금',
  HEALTH_INSURANCE: '건강보험',
  LONG_TERM_CARE: '장기요양',
  EMPLOYMENT_INSURANCE: '고용보험',
  ACCIDENT_INSURANCE: '산재보험',
  INCOME_TAX: '소득세',
  LOCAL_INCOME_TAX: '지방소득세',
};
const ITEM_TYPE_KO: Record<string, string> = { EARNING: '지급', DEDUCTION: '공제' };
const PAY_DAY_SHIFT_KO: Record<string, string> = {
  BEFORE: '직전 영업일',
  AFTER: '직후 영업일',
  NONE: '해당일 그대로',
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * `GET /member/search`(member-service, QueryDSL) — **호출자와 동일 회사** 사원만.
 * ES 인덱스(`/search/employees`) 없어도 동작한다.
 */
function MemberIdSearchField({ name = 'memberId' }: { name?: string }) {
  const [searchText, setSearchText] = useState('');
  const debounced = useDebouncedValue(searchText, 320);
  const { data: rows = [], isFetching, isError, error } = useQuery({
    queryKey: ['member', 'search', 'salary-settings', debounced],
    queryFn: () => memberApi.searchMembersLookup({ keyword: debounced.trim(), page: 0, size: 30 }),
    enabled: debounced.trim().length >= 1,
    retry: 1,
  });
  const options = useMemo(
    () =>
      rows.map((m) => ({
        value: m.memberId,
        label: `${m.name ?? '이름 없음'} · ${m.email ?? '—'}`,
      })),
    [rows],
  );
  const errMsg = isError
    ? (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '검색에 실패했습니다.')
    : null;
  return (
    <Form.Item
      name={name}
      label="구성원"
      rules={[{ required: true, message: '검색 후 구성원을 선택하세요' }]}
    >
      <Select
        showSearch
        allowClear
        placeholder="이름·이메일·사번으로 검색"
        filterOption={false}
        searchValue={searchText}
        onSearch={setSearchText}
        onClear={() => setSearchText('')}
        notFoundContent={
          debounced.trim().length < 1 ? (
            <span className="tw-text-slate-500">한 글자 이상 입력하세요</span>
          ) : isFetching ? (
            '검색 중…'
          ) : errMsg ? (
            <span className="tw-text-red-600">{errMsg}</span>
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

/* ======================================================================
 * 1. 급여 이력 (Salary) — 연봉 인상 / 직급 변경 이력
 *    신규 입사 시 기본급은 Kafka 이벤트로 자동 생성되므로,
 *    이 탭은 "급여 변경 이력"을 쌓는 용도. 실수로 입사 당일과 같은
 *    effectiveFrom으로 등록하면 auto-create된 Salary가 마감되고
 *    중복 이력이 쌓이니 주의.
 * ====================================================================== */

type SalaryFormValues = {
  memberId: string;
  salaryPolicyId: string;
  baseSalary?: number;
  /** 호봉제 정책일 때만 */
  step?: number | null;
  /** 직급명·직책명은 신규 입사 시 인사정보로 입력되므로 모달에서는 표시·입력하지 않음.
   *  기존 행 수정 시 값 보존을 위해 form 상태로만 유지 */
  jobGradeName?: string;
  jobTitleName?: string;
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
  /** 부양가족수 0~11, 기본 1=본인만, 소득세 간이세액표 룩업용 */
  dependentCount?: number;
  /** 등록 시 함께 부여할 부가 수당 — 항목 select 만 받고 금액은 template.defaultAmount 자동 사용.
   *  amount 필드는 제출 시 자동 lookup 되므로 form 에는 없음. */
  allowances?: { salaryItemTemplateId?: string }[];
};

type BootstrapFormValues = {
  memberId: string;
  hireDate: dayjs.Dayjs;
  baseSalary?: number | null;
  jobGradeName?: string;
  jobTitleName?: string;
};

export function SalaryTab() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Salary | null>(null);
  const [form] = Form.useForm<SalaryFormValues>();

  /** 입사 누락 복구 모달 (자주 쓰는 기능이 아니므로 기본은 숨김) */
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapForm] = Form.useForm<BootstrapFormValues>();

  const listQ = useQuery({ queryKey: ['salary', 'salaries'], queryFn: () => salaryApi.salary.listByCompany() });
  const policiesQ = useQuery({ queryKey: ['salary', 'salary-policies'], queryFn: () => salaryApi.salaryPolicy.list() });
  const payGradesQ = useQuery({
    queryKey: ['salary', 'pay-grade-table'],
    queryFn: () => salaryApi.payGradeTable.list(),
  });
  /** 회사 공통 수당 항목 — 급여 등록 시 함께 부여 가능한 EARNING 항목 (자격수당·직책수당 등) */
  const tplQ = useQuery({
    queryKey: ['salary', 'salary-item-templates', 'allowance-options'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
  });
  /** 부가 수당 부여 가능 템플릿 — 기본급만 제외한 모든 EARNING 항목.
   *  회사 공통(Y) 도 노출 — 직원별 다른 금액이 필요할 때 override 용으로 부여 가능.
   *  defaultAmount 가 미지정인 항목은 dropdown 에서 disabled (먼저 지급 항목(수당) 에서 금액 셋업 필요). */
  const allowanceTemplates = useMemo(
    () =>
      (tplQ.data ?? [])
        .filter((t) => t.itemType === 'EARNING' && t.itemName !== '기본급'),
    [tplQ.data],
  );
  const allowanceTemplateOptions = useMemo(
    () =>
      allowanceTemplates.map((t) => {
        const hasAmount = t.defaultAmount != null;
        const scope = t.applyToAllYn === 'Y' ? '회사 공통' : '개인 차등';
        return {
          value: t.salaryItemTemplateId!,
          label: hasAmount
            ? `${t.itemName ?? ''} · ${t.defaultAmount!.toLocaleString('ko-KR')}원 (${scope})`
            : `${t.itemName ?? ''} · 금액 미지정 (지급 항목 메뉴에서 먼저 셋업)`,
          disabled: !hasAmount,
        };
      }),
    [allowanceTemplates],
  );
  /** 템플릿 ID → defaultAmount 빠른 조회용 (제출 시 amount 자동 채움) */
  const tplDefaultAmountMap = useMemo(() => {
    const m = new Map<string, number | null>();
    allowanceTemplates.forEach((t) => {
      if (t.salaryItemTemplateId) m.set(t.salaryItemTemplateId, t.defaultAmount ?? null);
    });
    return m;
  }, [allowanceTemplates]);

  /** 회사에 활성 급여 정책이 1개만 있으면 자동 선택 (사용자가 매번 고를 필요 없음).
   *  활성 = effectiveFrom <= 오늘 && (effectiveTo == null || effectiveTo >= 오늘) */
  const activePolicies = useMemo(() => {
    const today = dayjs().startOf('day');
    return (policiesQ.data ?? []).filter((p) => {
      const fromOk = !p.effectiveFrom || !dayjs(p.effectiveFrom).startOf('day').isAfter(today);
      const toOk = !p.effectiveTo || !dayjs(p.effectiveTo).startOf('day').isBefore(today);
      return fromOk && toOk;
    });
  }, [policiesQ.data]);
  const defaultPolicyId = activePolicies[0]?.salaryPolicyId ?? '';

  /** 현재 활성 호봉 (effectiveTo 없음) 만 추출, step 오름차순 */
  const activePayGrades = useMemo(
    () =>
      (payGradesQ.data ?? [])
        .filter((p) => p.effectiveTo == null && p.step != null)
        .sort((a, b) => (a.step ?? 0) - (b.step ?? 0)),
    [payGradesQ.data],
  );

  const payGradeStepMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of activePayGrades) {
      if (p.step != null && p.baseSalary != null) m.set(p.step, p.baseSalary);
    }
    return m;
  }, [activePayGrades]);

  const bootstrapM = useMutation({
    mutationFn: (v: BootstrapFormValues) =>
      salaryApi.salary.bootstrap({
        memberId: v.memberId.trim(),
        hireDate: v.hireDate.format('YYYY-MM-DD'),
        baseSalary: v.baseSalary ?? null,
        jobGradeName: v.jobGradeName?.trim() || null,
        jobTitleName: v.jobTitleName?.trim() || null,
      }),
    onSuccess: () => {
      message.success('복구 요청 완료 — 활성 급여정책이 있어야 실제 Salary가 생성됩니다.');
      setBootstrapOpen(false);
      bootstrapForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] });
    },
    onError: (e: Error) => message.error(e.message || '복구 실패'),
  });

  const createM = useMutation({
    mutationFn: async (v: SalaryFormValues) => {
      // 1) 급여 이력 등록
      const saved = await salaryApi.salary.create({
        memberId: v.memberId.trim(),
        salaryPolicyId: v.salaryPolicyId,
        baseSalary: v.step != null ? null : v.baseSalary ?? null,
        step: v.step ?? null,
        jobGradeName: v.jobGradeName?.trim() || null,
        jobTitleName: v.jobTitleName?.trim() || null,
        effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
        dependentCount: v.dependentCount ?? 1,
      });
      // 2) 부가 수당 함께 등록 — 항목 select 만 받고 금액은 template.defaultAmount 자동 사용.
      //    defaultAmount 가 null 인 항목은 dropdown 에서 disabled 라 여기 도달하지 않음.
      const validAllowances = (v.allowances ?? [])
        .map((a) => ({
          salaryItemTemplateId: a.salaryItemTemplateId,
          amount: a.salaryItemTemplateId
            ? tplDefaultAmountMap.get(a.salaryItemTemplateId) ?? null
            : null,
        }))
        .filter((a) => a.salaryItemTemplateId && a.amount != null && a.amount > 0);
      const grantResults = await Promise.allSettled(
        validAllowances.map((a) =>
          salaryApi.memberAllowanceAdmin.autoGrant({
            memberId: v.memberId.trim(),
            salaryItemTemplateId: a.salaryItemTemplateId!,
            amount: a.amount!,
            effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
          }),
        ),
      );
      const grantFailed = grantResults.filter((r) => r.status === 'rejected').length;
      return { saved, grantTotal: validAllowances.length, grantFailed };
    },
    onSuccess: ({ grantTotal, grantFailed }) => {
      if (grantTotal === 0) {
        message.success('급여 등록 완료');
      } else if (grantFailed === 0) {
        message.success(`급여 등록 완료 — 수당 ${grantTotal}건 함께 부여됨`);
      } else {
        message.warning(`급여는 등록됐지만 수당 ${grantFailed}/${grantTotal}건 부여 실패. [수당 관리] 에서 확인해주세요.`);
      }
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] });
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin', 'list'] });
    },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: SalaryFormValues }) =>
      salaryApi.salary.update(id, {
        salaryPolicyId: v.salaryPolicyId,
        baseSalary: v.step != null ? null : v.baseSalary ?? null,
        step: v.step ?? null,
        jobGradeName: v.jobGradeName?.trim() || null,
        jobTitleName: v.jobTitleName?.trim() || null,
        effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
        dependentCount: v.dependentCount ?? 1,
      }),
    onSuccess: () => { message.success('수정 완료'); setOpen(false); setEditing(null); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

  const deleteM = useMutation({
    mutationFn: (params: { id: string; force?: boolean }) =>
      salaryApi.salary.delete(params.id, params.force ? { force: true } : undefined),
    onSuccess: () => { message.success('삭제 완료'); void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

  /** 활성/비활성 판정 — 백엔드 Salary.isActive() 와 동일 룰 */
  const isSalaryRowActive = (s: Salary): boolean => {
    if (!s.effectiveFrom) return false;
    const today = dayjs().startOf('day');
    const startedOk = !dayjs(s.effectiveFrom).startOf('day').isAfter(today);
    const notEnded = !s.effectiveTo || !dayjs(s.effectiveTo).startOf('day').isBefore(today);
    return startedOk && notEnded;
  };

  /** 삭제 클릭 핸들러 — 활성 행이면 강제 삭제 confirm, 아니면 일반 삭제 confirm */
  const handleDelete = (r: Salary) => {
    if (!r.salaryId) return;
    const active = isSalaryRowActive(r);
    modal.confirm({
      title: active ? '현재 적용 중인 급여 삭제' : '급여 이력 삭제',
      content: active
        ? '이 급여는 현재 적용 중입니다. 잘못 등록된 경우 [강제 삭제] 로 즉시 제거합니다. (이미 생성된 월 급여대장은 영향받지 않습니다.)'
        : '이 급여 이력을 삭제합니다.',
      okText: active ? '강제 삭제' : '삭제',
      okButtonProps: { danger: true },
      cancelText: '취소',
      onOk: () => deleteM.mutateAsync({ id: r.salaryId!, force: active }),
    });
  };

  const policyOptions = useMemo(
    () =>
      (policiesQ.data ?? [])
        .map((p) => ({ value: p.salaryPolicyId!, label: p.policyName ?? '' })),
    [policiesQ.data],
  );

  const salaries = listQ.data ?? [];

  const deriveStatus = (row: Salary): 'ACTIVE' | 'ENDED' => {
    if (!row.effectiveTo) return 'ACTIVE';
    const end = dayjs(row.effectiveTo);
    if (!end.isValid()) return 'ACTIVE';
    return end.isBefore(dayjs().startOf('day')) ? 'ENDED' : 'ACTIVE';
  };

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ENDED'>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState<string | 'ALL'>('ALL');
  /** 신규 입사자(급여 미등록 default 상태) 만 보기 토글 */
  const [onlyNewHires, setOnlyNewHires] = useState(false);

  // 백엔드 응답에 이미 sabun/name/organizationName 결합되어 옴 N+1 호출 제거
  const enrichedRows = useMemo(
    () =>
      salaries.map((row) => ({
        ...row,
        sabun: row.sabun ?? null,
        memberName: row.name ?? null,
        organizationName: row.organizationName ?? null,
        salaryStatus: deriveStatus(row),
      })),
    [salaries],
  );

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of enrichedRows) {
      if (row.organizationName) set.add(row.organizationName);
    }
    return Array.from(set).sort().map((d) => ({ value: d, label: d }));
  }, [enrichedRows]);

  const filteredRows = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return enrichedRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.salaryStatus !== statusFilter) return false;
      if (departmentFilter !== 'ALL' && row.organizationName !== departmentFilter) return false;
      // 신규 입사자(급여 미등록) = 활성 Salary 행인데 baseSalary == 0
      if (onlyNewHires) {
        const isActive = row.salaryStatus === 'ACTIVE';
        const isDefaultPay = (row.baseSalary ?? 0) === 0;
        if (!(isActive && isDefaultPay)) return false;
      }
      if (!k) return true;
      return (
        (row.sabun?.toLowerCase().includes(k) ?? false) ||
        (row.memberName?.toLowerCase().includes(k) ?? false) ||
        (row.organizationName?.toLowerCase().includes(k) ?? false)
      );
    });
  }, [departmentFilter, enrichedRows, keyword, onlyNewHires, statusFilter]);

  // 신규 입사자 카운트 — 토글 옆에 표시
  const newHireCount = useMemo(
    () => enrichedRows.filter((r) => r.salaryStatus === 'ACTIVE' && (r.baseSalary ?? 0) === 0).length,
    [enrichedRows],
  );

  const cols = useMemo<ColumnsType<Salary>>(() => [
    { title: '사번', dataIndex: 'sabun', key: 'sabun', width: 120, render: (v) => v ?? '-' },
    { title: '이름', dataIndex: 'memberName', key: 'memberName', width: 120, render: (v) => v ?? '-' },
    { title: '부서', dataIndex: 'organizationName', key: 'organizationName', width: 150, render: (v) => v ?? '-' },
    {
      title: '호봉',
      dataIndex: 'step',
      key: 'step',
      width: 80,
      render: (v) => (v != null ? <Tag color="geekblue">{v}호봉</Tag> : '-'),
    },
    { title: '기본급', dataIndex: 'baseSalary', key: 'baseSalary', width: 140, render: (v) => v != null ? `${Number(v).toLocaleString()}원` : '-' },
    { title: '직급', dataIndex: 'jobGradeName', key: 'jobGradeName', width: 100 },
    { title: '직책', dataIndex: 'jobTitleName', key: 'jobTitleName', width: 100 },
    {
      title: '부양가족',
      dataIndex: 'dependentCount',
      key: 'dependentCount',
      width: 100,
      align: 'center',
      render: (v) => (v != null ? `${v}명` : <Typography.Text type="secondary">-</Typography.Text>),
    },
    { title: '적용 기간', key: 'eff', width: 220, render: (_, r) => `${r.effectiveFrom ?? ''} ~ ${r.effectiveTo ?? '진행중'}` },
    {
      title: '액션', key: 'actions', width: 140,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({
              memberId: r.memberId ?? '',
              salaryPolicyId: r.salaryPolicyId ?? '',
              baseSalary: Number(r.baseSalary ?? 0),
              step: r.step ?? null,
              jobGradeName: r.jobGradeName ?? '',
              jobTitleName: r.jobTitleName ?? '',
              effectiveRange: [r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(), r.effectiveTo ? dayjs(r.effectiveTo) : null],
              dependentCount: r.dependentCount ?? 1,
            });
          }}>수정</Button>
          <Button size="small" danger onClick={() => handleDelete(r)}>
            삭제
          </Button>
        </Space>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [form]);

  return (
    <>
      <Alert
        showIcon
        type="info"
        className="tw-mb-3"
        message="신규 입사자는 임시로 0원(연봉제) / 1호봉(호봉제) 으로 자동 생성됩니다. 
        정확한 기본급과 호봉은 [급여 등록] 으로 등록해주세요."
        description="연봉 인상, 직급 변경 시에도 동일하게 새 급여 이력을 추가합니다."
      />
      <div className="tw-flex tw-flex-wrap tw-justify-between tw-items-center tw-gap-2 tw-mb-3">
        <Typography.Text type="secondary" className="!tw-text-xs">
        
        </Typography.Text>
        <Space>
          <Button onClick={() => { bootstrapForm.resetFields(); bootstrapForm.setFieldsValue({ hireDate: dayjs() }); setBootstrapOpen(true); }}>
            입사 누락 복구
          </Button>
          <Button type="primary" onClick={() => {
            setEditing(null);
            form.resetFields();
            form.setFieldsValue({
              salaryPolicyId: defaultPolicyId,  // 활성 정책 자동 선택
              baseSalary: 0,
              step: null,
              effectiveRange: [dayjs(), null],
              dependentCount: 1,
              allowances: [],
            });
            setOpen(true);
          }}>
            급여 등록
          </Button>
        </Space>
      </div>
      <Space wrap className="tw-mb-3">
        <Input.Search
          placeholder="이름·사번·부서 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          style={{ width: 260 }}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 130 }}
          options={[
            { value: 'ALL', label: '상태 전체' },
            { value: 'ACTIVE', label: '진행중' },
            { value: 'ENDED', label: '종료' },
          ]}
        />
        <Select
          value={departmentFilter}
          onChange={setDepartmentFilter}
          style={{ width: 150 }}
          options={[{ value: 'ALL', label: '부서 전체' }, ...departmentOptions]}
        />
        <Space size={6} className="tw-pl-2 tw-border-l tw-border-slate-200">
          <Switch
            size="small"
            checked={onlyNewHires}
            onChange={setOnlyNewHires}
          />
          <Typography.Text className="!tw-text-sm">
            신규 입사자(급여 등록 대상)만
          </Typography.Text>
          {newHireCount > 0 && (
            <Tag color={onlyNewHires ? 'orange' : 'default'}>{newHireCount}명</Tag>
          )}
        </Space>
      </Space>
      <Table<Salary>
        rowKey={(r) => r.salaryId ?? Math.random().toString()}
        loading={listQ.isLoading}
        dataSource={filteredRows}
        columns={cols}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '등록된 급여 이력이 없습니다.' }}
      />
      <AppDoubleActionModal open={open} onClose={() => { setOpen(false); setEditing(null); form.resetFields(); }} onConfirm={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} confirmText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '급여 수정' : '급여 등록'} destroyOnHidden width={560}>
        <div className="tw-px-5 tw-py-4">
        <Form<SalaryFormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => editing?.salaryId ? updateM.mutate({ id: editing.salaryId, v }) : createM.mutate(v)}
          onValuesChange={(changed, all) => {
            // 정책 변경 시 호봉제/연봉제 전환에 따라 step/baseSalary 초기화
            if ('salaryPolicyId' in changed) {
              const next = (policiesQ.data ?? []).find((p) => p.salaryPolicyId === changed.salaryPolicyId);
              if (next?.usePayGradeYn === 'Y') {
                form.setFieldsValue({ baseSalary: 0 });
              } else {
                form.setFieldsValue({ step: null });
              }
            }
            // 호봉 변경 시 해당 호봉의 기본급 자동 계산 (표시용)
            if ('step' in changed && all.step != null) {
              const base = payGradeStepMap.get(all.step);
              if (base != null) form.setFieldsValue({ baseSalary: base });
            }
            // 부가 수당 — 금액은 제출 시 template.defaultAmount 가 자동 사용되므로
            // 별도 onValuesChange 처리 불필요.
          }}
        >
          {!editing && (
            <Alert
              type="info"
              showIcon
              className="!tw-mb-4"
              message={
                <Typography.Text className="!tw-text-sm">
                  급여를 등록하시려면 직원을 선택해주세요.
                </Typography.Text>
              }
            />
          )}

          {/* ─── 1. 대상 직원 ─── */}
          {!editing && (
            <div className="tw-mb-3">
              <Typography.Text strong className="!tw-text-xs !tw-text-slate-500 tw-block tw-mb-1">
                1. 대상 직원
              </Typography.Text>
              <MemberIdSearchField />
            </div>
          )}

          {/* ─── 2. 급여 정책 + 호봉/기본급 ─── */}
          <Typography.Text strong className="!tw-text-xs !tw-text-slate-500 tw-block tw-mb-1">
            2. 급여 정책 · 기본급
          </Typography.Text>
          {/* 활성 정책이 1개면 자동 선택됨 — 정보 표시만, 사용자 선택 불필요.
              여러 개일 땐 select 노출. 수정 모드에서도 그대로 노출(기존 정책 변경 가능). */}
          {activePolicies.length === 1 && !editing ? (
            <>
              <Form.Item name="salaryPolicyId" hidden>
                <Input />
              </Form.Item>
              <Alert
                type="info"
                showIcon
                className="!tw-mb-3"
                message={
                  <Typography.Text className="!tw-text-sm">
                    적용 급여 정책: <Typography.Text strong>{activePolicies[0].policyName}</Typography.Text>
                    {activePolicies[0].usePayGradeYn === 'Y' ? (
                      <Tag color="blue" className="!tw-ml-2">호봉제</Tag>
                    ) : (
                      <Tag color="purple" className="!tw-ml-2">연봉제</Tag>
                    )}
                  </Typography.Text>
                }
              />
            </>
          ) : (
            <Form.Item label="급여 정책" name="salaryPolicyId" rules={[{ required: true, message: '급여 정책을 선택하세요.' }]}>
              <Select options={policyOptions} placeholder="정책을 선택하면 호봉제/연봉제에 따라 입력 필드가 바뀝니다" loading={policiesQ.isLoading} />
            </Form.Item>
          )}

          {/* 정책 usePayGradeYn 따라 호봉/기본급 필드 분기 */}
          <Form.Item noStyle shouldUpdate={(p, c) => p.salaryPolicyId !== c.salaryPolicyId || p.step !== c.step}>
            {({ getFieldValue }) => {
              const policyId = getFieldValue('salaryPolicyId') as string | undefined;
              const policy = (policiesQ.data ?? []).find((p) => p.salaryPolicyId === policyId);
              if (!policy) {
                return (
                  <Typography.Text type="secondary" className="!tw-text-xs tw-block tw-mb-3">
                    급여 정책을 선택해주세요.
                  </Typography.Text>
                );
              }
              const isPayGrade = policy.usePayGradeYn === 'Y';
              const currentStep = getFieldValue('step') as number | null | undefined;
              const autoBase = currentStep != null ? payGradeStepMap.get(currentStep) : null;

              if (isPayGrade) {
                return (
                  <>
                    <Form.Item
                      label={
                        <Space size={6}>
                          호봉
                          <Tag color="blue">호봉제</Tag>
                        </Space>
                      }
                      name="step"
                      rules={[{ required: true, message: '호봉을 선택하세요.' }]}
                      extra={
                        activePayGrades.length === 0
                          ? '⚠️ 활성 호봉이 없습니다. 호봉표 관리에서 먼저 등록하세요.'
                          : '호봉을 선택하면 호봉표의 기본급이 자동 적용됩니다.'
                      }
                    >
                      <Select
                        placeholder="호봉 선택 (예: 1호봉, 2호봉 …)"
                        loading={payGradesQ.isLoading}
                        options={activePayGrades.map((p) => ({
                          value: p.step!,
                          label: `${p.step}호봉 · ${Number(p.baseSalary ?? 0).toLocaleString('ko-KR')}원`,
                        }))}
                        showSearch
                        optionFilterProp="label"
                      />
                    </Form.Item>
                    <Form.Item label="기본급 (원, 자동 계산)">
                      <InputNumber
                        value={autoBase ?? 0}
                        disabled
                        style={{ width: '100%' }}
                        formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '0원')}
                      />
                    </Form.Item>
                  </>
                );
              }
              return (
                <Form.Item
                  label={
                    <Space size={6}>
                      기본급 (월, 원)
                      <Tag color="purple">연봉제</Tag>
                    </Space>
                  }
                  name="baseSalary"
                  rules={[{ required: true, message: '기본급을 입력하세요.' }, { type: 'number', min: 0 }]}
                  extra="만원 단위 권장. 연봉제는 월 기본급을 입력합니다."
                >
                  <InputNumber
                    min={0}
                    step={100000}
                    style={{ width: '100%' }}
                    placeholder="예: 3,500,000"
                    formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}` : '')}
                    parser={(v) => Number(String(v ?? '').replace(/[^\d]/g, '')) as 0 | number}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>

          {/* 직급명·직책명은 인사정보 등록 시 입력값을 사용 — 모달에서 입력받지 않음.
              SalaryFormValues 의 jobGradeName/jobTitleName 은 수정 모드 값 보존용으로만 form 에 유지 */}

          {/* ─── 3. 부양가족 + 적용 기간 ─── */}
          <Typography.Text strong className="!tw-text-xs !tw-text-slate-500 tw-block tw-mb-1 tw-mt-3">
            3. 부양가족 · 적용 기간
          </Typography.Text>
          <Form.Item
            label="부양가족수"
            name="dependentCount"
            rules={[{ required: true, message: '부양가족수를 입력하세요.' }]}
            extra="본인 포함 (예: 본인만 1, 본인+배우자 2). 소득세 간이세액표 룩업에 사용됩니다."
          >
            <InputNumber min={0} max={11} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="적용 기간"
            name="effectiveRange"
            rules={[{ required: true, message: '적용 시작일을 선택하세요.' }]}
            extra="시작일은 신규 적용일, 종료일은 비워두면 진행중. 기존 이력과 같은 시작일은 거부됩니다."
          >
            <DatePicker.RangePicker allowEmpty={[false, true]} format="YYYY-MM-DD" style={{ width: '100%' }} />
          </Form.Item>

          {/* ─── 4. 부가 수당 (선택, 등록 모드만) ─── */}
          {!editing && (
            <>
              <Typography.Text strong className="!tw-text-xs !tw-text-slate-500 tw-block tw-mb-1 tw-mt-3">
                4. 부가 수당 <Typography.Text type="secondary" className="!tw-text-xs">(선택)</Typography.Text>
              </Typography.Text>
              <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-xs">
                자격수당·직책수당·자녀수당 등 개인 차등 수당을 함께 등록합니다. 적용 시작일은 위
                급여 적용 시작일과 동일하게 자동 부여(AUTO)됩니다.
              </Typography.Paragraph>
              <Form.List name="allowances">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" className="tw-w-full" size={8}>
                    {fields.map(({ key, name, ...restField }) => (
                      <Space key={key} align="baseline" className="tw-w-full" wrap={false}>
                        <Form.Item
                          {...restField}
                          name={[name, 'salaryItemTemplateId']}
                          rules={[{ required: true, message: '수당 항목 선택' }]}
                          className="!tw-mb-0 tw-w-full"
                          style={{ flex: 1, minWidth: 320 }}
                        >
                          <Select
                            placeholder="수당 항목 선택"
                            options={allowanceTemplateOptions}
                            loading={tplQ.isLoading}
                            showSearch
                            optionFilterProp="label"
                          />
                        </Form.Item>
                        <Button type="link" danger onClick={() => remove(name)}>
                          삭제
                        </Button>
                      </Space>
                    ))}
                    <Button
                      type="dashed"
                      onClick={() => add({})}
                      className="tw-w-full"
                      disabled={allowanceTemplateOptions.length === 0}
                    >
                      + 수당 추가
                    </Button>
                    {allowanceTemplateOptions.length === 0 ? (
                      <Typography.Text type="secondary" className="!tw-text-xs">
                        등록 가능한 수당 항목이 없습니다. [지급 항목(수당)] 탭에서 항목을 먼저 만들어주세요.
                      </Typography.Text>
                    ) : (
                      <Typography.Text type="secondary" className="!tw-text-xs">
                        금액은 [지급 항목(수당)] 에 셋업한 회사 기본 금액이 자동 적용됩니다. 금액 미지정 항목은 비활성화 — 먼저 메뉴에서 금액을 셋업해주세요.
                      </Typography.Text>
                    )}
                  </Space>
                )}
              </Form.List>
            </>
          )}
        </Form>
        </div>
      </AppDoubleActionModal>

      <AppDoubleActionModal
        open={bootstrapOpen}
        onClose={() => { setBootstrapOpen(false); bootstrapForm.resetFields(); }}
        onConfirm={() => bootstrapForm.submit()}
        confirmLoading={bootstrapM.isPending}
        confirmText="복구 요청"
        cancelText="취소"
        title="입사 누락 Salary 복구"
        destroyOnHidden
        width={520}
      >
        <Alert
          type="warning"
          showIcon
          className="tw-mb-3"
          message="활성 급여정책(SalaryPolicy)이 없으면 백엔드가 조용히 skip 합니다."
          description="먼저 '급여 정책' 탭에서 입사일 기준 활성 정책을 등록했는지 확인하세요."
        />
        <Form<BootstrapFormValues>
          form={bootstrapForm}
          layout="vertical"
          onFinish={(v) => bootstrapM.mutate(v)}
        >
          <MemberIdSearchField />
          <Form.Item label="입사일 (hireDate)" name="hireDate" rules={[{ required: true }]}><DatePicker className="tw-w-full" format="YYYY-MM-DD" /></Form.Item>
          <Form.Item label="기본급 (원, 생략 시 회사 기본값)" name="baseSalary"><InputNumber min={0} step={10000} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="직급명" name="jobGradeName"><Input maxLength={40} /></Form.Item>
          <Form.Item label="직책명" name="jobTitleName"><Input maxLength={40} /></Form.Item>
        </Form>
      </AppDoubleActionModal>
    </>
  );
}

/* ======================================================================
 * 2. 급여 정책 (SalaryPolicy)
 * ====================================================================== */

type PolicyFormValues = {
  policyName: string;
  payDay: number;
  usePayGradeYn: 'Y' | 'N';
  wageSystemType: WageSystemTypeCode;
  fixedOvertimeMinutes?: number;
  payDayShiftRule: PayDayShiftRuleCode;
  // 월 소정근로시간 시급 환산 기준 한국 표준 209
  monthlyOrdinaryHours: number;
  // 일할계산 방식 입사 / 퇴사 / 기간변경 월 적용
  prorationMethod: ProrationMethodCode;
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
};

const PRORATION_METHOD_KO: Record<string, string> = {
  DAYS_IN_MONTH: '해당월 일수 (28~31일)',
  FIXED_30: '30일 고정 (통상임금 표준)',
  WORKING_DAYS: '월 소정근로일 (간이 22일)',
};

function SalaryPolicyTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryPolicy | null>(null);
  const [form] = Form.useForm<PolicyFormValues>();

  const listQ = useQuery({ queryKey: ['salary', 'salary-policies'], queryFn: () => salaryApi.salaryPolicy.list() });

  const buildPayload = (v: PolicyFormValues) => ({
    policyName: v.policyName.trim(),
    payDay: v.payDay,
    usePayGradeYn: v.usePayGradeYn,
    wageSystemType: v.wageSystemType,
    fixedOvertimeMinutes: v.wageSystemType === 'NON_COMPREHENSIVE' ? 0 : (v.fixedOvertimeMinutes ?? 0),
    // 급여 정산 기간은 1일~말일 고정
    periodStartType: 'FIRST' as PeriodStartTypeCode,
    periodEndType: 'LAST' as PeriodEndTypeCode,
    payDayShiftRule: v.payDayShiftRule,
    monthlyOrdinaryHours: v.monthlyOrdinaryHours,
    prorationMethod: v.prorationMethod,
    effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
    effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
  });

  const createM = useMutation({
    mutationFn: (v: PolicyFormValues) => salaryApi.salaryPolicy.create(buildPayload(v)),
    onSuccess: () => { message.success('등록 완료'); setOpen(false); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salary-policies'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: PolicyFormValues }) => salaryApi.salaryPolicy.update(id, buildPayload(v)),
    onSuccess: () => { message.success('수정 완료'); setOpen(false); setEditing(null); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salary-policies'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.salaryPolicy.delete(id),
    onSuccess: () => { message.success('삭제 완료'); void qc.invalidateQueries({ queryKey: ['salary', 'salary-policies'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

  const cols = useMemo<ColumnsType<SalaryPolicy>>(() => [
    { title: '정책명', dataIndex: 'policyName', key: 'policyName' },
    { title: '지급일', dataIndex: 'payDay', key: 'payDay', width: 80, render: (v) => `${v}일` },
    {
      title: '지급일 조정',
      dataIndex: 'payDayShiftRule',
      key: 'payDayShiftRule',
      width: 120,
      render: (v) => <Tag color={v === 'BEFORE' ? 'geekblue' : v === 'AFTER' ? 'purple' : 'default'}>{PAY_DAY_SHIFT_KO[v ?? 'BEFORE'] ?? v ?? '—'}</Tag>,
    },
    {
      title: '임금체계',
      dataIndex: 'usePayGradeYn',
      key: 'usePayGradeYn',
      width: 110,
      render: (v) => v === 'Y'
        ? <Tag color="geekblue">호봉제</Tag>
        : <Tag color="default">연봉협상제</Tag>,
    },
    { title: '임금제', dataIndex: 'wageSystemType', key: 'wageSystemType', width: 100, render: (v) => <Tag color={v === 'COMPREHENSIVE' ? 'orange' : 'blue'}>{WAGE_SYS_KO[v] ?? v}</Tag> },
    {
      title: '월 소정근로시간',
      dataIndex: 'monthlyOrdinaryHours',
      key: 'monthlyOrdinaryHours',
      width: 130,
      render: (v: number | null) => v != null ? <Tag color="cyan">{v}h</Tag> : <Tag>209h</Tag>,
    },
    {
      title: '일할계산',
      dataIndex: 'prorationMethod',
      key: 'prorationMethod',
      width: 200,
      render: (v: string | null) => (
        <Tag>{PRORATION_METHOD_KO[v ?? 'DAYS_IN_MONTH'] ?? v ?? '—'}</Tag>
      ),
    },
    { title: '적용 기간', key: 'eff', width: 220, render: (_, r) => `${r.effectiveFrom ?? ''} ~ ${r.effectiveTo ?? '진행중'}` },
    {
      title: '액션', key: 'a', width: 140,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({
              policyName: r.policyName ?? '', payDay: r.payDay ?? 25,
              usePayGradeYn: r.usePayGradeYn === 'Y' ? 'Y' : 'N',
              wageSystemType: (r.wageSystemType as WageSystemTypeCode) ?? 'NON_COMPREHENSIVE',
              fixedOvertimeMinutes: r.fixedOvertimeMinutes ?? undefined,
              payDayShiftRule: (r.payDayShiftRule as PayDayShiftRuleCode) ?? 'BEFORE',
              monthlyOrdinaryHours: r.monthlyOrdinaryHours ?? 209,
              prorationMethod: (r.prorationMethod as ProrationMethodCode) ?? 'DAYS_IN_MONTH',
              effectiveRange: [r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(), r.effectiveTo ? dayjs(r.effectiveTo) : null],
            });
          }}>수정</Button>
          <Popconfirm title="삭제?" okText="삭제" cancelText="취소" onConfirm={() => r.salaryPolicyId && deleteM.mutate(r.salaryPolicyId)}><Button size="small" danger>삭제</Button></Popconfirm>
        </Space>
      ),
    },
  ], [deleteM, form]);

  return (
    <>
      <div className="tw-flex tw-justify-end tw-mb-3"><Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ payDay: 25, usePayGradeYn: 'N', wageSystemType: 'NON_COMPREHENSIVE', payDayShiftRule: 'BEFORE', monthlyOrdinaryHours: 209, prorationMethod: 'DAYS_IN_MONTH', effectiveRange: [dayjs(), null] }); setOpen(true); }}>정책 등록</Button></div>
      <Table<SalaryPolicy> rowKey={(r) => r.salaryPolicyId ?? Math.random().toString()} loading={listQ.isLoading} dataSource={listQ.data ?? []} columns={cols} pagination={{ pageSize: 10 }} locale={{ emptyText: '등록된 정책이 없습니다.' }} />
      <AppDoubleActionModal open={open} onClose={() => { setOpen(false); setEditing(null); form.resetFields(); }} onConfirm={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} confirmText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '급여 정책 수정' : '급여 정책 등록'} destroyOnHidden width={600}>
        <div className="tw-px-5 tw-py-4">
        <Form<PolicyFormValues> form={form} layout="vertical" onFinish={(v) => editing?.salaryPolicyId ? updateM.mutate({ id: editing.salaryPolicyId, v }) : createM.mutate(v)}>
          <Form.Item label="정책명" name="policyName" rules={[{ required: true }]}><Input maxLength={60} placeholder="예: ㅇㅇ컴퍼니 급여정책" /></Form.Item>
          <Form.Item label="지급일 (1~31)" name="payDay" rules={[{ required: true }]}><InputNumber min={1} max={31} style={{ width: 120 }} /></Form.Item>
          <Form.Item
            label="지급일 주말/공휴일 조정"
            name="payDayShiftRule"
            rules={[{ required: true }]}
            extra="지급일이 주말 또는 회사 휴일과 겹칠 때 처리 방식. 실무 표준은 '직전 영업일'."
          >
            <Select
              style={{ width: '100%' }}
              options={[
                { value: 'BEFORE', label: '직전 영업일 (실무 표준)' },
                { value: 'AFTER', label: '직후 영업일' },
                { value: 'NONE', label: '해당일 그대로' },
              ]}
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            className="!tw-mb-3"
            message="급여 정산 기간은 매월 1일부터 말일까지 고정입니다."
          />
          <Form.Item
            label="임금 체계"
            name="usePayGradeYn"
            rules={[{ required: true }]}
            extra="정책 한 건당 호봉제·연봉협상제 중 하나입니다. 호봉제면 호봉표 탭이 열리고, 연봉협상제면 급여 정산 메뉴에 연봉 협상이 표시됩니다."
          >
            <Select
              style={{ width: '100%' }}
              options={[
                { value: 'N', label: '연봉협상제 (기본급 직접 입력)' },
                { value: 'Y', label: '호봉제 (호봉표 기반 자동 계산)' },
              ]}
            />
          </Form.Item>
          <Space className="tw-w-full" size={16}>
            <Form.Item label="임금제 유형" name="wageSystemType" rules={[{ required: true }]}><Select style={{ width: 180 }} options={[{ value: 'COMPREHENSIVE', label: '포괄임금제' }, { value: 'NON_COMPREHENSIVE', label: '비포괄임금제' }]} /></Form.Item>
            <Form.Item noStyle shouldUpdate={(p, c) => p.wageSystemType !== c.wageSystemType}>
              {({ getFieldValue }) => getFieldValue('wageSystemType') === 'COMPREHENSIVE' ? (
                <Form.Item label="기본 초과근무시간(분), ex) 20시간(1200분)" name="fixedOvertimeMinutes"><InputNumber min={0} style={{ width: 140 }} /></Form.Item>
              ) : null}
            </Form.Item>
          </Space>
          <Alert
            type="info"
            showIcon
            className="!tw-mb-3"
            message="연장근무시간 인정 단위(15분/30분 절사)는 「연장근로 정책」에서 관리합니다."
          />
          <Space className="tw-w-full" size={16} align="start">
            <Form.Item
              label="월 소정근로시간"
              name="monthlyOrdinaryHours"
              rules={[
                { required: true, message: '월 소정근로시간을 입력하세요.' },
                { type: 'number', min: 1, max: 300, message: '1 ~ 300 사이' },
              ]}
              extra="시급 환산 기준. 한국 표준 209h (주 40h × 4.345 + 주휴 8h × 4.345). 주 35h 회사는 183h."
            >
              <InputNumber min={1} max={300} style={{ width: 160 }} addonAfter="시간" />
            </Form.Item>
            <Form.Item
              label="일할계산 방식"
              name="prorationMethod"
              rules={[{ required: true, message: '일할계산 방식을 선택하세요.' }]}
              extra="입사 / 퇴사 / 기간변경 월에 적용. 통상임금 표준은 30일 고정."
            >
              <Select
                style={{ width: 240 }}
                options={[
                  { value: 'DAYS_IN_MONTH', label: PRORATION_METHOD_KO.DAYS_IN_MONTH },
                  { value: 'FIXED_30', label: PRORATION_METHOD_KO.FIXED_30 },
                  { value: 'WORKING_DAYS', label: PRORATION_METHOD_KO.WORKING_DAYS },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item label="적용 기간" name="effectiveRange" rules={[{ required: true }]}><DatePicker.RangePicker allowEmpty={[false, true]} format="YYYY-MM-DD" style={{ width: '100%' }} /></Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>
    </>
  );
}

/* ======================================================================
 * 3. 세율 (TaxRate)
 * ====================================================================== */

type TaxFormValues = {
  taxType: TaxTypeCode;
  rate: number;
  applyYear: number;
  employerRate?: number;
  incomeCeiling?: number | null;
  incomeFloor?: number | null;
};

function TaxRateTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form] = Form.useForm<TaxFormValues>();
  const [listYear, setListYear] = useState(() => dayjs().year());

  const listQ = useQuery({
    queryKey: ['salary', 'tax-rates', listYear],
    queryFn: () => salaryApi.taxRate.list(listYear),
  });

  const createM = useMutation({
    mutationFn: (v: TaxFormValues) => salaryApi.taxRate.create(v),
    onSuccess: () => { message.success('등록 완료'); setOpen(false); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'tax-rates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: TaxFormValues }) => salaryApi.taxRate.update(id, v),
    onSuccess: () => { message.success('수정 완료'); setOpen(false); setEditing(null); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'tax-rates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.taxRate.delete(id),
    onSuccess: () => { message.success('삭제 완료'); void qc.invalidateQueries({ queryKey: ['salary', 'tax-rates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const initDefaultsM = useMutation({
    mutationFn: (year: number) => salaryApi.taxRate.initDefaults(year),
    onSuccess: (res) => {
      message.success(`${res.applyYear}년 표준 세율 ${res.inserted}건 반영, ${res.skipped}건 스킵`);
      void qc.invalidateQueries({ queryKey: ['salary', 'tax-rates'] });
    },
    onError: (e: Error) => message.error(e.message || '표준 세율 시드 실패'),
  });

  const taxTypeOpts = Object.entries(TAX_TYPE_KO).map(([value, label]) => ({ value, label: `${label} (${value})` }));

  const cols = useMemo<ColumnsType<TaxRate>>(() => [
    { title: '세금 유형', dataIndex: 'taxType', key: 'taxType', render: (v) => <Tag>{TAX_TYPE_KO[v] ?? v}</Tag> },
    { title: '적용 연도', dataIndex: 'applyYear', key: 'applyYear', width: 100 },
    { title: '근로자 부담률', dataIndex: 'rate', key: 'rate', width: 120, render: (v) => v != null ? `${(Number(v) * 100).toFixed(2)}%` : '-' },
    { title: '회사 부담률', dataIndex: 'employerRate', key: 'employerRate', width: 120, render: (v) => v != null ? `${(Number(v) * 100).toFixed(2)}%` : '-' },
    {
      title: '기준소득 상한',
      dataIndex: 'incomeCeiling',
      key: 'incomeCeiling',
      width: 150,
      render: (v) => v != null ? `${Number(v).toLocaleString('ko-KR')}원` : '-',
    },
    {
      title: '기준소득 하한',
      dataIndex: 'incomeFloor',
      key: 'incomeFloor',
      width: 150,
      render: (v) => v != null ? `${Number(v).toLocaleString('ko-KR')}원` : '-',
    },
    {
      title: '액션', key: 'a', width: 140,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({
              taxType: r.taxType as TaxTypeCode,
              rate: Number(r.rate ?? 0),
              applyYear: r.applyYear ?? dayjs().year(),
              employerRate: r.employerRate != null ? Number(r.employerRate) : undefined,
              incomeCeiling: r.incomeCeiling != null ? Number(r.incomeCeiling) : undefined,
              incomeFloor: r.incomeFloor != null ? Number(r.incomeFloor) : undefined,
            });
          }}>수정</Button>
          <Popconfirm title="삭제?" okText="삭제" cancelText="취소" onConfirm={() => r.taxRateId && deleteM.mutate(r.taxRateId)}><Button size="small" danger>삭제</Button></Popconfirm>
        </Space>
      ),
    },
  ], [deleteM, form]);

  const yearSelectOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const y = dayjs().year() - 5 + i;
        return { value: y, label: `${y}년` };
      }),
    [],
  );

  return (
    <>
      <div className="tw-flex tw-flex-wrap tw-justify-between tw-items-center tw-gap-2 tw-mb-3">
        <Space align="center">
          <Typography.Text type="secondary" className="!tw-text-sm">
            조회 연도
          </Typography.Text>
          <Select
            className="tw-min-w-[120px]"
            value={listYear}
            onChange={(y) => setListYear(y)}
            options={yearSelectOptions}
          />
        </Space>
        <Space>
          <Popconfirm
            title={`${listYear}년 표준 세율을 불러올까요?`}
            description="이미 등록된 세율은 유지되고, 없는 유형만 추가됩니다."
            okText="불러오기"
            cancelText="취소"
            onConfirm={() => initDefaultsM.mutate(listYear)}
          >
            <Button loading={initDefaultsM.isPending}>표준 세율 불러오기</Button>
          </Popconfirm>
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              form.resetFields();
              form.setFieldsValue({ applyYear: listYear, rate: 0 });
              setOpen(true);
            }}
          >
            세율 등록
          </Button>
        </Space>
      </div>
      <Table<TaxRate> rowKey={(r) => r.taxRateId ?? Math.random().toString()} loading={listQ.isLoading} dataSource={listQ.data ?? []} columns={cols} pagination={{ pageSize: 20 }} locale={{ emptyText: '등록된 세율이 없습니다.' }} />
      <AppDoubleActionModal
        open={open}
        onClose={() => { setOpen(false); setEditing(null); form.resetFields(); }}
        onConfirm={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        confirmText={editing ? '수정' : '등록'}
        cancelText="취소"
        title={editing ? '세율 수정' : '세율 등록'}
        destroyOnHidden
        width={520}
      >
        <div className="tw-px-5 tw-py-4">
        <Form<TaxFormValues> form={form} layout="vertical" onFinish={(v) => editing?.taxRateId ? updateM.mutate({ id: editing.taxRateId, v }) : createM.mutate(v)}>
          <Form.Item label="세금 유형" name="taxType" rules={[{ required: true }]}><Select options={taxTypeOpts} /></Form.Item>
          <Form.Item label="적용 연도" name="applyYear" rules={[{ required: true }]}><InputNumber min={2000} max={2099} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="근로자 부담률 (소수, 예: 0.045)" name="rate" rules={[{ required: true }]}><InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="회사 부담률 (소수, 선택)" name="employerRate"><InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} /></Form.Item>

          {/* 국민연금/건강보험만 상/하한 지원 */}
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.taxType !== curr.taxType}>
            {({ getFieldValue }) => {
              const currentType = getFieldValue('taxType') as TaxTypeCode | undefined;
              if (!currentType || !TAX_CAP_SUPPORTED_TYPES.has(currentType)) {
                return null;
              }
              return (
                <>
                  <Form.Item
                    label="기준소득 상한 (월, 원)"
                    name="incomeCeiling"
                    extra={
                      currentType === 'NATIONAL_PENSION'
                        ? '국민연금 기준소득월액 상한 (2026년 6,170,000원 기준)'
                        : '건강보험 보수월액 상한 (매년 변동)'
                    }
                  >
                    <InputNumber
                      min={0}
                      step={100000}
                      style={{ width: '100%' }}
                      formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
                      parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
                    />
                  </Form.Item>
                  <Form.Item
                    label="기준소득 하한 (월, 원)"
                    name="incomeFloor"
                    extra={
                      currentType === 'NATIONAL_PENSION'
                        ? '국민연금 기준소득월액 하한 (2026년 390,000원 기준)'
                        : '건강보험 보수월액 하한 (매년 변동)'
                    }
                  >
                    <InputNumber
                      min={0}
                      step={10000}
                      style={{ width: '100%' }}
                      formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
                      parser={(v) => Number((v ?? '').replace(/[^0-9]/g, '')) as 0}
                    />
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>
    </>
  );
}

/* ======================================================================
 * 4. 지급 항목 템플릿 (SalaryItemTemplate)
 *    회사가 직원에게 지급하는 항목 마스터 (기본급·수당 등)
 *    공제(4대보험·소득세) 는 [세금·4대보험] 메뉴에서 별도 관리
 * ====================================================================== */

type TemplateFormValues = {
  itemName: string;
  itemType: ItemTypeCode;
  displayOrder: number;
  isTaxableYn: 'Y' | 'N';
  // 통상임금 포함 여부 가산수당 시급 환산 base
  isOrdinaryWageYn: 'Y' | 'N';
  // 회사 기본 지급 금액 (수당 산식 v1) — applyToAll=Y 면 전 직원 자동 합산
  defaultAmount?: number | null;
  // 회사 공통(Y) / 개인 차등(N)
  applyToAllYn: 'Y' | 'N';
};

function SalaryItemTemplateTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryItemTemplate | null>(null);
  const [form] = Form.useForm<TemplateFormValues>();

  const listQ = useQuery({ queryKey: ['salary', 'salary-item-templates'], queryFn: () => salaryApi.salaryItemTemplate.list() });

  const createM = useMutation({
    mutationFn: (v: TemplateFormValues) => salaryApi.salaryItemTemplate.create(v),
    onSuccess: () => { message.success('등록 완료'); setOpen(false); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salary-item-templates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: TemplateFormValues }) => salaryApi.salaryItemTemplate.update(id, v),
    onSuccess: () => { message.success('수정 완료'); setOpen(false); setEditing(null); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salary-item-templates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => salaryApi.salaryItemTemplate.delete(id),
    onSuccess: () => { message.success('삭제 완료'); void qc.invalidateQueries({ queryKey: ['salary', 'salary-item-templates'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });
  const initDefaultsM = useMutation({
    mutationFn: () => salaryApi.salaryItemTemplate.initDefaults(),
    onSuccess: (res) => {
      if (res.created > 0) {
        message.success(`표준 급여 항목 ${res.created}건이 추가되었습니다.`);
      } else {
        message.info(res.message || '이미 표준 항목이 등록되어 있습니다.');
      }
      void qc.invalidateQueries({ queryKey: ['salary', 'salary-item-templates'] });
    },
    onError: (e: Error) => message.error(e.message || '기본 항목 불러오기에 실패했습니다.'),
  });

  const cols = useMemo<ColumnsType<SalaryItemTemplate>>(() => [
    {
      title: '항목명',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (v: string, r) => (
        <Space size={4}>
          <span>{v}</span>
          {r.isSystemDefault ? <Tag color="blue">기본</Tag> : null}
        </Space>
      ),
    },
    {
      // 카테고리 기준 월 비과세 한도 한도 없음 또는 미지정 dash
      title: '기본 비과세 금액',
      dataIndex: 'monthlyNonTaxableLimit',
      key: 'monthlyNonTaxableLimit',
      width: 160,
      align: 'right',
      render: (v: number | null | undefined, r) => {
        if (typeof v === 'number' && v > 0) {
          return <span>{v.toLocaleString('ko-KR')} 원 / 월</span>;
        }
        if (typeof v === 'number' && v === 0) {
          return <Typography.Text type="secondary">한도 없음</Typography.Text>;
        }
        // null 인 경우 한도 미정 카테고리 학자금 기타 비과세
        if (r.taxCategory === 'TUITION' || r.taxCategory === 'ETC_NON_TAXABLE') {
          return <Typography.Text type="secondary">실비 / 별도</Typography.Text>;
        }
        return <Typography.Text type="secondary">—</Typography.Text>;
      },
    },
    {
      // 적용 범위 — 회사 공통(Y) / 개인 차등(N).
      // 회사 공통이면 PayrollService 가 default_amount 를 모든 직원에게 자동 합산.
      title: '적용 범위',
      dataIndex: 'applyToAllYn',
      key: 'applyToAllYn',
      width: 120,
      render: (v: string | null | undefined) =>
        v === 'Y'
          ? <Tag color="cyan">회사 공통</Tag>
          : <Tag>개인 차등</Tag>,
    },
    {
      // 회사 기본 지급 금액 (수당 산식 v1) — applyToAll=Y 면 전 직원 자동 합산
      title: '기본 지급 금액',
      dataIndex: 'defaultAmount',
      key: 'defaultAmount',
      width: 160,
      align: 'right',
      render: (v: number | null | undefined) =>
        typeof v === 'number'
          ? <span>{v.toLocaleString('ko-KR')} 원</span>
          : <Typography.Text type="secondary">미지정</Typography.Text>,
    },
    {
      title: '유형',
      dataIndex: 'itemType',
      key: 'itemType',
      width: 100,
      render: (v) => (
        <Tag color={v === 'EARNING' ? 'green' : 'red'}>{ITEM_TYPE_KO[v] ?? v}</Tag>
      ),
    },
    {
      title: '과세',
      dataIndex: 'isTaxableYn',
      key: 'isTaxableYn',
      width: 100,
      render: (v) => (v === 'Y' ? <Tag color="blue">과세</Tag> : <Tag>비과세</Tag>),
    },
    {
      title: '통상임금',
      dataIndex: 'isOrdinaryWageYn',
      key: 'isOrdinaryWageYn',
      width: 110,
      render: (v) =>
        v === 'Y'
          ? <Tag color="purple">포함</Tag>
          : <Typography.Text type="secondary">제외</Typography.Text>,
    },
    {
      title: '액션',
      key: 'a',
      width: 180,
      render: (_, r) => (
        <Space>
          <Button size="middle" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({
              itemName: r.itemName ?? '',
              itemType: (r.itemType as ItemTypeCode) ?? 'EARNING',
              displayOrder: r.displayOrder ?? 0,
              isTaxableYn: (r.isTaxableYn as 'Y' | 'N') ?? 'Y',
              isOrdinaryWageYn: (r.isOrdinaryWageYn as 'Y' | 'N') ?? 'N',
              defaultAmount: r.defaultAmount ?? null,
              applyToAllYn: (r.applyToAllYn as 'Y' | 'N') ?? 'N',
            });
          }}>수정</Button>
          {r.isSystemDefault ? (
            <Typography.Text type="secondary" className="!tw-text-xs">
              삭제 불가
            </Typography.Text>
          ) : (
            <Popconfirm title="삭제?" okText="삭제" cancelText="취소" onConfirm={() => r.salaryItemTemplateId && deleteM.mutate(r.salaryItemTemplateId)}>
              <Button size="middle" danger>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ], [deleteM, form]);

  /** 표시는 displayOrder 오름차순 유지.
   *  기본급은 모든 직원이 받는 Salary.baseSalary 로 처리되므로 수당 목록에서는 숨김 (DB 행 자체는 유지). */
  const sortedItems = useMemo(
    () =>
      (listQ.data ?? [])
        .filter((t) => t.delYn !== 'Y' && t.itemName !== '기본급')
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [listQ.data],
  );

  return (
    <>
      <div className="tw-flex tw-justify-end tw-mb-3">
        <Space>
          <Popconfirm
            title="기본 급여 항목을 불러올까요?"
            description="기본급, 직책수당(과세), 식대·자가운전·보육·연구활동비(비과세)가 생성됩니다. 이미 등록된 항목이 있으면 건너뜁니다."
            okText="불러오기"
            cancelText="취소"
            onConfirm={() => initDefaultsM.mutate()}
          >
            <Button loading={initDefaultsM.isPending}>기본 항목 불러오기</Button>
          </Popconfirm>
          <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ itemType: 'EARNING', displayOrder: 0, isTaxableYn: 'Y', isOrdinaryWageYn: 'N', applyToAllYn: 'N' }); setOpen(true); }}>항목(수당) 등록</Button>
        </Space>
      </div>
      <Table<SalaryItemTemplate>
        rowKey={(r) => r.salaryItemTemplateId ?? Math.random().toString()}
        loading={listQ.isLoading}
        dataSource={sortedItems}
        columns={cols}
        pagination={{ pageSize: 20 }}
        size="middle"
        className="!tw-text-[15px]"
        locale={{ emptyText: '등록된 항목이 없습니다.' }}
      />
      <AppDoubleActionModal open={open} onClose={() => { setOpen(false); setEditing(null); form.resetFields(); }} onConfirm={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} confirmText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? (editing.isSystemDefault ? '시스템 기본 항목 수정' : '항목 수정') : '항목 등록'} destroyOnHidden width={480}>
        <div className="tw-px-5 tw-py-4">
        <Form<TemplateFormValues> form={form} layout="vertical" onFinish={(v) => editing?.salaryItemTemplateId ? updateM.mutate({ id: editing.salaryItemTemplateId, v }) : createM.mutate(v)}>
          <Form.Item label="수당명" name="itemName" rules={[{ required: true }]}>
            <Input maxLength={40} placeholder="예: 직책수당, 식대" />
          </Form.Item>
          {/* 유형은 항상 EARNING 으로 자동 — 공제(세금/4대보험) 는 [세금·4대보험] 메뉴에서 별도 관리 */}
          <Form.Item name="itemType" hidden initialValue="EARNING">
            <Input />
          </Form.Item>
          <Form.Item label="표시 순서" name="displayOrder" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="과세 여부"
            name="isTaxableYn"
            rules={[{ required: true }]}
            extra="과세 = 소득세·4대보험 계산에 포함. 비과세 = 식대·자가운전·보육수당 등 세법상 비과세 한도 적용."
          >
            <Select
              disabled={!!editing?.isSystemDefault}
              options={[{ value: 'Y', label: '과세' }, { value: 'N', label: '비과세' }]}
            />
          </Form.Item>
          <Form.Item
            label="통상임금 포함"
            name="isOrdinaryWageYn"
            rules={[{ required: true }]}
            extra="포함하면 연장·야간·휴일수당 시급 환산 기준에 합산됩니다. 매달 같은 금액으로 받는 정기 수당(직책수당·자격수당)만 포함하세요."
          >
            <Select
              options={[
                { value: 'N', label: '제외 (성과급·식대·자가운전 등 변동·실비)' },
                { value: 'Y', label: '포함 (직책수당·자격수당 등 매월 고정)' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="적용 범위"
            name="applyToAllYn"
            rules={[{ required: true }]}
            extra="회사 공통: 정한 금액이 모든 직원에게 자동 합산 (식대·자가운전·보육수당 등). 개인 차등: 직원별로 [수당 관리] 에서 부여한 사람만 적용 (직책수당·자녀수당 등)."
          >
            <Select
              options={[
                { value: 'N', label: '개인 차등 (직원별로 부여)' },
                { value: 'Y', label: '회사 공통 (전 직원 자동 적용)' },
              ]}
            />
          </Form.Item>
          <Form.Item
            label="수당 금액 (월, 원)"
            name="defaultAmount"
            extra="회사 공통이면 모든 직원에게 매달 이 금액이 자동으로 합산됩니다. 개인 차등이면 부여 시 기본값으로 사용되며 직원별 다른 금액으로 변경할 수 있습니다. 비워두면 자동 적용·자동 채움이 없습니다."
          >
            <InputNumber
              min={0}
              step={10000}
              style={{ width: '100%' }}
              placeholder="예: 200000"
              formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}` : '')}
              parser={(v) => Number(String(v ?? '').replace(/[^\d]/g, '')) as 0 | number}
            />
          </Form.Item>
          {editing?.isSystemDefault && (
            <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-xs">
              시스템 기본 항목은 이름·표시 순서만 수정됩니다. 과세 여부는 변경할 수 없습니다.
            </Typography.Paragraph>
          )}
        </Form>
        </div>
      </AppDoubleActionModal>
    </>
  );
}

/* ======================================================================
 * 5. 초과 근무 현황 (ComprehensiveOvertime)
 *    - 포괄임금제 회사만 의미, 비포괄이면 빈 테이블
 *    - 이번 달 1일 ~ 기준일 누적 승인 OT vs 고정 OT 한도
 * ====================================================================== */

export function ComprehensiveOvertimeTab() {
  const [baseDate, setBaseDate] = useState<dayjs.Dayjs>(() => dayjs());
  const iso = baseDate.format('YYYY-MM-DD');
  const formatMinutes = (v?: number | null) =>
    v == null ? '—' : `${v.toLocaleString()}분 (${(v / 60).toFixed(1)}h)`;

  const listQ = useQuery({
    queryKey: ['salary', 'comprehensive-overtime', iso],
    queryFn: () => attendanceApi.comprehensiveOvertime.getStatus(iso),
  });

  const policyQ = useQuery({
    queryKey: ['salary', 'attendance', 'overtime-policy', 'current', iso],
    queryFn: () => attendanceApi.overtimePolicy.getCurrent(),
  });

  const cols = useMemo<ColumnsType<ComprehensiveOvertimeStatus>>(() => [
    { title: '구성원', dataIndex: 'name', key: 'name', render: (v) => v ?? '—' },
    {
      title: '이번 달 누적 OT',
      dataIndex: 'approvedMinutes',
      key: 'approvedMinutes',
      width: 140,
      align: 'right',
      render: (v: number | null) => formatMinutes(v),
    },
    {
      title: '고정 한도',
      dataIndex: 'fixedLimit',
      key: 'fixedLimit',
      width: 120,
      align: 'right',
      render: (v: number | null) => formatMinutes(v),
    },
    {
      title: '회사 월 한도',
      key: 'companyMonthlyLimit',
      width: 130,
      align: 'right',
      render: () => formatMinutes(policyQ.data?.monthlyOvertimeLimitMinutes),
    },
    {
      title: '회사 월 한도 대비',
      key: 'companyMonthlyUsage',
      width: 140,
      align: 'right',
      render: (_, row) => {
        const approved = row.approvedMinutes ?? 0;
        const monthlyLimit = policyQ.data?.monthlyOvertimeLimitMinutes ?? null;
        if (!monthlyLimit || monthlyLimit <= 0) return '—';
        const pct = (approved / monthlyLimit) * 100;
        if (pct >= 100) return <Tag color="red">{pct.toFixed(1)}%</Tag>;
        if (pct >= 80) return <Tag color="orange">{pct.toFixed(1)}%</Tag>;
        return <Tag>{pct.toFixed(1)}%</Tag>;
      },
    },
    {
      title: '사용률',
      dataIndex: 'usagePercent',
      key: 'usagePercent',
      width: 100,
      align: 'right',
      render: (v: number | null) => {
        if (v == null) return '—';
        if (v >= 100) return <Tag color="red">{v.toFixed(1)}%</Tag>;
        if (v >= 80) return <Tag color="orange">{v.toFixed(1)}%</Tag>;
        return <Tag>{v.toFixed(1)}%</Tag>;
      },
      sorter: (a, b) => (a.usagePercent ?? 0) - (b.usagePercent ?? 0),
      defaultSortOrder: 'descend',
    },
    {
      title: '초과분',
      dataIndex: 'exceedMinutes',
      key: 'exceedMinutes',
      width: 120,
      align: 'right',
      render: (v: number | null) =>
        !v ? <Typography.Text type="secondary">—</Typography.Text> : <Tag color="red">{v}분</Tag>,
    },
  ], [policyQ.data?.monthlyOvertimeLimitMinutes]);

  return (
    <Space direction="vertical" className="tw-w-full" size={12}>
      <Alert
        type="info"
        showIcon
        message="직원들의 이번 달 누적 초과 근무 현황입니다."
        description="사용률 50% 이상만 표시됩니다. 고정 한도와 함께 회사 커스텀 일/월 연장근로 한도도 같이 확인할 수 있습니다."
      />
      <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-3">
        <Card size="small" className="tw-border-slate-200/80 tw-shadow-sm">
          <Typography.Text type="secondary" className="tw-text-xs">
            회사 커스텀 일 연장근로 한도
          </Typography.Text>
          <div className="tw-mt-1 tw-text-xl tw-font-semibold tw-text-slate-900">
            {formatMinutes(policyQ.data?.dailyOvertimeLimitMinutes)}
          </div>
        </Card>
        <Card size="small" className="tw-border-slate-200/80 tw-shadow-sm">
          <Typography.Text type="secondary" className="tw-text-xs">
            회사 커스텀 월 연장근로 한도
          </Typography.Text>
          <div className="tw-mt-1 tw-text-xl tw-font-semibold tw-text-slate-900">
            {formatMinutes(policyQ.data?.monthlyOvertimeLimitMinutes)}
          </div>
        </Card>
      </div>
      <div className="tw-flex tw-items-center tw-gap-3">
        <Typography.Text type="secondary" className="!tw-text-sm">
          기준일
        </Typography.Text>
        <DatePicker
          value={baseDate}
          onChange={(d) => d && setBaseDate(d)}
          allowClear={false}
          format="YYYY-MM-DD"
        />
      </div>
      <Table<ComprehensiveOvertimeStatus>
        rowKey={(r) => r.memberId ?? `${r.name}-${r.approvedMinutes}`}
        loading={listQ.isLoading}
        dataSource={listQ.data ?? []}
        columns={cols}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '포괄임금제 초과(또는 임박) 대상이 없습니다.' }}
      />
    </Space>
  );
}

/* ======================================================================
 * 간이세액표 (SimplifiedTaxTable) — 국세청 고시 표 엑셀 업로드
 * 매년 1월 새 표 등록 시 다음 달 급여 계산부터 정확한 소득세 적용
 * ====================================================================== */

function SimplifiedTaxTableTab() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [year, setYear] = useState<number>(() => dayjs().year());
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);

  const yearsQ = useQuery({
    queryKey: ['salary', 'simplified-tax-table', 'years'],
    queryFn: () => salaryApi.simplifiedTaxTable.listYears(),
  });

  const countQ = useQuery({
    queryKey: ['salary', 'simplified-tax-table', 'count', year],
    queryFn: () => salaryApi.simplifiedTaxTable.countByYear(year),
  });

  const handleUpload = async () => {
    if (!pickedFile) {
      message.warning('엑셀 파일을 선택하세요.');
      return;
    }
    try {
      setUploading(true);
      const res = await salaryApi.simplifiedTaxTable.upload(year, pickedFile);
      message.success(`${res.effectiveYear}년 표 ${res.inserted.toLocaleString()}행 등록 완료`);
      setPickedFile(null);
      setFileName(null);
      void qc.invalidateQueries({ queryKey: ['salary', 'simplified-tax-table'] });
    } catch (e: unknown) {
      const err = e as { message?: string };
      message.error(err?.message ?? '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const yearOptions = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const y = dayjs().year() - 1 + i;
        return { value: y, label: `${y}년` };
      }),
    [],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <Alert
        type="info"
        showIcon
        message="간이세액표는 국세청 홈택스에서 매년 고시됩니다."
        description={
          <span className="tw-text-xs">
            홈택스 → 「세무업무별 서비스」 → 「원천징수」 → 「근로소득간이세액표」 에서 엑셀 다운로드 후 업로드하세요.
            같은 연도 재업로드 시 기존 행은 자동 갱신됩니다.
          </span>
        }
      />

      <Card title="신규 업로드">
        <Space direction="vertical" className="tw-w-full" size={12}>
          <Space wrap>
            <span className="tw-text-sm">적용 연도</span>
            <Select
              value={year}
              onChange={setYear}
              options={yearOptions}
              style={{ width: 140 }}
            />
          </Space>

          <Space wrap>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setPickedFile(f);
                setFileName(f?.name ?? null);
              }}
            />
            {fileName && <span className="tw-text-xs tw-text-slate-500">{fileName}</span>}
          </Space>

          <Button
            type="primary"
            onClick={handleUpload}
            loading={uploading}
            disabled={!pickedFile}
          >
            업로드
          </Button>
        </Space>
      </Card>

      <Card title="등록 현황">
        <Space direction="vertical" className="tw-w-full" size={8}>
          <div>
            <span className="tw-text-sm tw-text-slate-500">{year}년 등록 행 수</span>
            <Typography.Title level={3} className="!tw-m-0 !tw-mt-1">
              {countQ.isLoading ? '…' : (countQ.data?.count ?? 0).toLocaleString()}
              <span className="tw-text-base tw-font-normal tw-ml-1">건</span>
            </Typography.Title>
          </div>

          <div>
            <span className="tw-text-sm tw-text-slate-500">등록된 연도 목록</span>
            <div className="tw-mt-1">
              {yearsQ.isLoading ? '…'
                : (yearsQ.data ?? []).length === 0
                  ? <span className="tw-text-slate-400">등록된 연도가 없습니다.</span>
                  : (yearsQ.data ?? []).map((y) => <Tag key={y} color="blue">{y}년</Tag>)
              }
            </div>
          </div>
        </Space>
      </Card>

      <Alert
        type="warning"
        showIcon
        message="간이세액표가 등록되지 않은 연도는 소득세가 0원으로 계산됩니다."
      />
    </Space>
  );
}

/* ======================================================================
 * Page — 4탭 통합 (정책/세율/항목/간이세액표 + 호봉표 조건부)
 * ====================================================================== */

export function AdminSalarySettingsPage() {
  const salaryPoliciesQ = useQuery({
    queryKey: ['salary', 'salary-policies'],
    queryFn: () => salaryApi.salaryPolicy.list(),
  });
  const hasPayGradePolicy = useMemo(
    () => hasActivePayGradeSalaryPolicy(salaryPoliciesQ.data),
    [salaryPoliciesQ.data],
  );

  const tabItems = useMemo(
    () => [
      { key: 'policy', label: '급여 정책', children: <SalaryPolicyTab /> },
      ...(hasPayGradePolicy
        ? [{ key: 'pay-grade-table', label: '호봉표 관리', children: <AdminPayGradeTablePage embedded /> }]
        : []),
      { key: 'tax', label: '세율', children: <TaxRateTab /> },
      { key: 'template', label: '지급 항목(수당)', children: <SalaryItemTemplateTab /> },
      { key: 'simplified-tax', label: '간이세액표', children: <SimplifiedTaxTableTab /> },
    ],
    [hasPayGradePolicy],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={1} className="!tw-m-0 !tw-text-slate-900">
          급여 정책
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          회사 단위 급여 정책, 세율, 항목을 관리합니다.
        </Typography.Paragraph>
      </div>
      <Card>
        <Tabs defaultActiveKey="policy" items={tabItems} />
      </Card>
    </Space>
  );
}
