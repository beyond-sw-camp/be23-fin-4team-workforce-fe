import type {
  ApprovalSearchRequestType,
  ApprovalSearchStatus,
} from '@/features/approvals/api/approvalSearchApi';

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

export const APPROVAL_TYPE_LABEL: Record<ApprovalSearchRequestType, string> = {
  VACATION: '휴가',
  ATTENDANCE: '근태',
  HR_MOVEMENT: '인사이동',
  SALARY: '급여',
  GENERAL: '일반기안',
  CONTRACT: '전자계약',
  CERTIFICATE: '증명서',
  OFFICIAL: '공문',
};
