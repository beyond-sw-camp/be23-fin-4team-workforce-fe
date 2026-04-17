import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Card, List, Progress, Spin, Tabs, Tag, Typography } from 'antd';
import clsx from 'clsx';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/ko';
import { useMemo, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { Me } from '@/features/auth/types';
import {
  type CalendarEvent,
  type CalendarHoliday,
  calendarApi,
} from '@/features/calendar/api/calendarApi';
import { DASHBOARD_WIDGET_LABELS, type DashboardWidgetId } from '@/features/dashboard/dashboardWidgetsModel';
import { memberApi } from '@/features/member/api/memberApi';

dayjs.locale('ko');

const DUMMY_APPROVALS = [
  { id: '1', title: '[전사] 2026년 상반기 인사운영 보고', type: '결재요청', author: '이인사', date: '2026-04-08', tab: 'wait' },
  { id: '2', title: '연차 신청 (4/10)', type: '합의', author: '김한별', date: '2026-04-07', tab: 'wait' },
  { id: '3', title: '법인 카드 사용 보고', type: '기안', author: '박재무', date: '2026-04-05', tab: 'draft' },
  { id: '4', title: '출장 비용 정산', type: '수신', author: '최재무', date: '2026-04-04', tab: 'inbox' },
];

const DUMMY_NOTIFICATIONS: { id: string; day: string; name: string; action: string; text: string; time: string }[] = [
  {
    id: 'n1',
    day: '2026-04-08',
    name: '정연구',
    action: '댓글 등록',
    text: '[공지] 시스템 점검 일정에 참여해 주세요.',
    time: '09:42',
  },
  {
    id: 'n2',
    day: '2026-04-08',
    name: '한결재',
    action: '결재 승인',
    text: '연차 신청이 승인되었습니다.',
    time: '08:10',
  },
  {
    id: 'n3',
    day: '2026-04-07',
    name: '시스템',
    action: '알림',
    text: '전자결재 문서가 도착했습니다.',
    time: '17:55',
  },
];

function cardShell(title: string, extra: ReactNode | undefined, children: ReactNode) {
  return (
    <Card
      className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5"
      title={<span className="tw-text-[15px] tw-font-semibold tw-text-slate-900">{title}</span>}
      extra={extra}
      styles={{ body: { paddingTop: 12 } }}
    >
      {children}
    </Card>
  );
}

export function DashboardProfileBlock({ user }: { user: Me | null }) {
  const profileQuery = useQuery({
    queryKey: ['member', 'dashboard-profile'],
    queryFn: () => memberApi.dashboardProfile(),
    staleTime: 60_000,
  });
  const p = profileQuery.data;
  const name = (p?.name ?? user?.name)?.trim() || '—';
  const jobTitle = (p?.jobTitleName ?? user?.jobTitle)?.trim() || null;
  const org = (p?.organizationName ?? user?.departmentName)?.trim() || null;
  const jobGrade = p?.jobGradeName?.trim() || null;
  const deptLine = [org, jobGrade].filter(Boolean).join(' · ') || '—';
  const avatarSrc = (p?.profileUrl?.trim() || user?.profileImageUrl) ?? undefined;
  const title = DASHBOARD_WIDGET_LABELS.profile;
  return cardShell(
    title,
    <Link to="/app/me" className="tw-text-xs tw-font-medium tw-text-blue-600 hover:tw-text-blue-700">
      내 정보
    </Link>,
    <div className="tw-space-y-4">
      <div className="tw-flex tw-items-start tw-gap-3">
        <Avatar size={56} className="tw-bg-slate-200 tw-text-slate-700" icon={<UserOutlined />} src={avatarSrc} />
        <div className="tw-min-w-0 tw-flex-1">
          <div className="tw-flex tw-flex-wrap tw-items-baseline tw-gap-x-2 tw-gap-y-0">
            <Typography.Text className="tw-text-base tw-font-bold tw-text-slate-900">{name}</Typography.Text>
            {jobTitle ? (
              <Typography.Text type="secondary" className="tw-text-sm">
                {jobTitle}
              </Typography.Text>
            ) : null}
          </div>
          <Typography.Text type="secondary" className="tw-mt-0.5 tw-block tw-text-xs">
            {deptLine}
          </Typography.Text>
        </div>
      </div>
      <div className="tw-rounded-xl tw-bg-slate-50 tw-px-4 tw-py-3 tw-text-center">
        <Typography.Text type="secondary" className="tw-text-xs">
          오늘의 일정
        </Typography.Text>
        <div className="tw-mt-1 tw-flex tw-min-h-[2.5rem] tw-items-center tw-justify-center tw-text-3xl tw-font-bold tw-tabular-nums tw-text-slate-900">
          {profileQuery.isLoading ? <Spin size="small" /> : (p?.todayEventCount ?? 0)}
        </div>
      </div>
    </div>,
  );
}

export function DashboardApprovalInboxBlock() {
  const title = DASHBOARD_WIDGET_LABELS.approvalInbox;
  return cardShell(
    title,
    <Link to="/app/approvals" className="tw-text-xs tw-font-medium tw-text-blue-600">
      더보기
    </Link>,
    <Tabs
      size="small"
      items={[
        {
          key: 'wait',
          label: '결재대기',
          children: (
            <List
              size="small"
              dataSource={DUMMY_APPROVALS.filter((x) => x.tab === 'wait')}
              renderItem={(item) => (
                <List.Item className="!tw-px-0">
                  <div className="tw-min-w-0 tw-flex-1">
                    <div className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">{item.title}</div>
                    <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
                      {item.author} · {item.date}
                    </div>
                  </div>
                  <Tag className="tw-shrink-0 !tw-m-0">{item.type}</Tag>
                </List.Item>
              )}
            />
          ),
        },
        {
          key: 'all',
          label: '전체',
          children: (
            <List
              size="small"
              dataSource={DUMMY_APPROVALS}
              renderItem={(item) => (
                <List.Item className="!tw-px-0">
                  <div className="tw-min-w-0 tw-flex-1">
                    <div className="tw-truncate tw-text-sm tw-text-slate-800">{item.title}</div>
                    <div className="tw-text-xs tw-text-slate-500">
                      {item.author} · {item.date}
                    </div>
                  </div>
                </List.Item>
              )}
            />
          ),
        },
      ]}
    />,
  );
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function eventOccursOnDay(e: CalendarEvent, day: Dayjs): boolean {
  const start = dayjs(e.startAt).startOf('day');
  const end = dayjs(e.endAt).startOf('day');
  const cur = day.startOf('day');
  return !cur.isBefore(start, 'day') && !cur.isAfter(end, 'day');
}

function eventsOnDay(events: CalendarEvent[], day: Dayjs): CalendarEvent[] {
  return events.filter((ev) => eventOccursOnDay(ev, day));
}

function holidaysOnDay(holidays: CalendarHoliday[], day: Dayjs): CalendarHoliday[] {
  const key = day.format('YYYY-MM-DD');
  return holidays.filter((h) => h.holidayDate === key);
}

function formatDashboardEventRange(e: CalendarEvent): string {
  const a = dayjs(e.startAt);
  const b = dayjs(e.endAt);
  if (a.isSame(b, 'day')) {
    return `${a.format('M.D(ddd)')} ${a.format('HH:mm')}–${b.format('HH:mm')}`;
  }
  return `${a.format('M.D(ddd)')} – ${b.format('M.D(ddd)')}`;
}

function DashboardMiniCalendar({
  monthStart,
  events,
  holidays,
  loading,
}: {
  monthStart: Dayjs;
  events: CalendarEvent[];
  holidays: CalendarHoliday[];
  loading: boolean;
}) {
  const daysInMonth = monthStart.daysInMonth();
  const pad = monthStart.day();
  const cells: (Dayjs | null)[] = [...Array(pad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => monthStart.add(i, 'day'))];
  const today = dayjs();

  return (
    <Spin spinning={loading}>
      <div>
        <div className="tw-mb-2 tw-flex tw-items-center tw-justify-between">
          <Typography.Text strong className="tw-text-slate-800">
            {monthStart.format('YYYY.MM')}
          </Typography.Text>
          <CalendarOutlined className="tw-text-slate-400" />
        </div>
        <div className="tw-grid tw-grid-cols-7 tw-gap-1 tw-text-center tw-text-[11px] tw-text-slate-500">
          {WEEKDAY_KO.map((d) => (
            <div key={d} className="tw-py-1 tw-font-medium">
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e-${i}`} className="tw-aspect-square" />;
            const isToday = d.isSame(today, 'day');
            const dotEvent = eventsOnDay(events, d).length > 0;
            const dotHoliday = holidaysOnDay(holidays, d).length > 0;
            return (
              <div
                key={d.format('D')}
                className={clsx(
                  'tw-flex tw-aspect-square tw-flex-col tw-items-center tw-justify-center tw-rounded-lg tw-text-xs',
                  isToday && 'tw-bg-slate-900 tw-font-semibold tw-text-white',
                  !isToday && 'tw-text-slate-700',
                )}
              >
                {d.date()}
                {(dotEvent || dotHoliday) && (
                  <span className="tw-mt-0.5 tw-flex tw-items-center tw-justify-center tw-gap-0.5">
                    {dotHoliday ? (
                      <span
                        className={clsx(
                          'tw-h-1 tw-w-1 tw-shrink-0 tw-rounded-full',
                          isToday ? 'tw-bg-rose-200' : 'tw-bg-rose-500',
                        )}
                      />
                    ) : null}
                    {dotEvent ? (
                      <span
                        className={clsx(
                          'tw-h-1 tw-w-1 tw-shrink-0 tw-rounded-full',
                          isToday ? 'tw-bg-white' : 'tw-bg-blue-500',
                        )}
                      />
                    ) : null}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Spin>
  );
}

export function DashboardCalendarBlock() {
  const monthStart = dayjs().startOf('month');
  const year = monthStart.year();
  const month = monthStart.month() + 1;

  const monthQuery = useQuery({
    queryKey: ['calendar', 'dashboard-month', year, month],
    queryFn: () => calendarApi.listMonth(year, month),
    staleTime: 60_000,
  });

  const events = monthQuery.data?.events ?? [];
  const holidays = monthQuery.data?.holidays ?? [];

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => dayjs(a.startAt).valueOf() - dayjs(b.startAt).valueOf()),
    [events],
  );

  const title = DASHBOARD_WIDGET_LABELS.calendar;

  return cardShell(
    title,
    <Link to="/app/calendar" className="tw-text-xs tw-font-medium tw-text-blue-600">
      일정 관리
    </Link>,
    <Tabs
      size="small"
      items={[
        {
          key: 'schedule',
          label: '일정',
          children: (
            <Spin spinning={monthQuery.isLoading}>
              {sortedEvents.length === 0 && !monthQuery.isLoading ? (
                <Typography.Text type="secondary" className="tw-text-xs">
                  이번 달 일정이 없습니다.
                </Typography.Text>
              ) : (
                <List
                  size="small"
                  dataSource={sortedEvents}
                  split={false}
                  className="tw-max-h-[220px] tw-overflow-y-auto"
                  renderItem={(e) => (
                    <List.Item className="!tw-px-0 !tw-py-1.5">
                      <div className="tw-min-w-0 tw-flex-1">
                        <div className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">{e.title}</div>
                        <div className="tw-text-xs tw-text-slate-500">{formatDashboardEventRange(e)}</div>
                      </div>
                    </List.Item>
                  )}
                />
              )}
            </Spin>
          ),
        },
        {
          key: 'grid',
          label: '달력',
          children: (
            <DashboardMiniCalendar
              monthStart={monthStart}
              events={events}
              holidays={holidays}
              loading={monthQuery.isLoading}
            />
          ),
        },
      ]}
    />,
  );
}

export function DashboardAttendanceBlock() {
  const title = DASHBOARD_WIDGET_LABELS.attendance;
  const pct = Math.round(((14 + 43 / 60) / 40) * 100);
  return cardShell(
    title,
    <Tag color="processing" className="!tw-m-0">
      재직중
    </Tag>,
    <div className="tw-space-y-4">
      <div className="tw-flex tw-items-baseline tw-justify-between tw-gap-2">
        <div>
          <Typography.Text type="secondary" className="tw-text-xs">
            {dayjs().format('YYYY.MM.DD (ddd)')}
          </Typography.Text>
          <div className="tw-mt-1 tw-font-mono tw-text-2xl tw-font-semibold tw-tabular-nums tw-text-slate-900">
            {dayjs().format('HH:mm:ss')}
          </div>
        </div>
        <ClockCircleOutlined className="tw-text-2xl tw-text-blue-600" />
      </div>
      <div className="tw-grid tw-grid-cols-2 tw-gap-3 tw-rounded-xl tw-bg-slate-50 tw-p-3">
        <div>
          <Typography.Text type="secondary" className="tw-text-xs">
            출근
          </Typography.Text>
          <div className="tw-text-sm tw-font-semibold tw-text-slate-900">09:02</div>
        </div>
        <div>
          <Typography.Text type="secondary" className="tw-text-xs">
            퇴근
          </Typography.Text>
          <div className="tw-text-sm tw-font-semibold tw-text-slate-400">--:--</div>
        </div>
      </div>
      <div>
        <div className="tw-mb-1 tw-flex tw-justify-between tw-text-xs tw-text-slate-600">
          <span>주간 누적</span>
          <span className="tw-font-medium tw-text-slate-900">14h 43m / 40h</span>
        </div>
        <Progress percent={pct} showInfo={false} strokeColor="#2563EB" trailColor="#e2e8f0" />
        <Typography.Text type="secondary" className="tw-mt-1 tw-block tw-text-[11px]">
          주간 목표까지 약 25시간 남았습니다.
        </Typography.Text>
      </div>
      <div className="tw-flex tw-flex-wrap tw-gap-2">
        <Button type="primary">출근하기</Button>
        <Button>퇴근하기</Button>
      </div>
    </div>,
  );
}

export function DashboardLeaveBlock() {
  const title = DASHBOARD_WIDGET_LABELS.leave;
  const usedPct = 42.1;
  return cardShell(
    title,
    <Link to="/app/leave" className="tw-text-xs tw-font-medium tw-text-blue-600">
      휴가 관리
    </Link>,
    <div className="tw-space-y-4">
      <div className="tw-grid tw-grid-cols-3 tw-gap-2 tw-text-center">
        {[
          { label: '잔여', value: '5.5일', icon: <CheckCircleOutlined className="tw-text-blue-600" /> },
          { label: '사용', value: '4일', icon: <CalendarOutlined className="tw-text-blue-500" /> },
          { label: '연간', value: '9.5일', icon: <TeamOutlined className="tw-text-slate-500" /> },
        ].map((x) => (
          <div key={x.label} className="tw-rounded-xl tw-border tw-border-slate-100 tw-bg-slate-50/80 tw-py-3">
            <div className="tw-mb-1 tw-flex tw-justify-center">{x.icon}</div>
            <div className="tw-text-lg tw-font-bold tw-tabular-nums tw-text-slate-900">{x.value}</div>
            <div className="tw-text-[11px] tw-text-slate-500">{x.label}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="tw-mb-1 tw-flex tw-justify-between tw-text-xs">
          <span className="tw-text-slate-600">사용 비율</span>
          <span className="tw-font-medium tw-text-slate-900">{usedPct}%</span>
        </div>
        <Progress percent={usedPct} strokeColor="#2563EB" trailColor="#e2e8f0" size="small" />
      </div>
    </div>,
  );
}

export function DashboardNotificationsBlock() {
  const title = DASHBOARD_WIDGET_LABELS.notifications;
  const grouped = DUMMY_NOTIFICATIONS.reduce<Record<string, typeof DUMMY_NOTIFICATIONS>>((acc, n) => {
    const bucket = acc[n.day] ?? [];
    bucket.push(n);
    acc[n.day] = bucket;
    return acc;
  }, {});
  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return cardShell(
    title,
    <Link to="/app/notifications" className="tw-text-xs tw-font-medium tw-text-blue-600">
      전체 보기
    </Link>,
    <div className="tw-max-h-[280px] tw-space-y-4 tw-overflow-y-auto tw-pr-1">
      {days.map((day) => (
        <div key={day}>
          <Typography.Text type="secondary" className="tw-mb-2 tw-block tw-text-xs">
            {day}
          </Typography.Text>
          <List
            size="small"
            dataSource={grouped[day]}
            renderItem={(item) => (
              <List.Item className="!tw-px-0 !tw-py-2">
                <div className="tw-flex tw-gap-2">
                  <Avatar size="small" className="tw-shrink-0 tw-bg-slate-200" icon={<UserOutlined />} />
                  <div className="tw-min-w-0">
                    <div className="tw-text-xs">
                      <Tag className="!tw-mr-1 !tw-text-[10px]">[{item.action}]</Tag>
                      <span className="tw-font-medium tw-text-slate-800">{item.name}</span>
                    </div>
                    <div className="tw-mt-0.5 tw-text-xs tw-leading-snug tw-text-slate-600">{item.text}</div>
                    <div className="tw-mt-0.5 tw-text-[11px] tw-text-slate-400">{item.time}</div>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </div>
      ))}
    </div>,
  );
}

export function renderDashboardWidget(id: DashboardWidgetId, user: Me | null): ReactNode {
  switch (id) {
    case 'profile':
      return <DashboardProfileBlock key={id} user={user} />;
    case 'approvalInbox':
      return <DashboardApprovalInboxBlock key={id} />;
    case 'calendar':
      return <DashboardCalendarBlock key={id} />;
    case 'attendance':
      return <DashboardAttendanceBlock key={id} />;
    case 'leave':
      return <DashboardLeaveBlock key={id} />;
    case 'notifications':
      return <DashboardNotificationsBlock key={id} />;
    default:
      return null;
  }
}