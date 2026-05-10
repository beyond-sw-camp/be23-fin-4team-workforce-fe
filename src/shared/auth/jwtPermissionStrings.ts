import { normalizePermissionSources } from '@/features/permissions/normalize-permission-codes';

/** `decodeMeFromAccessToken` 과 동일한 JWT 필드에서 권한 문자열 수집 — 인터셉터 폴백용 */
export function extractPermissionStringsFromJwtPayload(jwtPayload: Record<string, unknown>): string[] {
  const permissionsRaw =
    jwtPayload.permissions ??
    jwtPayload.perms ??
    jwtPayload.permissionCodes ??
    jwtPayload.grantedPermissions ??
    jwtPayload.authorities ??
    jwtPayload.roles;

  const memberNested =
    jwtPayload.member && typeof jwtPayload.member === 'object'
      ? (jwtPayload.member as Record<string, unknown>).permissions
      : undefined;

  return normalizePermissionSources(
    permissionsRaw,
    jwtPayload.permissionList,
    jwtPayload.memberPermissions,
    jwtPayload.rolePermissions,
    memberNested,
  );
}
