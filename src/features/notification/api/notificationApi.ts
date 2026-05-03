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
  | 'LEAVE_PROMOTION_FIRST'
  | 'LEAVE_PROMOTION_SECOND'
  | 'LEAVE_DESIGNATION'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_APPROVED'
  | 'APPROVAL_REJECTED'
  | 'GOAL_BUNDLE_REQUESTED'
  | 'GOAL_BUNDLE_APPROVED'
  | 'GOAL_BUNDLE_REJECTED'
  | 'GOAL_BUNDLE_WITHDRAWN'
  | 'SALARY_PUBLISHED'
  | 'GOAL_EVALUATED'
  | 'EVALUATION_REMINDER'
  | 'EVALUATION_REOPENED'
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
  | 'CONTRACT_REMIND'
  | 'CONTRACT_SENT'
  | 'CONTRACT_CANCELED'
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
  LEAVE_PROMOTION_FIRST: '연차 사용 1차 통보',
  LEAVE_PROMOTION_SECOND: '연차 사용 2차 통보',
  LEAVE_DESIGNATION: '연차 강제 지정',
  APPROVAL_REQUESTED: '결재 요청',
  APPROVAL_APPROVED: '결재 승인',
  APPROVAL_REJECTED: '결재 반려',
  APPROVAL_CANCELED: '결재 회수',
  APPROVAL_REFERENCED: '결재 참조 지정',
  APPROVAL_CIRCULATED: '결재 공람 도착',
  GOAL_BUNDLE_REQUESTED: '목표 승인 요청',
  GOAL_BUNDLE_APPROVED: '목표 승인 완료',
  GOAL_BUNDLE_REJECTED: '목표 승인 반려',
  GOAL_BUNDLE_WITHDRAWN: '목표 승인 회수',
  SALARY_PUBLISHED: '급여 명세서 발행',
  GOAL_EVALUATED: '목표 평가 완료',
  EVALUATION_REMINDER: '평가 미제출 안내',
  EVALUATION_REOPENED: '평가 재작성 가능',
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
  LABOR_LAW_WEEKLY_VIOLATION: '주 52시간 초과',
  CONTRACT_REMIND: '계약 서명 리마인드',
  CONTRACT_SENT: '전자계약 도착',
  CONTRACT_CANCELED: '계약 회수',
};

const GOAL_BUNDLE_TARGET_TYPE_KO: Record<string, string> = {
  GOAL_BUNDLE_REQUESTED: '목표 승인 요청',
  GOAL_BUNDLE_APPROVED: '목표 승인 완료',
  GOAL_BUNDLE_REJECTED: '목표 승인 반려',
  GOAL_BUNDLE_WITHDRAWN: '목표 승인 회수',
};

function normalizeYesNo(v: unknown): 'YES' | 'NO' {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'YES' || s === 'Y' || s === 'TRUE' ? 'YES' : 'NO';
}

function toNotificationItem(raw: unknown): NotificationItem {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = String(r.notificationType ?? r.type ?? 'UNKNOWN').trim();
  const targetType = typeof r.targetType === 'string' ? r.targetType.trim() : '';
  const targetIdRaw =
    r.targetId ??
    r.target_id ??
    r.contractId ??
    r.contract_id ??
    r.requestId ??
    r.request_id ??
    r.approvalRequestId ??
    r.approval_request_id;
  const title =
    (type === 'GOAL_EVALUATED' && targetType && GOAL_BUNDLE_TARGET_TYPE_KO[targetType]) ||
    NOTIFICATION_TYPE_KO[type] ||
    type;
  return {
    notificationId: String(r.notificationId ?? r.id ?? '').trim(),
    notificationType: type,
    title,
    content: String(r.content ?? '').trim(),
    targetId: typeof targetIdRaw === 'string' ? targetIdRaw.trim() || undefined : undefined,
    targetType: targetType || undefined,
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
    try {
      const response = await httpClient.get('/notification/unread-count');
      const payload = unwrapApiResponse<{ count?: number } | number>(response.data);
      if (typeof payload === 'number') {
        return payload;
      }
      return payload?.count ?? 0;
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      if (status === 404) return 0;
      throw e;
    }
  },
  async markAsRead(notificationId: string) {
    const response = await httpClient.patch(`/notification/${notificationId}/read`);
    return unwrapApiResponse<null>(response.data);
  },
  async markAllAsRead() {
    const response = await httpClient.patch('/notification/read-all');
    return unwrapApiResponse<null>(response.data);
  },
  async deleteNotification(notificationId: string) {
    const response = await httpClient.patch(`/notification/${encodeURIComponent(notificationId)}/delete`, null);
    return unwrapApiResponse<null>(response.data);
  },
  async deleteAllNotifications() {
    const response = await httpClient.patch('/notification/delete-all', null);
    return unwrapApiResponse<null>(response.data);
  },
  subscribe(onNotification: () => void) {
    const token = getAccessToken();
    const refreshIdentity = getRefreshIdentityHeaders();
    const userUuid = refreshIdentity['X-User-UUID'];
    if (!token || !userUuid) {
      return () => undefined;
    }

    /**
     * SSE 연결 관리자.
     * 주의:
     *   - EventSourcePolyfill 은 자체 자동 재연결을 지원한다.
     *   - onerror 에서 close() 를 호출하면 readyState=CLOSED 로 고정되어 영구 끊김.
     *     (네트워크 일시 단절 · 브라우저 절전 · 프록시 idle timeout 에서도 발생)
     *   - 따라서 onerror 에선 close() 를 하지 않고, 폴리필의 내부 재시도에 맡긴다.
     *   - fallback 경로(/api prefix) 는 "첫 연결" 이 실패한 경우에만 1회 전환.
     *   - unsubscribe 시에만 명시적으로 close().
     */
    let fallbackTried = false;
    let closed = false;
    let activeEs: EventSourcePolyfill | null = null;

    const attach = (path: string): EventSourcePolyfill => {
      // 재연결 시 최신 lastEventId 를 매번 새로 읽어 Last-Event-ID 헤더로 전송.
      const lastEventId = readLastEventId();
      const es = new EventSourcePolyfill(`${env.VITE_API_BASE_URL}${path}`, {
        withCredentials: true,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-UUID': userUuid,
          ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
        },
        // 서버 heartbeat 주기(30s) 에 대비해 여유 있게 설정.
        // 이 시간 내 heartbeat 가 없으면 폴리필이 재연결을 시도한다.
        heartbeatTimeout: 120_000,
      });

      es.addEventListener('connect', (event) => {
        writeLastEventId((event as MessageEvent).lastEventId);
      });
      es.addEventListener('heartbeat', (event) => {
        writeLastEventId((event as MessageEvent).lastEventId);
      });
      es.addEventListener('notification', (event) => {
        writeLastEventId((event as MessageEvent).lastEventId);
        onNotification();
      });

      es.onerror = (err) => {
        if (closed) return;
        // 첫 연결이 실패했을 때만 /api prefix 경로로 fallback.
        if (!fallbackTried && es.readyState === EventSourcePolyfill.CLOSED) {
          fallbackTried = true;
          try { es.close(); } catch { /* noop */ }
          activeEs = attach('/api/notification/subscribe');
          return;
        }
        // 그 외 모든 에러는 폴리필의 자동 재연결에 맡긴다. close() 하지 않는다.
        if (typeof console !== 'undefined') {
          console.warn('[notification SSE] 일시 에러 — 자동 재연결 대기', err);
        }
      };

      return es;
    };

    activeEs = attach('/notification/subscribe');

    return () => {
      closed = true;
      try { activeEs?.close(); } catch { /* noop */ }
    };
  },
};
