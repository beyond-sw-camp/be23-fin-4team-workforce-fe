import type { PermissionSpec } from '@/features/permissions/model';

/**
 * member-service `Resource.name() + ":" + Action.name()` 와 동일한 접두사.
 * Redis 권한 문자열은 `MEMBER:READ:SELF` 형태이며, 백엔드 CheckPermission 은 granted.startsWith("MEMBER:READ") 로 검사합니다.
 */
export const PERM = {
  MEMBER_READ: 'MEMBER:READ',
  MEMBER_CREATE: 'MEMBER:CREATE',
  MEMBER_UPDATE: 'MEMBER:UPDATE',
  MEMBER_DELETE: 'MEMBER:DELETE',
  GOAL_READ: 'GOAL:READ',
  GOAL_CREATE: 'GOAL:CREATE',
  GOAL_UPDATE: 'GOAL:UPDATE',
  EVALUATION_READ: 'EVALUATION:READ',
  EVALUATION_CREATE: 'EVALUATION:CREATE',
  EVALUATION_UPDATE: 'EVALUATION:UPDATE',
  ORGANIZATION_READ: 'ORGANIZATION:READ',
  ROLE_READ: 'ROLE:READ',
  ROLE_CREATE: 'ROLE:CREATE',
  ROLE_UPDATE: 'ROLE:UPDATE',
  ROLE_DELETE: 'ROLE:DELETE',
  APPROVAL_AD_READ: 'APPROVAL_AD:READ',
  APPROVAL_AD_CREATE: 'APPROVAL_AD:CREATE',
  APPROVAL_AD_UPDATE: 'APPROVAL_AD:UPDATE',
  APPROVAL_AD_DELETE: 'APPROVAL_AD:DELETE',
  /** 전자계약 템플릿·발송 (`approval-service` contract) */
  CONTRACT_READ: 'CONTRACT:READ',
  CONTRACT_CREATE: 'CONTRACT:CREATE',
  CONTRACT_UPDATE: 'CONTRACT:UPDATE',
} as const;

/**
 * goal-service {@code PositionPermissionReader.canCreateOrganizationScopedGoal} 과 동일:
 * 조직 Objective 는 TEAM 또는 COMPANY 범위의 GOAL CREATE 또는 UPDATE 만 허용.
 */
export function canManageOrganizationScopedGoals(
  hasPermission: (spec: PermissionSpec) => boolean,
): boolean {
  return (
    hasPermission({ resource: 'GOAL', action: 'CREATE', scope: 'team' }) ||
    hasPermission({ resource: 'GOAL', action: 'CREATE', scope: 'company' }) ||
    hasPermission({ resource: 'GOAL', action: 'UPDATE', scope: 'team' }) ||
    hasPermission({ resource: 'GOAL', action: 'UPDATE', scope: 'company' })
  );
}
