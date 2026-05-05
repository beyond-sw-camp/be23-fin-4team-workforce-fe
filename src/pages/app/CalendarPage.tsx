import { LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Calendar,
  Checkbox,
  Card,
  DatePicker,
  Form,
  Input,
  Popover,
  Radio,
  Select,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import type { CalendarProps } from 'antd';
import clsx from 'clsx';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/ko';
import localeData from 'dayjs/plugin/localeData';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  type CalendarHoliday,
  type CalendarEvent,
  calendarApi,
  type CreatePersonalCalendarPayload,
  type CreateTeamCalendarPayload,
} from '@/features/calendar/api/calendarApi';
import type { OrganizationTreeNode } from '@/features/organization/api/organizationApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { CALENDAR_PAGE_KO } from '@/app/locale/app-ko';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

dayjs.extend(localeData);
dayjs.locale('ko');

const EMPTY_ORG_TREE: OrganizationTreeNode[] = [];

/** 월 그리드: 선택 배경 제거 — 숫자 색은 `fullCellRender` 인라인 스타일로 지정 */
const MONTH_GRID_CALENDAR_CLASS =
  'wf-cal-month [&_.ant-picker-calendar-header]:tw-hidden [&_.ant-picker-content_td]:!tw-px-0 [&_.ant-picker-cell-inner]:tw-min-h-[188px] [&_.ant-picker-calendar-date]:tw-w-full [&_.ant-picker-cell-selected::before]:!tw-border-0 [&_.ant-picker-cell-selected_.ant-picker-calendar-date]:!tw-bg-transparent [&_.ant-picker-cell-selected_.ant-picker-calendar-date]:!tw-shadow-none [&_.ant-picker-cell-today_.ant-picker-calendar-date]:!tw-bg-transparent [&_.ant-picker-cell-today_.ant-picker-calendar-date]:!tw-shadow-none [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-inline-flex [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-h-6 [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-min-w-6 [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-items-center [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-justify-center [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-rounded-full [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-bg-slate-900 [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-px-1.5 [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-text-white';

/** 날짜/월 미니 캘린더(스테퍼 팝오버) — 동일 이슈 방지 */
const MINI_CALENDAR_CLASS =
  '[&_.ant-picker-cell:not(.ant-picker-cell-today)_.ant-picker-calendar-date-value]:!tw-text-slate-900 [&_.ant-picker-cell-today_.ant-picker-calendar-date-value]:!tw-text-white';

const CAL_LABEL_COLOR_STORAGE_KEY = 'wf-calendar-label-colors-v1';
const PERSONAL_LABEL_COLOR_KEY = 'personal';
const APPROVAL_LABEL_COLOR_KEY = 'approval';
const DEFAULT_PERSONAL_LABEL_COLOR = '#2563eb';
const DEFAULT_APPROVAL_LABEL_COLOR = '#f4a640';
const DEFAULT_TEAM_LABEL_COLOR = '#475569';
/** UI 참고: 3×6 원형 팔레트 */
const CAL_LABEL_COLOR_SWATCHES = [
  '#9b5f50', '#c07d72', '#f05a7e', '#ef7a42', '#f4a640', '#f0c236',
  '#4ade80', '#22c55e', '#84cc16', '#bef264', '#fde047', '#eab308',
  '#fb7185', '#e879f9', '#a78bfa', '#c4b5fd', '#2563eb', '#38bdf8',
] as const;

function normalizeHexColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

