/** /app/attendance/overtime - 연장근로 신청/조회 (사원) */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, InputNumber, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { OvertimeRequest, OvertimeRequestCreatePayload } from '@/features/salary-service/types';

type FormValues = {
  targetDate: dayjs.Dayjs;
  requestType: 'PRE' | 'POST';
  plannedStartTime?: string;
  plannedEndTime?: string;
  requestedMinutes?: number;
  actualStartTime?: string;
  actualEndTime?: string;
  actualMinutes?: number;
  reason?: string;
};

const STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
  EXPIRED: '만료',
};

const TYPE_KO: Record<string, string> = {
  PRE: '사전',
  POST: '사후',
};

export function MyOvertimeRequestsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: ['salary', 'attendance', 'overtime', 'my'],
    queryFn: () => attendanceApi.overtimeRequest.listMy({ page: 0, size: 20 }),
  });

  const createM = useMutation({
    mutationFn: (payload: OvertimeRequestCreatePayload) => attendanceApi.overtimeRequest.createMy(payload),
    onSuccess: () => {
      message.success('연장근로 신청이 등록되었습니다.');
      form.resetFields();
      form.setFieldsValue({ requestType: 'PRE', targetDate: dayjs() });
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'overtime', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '신청에 실패했습니다.'),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => attendanceApi.overtimeRequest.cancelMy(id),
    onSuccess: () => {
      message.success('신청이 취소되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'overtime', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '취소에 실패했습니다.'),
  });

  const rows = listQ.data?.content ?? [];
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (b.targetDate ?? '').localeCompare(a.targetDate ?? '')),
    [rows],
  );

  const columns = useMemo<ColumnsType<OvertimeRequest>>(
    () => [
      { title: '일자', dataIndex: 'targetDate', key: 'targetDate', width: 120 },
      {
        title: '구분',
        dataIndex: 'requestType',
        key: 'requestType',
        width: 80,
        render: (v) => TYPE_KO[v ?? ''] ?? (v ?? '-'),
      },
      {
        title: '시간',
        key: 'time',
        render: (_, r) =>
          r.requestType === 'POST'
            ? `${r.actualStartTime ?? '-'} ~ ${r.actualEndTime ?? '-'}`
            : `${r.plannedStartTime ?? '-'} ~ ${r.plannedEndTime ?? '-'}`,
      },
      {
        title: '분',
        key: 'minutes',
        width: 90,
        render: (_, r) => (r.requestType === 'POST' ? r.actualMinutes : r.requestedMinutes) ?? '-',
      },
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
          r.overtimeRequestId && r.approvalStatus === 'PENDING' ? (
            <Popconfirm title="신청을 철회할까요?" onConfirm={() => cancelM.mutate(r.overtimeRequestId!)}>
              <Button danger size="small">
                철회
              </Button>
            </Popconfirm>
          ) : (
            '-'
          ),
      },
    ],
    [cancelM],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0">
          연장근로
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mt-1 !tw-mb-0">
          사전/사후 연장근로 신청을 등록하고 내 신청 이력을 확인합니다.
        </Typography.Paragraph>
      </div>

      <Card title="신청 등록" className="tw-border-slate-200/80 tw-shadow-sm">
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ requestType: 'PRE', targetDate: dayjs() }}
          onFinish={(v) =>
            createM.mutate({
              targetDate: v.targetDate.format('YYYY-MM-DD'),
              requestType: v.requestType,
              plannedStartTime: v.requestType === 'PRE' ? v.plannedStartTime ?? null : null,
              plannedEndTime: v.requestType === 'PRE' ? v.plannedEndTime ?? null : null,
              requestedMinutes: v.requestType === 'PRE' ? v.requestedMinutes ?? null : null,
              actualStartTime: v.requestType === 'POST' ? v.actualStartTime ?? null : null,
              actualEndTime: v.requestType === 'POST' ? v.actualEndTime ?? null : null,
              actualMinutes: v.requestType === 'POST' ? v.actualMinutes ?? null : null,
              reason: v.reason?.trim() || null,
            })
          }
        >
          <Space wrap align="start" size={12} className="tw-w-full">
            <Form.Item name="targetDate" label="대상일" rules={[{ required: true }]}>
              <DatePicker format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="requestType" label="구분" rules={[{ required: true }]}>
              <Select
                style={{ width: 120 }}
                options={[
                  { value: 'PRE', label: '사전' },
                  { value: 'POST', label: '사후' },
                ]}
              />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(p, c) => p.requestType !== c.requestType}>
              {({ getFieldValue }) =>
                getFieldValue('requestType') === 'PRE' ? (
                  <>
                    <Form.Item name="plannedStartTime" label="시작(HH:mm)" rules={[{ required: true }]}>
                      <Input style={{ width: 110 }} placeholder="18:00" />
                    </Form.Item>
                    <Form.Item name="plannedEndTime" label="종료(HH:mm)" rules={[{ required: true }]}>
                      <Input style={{ width: 110 }} placeholder="21:00" />
                    </Form.Item>
                    <Form.Item name="requestedMinutes" label="신청분" rules={[{ required: true }]}>
                      <InputNumber min={1} style={{ width: 110 }} />
                    </Form.Item>
                  </>
                ) : (
                  <>
                    <Form.Item name="actualStartTime" label="실근무 시작(HH:mm)" rules={[{ required: true }]}>
                      <Input style={{ width: 130 }} placeholder="18:00" />
                    </Form.Item>
                    <Form.Item name="actualEndTime" label="실근무 종료(HH:mm)" rules={[{ required: true }]}>
                      <Input style={{ width: 130 }} placeholder="21:00" />
                    </Form.Item>
                    <Form.Item name="actualMinutes" label="실근무분" rules={[{ required: true }]}>
                      <InputNumber min={1} style={{ width: 110 }} />
                    </Form.Item>
                  </>
                )
              }
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

      <Card title="내 신청 이력" className="tw-border-slate-200/80 tw-shadow-sm" loading={listQ.isLoading}>
        <Table<OvertimeRequest>
          rowKey={(r) => r.overtimeRequestId ?? `${r.targetDate}-${r.createdAt}`}
          dataSource={sortedRows}
          columns={columns}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 920 }}
          locale={{ emptyText: '신청 내역이 없습니다.' }}
        />
      </Card>
    </Space>
  );
}
