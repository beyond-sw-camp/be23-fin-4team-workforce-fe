import { useContext } from 'react';
import { PermissionsContext } from '@/features/permissions/permissions-context';

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within PermissionsProvider');
  }
  return context;
}
