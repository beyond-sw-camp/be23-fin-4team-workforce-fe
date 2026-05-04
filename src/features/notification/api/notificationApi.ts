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
  | 'CONTRACT_SIGNED'
  | 'CONTRACT_CANCELED'
  | 'CONTRACT_EXPIRED'
  | 'CONTRACT_DECLINED'
  | 'CONTRACT_REJECTED'
  | 'CONTRACT_COMPLETED'
  | 'CONTRACT_VIEWED'
  | 'WORK_TRIP_REQUESTED'
  | 'WORK_TRIP_APPROVED'
  | 'WORK_TRIP_REJECTED'
  | 'WORK_TRIP_CANCELED'
  | 'BUSINESS_TRIP_REQUESTED'
  | 'OVERTIME_REQUESTED'
  | 'OVERTIME_APPROVED'
  | 'OVERTIME_REJECTED'
  | 'OVERTIME_CANCELED'
  | 'MEETING_SCHEDULED'
  | 'MEETING_REMINDER'
  | 'MEETING_CANCELED'
  | 'MEETING_COMPLETED'
  | 'MEETING_REQUESTED'
  | 'APPROVAL_REMINDER'
  | 'APPROVAL_DELEGATED'
  | 'LEAVE_CANCELED'
  | 'LEAVE_CANCELLED'
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
  CONTRACT_SIGNED: '전자계약 서명 완료',
  CONTRACT_CANCELED: '계약 회수',
  CONTRACT_EXPIRED: '전자계약 만료',
  CONTRACT_DECLINED: '전자계약 거절',
  CONTRACT_REJECTED: '전자계약 반려',
  CONTRACT_COMPLETED: '전자계약 완료',
  CONTRACT_VIEWED: '전자계약 열람',
  WORK_TRIP_REQUESTED: '출장 신청',
  WORK_TRIP_APPROVED: '출장 승인',
  WORK_TRIP_REJECTED: '출장 반려',
  WORK_TRIP_CANCELED: '출장 취소',
  BUSINESS_TRIP_REQUESTED: '출장 신청',
  OVERTIME_REQUESTED: '연장근무 신청',
  OVERTIME_APPROVED: '연장근무 승인',
  OVERTIME_REJECTED: '연장근무 반려',
  OVERTIME_CANCELED: '연장근무 취소',
  MEETING_SCHEDULED: '면담 예약',
  MEETING_REMINDER: '면담 알림',
  MEETING_CANCELED: '면담 취소',
  MEETING_COMPLETED: '면담 완료',
  MEETING_REQUESTED: '면담 요청',
  APPROVAL_REMINDER: '결재 리마인드',
  APPROVAL_DELEGATED: '결재 위임',
  LEAVE_CANCELED: '휴가 신청 취소',
  LEAVE_CANCELLED: '휴가 신청 취소',
  UNKNOWN: '알림',
};

const GOAL_BUNDLE_TARGET_TYPE_KO: Record<string, string> = {
  GOAL_BUNDLE_REQUESTED: '목표 승인 요청',
  GOAL_BUNDLE_APPROVED: '목표 승인 완료',
  GOAL_BUNDLE_REJECTED: '목표 승인 반려',
  GOAL_BUNDLE_WITHDRAWN: '목표 승인 회수',
};

