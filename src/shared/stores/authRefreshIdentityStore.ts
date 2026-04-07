import { decodeJwtPayload } from '@/shared/auth/jwtTenantClaims';
import { getAccessToken } from '@/shared/stores/authTokenStore';

const MEMBER_ID_KEY = 'workforce.refreshMemberId';
const POSITION_ID_KEY = 'workforce.refreshMemberPositionId';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function setRefreshIdentity(memberId: string | null, memberPositionId: string | null) {
  if (!canUseStorage()) return;
  if (memberId) {
    window.localStorage.setItem(MEMBER_ID_KEY, memberId);
  } else {
    window.localStorage.removeItem(MEMBER_ID_KEY);
  }
  if (memberPositionId) {
    window.localStorage.setItem(POSITION_ID_KEY, memberPositionId);
  } else {
    window.localStorage.removeItem(POSITION_ID_KEY);
  }
}

export function clearRefreshIdentity() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(MEMBER_ID_KEY);
  window.localStorage.removeItem(POSITION_ID_KEY);
}

/**
 * POST /member/generate-at 에 필요한 헤더 값.
 * 로그인 시 저장하고, 없으면 현재 AT JWT 클레임에서 보완합니다.
 */
export function getRefreshIdentityHeaders(): { 'X-User-UUID'?: string; 'X-User-MemberPositionId'?: string } {
  let memberId: string | null = null;
  let memberPositionId: string | null = null;

  if (canUseStorage()) {
    memberId = window.localStorage.getItem(MEMBER_ID_KEY);
    memberPositionId = window.localStorage.getItem(POSITION_ID_KEY);
  }

  const token = getAccessToken();
  const payload = token ? decodeJwtPayload(token) : null;
  if (!memberId && payload) {
    const m =
      (typeof payload.memberId === 'string' && payload.memberId) ||
      (typeof payload.sub === 'string' && payload.sub) ||
      (typeof payload.id === 'string' && payload.id);
    memberId = m || null;
  }
  if (!memberPositionId && payload) {
    const p =
      (typeof payload.memberPositionId === 'string' && payload.memberPositionId) ||
      (typeof payload.member_position_id === 'string' && payload.member_position_id);
    memberPositionId = p || null;
  }

  const out: { 'X-User-UUID'?: string; 'X-User-MemberPositionId'?: string } = {};
  if (memberId) out['X-User-UUID'] = memberId;
  if (memberPositionId) out['X-User-MemberPositionId'] = memberPositionId;
  return out;
}
