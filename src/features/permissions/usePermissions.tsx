import { useMemo } from 'react';
import type { PropsWithChildren } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import type { PermissionSpec, PermissionsContextValue } from '@/features/permissions/model';
import { grantedStartsWithRequired, toPermissionCode } from '@/features/permissions/model';
import { PermissionsContext } from '@/features/permissions/permissions-context';

export function PermissionsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();

  const value = useMemo<PermissionsContextValue>(() => {
    const granted = user?.permissions ?? [];
    const isSystemAdmin = user?.isSystemAdmin === true;

    return {
      granted,
      hasPermission: (spec: PermissionSpec) => {
        if (isSystemAdmin) return true;
        const required = toPermissionCode(spec);
        if (!required) return false;
        return granted.some((item) => {
          const code = typeof item === 'string' ? item.trim() : toPermissionCode(item as PermissionSpec);
          return grantedStartsWithRequired(code, required);
        });
      },
    };
  }, [user?.permissions, user?.isSystemAdmin]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
