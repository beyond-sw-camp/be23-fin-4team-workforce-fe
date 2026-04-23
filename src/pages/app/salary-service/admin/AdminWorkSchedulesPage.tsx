/** /app/attendance/schedules — 근무 스케줄 CRUD (시스템 관리자) */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { WorkSchedule, WorkTypeCode } from '@/features/salary-service/types';

type FormValues = {
  scheduleName: string;
  workType: WorkTypeCode;
  timeRange: [dayjs.Dayjs, dayjs.Dayjs];
  workMinutes: number;
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
};

const QK = ['salary', 'work-schedules'] as const;

const WORK_TYPE_OPTIONS = [
  { value: 'FIXED', label: '고정 (FIXED)' },
  { value: 'FLEXIBLE', label: '유연 (FLEXIBLE)' },
  { value: 'SHIFT', label: '교대 (SHIFT)' },
];

const WORK_TYPE_KO: Record<string, string> = {
  FIXED: '고정',
  FLEXIBLE: '유연',
  SHIFT: '교대',
};
const LUNCH_BREAK_MINUTES = 60;

function calcNetWorkMinutes(timeRange?: [dayjs.Dayjs, dayjs.Dayjs]): number {
  if (!timeRange) return 0;
  const [start, end] = timeRange;
  if (!start || !end) return 0;
  const adjustedEnd = end.isBefore(start) ? end.add(1, 'day') : end;
  const totalMinutes = adjustedEnd.diff(start, 'minute');
  return Math.max(totalMinutes - LUNCH_BREAK_MINUTES, 0);
}

