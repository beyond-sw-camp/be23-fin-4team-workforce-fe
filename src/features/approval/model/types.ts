export type BundleApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
export type GoalApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED';

export type GoalApprovalBundle = {
  bundleId: string;
  companyId: string;
  requestedBy: string;
  requestedAt: string;
  cycleKey: string;
  revision: number;
  originalBundleId?: string | null;
  weightSumSnapshot: number;
  status: BundleApprovalStatus;
  decision: GoalApprovalDecision;
  approverId: string;
  delegateApproverId?: string | null;
  decidedAt?: string | null;
  commentText?: string | null;
  rejectionReason?: string | null;
  lastRejectedReason?: string | null;
  goalIds: string[];
  affectedGoalIds: string[];
  watcherIds: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type SubmitCyclePayload = {
  approverId?: string | null;
  watcherIds?: string[];
};
export type ApprovePayload = { comment?: string };
export type RejectPayload = { reason: string; affectedGoalIds?: string[] };
export type DelegatePayload = { delegateApproverId: string };
