/** /app/leave/grant — 휴가 부여 POST /member-balance/grant (시스템 관리자) */
import { Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { BalanceTypeCode } from '@/features/salary-service/types';

type FormValues = {
  memberId: string;
  balanceType: BalanceTypeCode;
  totalGranted: number;
  expirationDate?: dayjs.Dayjs | null;
};

const BALANCE_OPTIONS: { value: BalanceTypeCode; label: string }[] = [
  { value: 'ANNUAL', label: '당해 연차 (ANNUAL)' },
  { value: 'MONTHLY', label: '월차 (MONTHLY)' },
  { value: 'CARRYOVER', label: '이월 연차 (CARRYOVER)' },
];

export function AdminLeaveGrantPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const grantM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.memberBalance.grant({
        memberId: v.memberId.trim(),
        balanceType: v.balanceType,
        totalGranted: v.totalGranted,
        expirationDate: v.expirationDate ? v.expirationDate.format('YYYY-MM-DD') : null,
      }),
    onSuccess: () => {
      message.success('휴가가 부여되었습니다.');
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'member-balance'] });
    },
    onError: (e: Error) => message.error(e.message || '부여에 실패했습니다.'),
  });

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          휴가 부여
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          <Typography.Text code>POST /member-balance/grant</Typography.Text> — 대상 구성원 UUID는 구성원 상세 등에서 확인할
          수 있습니다.
        </Typography.Paragraph>
        <Link to="/app/leave" className="tw-mt-2 tw-inline-block tw-text-sm tw-text-[#2563EB]">
          ← 휴가 화면으로
        </Link>
      </div>

      <Card className="tw-max-w-xl tw-border-slate-200/80 tw-shadow-sm">
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ balanceType: 'ANNUAL', totalGranted: 1 }}
          onFinish={(v) => grantM.mutate(v)}
        >
          <Form.Item
            name="memberId"
            label="구성원 ID (UUID)"
            rules={[{ required: true, message: 'UUID를 입력하세요.' }]}
          >
            <Input placeholder="00000000-0000-0000-0000-000000000000" />
          </Form.Item>
          <Form.Item name="balanceType" label="잔여 유형" rules={[{ required: true }]}>
            <Select options={BALANCE_OPTIONS} />
          </Form.Item>
          <Form.Item name="totalGranted" label="부여 일수" rules={[{ required: true }]}>
            <InputNumber className="tw-w-full" min={0.5} step={0.5} />
          </Form.Item>
          <Form.Item name="expirationDate" label="만료일 (선택)">
            <DatePicker className="tw-w-full" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={grantM.isPending}>
              부여
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
