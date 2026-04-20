/** /app/attendance/overtime-policies - 연장근로 정책 관리 (시스템 관리자) */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { OvertimePolicy } from '@/features/salary-service/types';

type FormValues = {
  overtimeRoundingMinutes: number;
  approvalMode: 'PRE_ONLY' | 'POST_ONLY' | 'HYBRID';
  postApprovalDeadlineHours?: number;
  weeklyOvertimeLimitMinutes?: number;
  weeklyTotalLimitMinutes?: number;
  dailyOvertimeLimitMinutes?: number;
  monthlyOvertimeLimitMinutes?: number;
  holidayWorkRequiresApproval?: boolean;
  nightStartTime?: string;
  nightEndTime?: string;
  effectiveFrom: dayjs.Dayjs;
  effectiveTo?: dayjs.Dayjs | null;
};

const MODE_KO: Record<string, string> = {
  PRE_ONLY: '사전만',
  POST_ONLY: '사후만',
  HYBRID: '혼합',
};

export function AdminOvertimePoliciesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OvertimePolicy | null>(null);
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: ['salary', 'attendance', 'overtime-policies'],
    queryFn: () => attendanceApi.overtimePolicy.list(),
  });

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.overtimePolicy.create({
        overtimeRoundingMinutes: v.overtimeRoundingMinutes,
        approvalMode: v.approvalMode,
        postApprovalDeadlineHours: v.postApprovalDeadlineHours ?? null,
        weeklyOvertimeLimitMinutes: v.weeklyOvertimeLimitMinutes ?? null,
        weeklyTotalLimitMinutes: v.weeklyTotalLimitMinutes ?? null,
        dailyOvertimeLimitMinutes: v.dailyOvertimeLimitMinutes ?? null,
        monthlyOvertimeLimitMinutes: v.monthlyOvertimeLimitMinutes ?? null,
        holidayWorkRequiresApproval: v.holidayWorkRequiresApproval ?? true,
        nightStartTime: v.nightStartTime ?? null,
        nightEndTime: v.nightEndTime ?? null,
        effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'),
        effectiveTo: v.effectiveTo ? v.effectiveTo.format('YYYY-MM-DD') : null,
      }),
    onSuccess: () => {
      message.success('정책이 등록되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'overtime-policies'] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: FormValues }) =>
      attendanceApi.overtimePolicy.update(id, {
        overtimeRoundingMinutes: v.overtimeRoundingMinutes,
        approvalMode: v.approvalMode,
        postApprovalDeadlineHours: v.postApprovalDeadlineHours ?? null,
        weeklyOvertimeLimitMinutes: v.weeklyOvertimeLimitMinutes ?? null,
        weeklyTotalLimitMinutes: v.weeklyTotalLimitMinutes ?? null,
        dailyOvertimeLimitMinutes: v.dailyOvertimeLimitMinutes ?? null,
        monthlyOvertimeLimitMinutes: v.monthlyOvertimeLimitMinutes ?? null,
        holidayWorkRequiresApproval: v.holidayWorkRequiresApproval ?? true,
        nightStartTime: v.nightStartTime ?? null,
        nightEndTime: v.nightEndTime ?? null,
        effectiveFrom: v.effectiveFrom.format('YYYY-MM-DD'),
        effectiveTo: v.effectiveTo ? v.effectiveTo.format('YYYY-MM-DD') : null,
      }),
    onSuccess: () => {
      message.success('정책이 수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'overtime-policies'] });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const rows = useMemo(
    () => [...(listQ.data ?? [])].sort((a, b) => (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? '')),
    [listQ.data],
  );

  const columns = useMemo<ColumnsType<OvertimePolicy>>(
    () => [
      { title: '적용 시작일', dataIndex: 'effectiveFrom', key: 'effectiveFrom', width: 130 },
      { title: '적용 종료일', dataIndex: 'effectiveTo', key: 'effectiveTo', width: 130, render: (v) => v ?? '진행중' },
      {
        title: '결재 모드',
        dataIndex: 'approvalMode',
        key: 'approvalMode',
        width: 120,
        render: (v) => <Tag>{MODE_KO[v ?? ''] ?? (v ?? '-')}</Tag>,
      },
      { title: '반올림(분)', dataIndex: 'overtimeRoundingMinutes', key: 'overtimeRoundingMinutes', width: 100 },
      { title: '일 최대(분)', dataIndex: 'dailyOvertimeLimitMinutes', key: 'dailyOvertimeLimitMinutes', width: 100 },
      { title: '주 최대(분)', dataIndex: 'weeklyOvertimeLimitMinutes', key: 'weeklyOvertimeLimitMinutes', width: 100 },
      { title: '월 최대(분)', dataIndex: 'monthlyOvertimeLimitMinutes', key: 'monthlyOvertimeLimitMinutes', width: 100 },
      {
        title: '액션',
        key: 'action',
        width: 90,
        render: (_, r) =>
          r.overtimePolicyId ? (
            <Button
              size="small"
              onClick={() => {
                setEditing(r);
                setOpen(true);
                form.setFieldsValue({
                  overtimeRoundingMinutes: r.overtimeRoundingMinutes ?? 15,
                  approvalMode: (r.approvalMode as 'PRE_ONLY' | 'POST_ONLY' | 'HYBRID') ?? 'HYBRID',
                  postApprovalDeadlineHours: r.postApprovalDeadlineHours ?? undefined,
                  weeklyOvertimeLimitMinutes: r.weeklyOvertimeLimitMinutes ?? undefined,
                  weeklyTotalLimitMinutes: r.weeklyTotalLimitMinutes ?? undefined,
                  dailyOvertimeLimitMinutes: r.dailyOvertimeLimitMinutes ?? undefined,
                  monthlyOvertimeLimitMinutes: r.monthlyOvertimeLimitMinutes ?? undefined,
                  holidayWorkRequiresApproval: r.holidayWorkRequiresApproval ?? true,
                  nightStartTime: r.nightStartTime ?? '22:00',
                  nightEndTime: r.nightEndTime ?? '06:00',
                  effectiveFrom: r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(),
                  effectiveTo: r.effectiveTo ? dayjs(r.effectiveTo) : null,
                });
              }}
            >
              수정
            </Button>
          ) : (
            '-'
          ),
      },
    ],
    [form],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-items-end tw-justify-between">
        <div>
          <Typography.Title level={4} className="!tw-m-0">연장근로 정책</Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mt-1 !tw-mb-0">
            결재 모드, 반올림 단위, 일/주/월 한도 정책을 관리합니다.
          </Typography.Paragraph>
        </div>
        <Button
          type="primary"
          onClick={() => {
            setEditing(null);
            setOpen(true);
            form.resetFields();
            form.setFieldsValue({ approvalMode: 'HYBRID', overtimeRoundingMinutes: 15, effectiveFrom: dayjs() });
          }}
        >
          정책 등록
        </Button>
      </div>
      <Card className="tw-border-slate-200/80 tw-shadow-sm" loading={listQ.isLoading}>
        <Table<OvertimePolicy>
          rowKey={(r) => r.overtimePolicyId ?? `${r.effectiveFrom}-${r.effectiveTo}`}
          dataSource={rows}
          columns={columns}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 980 }}
        />
      </Card>

      <Modal
        open={open}
        title={editing ? '연장근로 정책 수정' : '연장근로 정책 등록'}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        width={760}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => (editing?.overtimePolicyId ? updateM.mutate({ id: editing.overtimePolicyId, v }) : createM.mutate(v))}
        >
          <Space wrap size={12}>
            <Form.Item name="approvalMode" label="결재 모드" rules={[{ required: true }]}>
              <Select
                style={{ width: 160 }}
                options={[
                  { value: 'PRE_ONLY', label: '사전만' },
                  { value: 'POST_ONLY', label: '사후만' },
                  { value: 'HYBRID', label: '혼합' },
                ]}
              />
            </Form.Item>
            <Form.Item name="overtimeRoundingMinutes" label="반올림(분)" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="postApprovalDeadlineHours" label="사후 결재 마감(시간)">
              <InputNumber min={0} />
            </Form.Item>
          </Space>
          <Space wrap size={12}>
            <Form.Item name="dailyOvertimeLimitMinutes" label="일 최대(분)"><InputNumber min={0} /></Form.Item>
            <Form.Item name="weeklyOvertimeLimitMinutes" label="주 연장 최대(분)"><InputNumber min={0} /></Form.Item>
            <Form.Item name="weeklyTotalLimitMinutes" label="주 총 최대(분)"><InputNumber min={0} /></Form.Item>
            <Form.Item name="monthlyOvertimeLimitMinutes" label="월 최대(분)"><InputNumber min={0} /></Form.Item>
          </Space>
          <Space wrap size={12}>
            <Form.Item name="nightStartTime" label="야간 시작(HH:mm)"><Select style={{ width: 120 }} options={[{ value: '22:00', label: '22:00' }, { value: '21:00', label: '21:00' }, { value: '23:00', label: '23:00' }]} /></Form.Item>
            <Form.Item name="nightEndTime" label="야간 종료(HH:mm)"><Select style={{ width: 120 }} options={[{ value: '06:00', label: '06:00' }, { value: '05:00', label: '05:00' }, { value: '07:00', label: '07:00' }]} /></Form.Item>
            <Form.Item name="holidayWorkRequiresApproval" label="휴일 근로 결재" rules={[{ required: true }]}>
              <Select style={{ width: 120 }} options={[{ value: true, label: '필수' }, { value: false, label: '생략' }]} />
            </Form.Item>
          </Space>
          <Space wrap size={12}>
            <Form.Item name="effectiveFrom" label="적용 시작일" rules={[{ required: true }]}><DatePicker format="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="effectiveTo" label="적용 종료일"><DatePicker format="YYYY-MM-DD" /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