/** NOTIFICATION_TYPE_KO 에 없는 SCREAMING_SNAKE_CASE 용 토큰별 한글 (순서대로 이어서 표시) */
const NOTIFICATION_TOKEN_KO: Record<string, string> = {
  APPROVAL: '결재',
  ATTENDANCE: '근태',
  MODIFIED: '수정',
  LEAVE: '휴가',
  REQUESTED: '요청',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
  CANCELLED: '취소',
  WITHDRAWN: '회수',
  REFERENCED: '참조 지정',
  CIRCULATED: '공람',
  REMIND: '리마인드',
  REMINDER: '알림',
  PROMOTION: '사용 통보',
  FIRST: '1차',
  SECOND: '2차',
  DESIGNATION: '지정',
  GOAL: '목표',
  BUNDLE: '묶음',
  SALARY: '급여',
  PUBLISHED: '발행',
  EVALUATED: '평가 완료',
  EVALUATION: '평가',
  REOPENED: '재작성',
  MEMBER: '구성원',
  DORMANT: '휴직',
  RETURN: '복직',
  ESG: 'ESG',
  ACTIVITY: '활동',
  POINT: '포인트',
  EARNED: '적립',
  CAMPAIGN: '캠페인',
  STARTED: '시작',
  CLOSED: '종료',
  SHOP: '샵',
  ORDER: '주문',
  COMPLETE: '완료',
  COMPLETED: '완료',
  CALENDAR: '캘린더',
  TEAM: '팀',
  EVENT: '일정',
  CREATED: '등록',
  ROLE: '역할',
  CHANGED: '변경',
  INFO: '정보',
  UPDATED: '수정',
  LABOR: '노동',
  LAW: '법',
  WEEKLY: '주간',
  VIOLATION: '위반',
  SENT: '도착',
  SIGNED: '서명',
  CONTRACT: '전자계약',
  MEETING: '면담',
  OVERTIME: '연장근무',
  WORK: '업무',
  TRIP: '출장',
  BUSINESS: '출장',
  DOMESTIC: '국내',
  INTERNATIONAL: '해외',
  SCHEDULED: '예약',
  FLEXIBLE: '유연근무',
  PAYROLL: '급여',
  ADJUSTED: '조정',
  RECALCULATED: '재계산',
  INVITED: '초대',
  JOINED: '가입',
  LEFT: '퇴사',
  SYSTEM: '시스템',
  BOARD: '게시판',
  POST: '게시',
  ANNOUNCEMENT: '공지',
  OFFICIAL: '공문',
  DOCUMENT: '문서',
  PRIVACY: '개인정보',
  CONSENT: '동의',
  EMPLOYMENT: '고용',
  NDA: '비밀유지',
  PENDING: '대기',
  DELEGATED: '위임',
  COMMENT: '댓글',
  VIEWED: '열람',
  DECLINED: '거절',
  EXPIRED: '만료',
  RECALL: '회수',
  NOTICE: '공지',
  SUBMITTED: '제출',
  IMPORTED: '가져오기',
  EXPORTED: '보내기',
  SYNC: '동기화',
  ALERT: '알림',
  WARNING: '경고',
  FAILED: '실패',
  SUCCESS: '성공',
  TARGET: '대상',
  SOURCE: '출처',
  NEW: '신규',
  DRAFT: '임시저장',
  ARCHIVED: '보관',
  RESTORED: '복원',
  TRANSFER: '이동',
  ASSIGN: '배정',
  ASSIGNMENT: '배정',
  SLOT: '슬롯',
  SLOTS: '슬롯',
  REQUEST: '요청',
};

function titleFromSnakeCaseTokens(upperType: string): string {
  if (!/^[A-Z0-9_]+$/.test(upperType)) return upperType;
  const pieces = upperType.split('_').filter(Boolean);
  const parts: string[] = [];
  for (const p of pieces) {
    const k = NOTIFICATION_TOKEN_KO[p];
    if (k) parts.push(k);
  }
  if (parts.length === 0) return '알림';
  return parts.join(' ');
}

function normalizeYesNo(v: unknown): 'YES' | 'NO' {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'YES' || s === 'Y' || s === 'TRUE' ? 'YES' : 'NO';
}

function toNotificationItem(raw: unknown): NotificationItem {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = String(r.notificationType ?? r.type ?? 'UNKNOWN')
    .trim()
    .toUpperCase();
  const targetTypeRaw = typeof r.targetType === 'string' ? r.targetType.trim() : '';
  const targetType = targetTypeRaw.toUpperCase();
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
    titleFromSnakeCaseTokens(type);
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
