import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';
import { env } from '@/app/config/env';
import { getRefreshIdentityHeaders } from '@/shared/stores/authRefreshIdentityStore';
import { getAccessToken } from '@/shared/stores/authTokenStore';
import { EventSourcePolyfill } from 'event-source-polyfill';

export type NotificationType =
  | 'ATTENDANCE_MODIFIED'
  | 'LEAVE_REQUESTED'
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_APPROVED'
  | 'APPROVAL_REJECTED'
  | 'SALARY_PUBLISHED'
  | 'GOAL_EVALUATED'
  | 'MEMBER_DORMANT'
  | 'MEMBER_RETURN'
  | 'ESG_ACTIVITY_APPROVED'
  | 'ESG_ACTIVITY_REJECTED'
  | 'ESG_POINT_EARNED'
  | 'ESG_CAMPAIGN_STARTED'
  | 'ESG_CAMPAIGN_CLOSED'
  | 'ESG_SHOP_ORDER_COMPLETE'
  | 'CALENDAR_TEAM_EVENT_CREATED'
  | 'MEMBER_ROLE_CHANGED'
  | 'MEMBER_INFO_UPDATED'
  | string;

export type NotificationItem = {
  notificationId: string;
  notificationType: NotificationType;
  title: string;
  content: string;
  targetId?: string;
  targetType?: string;
  isRead: 'YES' | 'NO';
  createdAt?: string;
};

const LAST_EVENT_ID_KEY = 'workforce.notification.lastEventId';

const NOTIFICATION_TYPE_KO: Record<string, string> = {
  ATTENDANCE_MODIFIED: '근태 수정',
  LEAVE_REQUESTED: '연차 신청',
  LEAVE_APPROVED: '연차 승인',
  LEAVE_REJECTED: '연차 반려',
  APPROVAL_REQUESTED: '결재 요청',
  APPROVAL_APPROVED: '결재 승인',
  APPROVAL_REJECTED: '결재 반려',
  SALARY_PUBLISHED: '급여 명세서 발행',
  GOAL_EVALUATED: '목표 평가 완료',
  MEMBER_DORMANT: '휴직 처리',
  MEMBER_RETURN: '복직 처리',
  ESG_ACTIVITY_APPROVED: '활동 승인됨',
  ESG_ACTIVITY_REJECTED: '활동 반려됨',
  ESG_POINT_EARNED: '포인트 적립됨',
  ESG_CAMPAIGN_STARTED: '캠페인 시작',
  ESG_CAMPAIGN_CLOSED: '캠페인 종료',
  ESG_SHOP_ORDER_COMPLETE: '물품 구매 완료',
  CALENDAR_TEAM_EVENT_CREATED: '팀 일정 등록됨',
  MEMBER_ROLE_CHANGED: '역할 변경됨',
  MEMBER_INFO_UPDATED: '인사 정보 수정됨',
};

function normalizeYesNo(v: unknown): 'YES' | 'NO' {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'YES' || s === 'Y' || s === 'TRUE' ? 'YES' : 'NO';
}

function toNotificationItem(raw: unknown): NotificationItem {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = String(r.notificationType ?? r.type ?? 'UNKNOWN').trim();
  return {
    notificationId: String(r.notificationId ?? r.id ?? '').trim(),
    notificationType: type,
    title: NOTIFICATION_TYPE_KO[type] ?? type,
    content: String(r.content ?? '').trim(),
    targetId: typeof r.targetId === 'string' ? r.targetId : undefined,
    targetType: typeof r.targetType === 'string' ? r.targetType : undefined,
    isRead: normalizeYesNo(r.isRead ?? r.readYn ?? r.read),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : undefined,
  };
}

function readLastEventId(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const v = window.localStorage.getItem(LAST_EVENT_ID_KEY);
  return v && v.trim() ? v.trim() : null;
}

function writeLastEventId(eventId: string | null | undefined) {
  if (!eventId || typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(LAST_EVENT_ID_KEY, eventId);
}

export const notificationApi = {
  async list() {
    const response = await httpClient.get('/notification/list');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return Array.isArray(unwrapped) ? unwrapped.map(toNotificationItem) : [];
  },
  async unreadCount() {
    const response = await httpClient.get('/notification/unread-count');
    const payload = unwrapApiResponse<{ count?: number } | number>(response.data);
    if (typeof payload === 'number') {
      return payload;
    }
    return payload?.count ?? 0;
  },
  async markAsRead(notificationId: string) {
    const response = await httpClient.patch(`/notification/${notificationId}/read`);
    return unwrapApiResponse<null>(response.data);
  },
  async markAllAsRead() {
    const response = await httpClient.patch('/notification/read-all');
    return unwrapApiResponse<null>(response.data);
  },
  subscribe(onNotification: () => void) {
    const token = getAccessToken();
    const refreshIdentity = getRefreshIdentityHeaders();
    const userUuid = refreshIdentity['X-User-UUID'];
    if (!token || !userUuid) {
      return () => undefined;
    }
    const lastEventId = readLastEventId();
    const eventSource = new EventSourcePolyfill(`${env.VITE_API_BASE_URL}/notification/subscribe`, {
      withCredentials: true,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-User-UUID': userUuid,
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      },
    });

    eventSource.addEventListener('connect', (event) => {
      writeLastEventId((event as MessageEvent).lastEventId);
    });
    eventSource.addEventListener('heartbeat', (event) => {
      writeLastEventId((event as MessageEvent).lastEventId);
    });
    eventSource.addEventListener('notification', (event) => {
      writeLastEventId((event as MessageEvent).lastEventId);
      onNotification();
    });
    eventSource.onerror = () => {
      eventSource.close();
    };
    return () => eventSource.close();
  },
};
