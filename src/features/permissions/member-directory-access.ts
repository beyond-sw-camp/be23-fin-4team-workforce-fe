import { PERM } from '@/features/permissions/backend-permissions';
import type { PermissionSpec } from '@/features/permissions/model';

/**
 * 로그인 `data.permissions` / JWT 문자열 기준 — `MEMBER:CREATE:*` 또는 `MEMBER:UPDATE:*`
 * (백엔드: `p.startsWith('MEMBER:CREATE') || p.startsWith('MEMBER:UPDATE')`)
 */
export function isHrManagementPermissionString(p: string): boolean {
  const u = p.trim().toUpperCase();
  return u.startsWith('MEMBER:CREATE') || u.startsWith('MEMBER:UPDATE');
}

/**
 * 인사 관리(구성원·조직도) 메뉴·라우트 — MEMBER:CREATE 또는 MEMBER:UPDATE (범위 접미사 포함).
 * 시스템 관리자는 호출부에서 `isSystemAdmin`으로 별도 허용.
 */
export function canAccessMemberDirectory(hasPermission: (spec: PermissionSpec) => boolean): boolean {
  return hasPermission(PERM.MEMBER_CREATE) || hasPermission(PERM.MEMBER_UPDATE);
}

/** `user.permissions` 배열 직접 검사 (hasPermission과 동일 조건) */
export function canAccessMemberDirectoryFromPermissionStrings(permissions: string[] | undefined): boolean {
  if (!permissions?.length) return false;
  return permissions.some(isHrManagementPermissionString);
}

/**
 * 인사팀 여부 — MEMBER:CREATE 또는 MEMBER:UPDATE
 */
export function isHrTeamMember(hasPermission: (spec: PermissionSpec) => boolean): boolean {
  return hasPermission(PERM.MEMBER_CREATE) || hasPermission(PERM.MEMBER_UPDATE);
}
