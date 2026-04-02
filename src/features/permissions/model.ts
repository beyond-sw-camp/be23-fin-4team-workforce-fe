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
    return permission;
  }
  const { resource, action, scope } = permission;
  return `${resource}:${action}${scope ? `:${scope}` : ''}`;
};
