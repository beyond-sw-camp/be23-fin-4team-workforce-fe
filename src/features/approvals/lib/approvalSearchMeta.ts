import type {
  ApprovalSearchRequestType,
  ApprovalSearchStatus,
} from '@/features/approvals/api/approvalSearchApi';
import { APPROVAL_REQUEST_TYPE_LABEL_KO } from '@/features/approvals/lib/approvalRequestTypeKo';

export const APPROVAL_STATUS_LABEL: Record<ApprovalSearchStatus, string> = {
  DRAFT: '임시저장',
  WAIT: '결재대기',
  PENDING: '진행중',
  APPROVED: '승인완료',
  REJECTED: '반려',
};

export const APPROVAL_STATUS_COLOR: Record<ApprovalSearchStatus, string> = {
  DRAFT: 'default',
  WAIT: 'blue',
  PENDING: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
};

export const APPROVAL_TYPE_LABEL = APPROVAL_REQUEST_TYPE_LABEL_KO as Record<
  ApprovalSearchRequestType,
  string
>;
