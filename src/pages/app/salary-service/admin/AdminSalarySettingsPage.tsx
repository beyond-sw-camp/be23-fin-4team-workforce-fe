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
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { memberApi } from '@/features/member/api/memberApi';
import { AdminPayGradeTablePage } from '@/pages/app/salary-service/admin/AdminPayGradeTablePage';
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
  jobGradeName?: string;
  jobTitleName?: string;
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
  /** 부양가족수 0~11, 기본 1=본인만, 소득세 간이세액표 룩업용 */
  dependentCount?: number;
};

type BootstrapFormValues = {
  memberId: string;
  hireDate: dayjs.Dayjs;
  baseSalary?: number | null;
  jobGradeName?: string;
  jobTitleName?: string;
};

export function SalaryTab() {
  const { message } = App.useApp();
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
    mutationFn: (v: SalaryFormValues) =>
      salaryApi.salary.create({
        memberId: v.memberId.trim(),
        salaryPolicyId: v.salaryPolicyId,
        baseSalary: v.step != null ? null : v.baseSalary ?? null,
        step: v.step ?? null,
        jobGradeName: v.jobGradeName?.trim() || null,
        jobTitleName: v.jobTitleName?.trim() || null,
        effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
        dependentCount: v.dependentCount ?? 1,
      }),
    onSuccess: () => { message.success('등록 완료'); setOpen(false); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] }); },
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
    mutationFn: (id: string) => salaryApi.salary.delete(id),
    onSuccess: () => { message.success('삭제 완료'); void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

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
      if (!k) return true;
      return (
        (row.sabun?.toLowerCase().includes(k) ?? false) ||
        (row.memberName?.toLowerCase().includes(k) ?? false) ||
        (row.organizationName?.toLowerCase().includes(k) ?? false)
      );
    });
  }, [departmentFilter, enrichedRows, keyword, statusFilter]);

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
          <Popconfirm title="삭제?" okText="삭제" cancelText="취소" onConfirm={() => r.salaryId && deleteM.mutate(r.salaryId)}>
            <Button size="small" danger>삭제</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [deleteM, form]);

  return (
    <>
      <Alert
        showIcon
        type="info"
        className="tw-mb-3"
        message="신규 입사자의 초기 기본급은 '인사정보등록' 시 자동으로 반영됩니다."
        description="이 탭은 연봉 인상 · 직급 변경 등 급여 변경 이력을 새 effectiveFrom으로 등록하는 곳입니다. 같은 날짜로 중복 등록하면 기존 이력이 마감되고 중복이 쌓이니 주의하세요."
      />
      <div className="tw-flex tw-flex-wrap tw-justify-between tw-items-center tw-gap-2 tw-mb-3">
        <Typography.Text type="secondary" className="!tw-text-xs">
          Kafka 이벤트 누락 등으로 입사자 Salary가 생성되지 않았다면 "입사 누락 복구"로 수동 생성할 수 있습니다.
        </Typography.Text>
        <Space>
          <Button onClick={() => { bootstrapForm.resetFields(); bootstrapForm.setFieldsValue({ hireDate: dayjs() }); setBootstrapOpen(true); }}>
            입사 누락 복구
          </Button>
          <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ baseSalary: 0, step: null, effectiveRange: [dayjs(), null], dependentCount: 1 }); setOpen(true); }}>
            급여 이력 등록
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
      </Space>
      <Table<Salary>
        rowKey={(r) => r.salaryId ?? Math.random().toString()}
        loading={listQ.isLoading}
        dataSource={filteredRows}
        columns={cols}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '등록된 급여 이력이 없습니다.' }}
      />
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '급여 이력 수정' : '급여 이력 등록'} destroyOnClose width={520}>
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
          }}
        >
          {!editing && <MemberIdSearchField />}
          <Form.Item label="급여 정책" name="salaryPolicyId" rules={[{ required: true }]}>
            <Select options={policyOptions} placeholder="정책 선택" loading={policiesQ.isLoading} />
          </Form.Item>

          {/* 정책 usePayGradeYn 따라 호봉/기본급 필드 분기 */}
          <Form.Item noStyle shouldUpdate={(p, c) => p.salaryPolicyId !== c.salaryPolicyId || p.step !== c.step}>
            {({ getFieldValue }) => {
              const policyId = getFieldValue('salaryPolicyId') as string | undefined;
              const policy = (policiesQ.data ?? []).find((p) => p.salaryPolicyId === policyId);
              const isPayGrade = policy?.usePayGradeYn === 'Y';
              const currentStep = getFieldValue('step') as number | null | undefined;
              const autoBase = currentStep != null ? payGradeStepMap.get(currentStep) : null;

              if (isPayGrade) {
                return (
                  <>
                    <Form.Item
                      label="호봉"
                      name="step"
                      rules={[{ required: true, message: '호봉제 정책입니다. 호봉을 선택하세요.' }]}
                      extra={
                        activePayGrades.length === 0
                          ? '활성 호봉이 없습니다. 호봉표 관리에서 먼저 등록하세요.'
                          : '선택한 호봉의 기본급이 자동 적용됩니다.'
                      }
                    >
                      <Select
                        placeholder="호봉 선택"
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
                        formatter={(v) => (v ? `${Number(v).toLocaleString('ko-KR')}원` : '')}
                      />
                    </Form.Item>
                  </>
                );
              }
              return (
                <Form.Item
                  label="기본급 (원)"
                  name="baseSalary"
                  rules={[{ required: true, message: '기본급을 입력하세요.' }]}
                >
                  <InputNumber min={0} step={10000} style={{ width: '100%' }} />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item label="직급명" name="jobGradeName"><Input maxLength={40} /></Form.Item>
          <Form.Item label="직책명" name="jobTitleName"><Input maxLength={40} /></Form.Item>
          <Form.Item
            label="부양가족수"
            name="dependentCount"
            rules={[{ required: true, message: '부양가족수를 입력하세요.' }]}
            extra="본인 포함 (예: 본인만 1, 본인+배우자 2). 소득세 간이세액표 룩업에 사용됩니다."
          >
            <InputNumber min={0} max={11} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="적용 기간 (새 effectiveFrom)" name="effectiveRange" rules={[{ required: true }]}>
            <DatePicker.RangePicker allowEmpty={[false, true]} format="YYYY-MM-DD" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={bootstrapOpen}
        onCancel={() => { setBootstrapOpen(false); bootstrapForm.resetFields(); }}
        onOk={() => bootstrapForm.submit()}
        confirmLoading={bootstrapM.isPending}
        okText="복구 요청"
        cancelText="취소"
        title="입사 누락 Salary 복구"
        destroyOnClose
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
      </Modal>
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
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
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
      <div className="tw-flex tw-justify-end tw-mb-3"><Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ payDay: 25, usePayGradeYn: 'N', wageSystemType: 'NON_COMPREHENSIVE', payDayShiftRule: 'BEFORE', effectiveRange: [dayjs(), null] }); setOpen(true); }}>정책 등록</Button></div>
      <Table<SalaryPolicy> rowKey={(r) => r.salaryPolicyId ?? Math.random().toString()} loading={listQ.isLoading} dataSource={listQ.data ?? []} columns={cols} pagination={{ pageSize: 10 }} locale={{ emptyText: '등록된 정책이 없습니다.' }} />
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '급여 정책 수정' : '급여 정책 등록'} destroyOnClose width={600}>
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
            extra="호봉제 선택 시 급여 이력 등록 시 호봉을 지정하면 호봉표에서 기본급 자동 계산"
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
          <Form.Item label="적용 기간" name="effectiveRange" rules={[{ required: true }]}><DatePicker.RangePicker allowEmpty={[false, true]} format="YYYY-MM-DD" style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
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
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '세율 수정' : '세율 등록'} destroyOnClose width={520}>
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
      </Modal>
    </>
  );
}

