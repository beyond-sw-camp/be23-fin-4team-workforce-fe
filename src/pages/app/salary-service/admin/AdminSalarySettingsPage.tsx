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
import { memberApi } from '@/features/member/api/memberApi';
import type {
  Salary,
  SalaryPolicy,
  SalaryItemTemplate,
  TaxRate,
  PayTypeCode,
  WageSystemTypeCode,
  PeriodStartTypeCode,
  PeriodEndTypeCode,
  TaxTypeCode,
  ItemTypeCode,
} from '@/features/salary-service/types';

/* ─── 공통 한글 맵 ─── */

const PAY_TYPE_KO: Record<string, string> = { MONTHLY: '월급', BONUS: '보너스', SEVERANCE: '퇴직금' };
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
  baseSalary: number;
  jobGradeName?: string;
  jobTitleName?: string;
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
};

type BootstrapFormValues = {
  memberId: string;
  hireDate: dayjs.Dayjs;
  baseSalary?: number | null;
  jobGradeName?: string;
  jobTitleName?: string;
};

function SalaryTab() {
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
        baseSalary: v.baseSalary,
        jobGradeName: v.jobGradeName?.trim() || null,
        jobTitleName: v.jobTitleName?.trim() || null,
        effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
      }),
    onSuccess: () => { message.success('등록 완료'); setOpen(false); form.resetFields(); void qc.invalidateQueries({ queryKey: ['salary', 'salaries'] }); },
    onError: (e: Error) => message.error(e.message || '실패'),
  });

  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: SalaryFormValues }) =>
      salaryApi.salary.update(id, {
        salaryPolicyId: v.salaryPolicyId,
        baseSalary: v.baseSalary,
        jobGradeName: v.jobGradeName?.trim() || null,
        jobTitleName: v.jobTitleName?.trim() || null,
        effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: v.effectiveRange[1]?.format('YYYY-MM-DD') ?? null,
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
    () => (policiesQ.data ?? []).map((p) => ({ value: p.salaryPolicyId!, label: `${p.policyName} (${PAY_TYPE_KO[p.payType ?? ''] ?? p.payType})` })),
    [policiesQ.data],
  );

  const cols = useMemo<ColumnsType<Salary>>(() => [
    { title: '멤버 ID', dataIndex: 'memberId', key: 'memberId', ellipsis: true, width: 220 },
    { title: '기본급', dataIndex: 'baseSalary', key: 'baseSalary', width: 140, render: (v) => v != null ? `${Number(v).toLocaleString()}원` : '-' },
    { title: '직급', dataIndex: 'jobGradeName', key: 'jobGradeName', width: 100 },
    { title: '직책', dataIndex: 'jobTitleName', key: 'jobTitleName', width: 100 },
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
              jobGradeName: r.jobGradeName ?? '',
              jobTitleName: r.jobTitleName ?? '',
              effectiveRange: [r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(), r.effectiveTo ? dayjs(r.effectiveTo) : null],
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
          <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ baseSalary: 0, effectiveRange: [dayjs(), null] }); setOpen(true); }}>
            급여 이력 등록
          </Button>
        </Space>
      </div>
      <Table<Salary> rowKey={(r) => r.salaryId ?? Math.random().toString()} loading={listQ.isLoading} dataSource={listQ.data ?? []} columns={cols} pagination={{ pageSize: 20 }} locale={{ emptyText: '등록된 급여 이력이 없습니다.' }} />
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '급여 이력 수정' : '급여 이력 등록'} destroyOnClose width={520}>
        <Form<SalaryFormValues> form={form} layout="vertical" onFinish={(v) => editing?.salaryId ? updateM.mutate({ id: editing.salaryId, v }) : createM.mutate(v)}>
          {!editing && <MemberIdSearchField />}
          <Form.Item label="급여 정책" name="salaryPolicyId" rules={[{ required: true }]}><Select options={policyOptions} placeholder="정책 선택" loading={policiesQ.isLoading} /></Form.Item>
          <Form.Item label="기본급 (원)" name="baseSalary" rules={[{ required: true }]}><InputNumber min={0} step={10000} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="직급명" name="jobGradeName"><Input maxLength={40} /></Form.Item>
          <Form.Item label="직책명" name="jobTitleName"><Input maxLength={40} /></Form.Item>
          <Form.Item label="적용 기간 (새 effectiveFrom)" name="effectiveRange" rules={[{ required: true }]}><DatePicker.RangePicker allowEmpty={[false, true]} format="YYYY-MM-DD" style={{ width: '100%' }} /></Form.Item>
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
  payType: PayTypeCode;
  payDay: number;
  overtimeRoundingMinutes?: number;
  wageSystemType: WageSystemTypeCode;
  fixedOvertimeMinutes?: number;
  periodStartType: PeriodStartTypeCode;
  periodEndType: PeriodEndTypeCode;
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
    payType: v.payType,
    payDay: v.payDay,
    overtimeRoundingMinutes: v.overtimeRoundingMinutes ?? null,
    wageSystemType: v.wageSystemType,
    fixedOvertimeMinutes: v.wageSystemType === 'NON_COMPREHENSIVE' ? 0 : (v.fixedOvertimeMinutes ?? 0),
    periodStartType: v.periodStartType,
    periodEndType: v.periodEndType,
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
    { title: '지급유형', dataIndex: 'payType', key: 'payType', width: 100, render: (v) => <Tag>{PAY_TYPE_KO[v] ?? v}</Tag> },
    { title: '지급일', dataIndex: 'payDay', key: 'payDay', width: 80, render: (v) => `${v}일` },
    { title: '임금제', dataIndex: 'wageSystemType', key: 'wageSystemType', width: 100, render: (v) => <Tag color={v === 'COMPREHENSIVE' ? 'orange' : 'blue'}>{WAGE_SYS_KO[v] ?? v}</Tag> },
    { title: '적용 기간', key: 'eff', width: 220, render: (_, r) => `${r.effectiveFrom ?? ''} ~ ${r.effectiveTo ?? '진행중'}` },
    {
      title: '액션', key: 'a', width: 140,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({
              policyName: r.policyName ?? '', payType: (r.payType as PayTypeCode) ?? 'MONTHLY', payDay: r.payDay ?? 25,
              overtimeRoundingMinutes: r.overtimeRoundingMinutes ?? undefined, wageSystemType: (r.wageSystemType as WageSystemTypeCode) ?? 'NON_COMPREHENSIVE',
              fixedOvertimeMinutes: r.fixedOvertimeMinutes ?? undefined,
              periodStartType: (r.periodStartType as PeriodStartTypeCode) ?? 'FIRST', periodEndType: (r.periodEndType as PeriodEndTypeCode) ?? 'LAST',
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
      <div className="tw-flex tw-justify-end tw-mb-3"><Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ payType: 'MONTHLY', payDay: 25, wageSystemType: 'NON_COMPREHENSIVE', periodStartType: 'FIRST', periodEndType: 'LAST', effectiveRange: [dayjs(), null] }); setOpen(true); }}>정책 등록</Button></div>
      <Table<SalaryPolicy> rowKey={(r) => r.salaryPolicyId ?? Math.random().toString()} loading={listQ.isLoading} dataSource={listQ.data ?? []} columns={cols} pagination={{ pageSize: 10 }} locale={{ emptyText: '등록된 정책이 없습니다.' }} />
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '정책 수정' : '정책 등록'} destroyOnClose width={600}>
        <Form<PolicyFormValues> form={form} layout="vertical" onFinish={(v) => editing?.salaryPolicyId ? updateM.mutate({ id: editing.salaryPolicyId, v }) : createM.mutate(v)}>
          <Form.Item label="정책명" name="policyName" rules={[{ required: true }]}><Input maxLength={60} /></Form.Item>
          <Space className="tw-w-full" size={16}>
            <Form.Item label="지급 유형" name="payType" rules={[{ required: true }]}><Select style={{ width: 160 }} options={[{ value: 'MONTHLY', label: '월급' }, { value: 'BONUS', label: '보너스' }, { value: 'SEVERANCE', label: '퇴직금' }]} /></Form.Item>
            <Form.Item label="지급일 (1~31)" name="payDay" rules={[{ required: true }]}><InputNumber min={1} max={31} style={{ width: 120 }} /></Form.Item>
          </Space>
          <Space className="tw-w-full" size={16}>
            <Form.Item label="임금제 유형" name="wageSystemType" rules={[{ required: true }]}><Select style={{ width: 180 }} options={[{ value: 'COMPREHENSIVE', label: '포괄임금제' }, { value: 'NON_COMPREHENSIVE', label: '비포괄임금제' }]} /></Form.Item>
            <Form.Item noStyle shouldUpdate={(p, c) => p.wageSystemType !== c.wageSystemType}>
              {({ getFieldValue }) => getFieldValue('wageSystemType') === 'COMPREHENSIVE' ? (
                <Form.Item label="고정 OT(분) - 20시간(1200분)" name="fixedOvertimeMinutes"><InputNumber min={0} style={{ width: 140 }} /></Form.Item>
              ) : null}
            </Form.Item>
          </Space>
          <Form.Item label="연장근무시간 인정 단위(분) - 15분 또는 30분" name="overtimeRoundingMinutes"><InputNumber min={1} style={{ width: '100%' }} placeholder="예: 15" /></Form.Item>
          <Space className="tw-w-full" size={16}>
            <Form.Item label="정산 시작" name="periodStartType" rules={[{ required: true }]}><Select style={{ width: 160 }} options={[{ value: 'FIRST', label: '1일' }]} /></Form.Item>
            <Form.Item label="정산 종료" name="periodEndType" rules={[{ required: true }]}><Select style={{ width: 160 }} options={[{ value: 'LAST', label: '말일' }]} /></Form.Item>
          </Space>
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

  const taxTypeOpts = Object.entries(TAX_TYPE_KO).map(([value, label]) => ({ value, label: `${label} (${value})` }));

  const cols = useMemo<ColumnsType<TaxRate>>(() => [
    { title: '세금 유형', dataIndex: 'taxType', key: 'taxType', render: (v) => <Tag>{TAX_TYPE_KO[v] ?? v}</Tag> },
    { title: '적용 연도', dataIndex: 'applyYear', key: 'applyYear', width: 100 },
    { title: '근로자 부담률', dataIndex: 'rate', key: 'rate', width: 140, render: (v) => v != null ? `${(Number(v) * 100).toFixed(2)}%` : '-' },
    { title: '회사 부담률', dataIndex: 'employerRate', key: 'employerRate', width: 140, render: (v) => v != null ? `${(Number(v) * 100).toFixed(2)}%` : '-' },
    {
      title: '액션', key: 'a', width: 140,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({ taxType: r.taxType as TaxTypeCode, rate: Number(r.rate ?? 0), applyYear: r.applyYear ?? dayjs().year(), employerRate: r.employerRate != null ? Number(r.employerRate) : undefined });
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
      </div>
      <Table<TaxRate> rowKey={(r) => r.taxRateId ?? Math.random().toString()} loading={listQ.isLoading} dataSource={listQ.data ?? []} columns={cols} pagination={{ pageSize: 20 }} locale={{ emptyText: '등록된 세율이 없습니다.' }} />
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '세율 수정' : '세율 등록'} destroyOnClose width={480}>
        <Form<TaxFormValues> form={form} layout="vertical" onFinish={(v) => editing?.taxRateId ? updateM.mutate({ id: editing.taxRateId, v }) : createM.mutate(v)}>
          <Form.Item label="세금 유형" name="taxType" rules={[{ required: true }]}><Select options={taxTypeOpts} /></Form.Item>
          <Form.Item label="적용 연도" name="applyYear" rules={[{ required: true }]}><InputNumber min={2000} max={2099} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="근로자 부담률 (소수, 예: 0.045)" name="rate" rules={[{ required: true }]}><InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="회사 부담률 (소수, 선택)" name="employerRate"><InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} /></Form.Item>
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

  const cols = useMemo<ColumnsType<SalaryItemTemplate>>(() => [
    { title: '항목명', dataIndex: 'itemName', key: 'itemName' },
    { title: '유형', dataIndex: 'itemType', key: 'itemType', width: 100, render: (v) => <Tag color={v === 'EARNING' ? 'green' : 'red'}>{ITEM_TYPE_KO[v] ?? v}</Tag> },
    { title: '순서', dataIndex: 'displayOrder', key: 'displayOrder', width: 80 },
    { title: '과세', dataIndex: 'isTaxableYn', key: 'isTaxableYn', width: 80, render: (v) => v === 'Y' ? <Tag color="blue">과세</Tag> : <Tag>비과세</Tag> },
    {
      title: '액션', key: 'a', width: 140,
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => {
            setEditing(r); setOpen(true);
            form.setFieldsValue({ itemName: r.itemName ?? '', itemType: (r.itemType as ItemTypeCode) ?? 'EARNING', displayOrder: r.displayOrder ?? 0, isTaxableYn: (r.isTaxableYn as 'Y' | 'N') ?? 'Y' });
          }}>수정</Button>
          <Popconfirm title="삭제?" okText="삭제" cancelText="취소" onConfirm={() => r.salaryItemTemplateId && deleteM.mutate(r.salaryItemTemplateId)}><Button size="small" danger>삭제</Button></Popconfirm>
        </Space>
      ),
    },
  ], [deleteM, form]);

  return (
    <>
      <div className="tw-flex tw-justify-end tw-mb-3"><Button type="primary" onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ itemType: 'EARNING', displayOrder: 0, isTaxableYn: 'Y' }); setOpen(true); }}>항목 등록</Button></div>
      <Table<SalaryItemTemplate> rowKey={(r) => r.salaryItemTemplateId ?? Math.random().toString()} loading={listQ.isLoading} dataSource={(listQ.data ?? []).filter((t) => t.delYn !== 'Y')} columns={cols} pagination={{ pageSize: 20 }} locale={{ emptyText: '등록된 템플릿이 없습니다.' }} />
      <Modal open={open} onCancel={() => { setOpen(false); setEditing(null); form.resetFields(); }} onOk={() => form.submit()} confirmLoading={createM.isPending || updateM.isPending} okText={editing ? '수정' : '등록'} cancelText="취소" title={editing ? '항목 수정' : '항목 등록'} destroyOnClose width={480}>
        <Form<TemplateFormValues> form={form} layout="vertical" onFinish={(v) => editing?.salaryItemTemplateId ? updateM.mutate({ id: editing.salaryItemTemplateId, v }) : createM.mutate(v)}>
          <Form.Item label="항목명" name="itemName" rules={[{ required: true }]}><Input maxLength={40} placeholder="예: 기본급, 소득세" /></Form.Item>
          <Form.Item label="유형" name="itemType" rules={[{ required: true }]}><Select options={[{ value: 'EARNING', label: '지급 (EARNING)' }, { value: 'DEDUCTION', label: '공제 (DEDUCTION)' }]} /></Form.Item>
          <Form.Item label="표시 순서" name="displayOrder" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item label="과세 여부" name="isTaxableYn" rules={[{ required: true }]}><Select options={[{ value: 'Y', label: '과세' }, { value: 'N', label: '비과세' }]} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ======================================================================
 * Page — 4탭 통합
 * ====================================================================== */

export function AdminSalarySettingsPage() {
  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          급여 설정
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          급여 이력·급여 정책·세율·항목 템플릿을 관리합니다. (신규 입사자의 초기 기본급은 '인사정보등록'에서 처리)
        </Typography.Paragraph>
      </div>
      <Card>
        <Tabs
          defaultActiveKey="salary"
          items={[
            { key: 'policy', label: '급여 정책', children: <SalaryPolicyTab /> },
            { key: 'tax', label: '세율', children: <TaxRateTab /> },
            { key: 'template', label: '항목 템플릿', children: <SalaryItemTemplateTab /> },
            { key: 'salary', label: '급여 이력', children: <SalaryTab /> }
          ]}
        />
      </Card>
    </Space>
  );
}
