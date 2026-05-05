import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export type YnFlag = 'YES' | 'NO';

export type CreatePersonalCalendarPayload = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  isPublicYn: YnFlag;
};

export type CreateTeamCalendarPayload = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  organizationId: string;
};

export type CalendarEventScope = 'personal' | 'team';

/** 목록 조회 쿼리 `eventType` (생략 시 개인+팀+결재 연동 전체) */
export type CalendarListEventTypeParam = 'PERSONAL' | 'TEAM' | 'APPROVAL';

export type CalendarEvent = {
  eventId: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  isPublicYn?: YnFlag;
  organizationId?: string | null;
  /** API가 주면 삭제·수정 시 엔드포인트 선택에 사용 */
  scope?: CalendarEventScope;
  /** PERSONAL | TEAM | APPROVAL 등 */
  eventType?: string;
  eventTypeDescription?: string | null;
  memberName?: string | null;
};

export type CalendarHoliday = {
  holidayDate: string;
  holidayName: string;
};

export type CalendarMonthResponse = {
  events: CalendarEvent[];
  holidays: CalendarHoliday[];
};

function pickEventId(raw: Record<string, unknown>): string {
  const v = raw.eventId ?? raw.id ?? raw.calendarEventId ?? raw.event_id;
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function normalizeEvent(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const eventId = pickEventId(r);
  const titleRaw = r.title ?? r.eventTitle ?? r.subject ?? r.eventName ?? r.summary ?? r.name;
  const title =
    typeof titleRaw === 'string'
      ? titleRaw.trim()
      : titleRaw != null && String(titleRaw).trim()
        ? String(titleRaw).trim()
        : '';
  const startAt = r.startAt ?? r.start_at;
  const endAt = r.endAt ?? r.end_at;
  if (!eventId || !title || typeof startAt !== 'string' || typeof endAt !== 'string') {
    return null;
  }
  const desc = r.description;
  const orgId = r.organizationId ?? r.organization_id ?? r.organizerId ?? r.organizer_id;
  const scopeRaw = r.scope ?? r.eventScope ?? r.event_scope ?? r.calendarType ?? r.calendar_type;
  const eventTypeRaw = r.eventType ?? r.event_type;
  const eventType = typeof eventTypeRaw === 'string' ? eventTypeRaw.trim() : undefined;
  let scope: CalendarEventScope | undefined;
  if (String(eventType).toUpperCase() === 'APPROVAL') {
    scope = undefined;
  } else if (scopeRaw === 'personal' || scopeRaw === 'PERSONAL') scope = 'personal';
  else if (scopeRaw === 'team' || scopeRaw === 'TEAM') scope = 'team';
  if (!scope && String(eventType).toUpperCase() !== 'APPROVAL') {
    if (typeof orgId === 'string' && orgId.trim()) scope = 'team';
    else if (r.isPublicYn != null || r.is_public_yn != null) scope = 'personal';
  }

  const eventTypeDescriptionRaw = r.eventTypeDescription ?? r.event_type_description;
  const memberNameRaw = r.memberName ?? r.member_name;

  return {
    eventId,
    title,
    description: typeof desc === 'string' ? desc : desc == null ? null : String(desc),
    startAt,
    endAt,
    isPublicYn: (r.isPublicYn ?? r.is_public_yn) as YnFlag | undefined,
    organizationId: typeof orgId === 'string' ? orgId : null,
    scope,
    ...(eventType ? { eventType } : {}),
    ...(typeof eventTypeDescriptionRaw === 'string' && eventTypeDescriptionRaw.trim()
      ? { eventTypeDescription: eventTypeDescriptionRaw.trim() }
      : {}),
    ...(typeof memberNameRaw === 'string' && memberNameRaw.trim() ? { memberName: memberNameRaw.trim() } : {}),
  };
}

function normalizeHoliday(raw: unknown): CalendarHoliday | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const holidayDate = r.holidayDate ?? r.date;
  const holidayName = r.holidayName ?? r.name;
  if (typeof holidayDate !== 'string' || typeof holidayName !== 'string') return null;
  return {
    holidayDate,
    holidayName,
  };
}

