/** /app/attendance/flexible-slots - 시차출퇴근 슬롯 관리 (시스템 관리자) */
import { useEffect, useMemo, useState } from 'react';
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

function parseHHmmToMinutes(value?: string): number | null {
  if (!value) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  const hh = m[1];
  const mm = m[2];
  if (!hh || !mm) return null;
  return Number(hh) * 60 + Number(mm);
}

function calcWorkMinutes(startTime?: string, endTime?: string, breakMinutes?: number): number {
  const start = parseHHmmToMinutes(startTime);
  const end = parseHHmmToMinutes(endTime);
  if (start == null || end == null) return 0;
  const total = end >= start ? end - start : 24 * 60 - start + end;
  const breaks = breakMinutes ?? 0;
  return Math.max(total - breaks, 0);
}

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

  /** 유연근무는 스케줄 단계에서 시간을 입력하지 않으므로 라벨에 시간을 노출하지 않는다.
   *  실제 시간은 슬롯 단위로 정의·표시. */
  const scheduleOptions = useMemo(
    () =>
      (schedulesQ.data ?? [])
        .filter((s: WorkSchedule) => s.workType === 'FLEXIBLE')
        .map((s: WorkSchedule) => ({
          value: s.workScheduleId!,
          label: s.scheduleName ?? '스케줄',
        })),
    [schedulesQ.data],
  );

  useEffect(() => {
    if (!scheduleOptions.length) {
      if (selectedScheduleId) setSelectedScheduleId('');
      return;
    }
    const exists = scheduleOptions.some((opt) => opt.value === selectedScheduleId);
    if (!exists) {
      const first = scheduleOptions[0];
      if (first?.value) setSelectedScheduleId(first.value);
    }
  }, [scheduleOptions, selectedScheduleId]);

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.flexibleSlot.create({
        ...v,
        workMinutes: calcWorkMinutes(v.startTime, v.endTime, v.breakMinutes),
      }),
    onSuccess: () => {
      message.success('스케줄이 등록되었습니다.');
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
        workMinutes: calcWorkMinutes(v.startTime, v.endTime, v.breakMinutes),
        breakMinutes: v.breakMinutes,
        isDefault: v.isDefault,
      }),
    onSuccess: () => {
      message.success('스케줄이 수정되었습니다.');
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
      message.success('스케줄이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'flexible-slots', selectedScheduleId] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const defaultM = useMutation({
    mutationFn: (id: string) => attendanceApi.flexibleSlot.setDefault(id),
    onSuccess: () => {
      message.success('기본 스케줄이 변경되었습니다.');
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
                      workMinutes: calcWorkMinutes(r.startTime ?? '09:00', r.endTime ?? '18:00', r.breakMinutes ?? 60),
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
            placeholder="유연근무(시차출퇴근) 스케줄 선택"
            options={scheduleOptions}
            value={selectedScheduleId || undefined}
            onChange={(v) => setSelectedScheduleId(v)}
            className="tw-min-w-[320px]"
            loading={schedulesQ.isLoading}
            notFoundContent="유연근무(시차출퇴근) 스케줄이 없습니다. 근무 스케줄 관리에서 먼저 생성해 주세요."
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
                breakMinutes: 60,
                workMinutes: calcWorkMinutes('09:00', '18:00', 60),
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
          locale={{ emptyText: selectedScheduleId ? '등록된 스케줄이 없습니다.' : '유연근무(시차출퇴근) 스케줄을 먼저 등록해 주세요.' }}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 920 }}
        />
      </Card>

      <Modal
        open={open}
        title={editing ? '스케줄 수정' : '스케줄 등록'}
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
          onValuesChange={(changed, all) => {
            if ('startTime' in changed || 'endTime' in changed || 'breakMinutes' in changed) {
              form.setFieldValue('workMinutes', calcWorkMinutes(all.startTime, all.endTime, all.breakMinutes));
            }
          }}
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
            <Form.Item
              name="workMinutes"
              label="근무분"
              rules={[{ required: true }]}
              extra="시작/종료/휴게분 기준 자동 계산"
            >
              <InputNumber min={0} disabled />
            </Form.Item>
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
