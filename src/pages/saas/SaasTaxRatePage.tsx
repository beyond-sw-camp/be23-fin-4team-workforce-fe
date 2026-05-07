import { ArrowLeftOutlined, PercentageOutlined, PlusOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Alert, App, Button, Form, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { saasApi, type TaxRate, type TaxRateInput, type TaxType } from '@/features/saas/api/saasApi';
import { SaasConsoleShell } from '@/pages/saas/SaasConsoleShell';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppUnitInputNumber } from '@/shared/ui/AppUnitInputNumber';

const TAX_TYPE_OPTIONS: { value: TaxType; label: string; supportsCap: boolean }[] = [
  { value: 'NATIONAL_PENSION', label: '국민연금', supportsCap: true },
  { value: 'HEALTH_INSURANCE', label: '건강보험', supportsCap: true },
  { value: 'LONG_TERM_CARE', label: '장기요양', supportsCap: false },
  { value: 'EMPLOYMENT_INSURANCE', label: '고용보험', supportsCap: false },
  { value: 'ACCIDENT_INSURANCE', label: '산재보험', supportsCap: false },
  { value: 'INCOME_TAX', label: '소득세', supportsCap: false },
  { value: 'LOCAL_INCOME_TAX', label: '지방소득세', supportsCap: false },
];

const TAX_TYPE_LABEL: Record<TaxType, string> =
  Object.fromEntries(TAX_TYPE_OPTIONS.map((o) => [o.value, o.label])) as Record<TaxType, string>;

function pctText(v: number | null | undefined): string {
  if (v == null) return '-';
  // BE 는 소수 (0.045) 로 보냄. 화면은 % (4.5)
  return `${(Number(v) * 100).toFixed(4).replace(/\.?0+$/, '')}%`;
}

function wonText(v: number | null | undefined): string {
  if (v == null) return '-';
  return `${Number(v).toLocaleString()}원`;
}

export default function SaasTaxRatePage() {
  return (
    <App>
      <SaasTaxRatePageInner />
    </App>
  );
}

