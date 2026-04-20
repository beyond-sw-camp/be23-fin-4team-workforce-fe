/** /app/attendance/schedules/my - 스케줄/시차 (사원) */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Form, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { FlexibleTimeSlot, MemberScheduleSelection, WorkSchedule } from '@/features/salary-service/types';

type FormValues = {
  targetYearMonth: dayjs.Dayjs;
  workScheduleId: string;
  slotId: string;
  requestReason?: string;
};

const STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
  AUTO: '자동',
};

export function MyScheduleSelectionsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const yearMonth = Form.useWatch('targetYearMonth', form)?.format('YYYY-MM') ?? dayjs().format('YYYY-MM');
  const selectedScheduleId = Form.useWatch('workScheduleId', form);

  const schedulesQ = useQuery({
    queryKey: ['salary', 'work-schedules'],
    queryFn: () => attendanceApi.workSchedule.list(),
  });
  const slotsQ = useQuery({
    queryKey: ['salary', 'flexible-slots', selectedScheduleId],
    queryFn: () => attendanceApi.flexibleSlot.listByWorkSchedule(selectedScheduleId),
    enabled: Boolean(selectedScheduleId),
  });
  const currentQ = useQuery({
    queryKey: ['salary', 'schedule-selection', 'my', 'current', yearMonth],
    queryFn: () => attendanceApi.scheduleSelection.getMyCurrent(yearMonth),
  });
  const historyQ = useQuery({
    queryKey: ['salary', 'schedule-selection', 'my', 'history', yearMonth],
    queryFn: () => attendanceApi.scheduleSelection.getMyHistory(yearMonth),
  });

  const scheduleOptions = useMemo(
    () =>
      (schedulesQ.data ?? [])
        .filter((s: WorkSchedule) => s.workType === 'FLEXIBLE')
        .map((s) => ({ value: s.workScheduleId!, label: s.scheduleName ?? s.workScheduleId! })),
    [schedulesQ.data],
  );
  const slotOptions = useMemo(
    () =>
      (slotsQ.data ?? [])
        .filter((s: FlexibleTimeSlot) => s.delYn !== 'Y')
        .map((s) => ({
          value: s.slotId!,
          label: `${s.slotLabel ?? s.slotCode ?? s.slotId} ${s.isDefault ? '(기본)' : ''}`,
        })),
    [slotsQ.data],
  );
  const slotMap = useMemo(
    () => new Map((slotsQ.data ?? []).map((s) => [s.slotId ?? '', s.slotLabel ?? s.slotCode ?? s.slotId ?? '-'])),
    [slotsQ.data],
  );

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.scheduleSelection.createMy({
        targetYearMonth: v.targetYearMonth.format('YYYY-MM'),
        slotId: v.slotId,
        requestReason: v.requestReason?.trim() || null,
      }),
    onSuccess: () => {
      message.success('슬롯 변경 신청이 등록되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'schedule-selection', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '신청에 실패했습니다.'),
  });
  const cancelM = useMutation({
    mutationFn: (id: string) => attendanceApi.scheduleSelection.cancelMy(id),
    onSuccess: () => {
      message.success('신청이 철회되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'schedule-selection', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '철회에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<MemberScheduleSelection>>(
    () => [
      { title: '대상월', dataIndex: 'targetYearMonth', key: 'targetYearMonth', width: 110 },
      { title: '신청 슬롯', key: 'slot', render: (_, r) => slotMap.get(r.slotId ?? '') ?? r.slotId ?? '-' },
      { title: '사유', dataIndex: 'requestReason', key: 'requestReason', ellipsis: true },
      { title: '상태', dataIndex: 'approvalStatus', key: 'approvalStatus', width: 100, render: (v) => <Tag>{STATUS_KO[v ?? ''] ?? (v ?? '-')}</Tag> },
      {
        title: '액션',
        key: 'action',
        width: 90,
        render: (_, r) =>
          r.selectionId && r.approvalStatus === 'PENDING' ? (
            <Popconfirm title="신청을 철회할까요?" onConfirm={() => cancelM.mutate(r.selectionId!)}>
              <Button danger size="small">철회</Button>
            </Popconfirm>
          ) : '-',
      },
    ],
    [cancelM, slotMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0">스케줄/시차</Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mt-1 !tw-mb-0">
          내 현재 슬롯, 선택 이력, 슬롯 변경 신청을 관리합니다.
        </Typography.Paragraph>
      </div>

      <Card title="슬롯 변경 신청" className="tw-border-slate-200/80 tw-shadow-sm">
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ targetYearMonth: dayjs() }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Space wrap size={12} align="start">
            <Form.Item name="targetYearMonth" label="대상월" rules={[{ required: true }]}>
              <DatePicker picker="month" format="YYYY-MM" />
            </Form.Item>
            <Form.Item name="workScheduleId" label="기준 스케줄" rules={[{ required: true }]}>
              <Select style={{ width: 220 }} options={scheduleOptions} loading={schedulesQ.isLoading} />
            </Form.Item>
            <Form.Item name="slotId" label="신청 슬롯" rules={[{ required: true }]}>
              <Select style={{ width: 260 }} options={slotOptions} loading={slotsQ.isLoading} />
            </Form.Item>
          </Space>
          <Form.Item name="requestReason" label="신청 사유" rules={[{ required: true, message: '사유를 입력하세요.' }]}>
            <Input.TextArea rows={2} maxLength={300} showCount />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={createM.isPending}>
            슬롯 변경 신청
          </Button>
        </Form>
      </Card>

      <Card title="내 현재 슬롯" className="tw-border-slate-200/80 tw-shadow-sm" loading={currentQ.isLoading}>
        {currentQ.data ? (
          <Space size={24}>
            <Typography.Text>대상월: {currentQ.data.targetYearMonth ?? '-'}</Typography.Text>
            <Typography.Text>슬롯: {slotMap.get(currentQ.data.slotId ?? '') ?? currentQ.data.slotId ?? '-'}</Typography.Text>
            <Typography.Text>상태: <Tag>{STATUS_KO[currentQ.data.approvalStatus ?? ''] ?? (currentQ.data.approvalStatus ?? '-')}</Tag></Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">현재 적용 슬롯이 없습니다.</Typography.Text>
        )}
      </Card>

      <Card title="선택 이력" className="tw-border-slate-200/80 tw-shadow-sm" loading={historyQ.isLoading}>
        <Table<MemberScheduleSelection>
          rowKey={(r) => r.selectionId ?? `${r.targetYearMonth}-${r.createdAt}`}
          dataSource={historyQ.data ?? []}
          columns={columns}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 860 }}
          locale={{ emptyText: '신청/이력 데이터가 없습니다.' }}
        />
      </Card>
    </Space>
  );
}
