import type { PropsWithChildren } from 'react';
import { PermissionGuard } from '@/features/permissions/permission-guard';
import type { PermissionSpec } from '@/features/permissions/model';

type Props = PropsWithChildren<{ required: PermissionSpec; fallback?: React.ReactNode }>;

export function AppPermissionGuard({ required, fallback, children }: Props) {
  return (
    <PermissionGuard required={required} fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}
