/** /app/payroll/allowances/admin - 수당 신청 목록 (시스템 관리자) */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { MemberAllowance, SalaryItemTemplate } from '@/features/salary-service/types';

type AutoGrantForm = {
  memberId: string;
  salaryItemTemplateId: string;
  amount: number;
  effectiveFrom: dayjs.Dayjs;
};

const STATUS_OPTIONS = [
  { value: 'PENDING', label: '대기' },
  { value: 'APPROVED', label: '승인' },
  { value: 'REJECTED', label: '반려' },
  { value: 'CANCELLED', label: '취소' },
  { value: 'AUTO', label: '자동' },
];

const STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
  AUTO: '자동',
};

export function AdminAllowanceRequestsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [form] = Form.useForm<AutoGrantForm>();

  const listQ = useQuery({
    queryKey: ['salary', 'allowance', 'admin', status],
    queryFn: () => salaryApi.memberAllowanceAdmin.listByStatus(status),
  });
  const templatesQ = useQuery({
    queryKey: ['salary', 'salary-item-templates'],
    queryFn: () => salaryApi.salaryItemTemplate.list(),
  });

  const templateMap = useMemo(
    () =>
      new Map((templatesQ.data ?? []).map((t: SalaryItemTemplate) => [t.salaryItemTemplateId ?? '', t.itemName ?? '-'])),
    [templatesQ.data],
  );
  const templateOptions = useMemo(
    () =>
      (templatesQ.data ?? [])
        .filter((t) => t.delYn !== 'Y' && t.itemType === 'EARNING')
        .map((t) => ({ value: t.salaryItemTemplateId!, label: t.itemName ?? t.salaryItemTemplateId! })),
    [templatesQ.data],
  );

  const autoGrantM = useMutation({
    mutationFn: (v: AutoGrantForm) =>
      salaryApi.memberAllowanceAdmin.autoGrant({
        memberId: v.memberId,
        salaryItemTemplateId: v.salaryItemTemplateId,
        amount: v.amount,
        effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'),
      }),
    onSuccess: () => {
      message.success('자동 수당 등록이 완료되었습니다.');
      form.resetFields();
      form.setFieldsValue({ effectiveFrom: dayjs() });
      void qc.invalidateQueries({ queryKey: ['salary', 'allowance', 'admin'] });
    },
    onError: (e: Error) => message.error(e.message || '자동 등록에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<MemberAllowance>>(
    () => [
      { title: '신청ID', dataIndex: 'memberAllowanceId', key: 'memberAllowanceId', width: 220, ellipsis: true },
      { title: '구성원ID', dataIndex: 'memberId', key: 'memberId', width: 220, ellipsis: true },
      {
        title: '항목',
        key: 'item',
        render: (_, r) => templateMap.get(r.salaryItemTemplateId ?? '') ?? (r.salaryItemTemplateId ?? '-'),
      },
      { title: '금액', dataIndex: 'amount', key: 'amount', width: 140, render: (v) => `${Number(v ?? 0).toLocaleString()}원` },
      { title: '적용일', dataIndex: 'effectiveFrom', key: 'effectiveFrom', width: 120 },
      {
        title: '상태',
        dataIndex: 'approvalStatus',
        key: 'approvalStatus',
        width: 100,
        render: (v) => <Tag>{STATUS_KO[v ?? ''] ?? (v ?? '-')}</Tag>,
      },
      { title: '사유', dataIndex: 'reason', key: 'reason', ellipsis: true },
    ],
    [templateMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0">수당 신청 관리</Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mt-1 !tw-mb-0">
          신청 상태별 목록을 조회하고, 입사자 기본 수당을 자동 등록합니다.
        </Typography.Paragraph>
      </div>

      <Card title="입사자 기본 수당 자동 등록" className="tw-border-slate-200/80 tw-shadow-sm">
        <Form<AutoGrantForm>
          form={form}
          layout="inline"
          initialValues={{ effectiveFrom: dayjs() }}
          onFinish={(v) => autoGrantM.mutate(v)}
        >
          <Form.Item name="memberId" label="구성원 ID" rules={[{ required: true }]}>
            <Input style={{ width: 280 }} placeholder="대상 구성원 UUID" />
          </Form.Item>
          <Form.Item name="salaryItemTemplateId" label="수당 항목" rules={[{ required: true }]}>
            <Select style={{ width: 220 }} options={templateOptions} loading={templatesQ.isLoading} />
          </Form.Item>
          <Form.Item name="amount" label="금액" rules={[{ required: true }]}>
            <InputNumber min={0} step={10000} />
          </Form.Item>
          <Form.Item name="effectiveFrom" label="적용일" rules={[{ required: true }]}>
            <DatePicker format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={autoGrantM.isPending}>자동 등록</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Space className="tw-mb-3">
          <Typography.Text type="secondary">상태</Typography.Text>
          <Select value={status} onChange={setStatus} options={STATUS_OPTIONS} style={{ width: 140 }} />
        </Space>
        <Table<MemberAllowance>
          rowKey={(r) => r.memberAllowanceId ?? `${r.memberId}-${r.createdAt}`}
          dataSource={listQ.data ?? []}
          columns={columns}
          loading={listQ.isLoading}
          pagination={{ pageSize: 12 }}
          scroll={{ x: 1200 }}
        />
      </Card>
    </Space>
  );
}
