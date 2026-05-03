/** /app/attendance/flexible-slots - 시차출퇴근 슬롯 관리 (시스템 관리자) */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, InputNumber, Popconfirm, Select, Space, Table, Tag, TimePicker, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import type { FlexibleTimeSlot, WorkSchedule } from '@/features/salary-service/types';

type FormValues = {
  workScheduleId: string;
  slotLabel: string;
  startTime: Dayjs | null;
  endTime: Dayjs | null;
  workMinutes: number;
  breakMinutes: number;
  isDefault: boolean;
};

function normalizeTimeText(value?: string | Dayjs | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (dayjs.isDayjs(value)) return value.format('HH:mm');
  return null;
}

function parseHHmmToMinutes(value?: string | Dayjs | null): number | null {
  const text = normalizeTimeText(value);
  if (!text) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text.trim());
  if (!m) return null;
  const hh = m[1];
  const mm = m[2];
  if (!hh || !mm) return null;
  return Number(hh) * 60 + Number(mm);
}

function calcWorkMinutes(startTime?: string | Dayjs | null, endTime?: string | Dayjs | null, breakMinutes?: number): number {
  const start = parseHHmmToMinutes(startTime);
  const end = parseHHmmToMinutes(endTime);
  if (start == null || end == null) return 0;
  const total = end >= start ? end - start : 24 * 60 - start + end;
  const breaks = breakMinutes ?? 0;
  return Math.max(total - breaks, 0);
}

