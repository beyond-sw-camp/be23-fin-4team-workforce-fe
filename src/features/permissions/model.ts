export type PermissionCode = string;

export type PermissionTuple = {
  resource: string;
  action: string;
  scope?: 'self' | 'team' | 'department' | 'company';
};

export type PermissionSpec = PermissionCode | PermissionTuple;

export type PermissionsContextValue = {
  granted: PermissionSpec[];
  hasPermission: (spec: PermissionSpec) => boolean;
};

export const toPermissionCode = (permission: PermissionSpec): string => {
  if (typeof permission === 'string') {
    return permission.trim().toUpperCase();
  }
  const { resource, action, scope } = permission;
  const r = String(resource).toUpperCase();
  const a = String(action).toUpperCase();
  const sc = scope ? `:${String(scope).toUpperCase()}` : '';
  return `${r}:${a}${sc}`;
};

/** 백엔드 `CheckPermission` 과 동일: 보유 권한 문자열이 `requiredPrefix` 로 시작하는지 (예: MEMBER:READ:SELF → MEMBER:READ) */
export function grantedStartsWithRequired(grantedCode: string, requiredPrefix: string): boolean {
  const g = grantedCode.trim().toUpperCase();
  const req = requiredPrefix.trim().toUpperCase();
  if (!req) return false;
  return g === req || g.startsWith(`${req}:`);
}
