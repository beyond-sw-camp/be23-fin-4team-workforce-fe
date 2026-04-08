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

/** 목록 조회 쿼리 `eventType` (생략 시 개인+팀 전체) */
export type CalendarListEventTypeParam = 'PERSONAL' | 'TEAM';

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
};

function pickEventId(raw: Record<string, unknown>): string {
  const v = raw.eventId ?? raw.id ?? raw.calendarEventId ?? raw.event_id;
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function normalizeEvent(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const eventId = pickEventId(r);
  const title = r.title;
  const startAt = r.startAt ?? r.start_at;
  const endAt = r.endAt ?? r.end_at;
  if (!eventId || typeof title !== 'string' || typeof startAt !== 'string' || typeof endAt !== 'string') {
    return null;
  }
  const desc = r.description;
  const orgId = r.organizationId ?? r.organization_id;
  const scopeRaw = r.scope ?? r.eventScope ?? r.event_scope ?? r.calendarType ?? r.calendar_type;
  let scope: CalendarEventScope | undefined;
  if (scopeRaw === 'personal' || scopeRaw === 'PERSONAL') scope = 'personal';
  if (scopeRaw === 'team' || scopeRaw === 'TEAM') scope = 'team';
  if (!scope && typeof orgId === 'string' && orgId.trim()) scope = 'team';
  if (!scope && (r.isPublicYn != null || r.is_public_yn != null)) scope = 'personal';

  return {
    eventId,
    title,
    description: typeof desc === 'string' ? desc : desc == null ? null : String(desc),
    startAt,
    endAt,
    isPublicYn: (r.isPublicYn ?? r.is_public_yn) as YnFlag | undefined,
    organizationId: typeof orgId === 'string' ? orgId : null,
    scope,
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

async function fetchCalendarList(
  url: string,
  params: Record<string, string | number | undefined>,
) {
  const response = await httpClient.get(url, { params });
  const unwrapped = unwrapApiResponse<unknown>(response.data);
  const arr = normalizeListPayload(unwrapped);
  return arr.map(normalizeEvent).filter((e): e is CalendarEvent => e != null);
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
    return fetchCalendarList('/calendar', {
      year,
      month,
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