function normalizeListPayload(raw: unknown, depth = 0): unknown[] {
  if (depth > 8) return [];
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const k of ['list', 'items', 'events', 'content', 'data', 'rows', 'calendarList']) {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const inner = normalizeListPayload(v, depth + 1);
      if (inner.length) return inner;
    }
  }
  return [];
}

function listQueryParams(eventType?: CalendarListEventTypeParam) {
  return eventType ? { eventType } : {};
}

/** 월/주/일 API에서 같은 일정이 중복 내려오는 경우를 제거 */
function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const e of events) {
    const key = `${e.eventId}|${e.startAt}|${e.endAt}|${String(e.eventType ?? '').toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

async function fetchCalendarList(
  url: string,
  params: Record<string, string | number | undefined>,
) {
  const response = await httpClient.get(url, { params });
  const unwrapped = unwrapApiResponse<unknown>(response.data);
  const arr = normalizeListPayload(unwrapped);
  return dedupeEvents(arr.map(normalizeEvent).filter((e): e is CalendarEvent => e != null));
}

async function fetchCalendarMonth(
  year: number,
  month: number,
  eventType?: CalendarListEventTypeParam,
): Promise<CalendarMonthResponse> {
  const response = await httpClient.get('/calendar', {
    params: {
      year,
      month,
      ...listQueryParams(eventType),
    },
  });
  const unwrapped = unwrapApiResponse<unknown>(response.data);

  const events = dedupeEvents(
    normalizeListPayload(unwrapped).map(normalizeEvent).filter((e): e is CalendarEvent => e != null),
  );
  let holidays: CalendarHoliday[] = [];

  if (unwrapped && typeof unwrapped === 'object') {
    const holidayRaw = (unwrapped as Record<string, unknown>).holidays;
    if (Array.isArray(holidayRaw)) {
      holidays = holidayRaw.map(normalizeHoliday).filter((h): h is CalendarHoliday => h != null);
    }
  }

  return { events, holidays };
}

export const calendarApi = {
  /** GET /calendar/daily?date=YYYY-MM-DD[&eventType=] */
  async listDaily(date: string, eventType?: CalendarListEventTypeParam) {
    return fetchCalendarList('/calendar/daily', {
      date,
      ...listQueryParams(eventType),
    });
  },

  /** GET /calendar/weekly?date=YYYY-MM-DD[&eventType=] (해당 날짜가 속한 주 월~일) */
  async listWeekly(date: string, eventType?: CalendarListEventTypeParam) {
    return fetchCalendarList('/calendar/weekly', {
      date,
      ...listQueryParams(eventType),
    });
  },

  /** GET /calendar?year=&month=[&eventType=] */
  async listMonth(year: number, month: number, eventType?: CalendarListEventTypeParam) {
    return fetchCalendarMonth(year, month, eventType);
  },

  /** GET /calendar/upcoming?from=YYYY-MM-DD&limit=4[&eventType=] */
  async listUpcoming(from: string, limit = 4, eventType?: CalendarListEventTypeParam) {
    return fetchCalendarList('/calendar/upcoming', {
      from,
      limit,
      ...listQueryParams(eventType),
    });
  },

  async detail(eventId: string) {
    const response = await httpClient.get(`/calendar/${encodeURIComponent(eventId)}`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const e = normalizeEvent(unwrapped);
    if (!e) {
      throw new Error('일정 정보를 해석할 수 없습니다.');
    }
    return e;
  },

  async createPersonal(payload: CreatePersonalCalendarPayload) {
    await httpClient.post('/calendar/personal', payload);
  },

  async createTeam(payload: CreateTeamCalendarPayload) {
    await httpClient.post('/calendar/team', payload);
  },

  async updatePersonal(eventId: string, payload: CreatePersonalCalendarPayload) {
    await httpClient.put(`/calendar/personal/${encodeURIComponent(eventId)}`, payload);
  },

  async updateTeam(eventId: string, payload: CreateTeamCalendarPayload) {
    await httpClient.put(`/calendar/team/${encodeURIComponent(eventId)}`, payload);
  },

  async deletePersonal(eventId: string) {
    await httpClient.delete(`/calendar/personal/${encodeURIComponent(eventId)}`);
  },

  async deleteTeam(eventId: string) {
    await httpClient.delete(`/calendar/team/${encodeURIComponent(eventId)}`);
  },
};
