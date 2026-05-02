/** /app/attendance/schedules — 근무 스케줄 CRUD (시스템 관리자) */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Alert,
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
import { membersApi } from '@/features/members/api/membersApi';
import type { Member } from '@/features/members/model/types';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { WorkSchedule, WorkTypeCode } from '@/features/salary-service/types';

type FormValues = {
  scheduleName: string;
  workType: WorkTypeCode;
  /** workType=FIXED 일 때만 사용. FLEXIBLE 이면 undefined → 페이로드에서 null 전송. */
  timeRange?: [dayjs.Dayjs, dayjs.Dayjs];
  /** workType=FIXED 일 때 회사 정책 점심·휴게 시작/종료 시각. FLEXIBLE 은 직원이 매월 선택. */
  breakRange?: [dayjs.Dayjs, dayjs.Dayjs];
  /** timeRange + breakRange 기준 자동 계산. FLEXIBLE 이면 undefined → null 전송. */
  workMinutes?: number;
  effectiveRange: [dayjs.Dayjs, dayjs.Dayjs | null];
};

const QK = ['salary', 'work-schedules'] as const;

const WORK_TYPE_OPTIONS = [
  { value: 'FIXED', label: '고정' },
  { value: 'FLEXIBLE', label: '유연근무(시차출퇴근)' },
];

const WORK_TYPE_KO: Record<string, string> = {
  FIXED: '고정',
  FLEXIBLE: '유연근무(시차출퇴근)',
};
const DEFAULT_BREAK_START = '12:00:00';
const DEFAULT_BREAK_END = '13:00:00';

/** 두 dayjs 간 분 차이 (자정 넘김 보정). 둘 중 하나라도 없으면 0. */
function durationMinutes(range?: [dayjs.Dayjs, dayjs.Dayjs]): number {
  if (!range) return 0;
  const [a, b] = range;
  if (!a || !b) return 0;
  const adjustedB = b.isBefore(a) ? b.add(1, 'day') : b;
  return Math.max(adjustedB.diff(a, 'minute'), 0);
}

function calcNetWorkMinutes(
  timeRange?: [dayjs.Dayjs, dayjs.Dayjs],
  breakRange?: [dayjs.Dayjs, dayjs.Dayjs],
): number {
  const total = durationMinutes(timeRange);
  if (total === 0) return 0;
  const breakMin = durationMinutes(breakRange);
  return Math.max(total - breakMin, 0);
}

