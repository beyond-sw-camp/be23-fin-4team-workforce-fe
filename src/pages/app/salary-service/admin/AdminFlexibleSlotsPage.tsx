/** /app/attendance/flexible-slots - 시차출퇴근 슬롯 관리 (시스템 관리자) */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { FlexibleTimeSlot, WorkSchedule } from '@/features/salary-service/types';

type FormValues = {
  workScheduleId: string;
  slotCode: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  workMinutes: number;
  breakMinutes: number;
  isDefault: boolean;
};

export function AdminFlexibleSlotsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FlexibleTimeSlot | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [form] = Form.useForm<FormValues>();

  const schedulesQ = useQuery({
    queryKey: ['salary', 'work-schedules'],
    queryFn: () => attendanceApi.workSchedule.list(),
  });

  const slotsQ = useQuery({
    queryKey: ['salary', 'attendance', 'flexible-slots', selectedScheduleId],
    queryFn: () => attendanceApi.flexibleSlot.listByWorkSchedule(selectedScheduleId),
    enabled: Boolean(selectedScheduleId),
  });

  const scheduleOptions = useMemo(
    () =>
      (schedulesQ.data ?? []).map((s: WorkSchedule) => ({
        value: s.workScheduleId!,
        label: `${s.scheduleName ?? '스케줄'} (${s.startTime ?? '--:--'}-${s.endTime ?? '--:--'})`,
      })),
    [schedulesQ.data],
  );

  const createM = useMutation({
    mutationFn: (v: FormValues) => attendanceApi.flexibleSlot.create(v),
    onSuccess: () => {
      message.success('슬롯이 등록되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'flexible-slots', selectedScheduleId] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: FormValues }) =>
      attendanceApi.flexibleSlot.update(id, {
        slotCode: v.slotCode,
        slotLabel: v.slotLabel,
        startTime: v.startTime,
        endTime: v.endTime,
        workMinutes: v.workMinutes,
        breakMinutes: v.breakMinutes,
        isDefault: v.isDefault,
      }),
    onSuccess: () => {
      message.success('슬롯이 수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'flexible-slots', selectedScheduleId] });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => attendanceApi.flexibleSlot.delete(id),
    onSuccess: () => {
      message.success('슬롯이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'flexible-slots', selectedScheduleId] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const defaultM = useMutation({
    mutationFn: (id: string) => attendanceApi.flexibleSlot.setDefault(id),
    onSuccess: () => {
      message.success('기본 슬롯이 변경되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'flexible-slots', selectedScheduleId] });
    },
    onError: (e: Error) => message.error(e.message || '기본 지정에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<FlexibleTimeSlot>>(
    () => [
      { title: '코드', dataIndex: 'slotCode', key: 'slotCode', width: 140 },
      { title: '라벨', dataIndex: 'slotLabel', key: 'slotLabel', width: 180 },
      { title: '시간', key: 'time', width: 170, render: (_, r) => `${r.startTime ?? '-'} ~ ${r.endTime ?? '-'}` },
      { title: '근무분', dataIndex: 'workMinutes', key: 'workMinutes', width: 90 },
      { title: '휴게분', dataIndex: 'breakMinutes', key: 'breakMinutes', width: 90 },
      { title: '기본', dataIndex: 'isDefault', key: 'isDefault', width: 80, render: (v) => (v ? <Tag color="blue">기본</Tag> : '-') },
      {
        title: '액션',
        key: 'action',
        width: 180,
        render: (_, r) => (
          <Space>
            {r.slotId ? (
              <>
                <Button size="small" onClick={() => r.slotId && defaultM.mutate(r.slotId)} disabled={!!r.isDefault}>
                  기본
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(r);
                    setOpen(true);
                    form.setFieldsValue({
                      workScheduleId: r.workScheduleId ?? selectedScheduleId,
                      slotCode: r.slotCode ?? '',
                      slotLabel: r.slotLabel ?? '',
                      startTime: r.startTime ?? '09:00',
                      endTime: r.endTime ?? '18:00',
                      workMinutes: r.workMinutes ?? 480,
                      breakMinutes: r.breakMinutes ?? 60,
                      isDefault: Boolean(r.isDefault),
                    });
                  }}
                >
                  수정
                </Button>
                <Popconfirm title="슬롯을 삭제할까요?" onConfirm={() => deleteM.mutate(r.slotId!)}>
                  <Button size="small" danger>삭제</Button>
                </Popconfirm>
              </>
            ) : null}
          </Space>
        ),
      },
    ],
    [defaultM, deleteM, form, selectedScheduleId],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0">시차 슬롯</Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mt-1 !tw-mb-0">
          근무 스케줄별 선택 가능한 출퇴근 슬롯을 관리합니다.
        </Typography.Paragraph>
      </div>
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Space className="tw-w-full tw-justify-between tw-mb-3" wrap>
          <Select
            placeholder="스케줄 선택"
            options={scheduleOptions}
            value={selectedScheduleId || undefined}
            onChange={(v) => setSelectedScheduleId(v)}
            className="tw-min-w-[320px]"
            loading={schedulesQ.isLoading}
          />
          <Button
            type="primary"
            disabled={!selectedScheduleId}
            onClick={() => {
              setEditing(null);
              setOpen(true);
              form.resetFields();
              form.setFieldsValue({
                workScheduleId: selectedScheduleId,
                slotCode: '',
                slotLabel: '',
                startTime: '09:00',
                endTime: '18:00',
                workMinutes: 480,
                breakMinutes: 60,
                isDefault: false,
              });
            }}
          >
            슬롯 등록
          </Button>
        </Space>

        <Table<FlexibleTimeSlot>
          rowKey={(r) => r.slotId ?? `${r.slotCode}-${r.startTime}`}
          dataSource={slotsQ.data ?? []}
          columns={columns}
          loading={slotsQ.isLoading}
          locale={{ emptyText: selectedScheduleId ? '등록된 슬롯이 없습니다.' : '먼저 스케줄을 선택하세요.' }}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 920 }}
        />
      </Card>

      <Modal
        open={open}
        title={editing ? '슬롯 수정' : '슬롯 등록'}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => (editing?.slotId ? updateM.mutate({ id: editing.slotId, v }) : createM.mutate(v))}
        >
          <Form.Item name="workScheduleId" label="근무 스케줄" rules={[{ required: true }]}>
            <Select options={scheduleOptions} disabled={Boolean(editing)} />
          </Form.Item>
          <Space wrap size={12} className="tw-w-full">
            <Form.Item name="slotCode" label="코드" rules={[{ required: true }]}><Input placeholder="SLOT_0900" /></Form.Item>
            <Form.Item name="slotLabel" label="표시명" rules={[{ required: true }]}><Input placeholder="09:00-18:00" /></Form.Item>
          </Space>
          <Space wrap size={12} className="tw-w-full">
            <Form.Item name="startTime" label="시작(HH:mm)" rules={[{ required: true }]}><Input placeholder="09:00" /></Form.Item>
            <Form.Item name="endTime" label="종료(HH:mm)" rules={[{ required: true }]}><Input placeholder="18:00" /></Form.Item>
          </Space>
          <Space wrap size={12} className="tw-w-full">
            <Form.Item name="workMinutes" label="근무분" rules={[{ required: true }]}><InputNumber min={1} /></Form.Item>
            <Form.Item name="breakMinutes" label="휴게분" rules={[{ required: true }]}><InputNumber min={0} /></Form.Item>
            <Form.Item name="isDefault" label="기본 슬롯" rules={[{ required: true }]}>
              <Select options={[{ value: true, label: '예' }, { value: false, label: '아니오' }]} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