/* ======================================================================
 * 4. 급여 항목 템플릿 (SalaryItemTemplate)
 * ====================================================================== */

type TemplateFormValues = {
  itemName: string;
  itemType: ItemTypeCode;
  displayOrder: number;
  isTaxableYn: 'Y' | 'N';
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
      title: '액션',
      key: 'a',
      width: 180,
      render: (_, r) => (
        <Space>
          <Button size="middle" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({ itemName: r.itemName ?? '', itemType: (r.itemType as ItemTypeCode) ?? 'EARNING', displayOrder: r.displayOrder ?? 0, isTaxableYn: (r.isTaxableYn as 'Y' | 'N') ?? 'Y' });
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

  /** 표시는 displayOrder 오름차순 유지, 컬럼은 숨김 */
  const sortedItems = useMemo(
    () =>
      (listQ.data ?? [])
        .filter((t) => t.delYn !== 'Y')
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
          <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ itemType: 'EARNING', displayOrder: 0, isTaxableYn: 'Y' }); setOpen(true); }}>항목 등록</Button>
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
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? (editing.isSystemDefault ? '시스템 기본 항목 수정' : '항목 수정') : '항목 등록'} destroyOnClose width={480}>
        <Form<TemplateFormValues> form={form} layout="vertical" onFinish={(v) => editing?.salaryItemTemplateId ? updateM.mutate({ id: editing.salaryItemTemplateId, v }) : createM.mutate(v)}>
          <Form.Item label="항목명" name="itemName" rules={[{ required: true }]}>
            <Input maxLength={40} placeholder="예: 기본급, 소득세" />
          </Form.Item>
          <Form.Item label="유형" name="itemType" rules={[{ required: true }]}>
            <Select
              disabled={!!editing?.isSystemDefault}
              options={[{ value: 'EARNING', label: '지급 (EARNING)' }, { value: 'DEDUCTION', label: '공제 (DEDUCTION)' }]}
            />
          </Form.Item>
          <Form.Item label="표시 순서" name="displayOrder" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="과세 여부" name="isTaxableYn" rules={[{ required: true }]}>
            <Select
              disabled={!!editing?.isSystemDefault}
              options={[{ value: 'Y', label: '과세' }, { value: 'N', label: '비과세' }]}
            />
          </Form.Item>
          {editing?.isSystemDefault && (
            <Typography.Paragraph type="secondary" className="!tw-mb-0 tw-text-xs">
              시스템 기본 항목은 이름과 표시 순서만 수정됩니다. 유형·과세 여부는 변경되지 않습니다.
            </Typography.Paragraph>
          )}
        </Form>
      </Modal>
    </>
  );
}

