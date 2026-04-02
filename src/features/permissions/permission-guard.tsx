import type { PropsWithChildren } from 'react';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import type { PermissionSpec } from '@/features/permissions/model';

type Props = PropsWithChildren<{
  required: PermissionSpec;
  fallback?: React.ReactNode;
}>;

export function PermissionGuard({ required, fallback = null, children }: Props) {
  const { hasPermission } = usePermissions();
  if (!hasPermission(required)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
