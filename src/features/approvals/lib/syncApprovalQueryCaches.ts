import type { QueryClient } from '@tanstack/react-query';
import {
  type ApprovalRequestDetail,
  approvalRequestStillInMyPendingInbox,
} from '@/features/approvals/api/approvalRequestApi';

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
}
