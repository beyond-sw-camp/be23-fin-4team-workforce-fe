import { canAccessMemberDirectoryFromPermissionStrings } from '@/features/permissions/member-directory-access';
import { extractPermissionStringsFromJwtPayload } from '@/shared/auth/jwtPermissionStrings';
import { decodeJwtPayload, isSystemAdminFromJwtPayload } from '@/shared/auth/jwtTenantClaims';
import { getAuthSessionMirrorUser } from '@/shared/stores/authSessionMirrorStore';

/**
 * `X-User-IsHrAdmin` 헤더 값 판별.
 * - 세션 미러(`auth-client`와 동기화된 `Me`)가 있으면 병합된 permissions 기준
 * - 없으면 JWT 클레임만으로 폴백 (초기 요청 레이스 등)
 */
export function hasHrPermissionFromAuth(trimmedToken: string): boolean {
  const mirrored = getAuthSessionMirrorUser();
  if (mirrored) {
    if (mirrored.isSystemAdmin === true) return true;
    return canAccessMemberDirectoryFromPermissionStrings(mirrored.permissions);
  }

  const payload = decodeJwtPayload(trimmedToken);
  if (!payload) return false;
  if (isSystemAdminFromJwtPayload(payload)) return true;
  return canAccessMemberDirectoryFromPermissionStrings(extractPermissionStringsFromJwtPayload(payload));
}
