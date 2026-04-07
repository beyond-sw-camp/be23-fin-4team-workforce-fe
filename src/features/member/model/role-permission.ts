/** 백엔드 Resource 종류 */
export const ROLE_RESOURCES = [
  'MEMBER',
  'ORGANIZATION',
  'SALARY',
  'ATTENDANCE',
  'APPROVAL',
  'ROLE',
  'GOAL',
  'EVALUATION',
  'ESG',
  'CALENDAR',
] as const;

/** Action 종류 */
export const ROLE_ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE'] as const;

/** PermissionRange — 적용 범위 */
export const ROLE_PERMISSION_RANGES = ['COMPANY', 'TEAM', 'SELF'] as const;

export type PermissionResource = (typeof ROLE_RESOURCES)[number];
export type PermissionAction = (typeof ROLE_ACTIONS)[number];
export type PermissionRange = (typeof ROLE_PERMISSION_RANGES)[number];

/** 역할에 부여하는 단일 권한 */
export type RolePermissionItem = {
  resource: PermissionResource;
  action: PermissionAction;
  permissionRange: PermissionRange;
};

export type CreateRolePayload = {
  name: string;
  description: string;
  permissions: RolePermissionItem[];
};

export type UpdateRolePayload = {
  name?: string;
  description?: string;
  permissions?: RolePermissionItem[];
};
