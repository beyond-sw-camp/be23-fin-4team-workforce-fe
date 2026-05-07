import type { QueryClient } from '@tanstack/react-query';
import {
  type ApprovalRequestDetail,
  approvalRequestStillInMyPendingInbox,
} from '@/features/approvals/api/approvalRequestApi';

export const APPROVAL_REQUEST_CHANGED_EVENT = 'workforce:approval-request-changed';
export const APPROVAL_REQUEST_CHANGED_MESSAGE = 'workforce:approval-request-changed';

type ApprovalRequestChangedPayload = {
  type: typeof APPROVAL_REQUEST_CHANGED_MESSAGE;
  requestId: string;
  requestStatus?: string;
};

function queryKeyPartHasApproval(value: unknown): boolean {
  if (typeof value === 'string') return value.toLowerCase().includes('approval');
  if (Array.isArray(value)) return value.some(queryKeyPartHasApproval);
  return false;
}

function isApprovalQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey.some(queryKeyPartHasApproval);
}

export async function invalidateApprovalRequestQueries(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ predicate: (query) => isApprovalQueryKey(query.queryKey) }),
    qc.invalidateQueries({ queryKey: ['calendar'] }),
  ]);
}

export function notifyApprovalRequestChanged(detail: ApprovalRequestDetail): void {
  if (typeof window === 'undefined') return;

  const payload: ApprovalRequestChangedPayload = {
    type: APPROVAL_REQUEST_CHANGED_MESSAGE,
    requestId: detail.requestId,
    requestStatus: String(detail.requestStatus ?? ''),
  };

  window.dispatchEvent(new CustomEvent<ApprovalRequestChangedPayload>(APPROVAL_REQUEST_CHANGED_EVENT, { detail: payload }));

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, window.location.origin);
    }
  } catch {
    // Cross-window sync is best effort. The current window cache was already updated.
  }
}

/**
 * 승인/반려 PATCH 응답(최신 ApprovalRequestResDto)으로 목록·상세 캐시를 맞춤.
 * `isProxyYn`·`actualApprover*` 등이 즉시 반영되도록 함.
 */
export function syncApprovalQueryCachesAfterAct(
  qc: QueryClient,
  detail: ApprovalRequestDetail,
  opts: { myMemberId?: string; myMemberPositionId?: string },
): void {
  const rid = detail.requestId.trim();
  if (!rid) return;

  const keepInPending = approvalRequestStillInMyPendingInbox(detail, opts);

  qc.setQueryData<ApprovalRequestDetail[]>(['approval-user', 'pending-approvals'], (old) => {
    if (!old) return old;
    if (keepInPending) {
      const i = old.findIndex((r) => r.requestId === rid);
      if (i === -1) return [...old, detail];
      const next = [...old];
      next[i] = detail;
      return next;
    }
    return old.filter((r) => r.requestId !== rid);
  });

  qc.setQueryData<ApprovalRequestDetail[]>(['approval-user', 'acted-approvals'], (old) => {
    if (!old?.length) return [detail];
    const i = old.findIndex((r) => r.requestId === rid);
    if (i === -1) return [detail, ...old];
    const next = [...old];
    next[i] = detail;
    return next;
  });

  qc.setQueriesData<ApprovalRequestDetail[]>({ queryKey: ['approval-user', 'my-requests'], exact: false }, (old) => {
    if (!old) return old;
    const i = old.findIndex((r) => r.requestId === rid);
    if (i === -1) return old;
    const next = [...old];
    next[i] = detail;
    return next;
  });

  qc.setQueryData<ApprovalRequestDetail>(['approval-user', 'request-detail', rid], detail);

  void qc.invalidateQueries({ queryKey: ['approval-user', 'approval-inbox'] });
  void qc.invalidateQueries({ queryKey: ['approval-user', 'approval-waiting'] });

  /** 최종 승인 시 서버가 결재 연동 캘린더 일정을 만들 수 있으므로 캘린더 목록을 다시 불러오게 함 */
  const terminal = String(detail.requestStatus ?? '').toUpperCase();
  if (terminal === 'APPROVED' || terminal === 'REJECTED' || terminal === 'CANCELED') {
    void qc.invalidateQueries({ queryKey: ['calendar'] });
  }
}