function loadCalendarLabelColors(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CAL_LABEL_COLOR_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const hex = normalizeHexColor(v);
      if (hex) out[k] = hex;
    }
    return out;
  } catch {
    return {};
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = normalizeHexColor(hex);
  if (!h) return null;
  const n = Number.parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const EVENT_CHIP_TINT_ALPHA = 0.75;

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(30,58,95,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** 흰 배경 위 알파 틴트와의 대비로 본문색 (연한 틴트에 흰 글씨 방지) */
function textColorForHexOnWhiteTint(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#0f172a';
  const r = rgb.r * alpha + 255 * (1 - alpha);
  const g = rgb.g * alpha + 255 * (1 - alpha);
  const b = rgb.b * alpha + 255 * (1 - alpha);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#0f172a' : '#ffffff';
}

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

function isApprovalCalendarEvent(e: CalendarEvent): boolean {
  return String(e.eventType ?? '').toUpperCase() === 'APPROVAL';
}

function isTeamEvent(e: CalendarEvent): boolean {
  if (isApprovalCalendarEvent(e)) return false;
  return e.scope === 'team' || Boolean(e.organizationId?.trim());
}

function calendarLabelColorKey(e: CalendarEvent): string {
  if (isApprovalCalendarEvent(e)) return APPROVAL_LABEL_COLOR_KEY;
  if (isTeamEvent(e) && e.organizationId?.trim()) return `team:${e.organizationId.trim()}`;
  return PERSONAL_LABEL_COLOR_KEY;
}

function defaultCalendarLabelColor(key: string): string {
  if (key === PERSONAL_LABEL_COLOR_KEY) return DEFAULT_PERSONAL_LABEL_COLOR;
  if (key === APPROVAL_LABEL_COLOR_KEY) return DEFAULT_APPROVAL_LABEL_COLOR;
  return DEFAULT_TEAM_LABEL_COLOR;
}

/** 월요일 시작 주간 (월~일) 기준 해당 주의 월요일 00:00 */
function mondayOfCalendarWeek(d: Dayjs): Dayjs {
  return d.subtract((d.day() + 6) % 7, 'day').startOf('day');
}

function startOfCalendarWeek(d: Dayjs, firstDayOfWeek: number): Dayjs {
  return d.subtract((d.day() - firstDayOfWeek + 7) % 7, 'day').startOf('day');
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

function holidaysOnDay(holidays: CalendarHoliday[], day: Dayjs): CalendarHoliday[] {
  const key = day.format('YYYY-MM-DD');
  return holidays.filter((h) => h.holidayDate === key);
}

/** 일요일·법정 공휴일: 빨강 / 토요일: 회색 / 그 외: 진한 슬레이트 (오늘은 스타일 비움 → pill 규칙 사용) */
function calendarDateNumberStyle(
  date: Dayjs,
  holidays: CalendarHoliday[],
  isToday: boolean,
): CSSProperties | undefined {
  if (isToday) return undefined;
  if (holidaysOnDay(holidays, date).length > 0) return { color: '#dc2626' };
  const dow = date.day();
  if (dow === 0) return { color: '#dc2626' };
  if (dow === 6) return { color: '#94a3b8' };
  return { color: '#0f172a' };
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
const EVENT_CHIP_CLASS =
  'tw-block tw-w-full tw-truncate tw-rounded tw-border-0 tw-px-1.5 tw-py-0.5 tw-text-left tw-text-[10px] tw-font-medium tw-leading-tight';

const EVENT_CHIP_TEAM_CLASS =
  'tw-block tw-w-full tw-truncate tw-rounded tw-border-0 tw-bg-violet-200/80 tw-px-1.5 tw-py-0.5 tw-text-left tw-text-[10px] tw-font-medium tw-leading-tight tw-text-violet-950 hover:tw-bg-violet-200';

const EVENT_CHIP_APPROVAL_CLASS =
  'tw-block tw-w-full tw-truncate tw-rounded tw-border-0 tw-bg-amber-100/90 tw-px-1.5 tw-py-0.5 tw-text-left tw-text-[10px] tw-font-medium tw-leading-tight tw-text-amber-950 hover:tw-bg-amber-100';

function eventChipButtonClass(e: CalendarEvent): string {
  if (isApprovalCalendarEvent(e)) return EVENT_CHIP_APPROVAL_CLASS;
  if (isTeamEvent(e)) return EVENT_CHIP_TEAM_CLASS;
  return EVENT_CHIP_CLASS;
}

const DAY_LANE_PERSONAL_CLASS =
  'tw-absolute tw-box-border tw-overflow-hidden tw-rounded tw-border tw-border-rose-300 tw-bg-rose-100/90 tw-px-1 tw-py-0.5 tw-text-left tw-text-[11px] tw-leading-tight tw-text-rose-900 hover:tw-bg-rose-100';

const DAY_LANE_TEAM_CLASS =
  'tw-absolute tw-box-border tw-overflow-hidden tw-rounded tw-border tw-border-violet-400 tw-bg-violet-100/90 tw-px-1 tw-py-0.5 tw-text-left tw-text-[11px] tw-leading-tight tw-text-violet-950 hover:tw-bg-violet-100';

const DAY_LANE_APPROVAL_CLASS =
  'tw-absolute tw-box-border tw-overflow-hidden tw-rounded tw-border tw-border-amber-300 tw-bg-amber-100/90 tw-px-1 tw-py-0.5 tw-text-left tw-text-[11px] tw-leading-tight tw-text-amber-950 hover:tw-bg-amber-100';

function dayLaneEventButtonClass(e: CalendarEvent): string {
  if (isApprovalCalendarEvent(e)) return DAY_LANE_APPROVAL_CLASS;
  if (isTeamEvent(e)) return DAY_LANE_TEAM_CLASS;
  return DAY_LANE_PERSONAL_CLASS;
}

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
      const laneEnd = lanesEnd[i];
      if (laneEnd !== undefined && laneEnd <= clip.startMin) {
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

function CalendarDateStepper({
  mode,
  monthValue,
  selectedDay,
  onPrev,
  onNext,
  onPick,
}: {
  mode: CalendarViewMode;
  monthValue: Dayjs;
  selectedDay: Dayjs;
  onPrev: () => void;
  onNext: () => void;
  onPick: (d: Dayjs) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [panelValue, setPanelValue] = useState(mode === 'month' ? monthValue : selectedDay);
  const weekMonday = mondayOfCalendarWeek(selectedDay);
  const label =
    mode === 'month'
      ? monthValue.format('YYYY.MM')
      : mode === 'week'
        ? `${weekMonday.format('YYYY.MM.DD')} ~ ${weekMonday.add(6, 'day').format('MM.DD')}`
        : selectedDay.format('YYYY.MM.DD');

  const popoverCalendarValue = mode === 'month' ? monthValue : selectedDay;

  return (
    <div className="tw-flex tw-items-center tw-gap-2 md:tw-gap-3">
      <Button
        type="text"
        size="middle"
        icon={<LeftOutlined className="tw-text-lg tw-text-slate-600" />}
        aria-label="이전"
        onClick={onPrev}
        className="!tw-flex !tw-size-10 !tw-items-center !tw-justify-center"
      />
      <Popover
        open={pickerOpen}
        onOpenChange={(o) => {
          setPickerOpen(o);
          if (o) setPanelValue(popoverCalendarValue);
        }}
        trigger="click"
        placement="bottom"
        content={
          <div className="tw-w-[270px]">
            <Calendar
              className={MINI_CALENDAR_CLASS}
              fullscreen={false}
              value={popoverCalendarValue}
              mode={mode === 'month' ? 'year' : 'month'}
              onPanelChange={(d) => setPanelValue(d)}
              onSelect={(d) => {
                if (mode === 'month') onPick(d.startOf('month'));
                else if (mode === 'week') onPick(mondayOfCalendarWeek(d));
                else onPick(d.startOf('day'));
                setPickerOpen(false);
              }}
              onChange={(d) => setPanelValue(d)}
            />
          </div>
        }
      >
        <Button
          type="text"
          size="middle"
          className="!tw-min-h-10 !tw-min-w-[8.5rem] !tw-rounded-lg !tw-px-4 !tw-text-base !tw-font-semibold !tw-text-slate-800 hover:!tw-bg-slate-100"
        >
          {label}
        </Button>
      </Popover>
      <Button
        type="text"
        size="middle"
        icon={<RightOutlined className="tw-text-lg tw-text-slate-600" />}
        aria-label="다음"
        onClick={onNext}
        className="!tw-flex !tw-size-10 !tw-items-center !tw-justify-center"
      />
    </div>
  );
}

export function CalendarPage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [monthValue, setMonthValue] = useState(() => dayjs());
  const [selectedDay, setSelectedDay] = useState<Dayjs>(() => dayjs());
  const [showPersonal, setShowPersonal] = useState(true);
  const [showApproval, setShowApproval] = useState(true);
  const [selectedTeamOrgIds, setSelectedTeamOrgIds] = useState<string[]>([]);
  const [labelColors, setLabelColors] = useState<Record<string, string>>(() => loadCalendarLabelColors());
  const [overflowPanel, setOverflowPanel] = useState<{
    dateKey: string;
    title: string;
    items: CalendarEvent[];
  } | null>(null);
  const skipNextMonthCellSelectRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(CAL_LABEL_COLOR_STORAGE_KEY, JSON.stringify(labelColors));
    } catch {
      /* ignore */
    }
  }, [labelColors]);

  const setLabelColor = useCallback((key: string, color: string) => {
    const hex = normalizeHexColor(color);
    if (!hex) return;
    setLabelColors((prev) => ({ ...prev, [key]: hex }));
  }, []);

  const labelColor = useCallback(
    (key: string, fallback: string) => {
      return labelColors[key] ?? fallback;
    },
    [labelColors],
  );

  const eventChipStyle = useCallback(
    (e: CalendarEvent): CSSProperties => {
      const key = calendarLabelColorKey(e);
      const base = labelColor(key, defaultCalendarLabelColor(key));
      return {
        backgroundColor: rgbaFromHex(base, EVENT_CHIP_TINT_ALPHA),
        color: textColorForHexOnWhiteTint(base, EVENT_CHIP_TINT_ALPHA),
      };
    },
    [labelColor],
  );

  const dayLaneEventStyle = useCallback(
    (e: CalendarEvent, layoutStyle: CSSProperties): CSSProperties => {
      const key = calendarLabelColorKey(e);
      const base = labelColor(key, defaultCalendarLabelColor(key));
      return {
        ...layoutStyle,
        backgroundColor: rgbaFromHex(base, 0.22),
        borderColor: base,
        color: textColorForHexOnWhiteTint(base, 0.22),
      };
    },
    [labelColor],
  );

  const renderLabelColorPicker = useCallback(
    (key: string, fallback: string, ariaLabel: string) => {
      const current = labelColor(key, fallback);
      return (
        <Popover
          trigger="click"
          placement="bottomRight"
          content={
            <div className="tw-grid tw-grid-cols-6 tw-gap-2">
              {CAL_LABEL_COLOR_SWATCHES.map((hex) => {
                const selected = current === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`${ariaLabel} ${hex}`}
                    className={clsx(
                      'tw-size-5 tw-rounded-full tw-border-0 tw-p-0 tw-transition tw-outline-none',
                      selected
                        ? 'tw-ring-2 tw-ring-slate-600 tw-ring-offset-1 tw-ring-offset-white'
                        : 'hover:tw-scale-105',
                    )}
                    style={{ backgroundColor: hex, border: 'none', boxShadow: 'none' }}
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setLabelColor(key, hex);
                    }}
                  />
                );
              })}
            </div>
          }
        >
          <button
            type="button"
            aria-label={ariaLabel}
            className="tw-inline-flex tw-size-3 tw-shrink-0 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-p-0 tw-shadow-none tw-outline-none tw-ring-0 focus:tw-outline-none"
            style={{ backgroundColor: current, border: 'none', boxShadow: 'none' }}
            onClick={(ev) => ev.stopPropagation()}
          />
        </Popover>
      );
    },
    [labelColor, setLabelColor],
  );

  const year = monthValue.year();
  const month = monthValue.month() + 1;

  const weekMonday = useMemo(() => mondayOfCalendarWeek(selectedDay), [selectedDay]);

  const monthQuery = useQuery({
    queryKey: ['calendar', 'month', year, month],
    queryFn: () => calendarApi.listMonth(year, month),
    enabled: viewMode === 'month',
  });

  const weekQuery = useQuery({
    queryKey: ['calendar', 'week', weekMonday.format('YYYY-MM-DD')],
    queryFn: () => calendarApi.listWeekly(weekMonday.format('YYYY-MM-DD')),
    enabled: viewMode === 'week',
  });

  /** 주간 뷰에서 공휴일 표시 — 해당 주가 속한 달의 법정휴일 목록 */
  const weekHolidayMonthY = weekMonday.year();
  const weekHolidayMonthM = weekMonday.month() + 1;
  const weekMonthHolidaysQuery = useQuery({
    queryKey: ['calendar', 'month', weekHolidayMonthY, weekHolidayMonthM],
    queryFn: () => calendarApi.listMonth(weekHolidayMonthY, weekHolidayMonthM),
    enabled: viewMode === 'week',
  });
  const weekHolidays = weekMonthHolidaysQuery.data?.holidays ?? [];

  const dayQuery = useQuery({
    queryKey: ['calendar', 'day', selectedDay.format('YYYY-MM-DD')],
    queryFn: () => calendarApi.listDaily(selectedDay.format('YYYY-MM-DD')),
    enabled: viewMode === 'day',
  });

  const events = useMemo(() => {
    if (viewMode === 'month') return monthQuery.data?.events ?? [];
    if (viewMode === 'week') return weekQuery.data ?? [];
    return dayQuery.data ?? [];
  }, [viewMode, monthQuery.data, weekQuery.data, dayQuery.data]);

  const monthHolidays = useMemo(
    () => (viewMode === 'month' ? monthQuery.data?.holidays ?? [] : []),
    [viewMode, monthQuery.data],
  );

  const filteredEvents = useMemo(
    () =>
      events.filter((e) => {
        if (isApprovalCalendarEvent(e)) {
          return showApproval;
        }
        const team = isTeamEvent(e);
        if (!team && !showPersonal) return false;
        if (team) {
          const orgId = e.organizationId?.trim() || '';
          if (!orgId) return false;
          if (selectedTeamOrgIds.length === 0) return false;
          if (!selectedTeamOrgIds.includes(orgId)) return false;
        }
        return true;
      }),
    [events, showPersonal, showApproval, selectedTeamOrgIds],
  );

  const isLoading =
    (viewMode === 'month' && monthQuery.isLoading) ||
    (viewMode === 'week' && weekQuery.isLoading) ||
    (viewMode === 'day' && dayQuery.isLoading);

  const { data: orgTreeData } = useQuery({
    queryKey: ['organization', 'simple-list'],
    queryFn: () => organizationApi.simpleList(),
  });
  const orgTree = orgTreeData ?? EMPTY_ORG_TREE;
  const orgOptions = useMemo(() => flattenOrgList(orgTree), [orgTree]);
  const orgMetaById = useMemo(() => {
    const map = new Map<string, { name: string; isRoot: boolean }>();
    const walk = (nodes: OrganizationTreeNode[], isRoot: boolean) => {
      for (const n of nodes) {
        const id =
          (typeof n.id === 'string' && n.id) ||
          (typeof n.organizationId === 'string' && n.organizationId) ||
          (typeof n.organization_id === 'string' && n.organization_id) ||
          '';
        const name = typeof n.name === 'string' ? n.name : '';
        if (id) map.set(id, { name: name || id, isRoot });
        const ch = n.children as OrganizationTreeNode[] | undefined;
        if (Array.isArray(ch) && ch.length > 0) walk(ch, false);
      }
    };
    walk(orgTree, true);
    return map;
  }, [orgTree]);

  const teamOrgFilters = useMemo(() => {
    const fromOrgTree = Array.from(orgMetaById.entries()).map(([id, meta]) => ({
      id,
      label: meta.isRoot ? (meta.name && meta.name !== '전사' ? `전사(${meta.name})` : '전사') : meta.name,
      isRoot: meta.isRoot,
    }));
    const fromEventsUnknown = Array.from(
      new Set(
        events
          .filter((e) => isTeamEvent(e))
          .map((e) => e.organizationId?.trim())
          .filter(
            (id): id is string =>
              typeof id === 'string' && id.length > 0 && !orgMetaById.has(id),
          ),
      ),
    ).map((id) => ({ id, label: id, isRoot: false }));

    return [...fromOrgTree, ...fromEventsUnknown]
      .filter((x) => !x.isRoot)
      .sort((a, b) => {
      if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
      return a.label.localeCompare(b.label, 'ko');
      });
  }, [events, orgMetaById]);

  const teamOrganizationOptions = useMemo(() => {
    const nonRootIds = new Set(teamOrgFilters.map((x) => x.id));
    return orgOptions
      .filter((o) => nonRootIds.has(o.id))
      .map((o) => ({ value: o.id, label: o.name }));
  }, [orgOptions, teamOrgFilters]);

  useEffect(() => {
    const valid = new Set(teamOrgFilters.map((x) => x.id));
    setSelectedTeamOrgIds((prev) => {
      const kept = prev.filter((id) => valid.has(id));
      if (kept.length > 0) {
        // No-op if nothing was dropped (preserve reference).
        return kept.length === prev.length ? prev : kept;
      }
      const all = teamOrgFilters.map((x) => x.id);
      // No-op if current selection already equals the full set (preserve reference).
      if (all.length === prev.length && all.every((id, i) => id === prev[i])) {
        return prev;
      }
      return all;
    });
  }, [teamOrgFilters]);

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
      if (isApprovalCalendarEvent(event)) {
        throw new Error('결재 연동 일정은 수정할 수 없습니다.');
      }
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
      if (isApprovalCalendarEvent(event)) {
        throw new Error('결재 연동 일정은 삭제할 수 없습니다.');
      }
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

  const openCreate = (baseDay?: Dayjs | undefined) => {
    const seed = (dayjs.isDayjs(baseDay) ? baseDay : selectedDay).startOf('day');
    setEditing(null);
    form.setFieldsValue({
      kind: 'personal',
      title: '',
      description: '',
      range: [seed.hour(9).minute(0), seed.hour(10).minute(0)],
      isPublicYn: 'YES',
      organizationId: teamOrganizationOptions[0]?.value,
    });
    setFormOpen(true);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'create') return;

    const dateParam = params.get('date');
    const seed = dateParam ? dayjs(dateParam) : null;
    openCreate(seed && seed.isValid() ? seed : undefined);
    params.delete('action');
    params.delete('date');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, []);

  const openEdit = (e: CalendarEvent) => {
    if (isApprovalCalendarEvent(e)) {
      message.warning('결재 연동 일정은 수정할 수 없습니다.');
      return;
    }
    setEditing(e);
    const start = dayjs(e.startAt);
    const end = dayjs(e.endAt);
    form.setFieldsValue({
      kind: isTeamEvent(e) ? 'team' : 'personal',
      title: e.title,
      description: e.description ?? '',
      range: [start, end],
      isPublicYn: e.isPublicYn ?? 'YES',
      organizationId: e.organizationId ?? teamOrganizationOptions[0]?.value,
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

  const dayList = useMemo(() => eventsOnDay(filteredEvents, selectedDay), [filteredEvents, selectedDay]);

  const dayPlacedEvents = useMemo(
    () => (viewMode === 'day' ? placeEventsInDayLanes(dayList, selectedDay) : []),
    [viewMode, dayList, selectedDay],
  );
  const firstDayOfWeek = useMemo(() => dayjs.localeData().firstDayOfWeek(), []);
  const showSixthMonthRow = useMemo(() => {
    const gridStart = startOfCalendarWeek(monthValue.startOf('month'), firstDayOfWeek);
    return Array.from({ length: 7 }, (_, index) => gridStart.add(35 + index, 'day')).some((d) =>
      d.isSame(monthValue, 'month'),
    );
  }, [firstDayOfWeek, monthValue]);
  const monthWeekLayouts = useMemo(() => {
    type Seg = { event: CalendarEvent; startIdx: number; endIdx: number };
    type WeekLayout = { lanesByDate: Map<string, Map<number, CalendarEvent>>; maxLane: number };
    const byWeek = new Map<string, Seg[]>();

    for (const event of filteredEvents) {
      const eventStart = dayjs(event.startAt).startOf('day');
      const eventEnd = dayjs(event.endAt).startOf('day');
      let cursor = startOfCalendarWeek(eventStart, firstDayOfWeek);
      while (!cursor.isAfter(eventEnd, 'day')) {
        const weekStart = cursor;
        const weekEnd = weekStart.add(6, 'day');
        const segStart = eventStart.isAfter(weekStart, 'day') ? eventStart : weekStart;
        const segEnd = eventEnd.isBefore(weekEnd, 'day') ? eventEnd : weekEnd;
        if (!segStart.isAfter(segEnd, 'day')) {
          const weekKey = weekStart.format('YYYY-MM-DD');
          const arr = byWeek.get(weekKey) ?? [];
          arr.push({
            event,
            startIdx: segStart.diff(weekStart, 'day'),
            endIdx: segEnd.diff(weekStart, 'day'),
          });
          byWeek.set(weekKey, arr);
        }
        cursor = cursor.add(7, 'day');
      }
    }

    const layoutByWeek = new Map<string, WeekLayout>();
    byWeek.forEach((segments, weekKey) => {
      segments.sort((a, b) => {
        if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx;
        const aLen = a.endIdx - a.startIdx;
        const bLen = b.endIdx - b.startIdx;
        if (aLen !== bLen) return bLen - aLen;
        return a.event.eventId.localeCompare(b.event.eventId);
      });
      const laneEndIdx: number[] = [];
      const lanesByDate = new Map<string, Map<number, CalendarEvent>>();
      let maxLane = -1;
      const weekStart = dayjs(weekKey);

      for (const seg of segments) {
        let lane = 0;
        while (lane < laneEndIdx.length) {
          const laneEnd = laneEndIdx[lane];
          if (laneEnd === undefined || seg.startIdx > laneEnd) break;
          lane += 1;
        }
        laneEndIdx[lane] = seg.endIdx;
        if (lane > maxLane) maxLane = lane;

        for (let idx = seg.startIdx; idx <= seg.endIdx; idx += 1) {
          const dateKey = weekStart.add(idx, 'day').format('YYYY-MM-DD');
          const dayLanes = lanesByDate.get(dateKey) ?? new Map<number, CalendarEvent>();
          dayLanes.set(lane, seg.event);
          lanesByDate.set(dateKey, dayLanes);
        }
      }

      layoutByWeek.set(weekKey, { lanesByDate, maxLane });
    });

    return layoutByWeek;
  }, [filteredEvents, firstDayOfWeek]);

  const monthFullCellRender = useCallback<NonNullable<CalendarProps<Dayjs>['fullCellRender']>>(
    (current, info) => {
      if (!info || info.type !== 'date') {
        return <div className="ant-picker-cell-inner" />;
      }
      const isToday = current.isSame(dayjs(), 'day');
      const isCurrentMonth = current.isSame(monthValue, 'month');
      const list = eventsOnDay(filteredEvents, current);
      const holidayList = holidaysOnDay(monthHolidays, current);
      const numStyle = calendarDateNumberStyle(current, monthHolidays, isToday);
      const weekKey = startOfCalendarWeek(current, firstDayOfWeek).format('YYYY-MM-DD');
      const weekLayout = monthWeekLayouts.get(weekKey);
      const dateKey = current.format('YYYY-MM-DD');
      const dayLaneMap = weekLayout?.lanesByDate.get(dateKey);
      const rowCount = Math.min((weekLayout?.maxLane ?? -1) + 1, 4);
      const hiddenCount = Math.max(0, (dayLaneMap?.size ?? list.length) - 4);
      const suppressNextCellSelect = () => {
        skipNextMonthCellSelectRef.current = true;
        window.setTimeout(() => {
          skipNextMonthCellSelectRef.current = false;
        }, 0);
      };
      const openOverflow = () => {
        suppressNextCellSelect();
        setOverflowPanel({
          dateKey,
          title: `${current.format('M\uC6D4 D\uC77C')} \uC77C\uC815`,
          items: list,
        });
      };
      return (
        <div
          className={clsx('ant-picker-cell-inner', 'ant-picker-calendar-date', 'tw-relative', {
            'ant-picker-calendar-date-today': isToday,
            'tw-opacity-35': !isCurrentMonth,
          })}
        >
          <div className="ant-picker-calendar-date-value tw-relative tw-z-0" style={numStyle}>
            {String(current.date()).padStart(2, '0')}
          </div>
          <div className="ant-picker-calendar-date-content tw-relative tw-z-10">
            <div className="tw-flex tw-min-h-[108px] tw-flex-col tw-gap-0.5">
              <div
                className={clsx('tw-truncate tw-text-[11px] tw-font-medium tw-min-h-[16px]', {
                  'tw-text-rose-600': holidayList.length > 0,
                  'tw-text-transparent': holidayList.length === 0,
                })}
                title={holidayList[0]?.holidayName}
              >
                {holidayList[0]?.holidayName ?? '\u00A0'}
              </div>
              <ul className="tw-m-0 tw-list-none tw-space-y-0.5 tw-p-0">
                {Array.from({ length: rowCount }).map((_, lane) => {
                  const e = dayLaneMap?.get(lane);
                  if (!e) {
                    return <li key={`empty-${dateKey}-${lane}`} className="tw-h-[16px]" />;
                  }
                  const colIndex = (current.day() - firstDayOfWeek + 7) % 7;
                  const hasPrevInRow = colIndex > 0 && eventOccursOnDay(e, current.subtract(1, 'day'));
                  const hasNextInRow = colIndex < 6 && eventOccursOnDay(e, current.add(1, 'day'));
                  return (
                    <li key={`${e.eventId}-${dateKey}-${lane}`}>
                      <button
                        type="button"
                        className={clsx(EVENT_CHIP_CLASS, {
                          'tw-h-4 tw-py-0 tw-leading-4': true,
                          'tw-rounded-l-none tw-pl-2': hasPrevInRow,
                          'tw-rounded-r-none tw-pr-2': hasNextInRow,
                        })}
                        style={eventChipStyle(e)}
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          suppressNextCellSelect();
                        }}
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          suppressNextCellSelect();
                          setDetailEvent(e);
                          setDetailOpen(true);
                        }}
                      >
                        {hasPrevInRow ? '\u00A0' : e.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  className="tw-relative tw-z-20 tw-inline-flex tw-cursor-pointer tw-items-center tw-rounded tw-border-0 tw-bg-transparent tw-px-1.5 tw-py-1.5 tw-text-[11px] tw-font-medium tw-text-blue-600 tw-appearance-none hover:tw-bg-[#F8FAFC] hover:tw-text-blue-50"
                  onClickCapture={(ev) => {
                    ev.stopPropagation();
                  }}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    openOverflow();
                  }}
                  onPointerDown={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    openOverflow();
                  }}
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    openOverflow();
                  }}
                >
                  +{hiddenCount}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    },
    [eventChipStyle, filteredEvents, firstDayOfWeek, monthHolidays, monthValue, monthWeekLayouts],
  );

  const calendarTheadAccentStyle = useMemo(() => {
    const first = dayjs.localeData().firstDayOfWeek();
    const sunCol = first === 0 ? 1 : 7;
    const satCol = first === 0 ? 7 : 6;
    return (
      <style
        dangerouslySetInnerHTML={{
          __html: `
.wf-cal-month.ant-picker-calendar .ant-picker-content thead > tr > th:nth-child(${sunCol}){color:#dc2626!important;}
.wf-cal-month.ant-picker-calendar .ant-picker-content thead > tr > th:nth-child(${satCol}){color:#94a3b8!important;}
${showSixthMonthRow ? '' : '.wf-cal-month.ant-picker-calendar .ant-picker-content tbody > tr:nth-child(6){display:none!important;}'}
/* 캘린더 사이드바: antd 5.29는 박스/체크가 .ant-checkbox-inner(+::after) — 바깥 .ant-checkbox만 줄이면 inner 16px이 겹침 */
.wf-cal-sidebar-filter-row .ant-checkbox-wrapper{
  align-items:center!important;
  flex:1 1 auto!important;
  min-width:0!important;
}
.wf-cal-sidebar-filter-row .ant-checkbox-inner{
  width:14px!important;
  height:14px!important;
  border-radius:4px!important;
}
/* 14px inner 기준 체크 크기만 축소 — scale+translate 조합은 시각적으로 우하단으로 밀림 */
.wf-cal-sidebar-filter-row .ant-checkbox-inner::after{
  width:5px!important;
  height:8px!important;
  border-width:0 1.5px 1.5px 0!important;
  box-sizing:border-box!important;
}
.wf-cal-sidebar-filter-row .ant-checkbox-checked .ant-checkbox-inner::after{
  transform:rotate(45deg) scale(1) translate(-50%,-50%)!important;
  transform-origin:center!important;
}
.wf-cal-sidebar-filter-row .ant-checkbox-label{
  padding-inline-start:8px!important;
}
`,
        }}
      />
    );
  }, [showSixthMonthRow]);

  return (
    <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-4">
      <AppWorkspacePageTitle eyebrow={CALENDAR_PAGE_KO.workspaceEyebrow} title={CALENDAR_PAGE_KO.pageTitle} />
      <div className="tw-grid tw-min-h-0 tw-flex-1 tw-gap-4 lg:tw-grid-cols-[280px_1fr]">
        <Card className="tw-h-fit tw-border-slate-200/80 tw-shadow-sm" styles={{ body: { padding: 12 } }}>
          <div className="tw-space-y-3">
            <Button
              type="primary"
              block
              onClick={() => openCreate()}
              className="!tw-h-10 !tw-w-full !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-font-semibold hover:!tw-bg-[#152a45]"
            >
              일정등록
            </Button>

            <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-3">
              <Typography.Text className="tw-text-xs tw-font-semibold tw-text-slate-700">내 캘린더 표시</Typography.Text>
              <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-[11px]">
                월/주/일 일정 목록에 개인 일정을 표시할지 선택합니다.
              </Typography.Paragraph>
              <div className="tw-mt-2 tw-space-y-2">
                <div
                  role="checkbox"
                  aria-checked={showPersonal}
                  tabIndex={0}
                  className="wf-cal-sidebar-filter-row tw-flex tw-cursor-pointer tw-items-center tw-justify-between tw-gap-2 tw-rounded-md tw-px-1"
                  onClick={() => setShowPersonal((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowPersonal((v) => !v);
                    }
                  }}
                >
                  <Checkbox
                    className="tw-min-w-0 tw-flex-1 !tw-items-center"
                    checked={showPersonal}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setShowPersonal(e.target.checked)}
                  >
                    <span
                      className="tw-text-slate-800"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowPersonal((v) => !v);
                      }}
                    >
                      개인 일정
                    </span>
                  </Checkbox>
                  <span className="tw-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {renderLabelColorPicker('personal', '#2563eb', '개인 일정 라벨 색상')}
                  </span>
                </div>
                <div
                  role="checkbox"
                  aria-checked={showApproval}
                  tabIndex={0}
                  className="wf-cal-sidebar-filter-row tw-flex tw-cursor-pointer tw-items-center tw-justify-between tw-gap-2 tw-rounded-md tw-px-1"
                  onClick={() => setShowApproval((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowApproval((v) => !v);
                    }
                  }}
                >
                  <Checkbox
                    className="tw-min-w-0 tw-flex-1 !tw-items-center"
                    checked={showApproval}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setShowApproval(e.target.checked)}
                  >
                    <span
                      className="tw-text-slate-800"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowApproval((v) => !v);
                      }}
                    >
                      결재 연동 일정
                    </span>
                  </Checkbox>
                  <span className="tw-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {renderLabelColorPicker(
                      APPROVAL_LABEL_COLOR_KEY,
                      DEFAULT_APPROVAL_LABEL_COLOR,
                      '결재 연동 일정 라벨 색상',
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-3">
              <Typography.Text className="tw-text-xs tw-font-semibold tw-text-slate-700">팀 캘린더 표시</Typography.Text>
              <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-[11px]">
                TEAM 일정 중 조직별 표시 여부를 선택합니다.
              </Typography.Paragraph>
              <div className="tw-mt-2 tw-space-y-2">
                {teamOrgFilters.length > 0 ? (
                  <div className="tw-space-y-1 tw-pl-1">
                    {teamOrgFilters.map((org) => (
                      <div
                        key={org.id}
                        role="checkbox"
                        aria-checked={selectedTeamOrgIds.includes(org.id)}
                        tabIndex={0}
                        className="wf-cal-sidebar-filter-row tw-flex tw-cursor-pointer tw-items-center tw-justify-between tw-gap-2 tw-rounded-md tw-px-1"
                        onClick={() => {
                          setSelectedTeamOrgIds((prev) =>
                            prev.includes(org.id) ? prev.filter((id) => id !== org.id) : [...new Set([...prev, org.id])],
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedTeamOrgIds((prev) =>
                              prev.includes(org.id) ? prev.filter((id) => id !== org.id) : [...new Set([...prev, org.id])],
                            );
                          }
                        }}
                      >
                        <Checkbox
                          className="tw-min-w-0 tw-flex-1 !tw-items-center"
                          checked={selectedTeamOrgIds.includes(org.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedTeamOrgIds((prev) =>
                              checked ? [...new Set([...prev, org.id])] : prev.filter((id) => id !== org.id),
                            );
                          }}
                        >
                          <span
                            className="tw-text-slate-800"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedTeamOrgIds((prev) =>
                                prev.includes(org.id) ? prev.filter((id) => id !== org.id) : [...new Set([...prev, org.id])],
                              );
                            }}
                          >
                            {org.label}
                          </span>
                        </Checkbox>
                        <span className="tw-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {renderLabelColorPicker(`team:${org.id}`, '#475569', `${org.label} 라벨 색상`)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Typography.Text type="secondary" className="tw-text-xs">
                    팀 일정 조직이 없습니다.
                  </Typography.Text>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="tw-border-slate-200/80 tw-shadow-sm" styles={{ body: { padding: 12 } }}>
          <div className="tw-mb-4 tw-grid tw-w-full tw-grid-cols-1 tw-items-center tw-gap-3 sm:tw-grid-cols-[1fr_auto_1fr]">
            <div className="tw-justify-self-start sm:tw-justify-self-start">
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
            </div>
            <div className="tw-flex tw-justify-center tw-justify-self-center">
              <CalendarDateStepper
                mode={viewMode}
                monthValue={monthValue}
                selectedDay={selectedDay}
                onPrev={() => {
                  if (viewMode === 'month') {
                    const next = monthValue.subtract(1, 'month').startOf('month');
                    setMonthValue(next);
                    setSelectedDay(next);
                    return;
                  }
                  if (viewMode === 'week') {
                    setSelectedDay((d) => d.subtract(7, 'day'));
                    return;
                  }
                  setSelectedDay((d) => d.subtract(1, 'day'));
                }}
                onNext={() => {
                  if (viewMode === 'month') {
                    const next = monthValue.add(1, 'month').startOf('month');
                    setMonthValue(next);
                    setSelectedDay(next);
                    return;
                  }
                  if (viewMode === 'week') {
                    setSelectedDay((d) => d.add(7, 'day'));
                    return;
                  }
                  setSelectedDay((d) => d.add(1, 'day'));
                }}
                onPick={(d) => {
                  setSelectedDay(d);
                  if (viewMode === 'month') setMonthValue(d.startOf('month'));
                }}
              />
            </div>
            <div className="tw-flex tw-justify-end tw-justify-self-end max-sm:tw-w-full max-sm:tw-justify-self-end">
              <Button
                type="default"
                size="middle"
                onClick={() => {
                  const today = dayjs();
                  setSelectedDay(today);
                  setMonthValue(today.startOf('month'));
                }}
              >
                오늘
              </Button>
            </div>
          </div>
          <Spin spinning={isLoading}>
            {viewMode === 'month' && (
              <>
                {calendarTheadAccentStyle}
                <Calendar
                  className={MONTH_GRID_CALENDAR_CLASS}
                  fullscreen={false}
                  value={selectedDay}
                  onChange={(d) => {
                    setMonthValue(d.startOf('month'));
                    setSelectedDay(d);
                  }}
                  onSelect={(d) => {
                    if (skipNextMonthCellSelectRef.current) {
                      skipNextMonthCellSelectRef.current = false;
                      return;
                    }
                    const selectedMonth = d.startOf('month');
                    if (!selectedMonth.isSame(monthValue, 'month')) {
                      setSelectedDay(selectedMonth);
                      setMonthValue(selectedMonth);
                      return;
                    }
                    setSelectedDay(d);
                    setMonthValue(selectedMonth);
                    openCreate(d);
                  }}
                  onPanelChange={(d) => setMonthValue(d.startOf('month'))}
                  fullCellRender={monthFullCellRender}
                />
              </>
            )}
            {viewMode === 'week' && (
              <div className="tw-space-y-3">
                <div className="tw-grid tw-grid-cols-7 tw-gap-2 max-sm:tw-grid-cols-1">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = weekMonday.add(i, 'day');
                    const list = eventsOnDay(filteredEvents, d);
                    const isSel = d.isSame(selectedDay, 'day');
                    const isTodayD = d.isSame(dayjs(), 'day');
                    const dayNumStyle = calendarDateNumberStyle(d, weekHolidays, isTodayD);
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
                          onClick={() => {
                            setSelectedDay(d);
                            openCreate(d);
                          }}
                        >
                          <span
                            className={clsx(
                              d.day() === 0 && 'tw-text-red-600',
                              d.day() === 6 && 'tw-text-slate-400',
                              d.day() !== 0 && d.day() !== 6 && 'tw-text-slate-700',
                            )}
                          >
                            {d.format('ddd')}
                          </span>{' '}
                          <span
                            className={clsx(
                              'tw-tabular-nums tw-font-semibold',
                              !dayNumStyle && 'tw-text-slate-900',
                            )}
                            style={dayNumStyle}
                          >
                            {d.format('D')}
                          </span>
                        </button>
                        <ul className="tw-m-0 tw-flex tw-min-h-0 tw-flex-1 tw-list-none tw-flex-col tw-space-y-0.5 tw-p-0">
                          {list.slice(0, 4).map((e, idx) => (
                            <li key={`${e.eventId}-${e.startAt}-${e.endAt}-${idx}`}>
                              <button
                                type="button"
                                className={EVENT_CHIP_CLASS}
                                style={eventChipStyle(e)}
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
                            key={`${e.eventId}-${clip.startMin}-${clip.endMin}-${lane}`}
                            type="button"
                            className={dayLaneEventButtonClass(e)}
                            style={dayLaneEventStyle(e, {
                              top: `${pctTop}%`,
                              height: `${pctH}%`,
                              left: `${left}%`,
                              width: `${w}%`,
                            })}
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

      </div>

      {/* `destroyOnHidden` 모달이 닫히면 Form이 제거되어 useForm 경고가 난다. */}
      {!formOpen ? <Form form={form} preserve={false} className="tw-hidden" aria-hidden /> : null}

      <AppSingleActionModal
        title={overflowPanel?.title ?? '\uC77C\uC815'}
        open={Boolean(overflowPanel)}
        onClose={() => setOverflowPanel(null)}
        onSubmit={() => setOverflowPanel(null)}
        submitText={'\uB2EB\uAE30'}
        width={360}
      >
        <div className="tw-space-y-1 tw-px-5 tw-py-4">
          {(overflowPanel?.items ?? []).map((e) => (
            <button
              key={`overflow-panel-${overflowPanel?.dateKey ?? 'date'}-${e.eventId}`}
              type="button"
              className="tw-block tw-w-full tw-truncate tw-rounded tw-border-0 tw-px-2 tw-py-1.5 tw-text-left tw-text-xs tw-font-medium hover:tw-bg-slate-100"
              style={eventChipStyle(e)}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setOverflowPanel(null);
                setDetailEvent(e);
                setDetailOpen(true);
              }}
            >
              {e.title}
            </button>
          ))}
        </div>
      </AppSingleActionModal>

      <AppDoubleActionModal
        title={editing ? '일정 수정' : '일정 추가'}
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        onConfirm={() => void submitForm()}
        confirmText={editing ? '저장' : '등록'}
        cancelText="취소"
        confirmLoading={createM.isPending || updateM.isPending}
        width={520}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="tw-px-5 tw-py-4 tw-pt-2">
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
                    options={teamOrganizationOptions}
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
      </AppDoubleActionModal>

      <AppDoubleActionModal
        title={'\uC77C\uC815 \uC0C1\uC138'}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailEvent(null);
        }}
        cancelText={'\uC0AD\uC81C'}
        confirmText={'\uC218\uC815'}
        cancelDanger
        cancelLoading={deleteM.isPending}
        cancelDisabled={(() => {
          const resolved = detailData ?? detailEvent;
          return !resolved || isApprovalCalendarEvent(resolved);
        })()}
        confirmDisabled={!detailData || isApprovalCalendarEvent(detailData)}
        onConfirm={() => {
          if (!detailData || isApprovalCalendarEvent(detailData)) return;
          setDetailOpen(false);
          setDetailEvent(null);
          openEdit(detailData);
        }}
        cancelAction={() => {
          const ev = detailData ?? detailEvent;
          if (!ev || isApprovalCalendarEvent(ev)) return;
          modal.confirm({
            title: '\uC77C\uC815\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?',
            content: '\uC0AD\uC81C\uD55C \uC77C\uC815\uC740 \uB418\uB3CC\uB9B4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
            okText: '\uC0AD\uC81C',
            cancelText: '\uCDE8\uC18C',
            okButtonProps: { danger: true, loading: deleteM.isPending },
            onOk: () => deleteM.mutateAsync(ev),
          });
        }}
        width={480}
      >
        <Spin spinning={detailLoading}>
          {detailData ? (
            <Space direction="vertical" className="tw-w-full tw-px-5 tw-py-4" size="middle">
              <div className="tw-flex tw-items-center tw-gap-2">
                <Typography.Text strong className="tw-text-lg">
                  {detailData.title}
                </Typography.Text>
                {isApprovalCalendarEvent(detailData) ? (
                  <Tag color="orange">{'\uACB0\uC7AC \uC5F0\uB3D9'}</Tag>
                ) : isTeamEvent(detailData) ? (
                  <Tag color="blue">{'\uD300'}</Tag>
                ) : (
                  <Tag>{'\uAC1C\uC778'}</Tag>
                )}
              </div>
              <Typography.Paragraph className="!tw-m-0 tw-whitespace-pre-wrap tw-text-slate-700">
                {detailData.description?.trim() || '-'}
              </Typography.Paragraph>
              <div className="tw-text-sm tw-text-slate-600">
                <div>{'\uC2DC\uC791'}: {dayjs(detailData.startAt).format('YYYY-MM-DD HH:mm')}</div>
                <div>{'\uC885\uB8CC'}: {dayjs(detailData.endAt).format('YYYY-MM-DD HH:mm')}</div>
                {detailData.memberName?.trim() ? <div>{'\uB300\uC0C1'}: {detailData.memberName.trim()}</div> : null}
                {detailData.eventTypeDescription?.trim() ? (
                  <div>{'\uC77C\uC815 \uC720\uD615'}: {detailData.eventTypeDescription.trim()}</div>
                ) : null}
                {!isTeamEvent(detailData) && !isApprovalCalendarEvent(detailData) && (
                  <div>{'\uACF5\uAC1C'}: {detailData.isPublicYn === 'NO' ? '\uBE44\uACF5\uAC1C' : '\uACF5\uAC1C'}</div>
                )}
                {isTeamEvent(detailData) && detailData.organizationId && (
                  <div>{'\uC870\uC9C1 ID'}: {detailData.organizationId}</div>
                )}
              </div>
            </Space>
          ) : (
            !detailLoading && (
              <div className="tw-px-5 tw-py-4">
                <Typography.Text type="secondary">{'\uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'}</Typography.Text>
              </div>
            )
          )}
        </Spin>
      </AppDoubleActionModal>
    </div>
  );
}
