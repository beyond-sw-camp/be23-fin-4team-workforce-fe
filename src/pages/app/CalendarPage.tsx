import { LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Calendar,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import type { CellRenderInfo } from 'antd/es/calendar/generateCalendar';
import clsx from 'clsx';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/ko';
import { useMemo, useState } from 'react';
import {
  type CalendarEvent,
  type CalendarListEventTypeParam,
  calendarApi,
  type CreatePersonalCalendarPayload,
  type CreateTeamCalendarPayload,
} from '@/features/calendar/api/calendarApi';
import type { OrganizationTreeNode } from '@/features/organization/api/organizationApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { AppButton } from '@/shared/ui/AppButton';

dayjs.locale('ko');

function flattenOrgList(nodes: OrganizationTreeNode[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const walk = (n: OrganizationTreeNode) => {
    const id =
      (typeof n.id === 'string' && n.id) ||
      (typeof n.organizationId === 'string' && n.organizationId) ||
      (typeof n.organization_id === 'string' && n.organization_id) ||
      '';
    const name = typeof n.name === 'string' ? n.name : '';
    if (id) out.push({ id, name: name || id });
    const ch = n.children as OrganizationTreeNode[] | undefined;
    if (Array.isArray(ch)) ch.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function isTeamEvent(e: CalendarEvent): boolean {
  return e.scope === 'team' || Boolean(e.organizationId?.trim());
}

/** 월요일 시작 주간 (월~일) 기준 해당 주의 월요일 00:00 */
function mondayOfCalendarWeek(d: Dayjs): Dayjs {
  return d.subtract((d.day() + 6) % 7, 'day').startOf('day');
}

function eventOccursOnDay(e: CalendarEvent, day: Dayjs): boolean {
  const start = dayjs(e.startAt).startOf('day');
  const end = dayjs(e.endAt).startOf('day');
  const cur = day.startOf('day');
  return !cur.isBefore(start, 'day') && !cur.isAfter(end, 'day');
}

function eventsOnDay(events: CalendarEvent[], day: Dayjs): CalendarEvent[] {
  return events.filter((e) => eventOccursOnDay(e, day));
}

function formatEventTimeRange(e: CalendarEvent): string {
  const a = dayjs(e.startAt);
  const b = dayjs(e.endAt);
  if (a.isSame(b, 'day')) {
    return `${a.format('HH:mm')} – ${b.format('HH:mm')}`;
  }
  return `${a.format('MM/DD HH:mm')} – ${b.format('MM/DD HH:mm')}`;
}

const MINUTES_PER_DAY = 24 * 60;
/** 일간 타임라인 한 시간당 높이(px) — 전체 24시간 = 24 * 이 값 */
const DAY_VIEW_HOUR_PX = 48;

function clipEventToDayMinutes(e: CalendarEvent, day: Dayjs): { startMin: number; endMin: number } | null {
  const dayStart = day.startOf('day');
  const dayEnd = day.add(1, 'day');
  const evStart = dayjs(e.startAt);
  const evEnd = dayjs(e.endAt);
  const visStart = evStart.isBefore(dayStart) ? dayStart : evStart;
  const visEnd = evEnd.isAfter(dayEnd) ? dayEnd : evEnd;
  if (!visEnd.isAfter(visStart)) return null;
  return {
    startMin: visStart.diff(dayStart, 'minute', true),
    endMin: visEnd.diff(dayStart, 'minute', true),
  };
}

/** 해당 일 00:00 기준 분 → 표시용 (하루 끝은 24:00) */
function formatMinuteOfDay(m: number): string {
  const clamped = Math.min(Math.max(m, 0), MINUTES_PER_DAY);
  if (clamped >= MINUTES_PER_DAY - 1e-6) return '24:00';
  const h = Math.floor(clamped / 60);
  const min = Math.floor(clamped % 60);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

type DayPlacedEvent = {
  event: CalendarEvent;
  clip: { startMin: number; endMin: number };
  lane: number;
  laneCount: number;
};

/** 하루(00:00~24:00) 안에서 겹치는 일정을 가로 레인으로 배치 */
function placeEventsInDayLanes(events: CalendarEvent[], day: Dayjs): DayPlacedEvent[] {
  const clips = events
    .map((e) => {
      const clip = clipEventToDayMinutes(e, day);
      return clip ? { event: e, clip } : null;
    })
    .filter((x): x is { event: CalendarEvent; clip: { startMin: number; endMin: number } } => x != null)
    .sort((a, b) => a.clip.startMin - b.clip.startMin);

  const lanesEnd: number[] = [];
  const out: DayPlacedEvent[] = [];
  for (const { event: ev, clip } of clips) {
    let lane = -1;
    for (let i = 0; i < lanesEnd.length; i++) {
      if (lanesEnd[i] <= clip.startMin) {
        lane = i;
        break;
      }
    }
    if (lane === -1) {
      lane = lanesEnd.length;
      lanesEnd.push(clip.endMin);
    } else {
      lanesEnd[lane] = clip.endMin;
    }
    out.push({ event: ev, clip, lane, laneCount: 0 });
  }
  const laneCount = Math.max(1, lanesEnd.length);
  out.forEach((o) => {
    o.laneCount = laneCount;
  });
  return out;
}

type FormValues = {
  kind: 'personal' | 'team';
  title: string;
  description: string;
  range: [Dayjs, Dayjs];
  isPublicYn: 'YES' | 'NO';
  organizationId?: string;
};

function toPayload(values: FormValues): CreatePersonalCalendarPayload | CreateTeamCalendarPayload {
  const [a, b] = values.range;
  const startAt = a.format('YYYY-MM-DDTHH:mm:ss');
  const endAt = b.format('YYYY-MM-DDTHH:mm:ss');
  if (values.kind === 'team') {
    return {
      title: values.title.trim(),
      description: values.description.trim(),
      startAt,
      endAt,
      organizationId: values.organizationId ?? '',
    };
  }
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    startAt,
    endAt,
    isPublicYn: values.isPublicYn,
  };
}

type CalendarViewMode = 'month' | 'week' | 'day';

export function CalendarPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [eventTypeFilter, setEventTypeFilter] = useState<'ALL' | CalendarListEventTypeParam>('ALL');
  const [monthValue, setMonthValue] = useState(() => dayjs());
  const [selectedDay, setSelectedDay] = useState<Dayjs>(() => dayjs());

  const year = monthValue.year();
  const month = monthValue.month() + 1;
  const eventTypeParam: CalendarListEventTypeParam | undefined =
    eventTypeFilter === 'ALL' ? undefined : eventTypeFilter;

  const weekMonday = useMemo(() => mondayOfCalendarWeek(selectedDay), [selectedDay]);

  const monthQuery = useQuery({
    queryKey: ['calendar', 'month', year, month, eventTypeParam],
    queryFn: () => calendarApi.listMonth(year, month, eventTypeParam),
    enabled: viewMode === 'month',
  });

  const weekQuery = useQuery({
    queryKey: ['calendar', 'week', weekMonday.format('YYYY-MM-DD'), eventTypeParam],
    queryFn: () => calendarApi.listWeekly(weekMonday.format('YYYY-MM-DD'), eventTypeParam),
    enabled: viewMode === 'week',
  });

  const dayQuery = useQuery({
    queryKey: ['calendar', 'day', selectedDay.format('YYYY-MM-DD'), eventTypeParam],
    queryFn: () => calendarApi.listDaily(selectedDay.format('YYYY-MM-DD'), eventTypeParam),
    enabled: viewMode === 'day',
  });

  const events = useMemo(() => {
    if (viewMode === 'month') return monthQuery.data ?? [];
    if (viewMode === 'week') return weekQuery.data ?? [];
    return dayQuery.data ?? [];
  }, [viewMode, monthQuery.data, weekQuery.data, dayQuery.data]);

  const isLoading =
    (viewMode === 'month' && monthQuery.isLoading) ||
    (viewMode === 'week' && weekQuery.isLoading) ||
    (viewMode === 'day' && dayQuery.isLoading);

  const { data: orgTree = [] } = useQuery({
    queryKey: ['organization', 'list'],
    queryFn: () => organizationApi.list(),
  });
  const orgOptions = useMemo(() => flattenOrgList(orgTree), [orgTree]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [form] = Form.useForm<FormValues>();

  const invalidateCalendarLists = () => {
    void qc.invalidateQueries({ queryKey: ['calendar'] });
  };

  const createM = useMutation({
    mutationFn: async (payload: CreatePersonalCalendarPayload | CreateTeamCalendarPayload) => {
      if ('organizationId' in payload && payload.organizationId) {
        await calendarApi.createTeam(payload as CreateTeamCalendarPayload);
      } else {
        await calendarApi.createPersonal(payload as CreatePersonalCalendarPayload);
      }
    },
    onSuccess: () => {
      message.success('일정이 등록되었습니다.');
      setFormOpen(false);
      setEditing(null);
      form.resetFields();
      invalidateCalendarLists();
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: async ({
      event,
      payload,
    }: {
      event: CalendarEvent;
      payload: CreatePersonalCalendarPayload | CreateTeamCalendarPayload;
    }) => {
      if (isTeamEvent(event)) {
        await calendarApi.updateTeam(event.eventId, payload as CreateTeamCalendarPayload);
      } else {
        await calendarApi.updatePersonal(event.eventId, payload as CreatePersonalCalendarPayload);
      }
    },
    onSuccess: () => {
      message.success('일정이 수정되었습니다.');
      setFormOpen(false);
      setEditing(null);
      form.resetFields();
      invalidateCalendarLists();
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: async (event: CalendarEvent) => {
      if (isTeamEvent(event)) {
        await calendarApi.deleteTeam(event.eventId);
      } else {
        await calendarApi.deletePersonal(event.eventId);
      }
    },
    onSuccess: () => {
      message.success('일정이 삭제되었습니다.');
      setDetailOpen(false);
      setDetailEvent(null);
      invalidateCalendarLists();
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const { data: detailData, isFetching: detailLoading } = useQuery({
    queryKey: ['calendar', 'detail', detailEvent?.eventId],
    queryFn: () => calendarApi.detail(detailEvent!.eventId),
    enabled: detailOpen && Boolean(detailEvent?.eventId),
  });

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      kind: 'personal',
      title: '',
      description: '',
      range: [selectedDay.hour(9).minute(0), selectedDay.hour(10).minute(0)],
      isPublicYn: 'YES',
      organizationId: orgOptions[0]?.id,
    });
    setFormOpen(true);
  };

  const openEdit = (e: CalendarEvent) => {
    setEditing(e);
    const start = dayjs(e.startAt);
    const end = dayjs(e.endAt);
    form.setFieldsValue({
      kind: isTeamEvent(e) ? 'team' : 'personal',
      title: e.title,
      description: e.description ?? '',
      range: [start, end],
      isPublicYn: e.isPublicYn ?? 'YES',
      organizationId: e.organizationId ?? orgOptions[0]?.id,
    });
    setFormOpen(true);
  };

  const submitForm = async () => {
    const values = await form.validateFields();
    const payload = toPayload(values);
    if (values.kind === 'team' && !values.organizationId) {
      message.warning('조직을 선택해 주세요.');
      return;
    }
    if (editing) {
      updateM.mutate({ event: editing, payload });
    } else {
      createM.mutate(payload);
    }
  };

  const dayList = useMemo(() => eventsOnDay(events, selectedDay), [events, selectedDay]);

  const dayPlacedEvents = useMemo(
    () => (viewMode === 'day' ? placeEventsInDayLanes(dayList, selectedDay) : []),
    [viewMode, dayList, selectedDay],
  );

  const cellRender = (current: Dayjs, info: CellRenderInfo<Dayjs>) => {
    if (info.type !== 'date') return info.originNode;
    const list = eventsOnDay(events, current);
    return (
      <div className="tw-flex tw-min-h-[52px] tw-flex-col tw-gap-0.5">
        <ul className="tw-m-0 tw-list-none tw-space-y-0.5 tw-p-0">
          {list.slice(0, 2).map((e) => (
            <li key={e.eventId}>
              <button
                type="button"
                className="tw-block tw-w-full tw-truncate tw-rounded tw-border-0 tw-bg-blue-50 tw-px-1 tw-text-left tw-text-[10px] tw-text-blue-900 tw-leading-tight hover:tw-bg-blue-100"
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  setDetailEvent(e);
                  setDetailOpen(true);
                }}
              >
                {e.title}
              </button>
            </li>
          ))}
        </ul>
        {list.length > 2 && (
          <span className="tw-text-[10px] tw-text-slate-400">+{list.length - 2}</span>
        )}
      </div>
    );
  };

  return (
    <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-4">
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            일정
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            개인 일정과 팀 일정을 캘린더에서 확인합니다.
          </Typography.Paragraph>
        </div>
        <AppButton type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          일정 추가
        </AppButton>
      </div>

      <div className="tw-grid tw-min-h-0 tw-flex-1 tw-gap-4 lg:tw-grid-cols-[1fr_320px]">
        <Card className="tw-border-slate-200/80 tw-shadow-sm" styles={{ body: { padding: 12 } }}>
          <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-gap-3">
            <Segmented
              value={viewMode}
              onChange={(v) => {
                const mode = v as CalendarViewMode;
                if (mode === 'month') {
                  setMonthValue(selectedDay.startOf('month'));
                }
                setViewMode(mode);
              }}
              options={[
                { label: '월', value: 'month' },
                { label: '주', value: 'week' },
                { label: '일', value: 'day' },
              ]}
            />
            <Select
              value={eventTypeFilter}
              onChange={(v) => setEventTypeFilter(v)}
              className="tw-min-w-[120px]"
              options={[
                { value: 'ALL', label: '전체' },
                { value: 'PERSONAL', label: '개인' },
                { value: 'TEAM', label: '팀' },
              ]}
            />
          </div>
          <Spin spinning={isLoading}>
            {viewMode === 'month' && (
              <Calendar
                fullscreen={false}
                value={monthValue}
                onChange={(d) => {
                  setMonthValue(d);
                  setSelectedDay(d);
                }}
                onSelect={(d) => setSelectedDay(d)}
                onPanelChange={(d) => setMonthValue(d)}
                cellRender={cellRender}
              />
            )}
            {viewMode === 'week' && (
              <div className="tw-space-y-3">
                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                  <Button
                    type="text"
                    icon={<LeftOutlined />}
                    aria-label="이전 주"
                    onClick={() => setSelectedDay((d) => d.subtract(7, 'day'))}
                  />
                  <Typography.Text className="tw-text-sm tw-font-medium tw-text-slate-800">
                    {weekMonday.format('YYYY.MM.DD')} – {weekMonday.add(6, 'day').format('YYYY.MM.DD')}
                  </Typography.Text>
                  <Button
                    type="text"
                    icon={<RightOutlined />}
                    aria-label="다음 주"
                    onClick={() => setSelectedDay((d) => d.add(7, 'day'))}
                  />
                </div>
                <div className="tw-grid tw-grid-cols-7 tw-gap-2 max-sm:tw-grid-cols-1">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = weekMonday.add(i, 'day');
                    const list = eventsOnDay(events, d);
                    const isSel = d.isSame(selectedDay, 'day');
                    return (
                      <div
                        key={d.format('YYYY-MM-DD')}
                        className={clsx(
                          'tw-flex tw-min-h-[140px] tw-flex-col tw-rounded-lg tw-border tw-border-solid tw-bg-white tw-p-2 tw-text-left tw-transition-colors',
                          isSel
                            ? 'tw-border-blue-500 tw-bg-blue-50/60'
                            : 'tw-border-slate-200',
                        )}
                      >
                        <button
                          type="button"
                          className="tw-mb-1 tw-w-full tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-text-xs tw-font-semibold tw-text-slate-700 hover:tw-text-slate-900"
                          onClick={() => setSelectedDay(d)}
                        >
                          {d.format('ddd')}{' '}
                          <span className="tw-text-slate-900">{d.format('D')}</span>
                        </button>
                        <ul className="tw-m-0 tw-flex tw-min-h-0 tw-flex-1 tw-list-none tw-flex-col tw-space-y-0.5 tw-p-0">
                          {list.slice(0, 4).map((e) => (
                            <li key={e.eventId}>
                              <button
                                type="button"
                                className="tw-block tw-w-full tw-truncate tw-rounded tw-border-0 tw-bg-blue-50 tw-px-1 tw-text-left tw-text-[10px] tw-text-blue-900 tw-leading-tight hover:tw-bg-blue-100"
                                onClick={() => {
                                  setDetailEvent(e);
                                  setDetailOpen(true);
                                }}
                              >
                                {e.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                        {list.length > 4 && (
                          <span className="tw-mt-auto tw-pt-1 tw-text-[10px] tw-text-slate-400">
                            +{list.length - 4}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {viewMode === 'day' && (
              <div className="tw-space-y-3">
                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                  <Button
                    type="default"
                    icon={<LeftOutlined />}
                    onClick={() => setSelectedDay((d) => d.subtract(1, 'day'))}
                  >
                    전날
                  </Button>
                  <DatePicker
                    value={selectedDay}
                    onChange={(d) => {
                      if (d) setSelectedDay(d);
                    }}
                    className="tw-min-w-[140px]"
                  />
                  <Button
                    type="default"
                    icon={<RightOutlined />}
                    onClick={() => setSelectedDay((d) => d.add(1, 'day'))}
                  >
                    다음날
                  </Button>
                  <Typography.Text type="secondary" className="tw-text-xs">
                    00:00 ~ 24:00 기준
                  </Typography.Text>
                </div>
                <div className="tw-overflow-hidden tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white">
                  <div className="tw-flex tw-max-h-[min(72vh,800px)] tw-overflow-y-auto">
                    <div
                      className="tw-w-11 tw-shrink-0 tw-border-r tw-border-slate-100 tw-bg-slate-50/90"
                      style={{ minHeight: 24 * DAY_VIEW_HOUR_PX }}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <div
                          key={h}
                          className="tw-flex tw-items-start tw-justify-end tw-pr-2 tw-pt-0 tw-text-[11px] tw-tabular-nums tw-text-slate-500"
                          style={{ height: DAY_VIEW_HOUR_PX }}
                        >
                          {String(h).padStart(2, '0')}:00
                        </div>
                      ))}
                    </div>
                    <div
                      className="tw-relative tw-min-w-0 tw-flex-1 tw-bg-white"
                      style={{ height: 24 * DAY_VIEW_HOUR_PX, minHeight: 24 * DAY_VIEW_HOUR_PX }}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <div
                          key={h}
                          className="tw-box-border tw-border-b tw-border-slate-100"
                          style={{ height: DAY_VIEW_HOUR_PX }}
                        />
                      ))}
                      {dayPlacedEvents.map(({ event: e, clip, lane, laneCount }) => {
                        const spanMin = clip.endMin - clip.startMin;
                        const pctTop = (clip.startMin / MINUTES_PER_DAY) * 100;
                        const pctH = Math.max((spanMin / MINUTES_PER_DAY) * 100, 0.4);
                        const gapPct = laneCount > 1 ? 0.35 : 0;
                        const w = 100 / laneCount - gapPct;
                        const left = (lane / laneCount) * 100 + gapPct / 2;
                        return (
                          <button
                            key={e.eventId}
                            type="button"
                            className="tw-absolute tw-box-border tw-overflow-hidden tw-rounded tw-border tw-border-blue-200 tw-bg-blue-50 tw-px-1 tw-py-0.5 tw-text-left tw-text-[11px] tw-leading-tight tw-text-blue-900 hover:tw-bg-blue-100"
                            style={{
                              top: `${pctTop}%`,
                              height: `${pctH}%`,
                              left: `${left}%`,
                              width: `${w}%`,
                            }}
                            onClick={() => {
                              setDetailEvent(e);
                              setDetailOpen(true);
                            }}
                          >
                            <span className="tw-line-clamp-2 tw-font-medium">{e.title}</span>
                            <span className="tw-block tw-text-[10px] tw-text-blue-800/90">
                              {formatMinuteOfDay(clip.startMin)} – {formatMinuteOfDay(clip.endMin)}
                            </span>
                          </button>
                        );
                      })}
                      {dayList.length === 0 && (
                        <div className="tw-pointer-events-none tw-absolute tw-inset-0 tw-flex tw-items-center tw-justify-center tw-px-4">
                          <Typography.Text type="secondary" className="tw-text-sm">
                            이 날짜에 표시할 일정이 없습니다.
                          </Typography.Text>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Spin>
        </Card>

        <Card
          title={
            <span className="tw-text-base tw-font-semibold">
              {selectedDay.format('M월 D일 (ddd)')} 일정
            </span>
          }
          className="tw-border-slate-200/80 tw-shadow-sm"
        >
          {dayList.length === 0 ? (
            <Typography.Text type="secondary">이 날짜에 등록된 일정이 없습니다.</Typography.Text>
          ) : (
            <ul className="tw-m-0 tw-list-none tw-space-y-2 tw-p-0">
              {dayList.map((e) => (
                <li key={e.eventId}>
                  <button
                    type="button"
                    className="tw-w-full tw-rounded-lg tw-border tw-border-solid tw-border-slate-200 tw-bg-white tw-px-3 tw-py-2 tw-text-left tw-transition-colors hover:tw-bg-slate-50"
                    onClick={() => {
                      setDetailEvent(e);
                      setDetailOpen(true);
                    }}
                  >
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                      <span className="tw-font-medium tw-text-slate-900">{e.title}</span>
                      {isTeamEvent(e) ? <Tag color="blue">팀</Tag> : <Tag>개인</Tag>}
                    </div>
                    <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
                      {formatEventTimeRange(e)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        title={editing ? '일정 수정' : '일정 추가'}
        open={formOpen}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        footer={[
          <Button key="cancel" onClick={() => setFormOpen(false)}>
            취소
          </Button>,
          <Button
            key="ok"
            type="primary"
            loading={createM.isPending || updateM.isPending}
            onClick={() => void submitForm()}
          >
            {editing ? '저장' : '등록'}
          </Button>,
        ]}
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="tw-pt-2">
          <Form.Item name="kind" label="유형" rules={[{ required: true }]}>
            <Radio.Group disabled={Boolean(editing)}>
              <Radio value="personal">개인 일정</Radio>
              <Radio value="team">팀 일정</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.kind !== cur.kind}
          >
            {({ getFieldValue }) =>
              getFieldValue('kind') === 'team' ? (
                <Form.Item
                  name="organizationId"
                  label="조직"
                  rules={[{ required: true, message: '조직을 선택해 주세요.' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="조직 선택"
                    options={orgOptions.map((o) => ({ value: o.id, label: o.name }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="title" label="제목" rules={[{ required: true, message: '제목을 입력해 주세요.' }]}>
            <Input placeholder="제목" maxLength={200} />
          </Form.Item>
          <Form.Item name="description" label="내용">
            <Input.TextArea rows={3} placeholder="설명" maxLength={2000} />
          </Form.Item>
          <Form.Item name="range" label="시작·종료" rules={[{ required: true, message: '일시를 선택해 주세요.' }]}>
            <DatePicker.RangePicker showTime className="tw-w-full" format="YYYY-MM-DD HH:mm" />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.kind !== cur.kind}
          >
            {({ getFieldValue }) =>
              getFieldValue('kind') === 'personal' ? (
                <Form.Item name="isPublicYn" label="공개 여부" rules={[{ required: true }]}>
                  <Radio.Group>
                    <Radio value="YES">공개</Radio>
                    <Radio value="NO">비공개</Radio>
                  </Radio.Group>
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="일정 상세"
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetailEvent(null);
        }}
        footer={[
          <Popconfirm
            key="del"
            title="이 일정을 삭제할까요?"
            okText="삭제"
            cancelText="취소"
            okButtonProps={{ danger: true, loading: deleteM.isPending }}
            onConfirm={() => {
              const ev = detailData ?? detailEvent;
              if (ev) deleteM.mutate(ev);
            }}
          >
            <Button danger loading={deleteM.isPending} disabled={!detailData && !detailEvent}>
              삭제
            </Button>
          </Popconfirm>,
          <Button
            key="edit"
            type="primary"
            disabled={!detailData}
            onClick={() => {
              if (!detailData) return;
              setDetailOpen(false);
              setDetailEvent(null);
              openEdit(detailData);
            }}
          >
            수정
          </Button>,
          <Button
            key="close"
            onClick={() => {
              setDetailOpen(false);
              setDetailEvent(null);
            }}
          >
            닫기
          </Button>,
        ]}
        width={480}
      >
        <Spin spinning={detailLoading}>
          {detailData ? (
            <Space direction="vertical" className="tw-w-full" size="middle">
              <div className="tw-flex tw-items-center tw-gap-2">
                <Typography.Text strong className="tw-text-lg">
                  {detailData.title}
                </Typography.Text>
                {isTeamEvent(detailData) ? <Tag color="blue">팀</Tag> : <Tag>개인</Tag>}
              </div>
              <Typography.Paragraph className="!tw-m-0 tw-whitespace-pre-wrap tw-text-slate-700">
                {detailData.description?.trim() || '—'}
              </Typography.Paragraph>
              <div className="tw-text-sm tw-text-slate-600">
                <div>
                  시작: {dayjs(detailData.startAt).format('YYYY-MM-DD HH:mm')}
                </div>
                <div>
                  종료: {dayjs(detailData.endAt).format('YYYY-MM-DD HH:mm')}
                </div>
                {!isTeamEvent(detailData) && (
                  <div>공개: {detailData.isPublicYn === 'NO' ? '비공개' : '공개'}</div>
                )}
                {isTeamEvent(detailData) && detailData.organizationId && (
                  <div>조직 ID: {detailData.organizationId}</div>
                )}
              </div>
            </Space>
          ) : (
            !detailLoading && <Typography.Text type="secondary">불러오지 못했습니다.</Typography.Text>
          )}
        </Spin>
      </Modal>
    </div>
  );
}
