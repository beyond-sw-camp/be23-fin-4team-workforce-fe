/** /app/payroll/allowances - 개인 수당 신청/이력 (사원) */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { MemberAllowance, SalaryItemTemplate } from '@/features/salary-service/types';

type FormValues = {
  salaryItemTemplateId: string;
  amount: number;
  effectiveFrom: dayjs.Dayjs;
  reason?: string;
};

const STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
  AUTO: '자동',
};

export function MyAllowancesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const templatesQ = useQuery({
    queryKey: ['salary', 'salary-item-templates'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
  });
  const listQ = useQuery({
    queryKey: ['salary', 'allowance', 'my'],
    queryFn: () => salaryApi.memberAllowance.listMy(),
  });

  const templateOptions = useMemo(
    () =>
      (templatesQ.data ?? [])
        .filter((t) => t.delYn !== 'Y' && t.itemType === 'EARNING')
        .map((t: SalaryItemTemplate) => ({
          value: t.salaryItemTemplateId!,
          label: `${t.itemName ?? '수당'} (${t.isTaxableYn === 'Y' ? '과세' : '비과세'})`,
        })),
    [templatesQ.data],
  );

  const templateNameMap = useMemo(
    () =>
      new Map((templatesQ.data ?? []).map((t) => [t.salaryItemTemplateId ?? '', t.itemName ?? t.salaryItemTemplateId ?? '-'])),
    [templatesQ.data],
  );

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      salaryApi.memberAllowance.createMy({
        salaryItemTemplateId: v.salaryItemTemplateId,
        amount: v.amount,
        effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'),
        reason: v.reason?.trim() || null,
      }),
    onSuccess: () => {
      message.success('수당 신청이 등록되었습니다.');
      form.resetFields();
      form.setFieldsValue({ effectiveFrom: dayjs() });
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => salaryApi.memberAllowance.cancelMy(id),
    onSuccess: () => {
      message.success('신청이 철회되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '철회에 실패했습니다.'),
  });

  const rows = useMemo(
    () => [...(listQ.data ?? [])].sort((a, b) => (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? '')),
    [listQ.data],
  );

  const columns = useMemo<ColumnsType<MemberAllowance>>(
    () => [
      {
        title: '항목',
        key: 'item',
        render: (_, r) => templateNameMap.get(r.salaryItemTemplateId ?? '') ?? (r.salaryItemTemplateId ?? '-'),
      },
      { title: '금액', dataIndex: 'amount', key: 'amount', width: 140, render: (v) => `${Number(v ?? 0).toLocaleString()}원` },
      { title: '적용 시작일', dataIndex: 'effectiveFrom', key: 'effectiveFrom', width: 130 },
      { title: '사유', dataIndex: 'reason', key: 'reason', ellipsis: true },
      {
        title: '상태',
        dataIndex: 'approvalStatus',
        key: 'approvalStatus',
        width: 100,
        render: (v) => <Tag>{STATUS_KO[v ?? ''] ?? (v ?? '-')}</Tag>,
      },
      {
        title: '액션',
        key: 'action',
        width: 90,
        render: (_, r) =>
          r.memberAllowanceId && r.approvalStatus === 'PENDING' ? (
            <Popconfirm title="신청을 철회할까요?" onConfirm={() => cancelM.mutate(r.memberAllowanceId!)}>
              <Button danger size="small">
                철회
              </Button>
            </Popconfirm>
          ) : (
            '-'
          ),
      },
    ],
    [cancelM, templateNameMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0">
          수당 신청
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mt-1 !tw-mb-0">
          수당 항목을 선택해 변경 신청을 등록하고 상태를 확인합니다.
        </Typography.Paragraph>
      </div>

      <Card title="신청 등록" className="tw-border-slate-200/80 tw-shadow-sm">
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ effectiveFrom: dayjs() }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Space wrap align="start" size={12} className="tw-w-full">
            <Form.Item name="salaryItemTemplateId" label="수당 항목" rules={[{ required: true }]} className="tw-min-w-[280px]">
              <Select
                options={templateOptions}
                loading={templatesQ.isLoading}
                placeholder="항목 선택"
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
            <Form.Item name="amount" label="금액(원)" rules={[{ required: true }]}>
              <InputNumber min={0} step={10000} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="effectiveFrom" label="적용 시작일" rules={[{ required: true }]}>
              <DatePicker format="YYYY-MM-DD" />
            </Form.Item>
          </Space>
          <Form.Item name="reason" label="사유" rules={[{ required: true, message: '사유를 입력하세요.' }]}>
            <Input.TextArea rows={2} maxLength={300} showCount />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={createM.isPending}>
            신청
          </Button>
        </Form>
      </Card>

      <Card title="내 수당 이력" className="tw-border-slate-200/80 tw-shadow-sm" loading={listQ.isLoading}>
        <Table<MemberAllowance>
          rowKey={(r) => r.memberAllowanceId ?? `${r.salaryItemTemplateId}-${r.createdAt}`}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 860 }}
          locale={{ emptyText: '신청 내역이 없습니다.' }}
        />
      </Card>
    </Space>
  );
}
