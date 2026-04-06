/**
 * member-service `Resource.name() + ":" + Action.name()` 와 동일한 접두사.
 * Redis 권한 문자열은 `MEMBER:READ:SELF` 형태이며, 백엔드 CheckPermission 은 granted.startsWith("MEMBER:READ") 로 검사합니다.
 */
export const PERM = {
  MEMBER_READ: 'MEMBER:READ',
  MEMBER_CREATE: 'MEMBER:CREATE',
  MEMBER_UPDATE: 'MEMBER:UPDATE',
  MEMBER_DELETE: 'MEMBER:DELETE',
  ORGANIZATION_READ: 'ORGANIZATION:READ',
  ROLE_READ: 'ROLE:READ',
} as const;
