import { useMemo } from 'react';
import type { PropsWithChildren } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import type { PermissionSpec, PermissionsContextValue } from '@/features/permissions/model';
import { toPermissionCode } from '@/features/permissions/model';
import { PermissionsContext } from '@/features/permissions/permissions-context';

export function PermissionsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();

  const value = useMemo<PermissionsContextValue>(() => {
    const granted = user?.permissions ?? [];
    const set = new Set(granted.map((item) => toPermissionCode(item)));

    return {
      granted,
      hasPermission: (spec: PermissionSpec) => set.has(toPermissionCode(spec)),
    };
  }, [user?.permissions]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