function buildAutoSlotCode(slotLabel?: string, startTime?: string | Dayjs | null, endTime?: string | Dayjs | null): string {
  const baseRaw = (slotLabel ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9가-힣]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const strictBase = (baseRaw || 'SCHEDULE')
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'SCHEDULE';
  const s = (normalizeTimeText(startTime) ?? '0900').replace(':', '');
  const e = (normalizeTimeText(endTime) ?? '1800').replace(':', '');
  const seed = `${Date.now()}`.slice(-4);
  return `${strictBase}_${s}_${e}_${seed}`.slice(0, 30);
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
        slotCode: buildAutoSlotCode(v.slotLabel, v.startTime, v.endTime),
        startTime: normalizeTimeText(v.startTime) ?? '09:00',
        endTime: normalizeTimeText(v.endTime) ?? '18:00',
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
        slotLabel: v.slotLabel,
        startTime: normalizeTimeText(v.startTime) ?? '09:00',
        endTime: normalizeTimeText(v.endTime) ?? '18:00',
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

  const hasDuplicateTimeRange = (
    startTime: string | Dayjs | null | undefined,
    endTime: string | Dayjs | null | undefined,
    excludeSlotId?: string,
  ) => {
    const start = normalizeTimeText(startTime);
    const end = normalizeTimeText(endTime);
    if (!start || !end) return false;
    return (slotsQ.data ?? []).some((slot) => {
      if (excludeSlotId && slot.slotId === excludeSlotId) return false;
      const s = (slot.startTime ?? '').slice(0, 5);
      const e = (slot.endTime ?? '').slice(0, 5);
      return s === start && e === end;
    });
  };

  const columns = useMemo<ColumnsType<FlexibleTimeSlot>>(
    () => [
      { title: '코드(자동)', dataIndex: 'slotCode', key: 'slotCode', width: 140 },
      { title: '스케줄명', dataIndex: 'slotLabel', key: 'slotLabel', width: 180 },
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
                      slotLabel: r.slotLabel ?? '',
                      startTime: dayjs(r.startTime ?? '09:00', 'HH:mm'),
                      endTime: dayjs(r.endTime ?? '18:00', 'HH:mm'),
                      workMinutes: calcWorkMinutes(r.startTime ?? '09:00', r.endTime ?? '18:00', r.breakMinutes ?? 60),
                      breakMinutes: r.breakMinutes ?? 60,
                      isDefault: Boolean(r.isDefault),
                    });
                  }}
                >
                  수정
                </Button>
                {r.isDefault ? (
                  <Button size="small" danger disabled>삭제</Button>
                ) : (
                  <Popconfirm
                    title="스케줄을 삭제할까요?"
                    description={
                      (slotsQ.data ?? []).length <= 1
                        ? '시차 스케줄은 최소 1개 이상 유지되어야 합니다.'
                        : undefined
                    }
                    okText="삭제"
                    cancelText="취소"
                    disabled={(slotsQ.data ?? []).length <= 1}
                    onConfirm={() => deleteM.mutate(r.slotId!)}
                  >
                    <Button size="small" danger disabled={(slotsQ.data ?? []).length <= 1}>삭제</Button>
                  </Popconfirm>
                )}
              </>
            ) : null}
          </Space>
        ),
      },
    ],
    [defaultM, deleteM, form, selectedScheduleId, slotsQ.data],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0">시차 스케줄</Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mt-1 !tw-mb-0">
          근무 스케줄별 선택 가능한 출퇴근 스케줄을 관리합니다.
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
                slotLabel: '',
                startTime: dayjs('09:00', 'HH:mm'),
                endTime: dayjs('18:00', 'HH:mm'),
                breakMinutes: 60,
                workMinutes: calcWorkMinutes('09:00', '18:00', 60),
                isDefault: false,
              });
            }}
          >
            스케줄 등록
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

      <AppDoubleActionModal
        open={open}
        title={editing ? '스케줄 수정' : '스케줄 등록'}
        onClose={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onConfirm={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        confirmText={editing ? '수정' : '등록'}
        cancelText="취소"
        width={680}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        <Form<FormValues>
          form={form}
          layout="vertical"
          onValuesChange={(changed, all) => {
            if ('startTime' in changed || 'endTime' in changed || 'breakMinutes' in changed) {
              form.setFieldValue('workMinutes', calcWorkMinutes(all.startTime, all.endTime, all.breakMinutes));
            }
          }}
          onFinish={(v) => {
            const duplicate = hasDuplicateTimeRange(v.startTime, v.endTime, editing?.slotId);
            if (duplicate) {
              message.warning('이미 동일한 시간대의 스케줄이 있습니다.');
              return;
            }
            if (editing?.slotId) {
              updateM.mutate({ id: editing.slotId, v });
              return;
            }
            createM.mutate(v);
          }}
        >
          <Alert
            type="info"
            showIcon
            className="tw-mb-3"
            message="시작/종료/휴게 시간을 입력하면 근무시간은 자동 계산됩니다."
          />
          <Form.Item name="workScheduleId" label="근무 스케줄" rules={[{ required: true, message: '근무 스케줄을 선택해 주세요.' }]}>
            <Select options={scheduleOptions} disabled={Boolean(editing)} />
          </Form.Item>
          <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-3">
            <Form.Item
              name="slotLabel"
              label="스케줄명"
              rules={[
                { required: true, message: '스케줄명을 입력해 주세요.' },
                { max: 40, message: '스케줄명은 40자 이내로 입력해 주세요.' },
              ]}
            >
              <Input placeholder="예: 조기 출근, 표준 근무, 늦은 출근" />
            </Form.Item>
            <div />
            <Form.Item
              name="startTime"
              label="시작 시간 (HH:mm)"
              rules={[{ required: true, message: '시작 시간을 선택해 주세요.' }]}
            >
              <TimePicker
                format="HH:mm"
                minuteStep={10}
                showNow={false}
                needConfirm={false}
                className="tw-w-full"
              />
            </Form.Item>
            <Form.Item
              name="endTime"
              label="종료 시간 (HH:mm)"
              rules={[{ required: true, message: '종료 시간을 선택해 주세요.' }]}
            >
              <TimePicker
                format="HH:mm"
                minuteStep={10}
                showNow={false}
                needConfirm={false}
                className="tw-w-full"
              />
            </Form.Item>
          </div>
          <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-3 tw-gap-3">
            <Form.Item
              name="workMinutes"
              label="근무 시간 (분)"
              rules={[{ required: true }]}
              extra="자동 계산"
            >
              <InputNumber min={0} disabled className="tw-w-full" />
            </Form.Item>
            <Form.Item
              name="breakMinutes"
              label="휴게 시간 (분)"
              rules={[{ required: true, message: '휴게 시간을 입력해 주세요.' }]}
            >
              <InputNumber min={0} step={10} className="tw-w-full" />
            </Form.Item>
            <Form.Item name="isDefault" label="기본 스케줄" rules={[{ required: true }]}>
              <Select options={[{ value: true, label: '예' }, { value: false, label: '아니오' }]} />
            </Form.Item>
          </div>
        </Form>
        </div>
      </AppDoubleActionModal>
    </Space>
  );
}