export function AdminWorkSchedulesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkSchedule | null>(null);
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.workSchedule.list(),
  });

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.workSchedule.create({
        memberId: null,
        scheduleName: v.scheduleName.trim(),
        workType: v.workType,
        startTime: v.timeRange[0].format('HH:mm:ss'),
        endTime: v.timeRange[1].format('HH:mm:ss'),
        workMinutes: calcNetWorkMinutes(v.timeRange),
        effectiveFrom: v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: v.effectiveRange[1] ? v.effectiveRange[1].format('YYYY-MM-DD') : null,
      }),
    onSuccess: () => {
      message.success('스케줄이 등록되었습니다.');
      setOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; v: FormValues }) =>
      attendanceApi.workSchedule.update(input.id, {
        scheduleName: input.v.scheduleName.trim(),
        workType: input.v.workType,
        startTime: input.v.timeRange[0].format('HH:mm:ss'),
        endTime: input.v.timeRange[1].format('HH:mm:ss'),
        workMinutes: calcNetWorkMinutes(input.v.timeRange),
        effectiveFrom: input.v.effectiveRange[0].format('YYYY-MM-DD'),
        effectiveTo: input.v.effectiveRange[1] ? input.v.effectiveRange[1].format('YYYY-MM-DD') : null,
      }),
    onSuccess: () => {
      message.success('수정되었습니다.');
      setOpen(false);
      setEditing(null);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => attendanceApi.workSchedule.delete(id),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const columns = useMemo<ColumnsType<WorkSchedule>>(
    () => [
      {
        title: '이름',
        dataIndex: 'scheduleName',
        key: 'scheduleName',
      },
      {
        title: '유형',
        dataIndex: 'workType',
        key: 'workType',
        width: 100,
        render: (v) => <Tag>{WORK_TYPE_KO[v as string] ?? v}</Tag>,
      },
      {
        title: '대상',
        dataIndex: 'memberId',
        key: 'memberId',
        width: 160,
        // TODO: memberId 대신 이름 매핑 표시 필요
        render: (v) =>
          v ? (
            <Tooltip title={v}>
              <Tag color="blue">개인</Tag>
            </Tooltip>
          ) : (
            <Tag>회사 기본</Tag>
          ),
      },
      {
        title: '시간',
        key: 'time',
        width: 180,
        render: (_, r) => `${(r.startTime ?? '').slice(0, 5)} ~ ${(r.endTime ?? '').slice(0, 5)}`,
      },
      {
        title: '근무(분)',
        dataIndex: 'workMinutes',
        key: 'workMinutes',
        width: 100,
      },
      {
        title: '적용기간',
        key: 'effective',
        width: 220,
        render: (_, r) => `${r.effectiveFrom ?? ''} ~ ${r.effectiveTo ?? '진행중'}`,
      },
      {
        title: '액션',
        key: 'actions',
        width: 160,
        render: (_, r) => (
          <Space>
            <Button
              size="small"
              onClick={() => {
                setEditing(r);
                setOpen(true);
                form.setFieldsValue({
                  scheduleName: r.scheduleName ?? '',
                  workType: (r.workType as WorkTypeCode) ?? 'FIXED',
                  timeRange: (() => {
                    const range: [dayjs.Dayjs, dayjs.Dayjs] = [
                      dayjs(`1970-01-01T${r.startTime ?? '09:00:00'}`),
                      dayjs(`1970-01-01T${r.endTime ?? '18:00:00'}`),
                    ];
                    return range;
                  })(),
                  workMinutes: calcNetWorkMinutes([
                    dayjs(`1970-01-01T${r.startTime ?? '09:00:00'}`),
                    dayjs(`1970-01-01T${r.endTime ?? '18:00:00'}`),
                  ]),
                  effectiveRange: [
                    r.effectiveFrom ? dayjs(r.effectiveFrom) : dayjs(),
                    r.effectiveTo ? dayjs(r.effectiveTo) : null,
                  ],
                });
              }}
            >
              수정
            </Button>
            <Popconfirm
              title="삭제하시겠어요?"
              okText="삭제"
              cancelText="취소"
              onConfirm={() => r.workScheduleId && deleteM.mutate(r.workScheduleId)}
            >
              <Button size="small" danger>
                삭제
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteM, form],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-items-end tw-justify-between">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            근무 스케줄 관리
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            <Typography.Text code>/work-schedules</Typography.Text> — 회사 기본 근무 스케줄을 등록·관리합니다.
          </Typography.Paragraph>
        </div>
        <Button
          type="primary"
          onClick={() => {
            setEditing(null);
            form.resetFields();
            const defaultTimeRange: [dayjs.Dayjs, dayjs.Dayjs] = [
              dayjs('1970-01-01T09:00:00'),
              dayjs('1970-01-01T18:00:00'),
            ];
            form.setFieldsValue({
              workType: 'FIXED',
              timeRange: defaultTimeRange,
              workMinutes: calcNetWorkMinutes(defaultTimeRange),
              effectiveRange: [dayjs(), null],
            });
            setOpen(true);
          }}
        >
          스케줄 추가
        </Button>
      </div>

      <Card>
        {/* TODO: 서버 페이지네이션 전환 필요(현재는 전체 조회 후 프론트 페이징) */}
        <Table<WorkSchedule>
          rowKey={(r) => r.workScheduleId ?? `${r.scheduleName}-${r.effectiveFrom}`}
          loading={listQ.isLoading}
          dataSource={listQ.data ?? []}
          columns={columns}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: '등록된 스케줄이 없습니다.' }}
        />
      </Card>

      <Modal
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending || updateM.isPending}
        okText={editing ? '수정' : '등록'}
        cancelText="취소"
        title={editing ? '스케줄 수정' : '스케줄 추가'}
        destroyOnClose
        width={560}
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          onValuesChange={(changed) => {
            if ('timeRange' in changed) {
              const nextTimeRange = changed.timeRange as [dayjs.Dayjs, dayjs.Dayjs] | undefined;
              form.setFieldValue('workMinutes', calcNetWorkMinutes(nextTimeRange));
            }
          }}
          onFinish={(v) => {
            if (editing?.workScheduleId) updateM.mutate({ id: editing.workScheduleId, v });
            else createM.mutate(v);
          }}
        >
          <Form.Item label="스케줄 명" name="scheduleName" rules={[{ required: true, message: '이름을 입력하세요.' }]}>
            <Input placeholder="예: ㅇㅇ 컴퍼니 근무 스케줄" maxLength={60} />
          </Form.Item>
          <Form.Item label="근무 유형" name="workType" rules={[{ required: true }]}>
            <Select options={WORK_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item label="출퇴근 시각" name="timeRange" rules={[{ required: true }]}>
            <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="근무시간(분)"
            name="workMinutes"
            rules={[{ required: true }]}
            extra="출퇴근 시각 기준 자동 계산 (점심 60분 차감). 예: 09:00~18:00 -> 480분(8시간)"
          >
            <InputNumber min={0} step={30} style={{ width: '100%' }} disabled />
          </Form.Item>
          <Form.Item label="스케줄 운영 기간 (종료일 미입력 시 계속 적용)" name="effectiveRange" rules={[{ required: true }]}>
            <DatePicker.RangePicker format="YYYY-MM-DD" allowEmpty={[false, true]} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