/* ======================================================================
 * 5. 포괄임금 OT 현황 (ComprehensiveOvertime)
 *    - 포괄임금제 회사만 의미, 비포괄이면 빈 테이블
 *    - 이번 달 1일 ~ 기준일 누적 승인 OT vs 고정 OT 한도
 * ====================================================================== */

export function ComprehensiveOvertimeTab() {
  const [baseDate, setBaseDate] = useState<dayjs.Dayjs>(() => dayjs());
  const iso = baseDate.format('YYYY-MM-DD');

  const listQ = useQuery({
    queryKey: ['salary', 'comprehensive-overtime', iso],
    queryFn: () => attendanceApi.comprehensiveOvertime.getStatus(iso),
  });

  const cols = useMemo<ColumnsType<ComprehensiveOvertimeStatus>>(() => [
    { title: '구성원', dataIndex: 'name', key: 'name', render: (v) => v ?? '—' },
    {
      title: '이번 달 누적 OT',
      dataIndex: 'approvedMinutes',
      key: 'approvedMinutes',
      width: 140,
      align: 'right',
      render: (v: number | null) => (v == null ? '—' : `${v}분 (${((v ?? 0) / 60).toFixed(1)}h)`),
    },
    {
      title: '고정 한도',
      dataIndex: 'fixedLimit',
      key: 'fixedLimit',
      width: 120,
      align: 'right',
      render: (v: number | null) => (v == null ? '—' : `${v}분 (${((v ?? 0) / 60).toFixed(1)}h)`),
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
  ], []);

  return (
    <Space direction="vertical" className="tw-w-full" size={12}>
      <Alert
        type="info"
        showIcon
        message="포괄임금제 정책을 적용받는 구성원의 이번 달 누적 OT 현황입니다."
        description="사용률 50% 이상만 표시됩니다. 80% 이상은 주황, 초과(100%+)는 빨간색으로 강조됩니다. 배치가 매주 월요일 04:00 기준 알림도 발송합니다."
      />
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
    queryKey: ['salary', 'salary-policies', 'settings-tabs'],
    queryFn: () => salaryApi.salaryPolicy.list(),
  });
  const hasPayGradePolicy = useMemo(
    () => (salaryPoliciesQ.data ?? []).some((p) => p.usePayGradeYn === 'Y'),
    [salaryPoliciesQ.data],
  );

  const tabItems = useMemo(
    () => [
      { key: 'policy', label: '급여 정책', children: <SalaryPolicyTab /> },
      ...(hasPayGradePolicy
        ? [{ key: 'pay-grade-table', label: '호봉표 관리', children: <AdminPayGradeTablePage embedded /> }]
        : []),
      { key: 'tax', label: '세율', children: <TaxRateTab /> },
      { key: 'template', label: '급여 항목', children: <SalaryItemTemplateTab /> },
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