function SaasTaxRatePageInner() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { message } = App.useApp();

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [deleting, setDeleting] = useState<TaxRate | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<{
    taxType: TaxType;
    rate: number; // %
    employerRate: number | null; // %
    incomeCeiling: number | null;
    incomeFloor: number | null;
  }>();
  const taxTypeWatch = Form.useWatch('taxType', form);
  const supportsCap = TAX_TYPE_OPTIONS.find((o) => o.value === taxTypeWatch)?.supportsCap ?? false;

  const listQ = useQuery({
    queryKey: ['saas', 'tax-rate', year],
    queryFn: () => saasApi.taxRate.list(year),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['saas', 'tax-rate', year] });

  const initM = useMutation({
    mutationFn: () => saasApi.taxRate.initDefaults(year),
    onSuccess: (res) => {
      message.success(`${res.applyYear}년 표준 ${res.inserted}건 반영, ${res.skipped}건 스킵`);
      void invalidate();
    },
    onError: (e: unknown) => {
      message.error((e as { message?: string })?.message ?? '표준 시드 실패');
    },
  });

  const saveM = useMutation({
    mutationFn: (vars: { id?: string; input: TaxRateInput }) =>
      vars.id ? saasApi.taxRate.update(vars.id, vars.input) : saasApi.taxRate.create(vars.input),
    onSuccess: () => {
      message.success(editing ? '수정되었습니다.' : '등록되었습니다.');
      setEditing(null);
      setCreating(false);
      void invalidate();
    },
    onError: (e: unknown) => {
      message.error((e as { message?: string })?.message ?? '저장 실패');
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => saasApi.taxRate.remove(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      setDeleting(null);
      void invalidate();
    },
    onError: (e: unknown) => {
      message.error((e as { message?: string })?.message ?? '삭제 실패');
    },
  });

  // 모달 열릴 때 폼 초기값 셋업
  useEffect(() => {
    if (creating) {
      form.resetFields();
      form.setFieldsValue({ taxType: 'NATIONAL_PENSION', rate: 4.5, employerRate: 4.5 });
    } else if (editing) {
      form.setFieldsValue({
        taxType: editing.taxType,
        // 0.045 -> 4.5 표시
        rate: Number((editing.rate * 100).toFixed(6)),
        employerRate: editing.employerRate == null ? null : Number((editing.employerRate * 100).toFixed(6)),
        incomeCeiling: editing.incomeCeiling,
        incomeFloor: editing.incomeFloor,
      });
    }
  }, [creating, editing, form]);

  const onSubmit = async () => {
    const v = await form.validateFields();
    const input: TaxRateInput = {
      taxType: v.taxType,
      applyYear: year,
      rate: Number((v.rate / 100).toFixed(6)),
      employerRate: v.employerRate == null ? null : Number((v.employerRate / 100).toFixed(6)),
      incomeCeiling: supportsCap ? v.incomeCeiling ?? null : null,
      incomeFloor: supportsCap ? v.incomeFloor ?? null : null,
    };
    saveM.mutate({ id: editing?.taxRateId, input });
  };

  const cols: ColumnsType<TaxRate> = [
    {
      title: '세금 유형',
      dataIndex: 'taxType',
      key: 'taxType',
      width: 140,
      render: (v: TaxType) => <Tag color="blue">{TAX_TYPE_LABEL[v] ?? v}</Tag>,
    },
    {
      title: '근로자 부담률',
      dataIndex: 'rate',
      key: 'rate',
      width: 130,
      render: (v: number) => pctText(v),
    },
    {
      title: '회사 부담률',
      dataIndex: 'employerRate',
      key: 'employerRate',
      width: 130,
      render: (v: number | null) => pctText(v),
    },
    {
      title: '기준소득 하한',
      dataIndex: 'incomeFloor',
      key: 'incomeFloor',
      width: 150,
      render: (v: number | null) => wonText(v),
    },
    {
      title: '기준소득 상한',
      dataIndex: 'incomeCeiling',
      key: 'incomeCeiling',
      width: 150,
      render: (v: number | null) => wonText(v),
    },
    {
      title: '',
      key: 'action',
      width: 160,
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => setEditing(row)}>
            수정
          </Button>
          <Button size="small" danger onClick={() => setDeleting(row)}>
            삭제
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <SaasConsoleShell contentClassName="tw-space-y-5">
        <div className="tw-flex tw-items-center tw-justify-between">
          <Space align="center" size={12}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate({ to: '/saas/dashboard' })}
            />
            <PercentageOutlined className="tw-text-2xl tw-text-orange-500" />
            <Typography.Title level={2} className="!tw-m-0">
              4대보험·세금 요율 관리
            </Typography.Title>
          </Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void invalidate()}
            loading={listQ.isFetching}
          >
            새로고침
          </Button>
        </div>

        <Alert
          type="info"
          showIcon
          message="국민연금/건강보험/장기요양/고용/산재/소득세/지방소득세 요율은 매년 법령 변경에 따라 운영자가 등록·수정해요. 등록된 요율은 모든 회사 급여 계산에 자동 반영됩니다."
        />

        <Space wrap size={12}>
          <Space size={4} align="center">
            <Typography.Text type="secondary">적용 연도</Typography.Text>
            <AppUnitInputNumber
              min={2000}
              max={2100}
              value={year}
              onChange={(v) => setYear(Number(v) || currentYear)}
              unit="년"
              style={{ width: 140 }}
            />
          </Space>
          <Button
            icon={<ThunderboltOutlined />}
            loading={initM.isPending}
            onClick={() => initM.mutate()}
          >
            {year}년 표준 일괄 등록
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreating(true)}
          >
            세율 추가
          </Button>
          <Typography.Text type="secondary" className="tw-text-xs">
            총 {listQ.data?.length ?? 0}건
          </Typography.Text>
        </Space>

        <Table<TaxRate>
          rowKey={(r) => r.taxRateId}
          loading={listQ.isLoading}
          dataSource={listQ.data ?? []}
          columns={cols}
          pagination={false}
        />

        <AppDoubleActionModal
          title={editing ? '세율 수정' : '세율 추가'}
          open={creating || !!editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onConfirm={onSubmit}
          confirmLoading={saveM.isPending}
          confirmText={editing ? '수정' : '등록'}
          cancelText="취소"
          width={560}
        >
          <div className="tw-px-5 tw-py-4">
            <Form form={form} layout="vertical">
              <Form.Item
                label="세금 유형"
                name="taxType"
                rules={[{ required: true, message: '세금 유형을 선택해주세요.' }]}
              >
                <Select
                  options={TAX_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  disabled={!!editing}
                />
              </Form.Item>
              <Form.Item
                label="근로자 부담률 (%)"
                name="rate"
                rules={[{ required: true, message: '근로자 부담률을 입력해주세요.' }]}
                tooltip="예: 4.5 입력 시 4.5%"
              >
                <AppUnitInputNumber min={0} max={100} step={0.001} unit="%" />
              </Form.Item>
              <Form.Item
                label="회사 부담률 (%)"
                name="employerRate"
                tooltip="회사 부담이 없는 세금(소득세 등)은 비워두세요"
              >
                <AppUnitInputNumber min={0} max={100} step={0.001} unit="%" />
              </Form.Item>
              {supportsCap ? (
                <>
                  <Form.Item
                    label="기준소득 하한 (원/월)"
                    name="incomeFloor"
                    tooltip="국민연금/건강보험만 적용. 비워두면 하한 없음"
                  >
                    <AppUnitInputNumber min={0} step={10000} unit="원" />
                  </Form.Item>
                  <Form.Item
                    label="기준소득 상한 (원/월)"
                    name="incomeCeiling"
                    tooltip="국민연금/건강보험만 적용. 비워두면 상한 없음"
                  >
                    <AppUnitInputNumber min={0} step={10000} unit="원" />
                  </Form.Item>
                </>
              ) : null}
            </Form>
          </div>
        </AppDoubleActionModal>

        <AppDoubleActionModal
          title="세율 삭제"
          open={!!deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            if (deleting) deleteM.mutate(deleting.taxRateId);
          }}
          confirmText="삭제"
          cancelText="취소"
          confirmDanger
          confirmLoading={deleteM.isPending}
          width={440}
        >
          <div className="tw-space-y-2 tw-px-5 tw-py-4">
            <Typography.Text className="tw-text-sm tw-font-semibold tw-text-slate-900">
              {deleting ? `${TAX_TYPE_LABEL[deleting.taxType] ?? deleting.taxType} 요율을 삭제할까요?` : '선택한 세율을 삭제할까요?'}
            </Typography.Text>
            <Typography.Paragraph className="!tw-m-0 tw-text-sm tw-leading-6 !tw-text-slate-500">
              삭제한 세율은 해당 연도의 급여 계산 기준에서 제외됩니다.
            </Typography.Paragraph>
          </div>
        </AppDoubleActionModal>
    </SaasConsoleShell>
  );
}