export function AdminWorkSchedulesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkSchedule | null>(null);
  const [form] = Form.useForm<FormValues>();

  const listQ = useQuery({
    queryKey: QK,
    queryFn: () => attendanceApi.workSchedule.list(),
  });

  // 직원 이름 매핑용 회사 멤버 목록 5분 캐시
  const membersQ = useQuery({
    queryKey: ['members', 'list', 'work-schedule-name-map'],
    queryFn: () => membersApi.list({ page: 1, pageSize: 1000 }),
    staleTime: 5 * 60 * 1000,
  });

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    membersQ.data?.items.forEach((m) => map.set(m.id, m));
    return map;
  }, [membersQ.data]);

  /** FLEXIBLE 일 때는 시간/점심 필드를 null 로 전송. 백엔드는 workType 분기로 검증. */
  const buildTimePayload = (v: FormValues) => {
    if (v.workType === 'FLEXIBLE' || !v.timeRange) {
      return { startTime: null, endTime: null, workMinutes: null, breakStart: null, breakEnd: null };
    }
    const breakRange =
      v.breakRange ??
      ([
        dayjs(`1970-01-01T${DEFAULT_BREAK_START}`),
        dayjs(`1970-01-01T${DEFAULT_BREAK_END}`),
      ] as [dayjs.Dayjs, dayjs.Dayjs]);
    return {
      startTime: v.timeRange[0].format('HH:mm:ss'),
      endTime: v.timeRange[1].format('HH:mm:ss'),
      workMinutes: calcNetWorkMinutes(v.timeRange, breakRange),
      breakStart: breakRange[0].format('HH:mm:ss'),
      breakEnd: breakRange[1].format('HH:mm:ss'),
    };
  };

  const createM = useMutation({
    mutationFn: (v: FormValues) =>
      attendanceApi.workSchedule.create({
        memberId: null,
        scheduleName: v.scheduleName.trim(),
        workType: v.workType,
        ...buildTimePayload(v),
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
        ...buildTimePayload(input.v),
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

  const hasFlexibleSchedule = useMemo(
    () => (listQ.data ?? []).some((s) => s.workType === 'FLEXIBLE'),
    [listQ.data],
  );

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
        width: 200,
        render: (v) => {
          if (!v) return <Tag>회사 기본</Tag>;
          const m = memberMap.get(v as string);
          if (!m) {
            return (
              <Tooltip title={v}>
                <Tag color="blue">개인</Tag>
              </Tooltip>
            );
          }
          return (
            <Tooltip title={`${m.name} ${m.email ?? ''}`}>
              <span>
                <Tag color="blue">개인</Tag>
                <span className="tw-text-sm tw-text-slate-700">{m.name}</span>
                {m.department ? (
                  <span className="tw-ml-1 tw-text-xs tw-text-slate-500">
                    ({m.department})
                  </span>
                ) : null}
              </span>
            </Tooltip>
          );
        },
      },
      {
        title: '시간',
        key: 'time',
        width: 180,
        render: (_, r) =>
          r.workType === 'FLEXIBLE' ? (
            <Tag color="purple">시간대별 운영</Tag>
          ) : (
            `${(r.startTime ?? '').slice(0, 5)} ~ ${(r.endTime ?? '').slice(0, 5)}`
          ),
      },
      {
        title: '근무(분)',
        dataIndex: 'workMinutes',
        key: 'workMinutes',
        width: 100,
        render: (v, r) =>
          r.workType === 'FLEXIBLE' ? <span className="tw-text-slate-400">—</span> : v,
      },
      {
        title: '점심시간',
        key: 'break',
        width: 160,
        render: (_, r) => {
          if (r.workType === 'FLEXIBLE') {
            return (
              <Tooltip title="유연근무는 시차 슬롯마다 점심시간이 박혀 있습니다. 시차 출퇴근 시간대 관리 화면에서 확인하세요.">
                <span className="tw-text-slate-400">슬롯별 운영</span>
              </Tooltip>
            );
          }
          /** 1순위: 백엔드가 내려준 점심 시작/종료 시각 그대로 표시. */
          if (r.breakStart && r.breakEnd) {
            return `${r.breakStart.slice(0, 5)} ~ ${r.breakEnd.slice(0, 5)}`;
          }
          /** 2순위: 시각이 비어있어도 점심 분량을 알면 분으로 표시 (서버 산출 breakMinutes 우선,
           *  없으면 출퇴근 - 근무분 으로 역산). 완전 누락된 구버전 데이터 호환용. */
          const computedBreakMin = (() => {
            if (typeof r.breakMinutes === 'number' && r.breakMinutes > 0) return r.breakMinutes;
            if (r.startTime && r.endTime && typeof r.workMinutes === 'number') {
              const total = durationMinutes([
                dayjs(`1970-01-01T${r.startTime}`),
                dayjs(`1970-01-01T${r.endTime}`),
              ]);
              return Math.max(total - r.workMinutes, 0);
            }
            return 0;
          })();
          if (computedBreakMin > 0) {
            return (
              <Tooltip title="점심 시작·종료 시각이 비어 있어 분량으로 표시합니다. 수정에서 시각을 다시 저장하면 시간대로 표시됩니다.">
                <span>{computedBreakMin}분</span>
              </Tooltip>
            );
          }
          return '-';
        },
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
                const isFlexible = r.workType === 'FLEXIBLE';
                /** FLEXIBLE 은 시간 필드를 사용하지 않으므로 폼에도 비워둔다. */
                const timeRange =
                  isFlexible || !r.startTime || !r.endTime
                    ? undefined
                    : ([
                        dayjs(`1970-01-01T${r.startTime}`),
                        dayjs(`1970-01-01T${r.endTime}`),
                      ] as [dayjs.Dayjs, dayjs.Dayjs]);
                const breakRange: [dayjs.Dayjs, dayjs.Dayjs] | undefined =
                  isFlexible
                    ? undefined
                    : ([
                        dayjs(`1970-01-01T${r.breakStart ?? DEFAULT_BREAK_START}`),
                        dayjs(`1970-01-01T${r.breakEnd ?? DEFAULT_BREAK_END}`),
                      ] as [dayjs.Dayjs, dayjs.Dayjs]);
                form.setFieldsValue({
                  scheduleName: r.scheduleName ?? '',
                  workType: (r.workType as WorkTypeCode) ?? 'FIXED',
                  timeRange,
                  breakRange,
                  workMinutes: timeRange ? calcNetWorkMinutes(timeRange, breakRange) : undefined,
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
    [deleteM, form, memberMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-items-end tw-justify-between">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            근무 스케줄 관리
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            회사 전체에 공통으로 적용되는 기본 근무 스케줄을 등록·수정합니다. 적용 기간, 근무 유형, 출퇴근 시각을
            설정하면 이후 일일 근태에 반영됩니다.
          </Typography.Paragraph>
        </div>
        <Space>
          <Button
            onClick={() => {
              void navigate({ to: '/app/attendance/flexible-slots' });
            }}
            disabled={!hasFlexibleSchedule}
          >
            시차 출퇴근 시간대 관리
          </Button>
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              form.resetFields();
              const defaultTimeRange: [dayjs.Dayjs, dayjs.Dayjs] = [
                dayjs('1970-01-01T09:00:00'),
                dayjs('1970-01-01T18:00:00'),
              ];
              const defaultBreakRange: [dayjs.Dayjs, dayjs.Dayjs] = [
                dayjs(`1970-01-01T${DEFAULT_BREAK_START}`),
                dayjs(`1970-01-01T${DEFAULT_BREAK_END}`),
              ];
              form.setFieldsValue({
                workType: 'FIXED',
                timeRange: defaultTimeRange,
                breakRange: defaultBreakRange,
                workMinutes: calcNetWorkMinutes(defaultTimeRange, defaultBreakRange),
                effectiveRange: [dayjs(), null],
              });
              setOpen(true);
            }}
          >
            스케줄 추가
          </Button>
        </Space>
      </div>
      {!hasFlexibleSchedule ? (
        <Typography.Text type="secondary">
          유연근무(시차출퇴근제) 스케줄을 먼저 생성하면 시차 출퇴근 시간대 관리 버튼이 활성화됩니다.
        </Typography.Text>
      ) : null}

      <Card>
        {/* TODO: 서버 페이지네이션 전환 필요(현재는 전체 조회 후 프론트 페이징) */}
        <Table<WorkSchedule>
          rowKey={(r) => r.workScheduleId ?? `${r.scheduleName}-${r.effectiveFrom}`}
          loading={listQ.isLoading || membersQ.isLoading}
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
        <ScheduleForm
          form={form}
          editing={editing}
          onSubmit={(v) => {
            if (editing?.workScheduleId) updateM.mutate({ id: editing.workScheduleId, v });
            else createM.mutate(v);
          }}
          onGoToFlexibleSlots={() => {
            void navigate({ to: '/app/attendance/flexible-slots' });
          }}
        />
      </Modal>
    </Space>
  );
}

type ScheduleFormProps = {
  form: ReturnType<typeof Form.useForm<FormValues>>[0];
  editing: WorkSchedule | null;
  onSubmit: (v: FormValues) => void;
  onGoToFlexibleSlots: () => void;
};

/** Form.useWatch 로 workType 변화를 감지하기 위해 자식 컴포넌트로 분리. */
function ScheduleForm({ form, editing, onSubmit, onGoToFlexibleSlots }: ScheduleFormProps) {
  const workType = Form.useWatch('workType', form);
  const isFlexible = workType === 'FLEXIBLE';

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      onValuesChange={(changed) => {
        /** FIXED 모드에서 시간/점심 변경 시 근무분 자동 재계산. FLEXIBLE 은 시간 자체를 받지 않음. */
        if ('timeRange' in changed || 'breakRange' in changed) {
          const nextTimeRange =
            'timeRange' in changed
              ? (changed.timeRange as [dayjs.Dayjs, dayjs.Dayjs] | undefined)
              : (form.getFieldValue('timeRange') as [dayjs.Dayjs, dayjs.Dayjs] | undefined);
          const nextBreakRange =
            'breakRange' in changed
              ? (changed.breakRange as [dayjs.Dayjs, dayjs.Dayjs] | undefined)
              : (form.getFieldValue('breakRange') as [dayjs.Dayjs, dayjs.Dayjs] | undefined);
          form.setFieldValue('workMinutes', calcNetWorkMinutes(nextTimeRange, nextBreakRange));
        }
      }}
      onFinish={onSubmit}
    >
      <Form.Item
        label="스케줄 명"
        name="scheduleName"
        rules={[{ required: true, message: '이름을 입력하세요.' }]}
      >
        <Input placeholder="예: ㅇㅇ 컴퍼니 근무 스케줄" maxLength={60} />
      </Form.Item>
      <Form.Item label="근무 유형" name="workType" rules={[{ required: true }]}>
        <Select options={WORK_TYPE_OPTIONS} />
      </Form.Item>

      {isFlexible ? (
        <Alert
          type="info"
          showIcon
          className="!tw-mb-4"
          message="유연근무는 시간대 관리에서 시간을 정의합니다."
          description={
            <span>
              스케줄 등록 후{' '}
              <Button type="link" size="small" className="!tw-p-0" onClick={onGoToFlexibleSlots}>
                시차 출퇴근 시간대 관리
              </Button>
              에서 운영할 시간대(예: 08-17, 09-18, 10-19)를 추가해 주세요.
            </span>
          }
        />
      ) : (
        <>
          <Form.Item label="출퇴근 시각" name="timeRange" rules={[{ required: true }]}>
            <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="점심·휴게 시각"
            name="breakRange"
            rules={[{ required: true, message: '점심 시작·종료 시각을 입력하세요.' }]}
            extra="고정근무 직원 전체에 회사 정책으로 적용됩니다. 유연근무는 직원이 매월 직접 선택합니다."
          >
            <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="근무시간(분)"
            name="workMinutes"
            rules={[{ required: true }]}
            extra="출퇴근 시각 - 점심·휴게 시간으로 자동 계산. 예: 09:00~18:00 + 60분 점심 → 480분(8시간)"
          >
            <InputNumber min={0} step={30} style={{ width: '100%' }} disabled />
          </Form.Item>
        </>
      )}

      <Form.Item
        label="스케줄 운영 기간 (종료일 미입력 시 계속 적용)"
        name="effectiveRange"
        rules={[{ required: true }]}
      >
        <DatePicker.RangePicker
          format="YYYY-MM-DD"
          allowEmpty={[false, true]}
          style={{ width: '100%' }}
        />
      </Form.Item>

      {/* 수정 모드에서 기존 스케줄 안내 */}
      {editing && isFlexible ? (
        <Typography.Text type="secondary" className="tw-text-xs">
          이 스케줄의 실제 운영 시간대는 「시차 출퇴근 시간대 관리」에서 확인·수정합니다.
        </Typography.Text>
      ) : null}
    </Form>
  );
}
