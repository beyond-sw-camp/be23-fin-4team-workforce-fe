import { APPROVAL_REQUEST_TYPES, type ApprovalRequestType } from '@/features/approvals/api/approvalApi';

/** 표준 결재 요청 유형 UI 한글명 (백엔드 enum과 동일) */
export const APPROVAL_REQUEST_TYPE_LABEL_KO: Record<ApprovalRequestType, string> = {
  VACATION: '휴가',
  ATTENDANCE: '근태',
  HR: '인사',
  BUSINESS_TRIP: '출장',
  GENERAL: '일반기안',
  OFFICIAL: '공문',
};

/** 구버전·DB 잔존 코드 → 표시용 한글 */
const LEGACY_REQUEST_TYPE_LABEL_KO: Record<string, string> = {
  HR_MOVEMENT: '인사',
  SALARY: '급여',
  CONTRACT: '전자계약',
  CERTIFICATE: '문서발급',
};

/**
 * API·양식에 올 수 있는 requestType 코드를 UI용 한글로 변환합니다.
 * 알 수 없는 값은 '기타'로 표시합니다.
 */
export function approvalRequestTypeLabelKo(raw: string | undefined | null): string {
  const u = String(raw ?? '').trim().toUpperCase();
  if (!u || u === '—') return '—';
  if ((APPROVAL_REQUEST_TYPES as readonly string[]).includes(u)) {
    return APPROVAL_REQUEST_TYPE_LABEL_KO[u as ApprovalRequestType];
  }
  return LEGACY_REQUEST_TYPE_LABEL_KO[u] ?? '기타';
}
