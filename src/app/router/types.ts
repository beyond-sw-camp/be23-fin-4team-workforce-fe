import type { QueryClient } from '@tanstack/react-query';
import type { AuthContextValue } from '@/features/auth/types';
import type { PermissionsContextValue } from '@/features/permissions/model';

export type AppRouterContext = {
  queryClient: QueryClient;
  auth: AuthContextValue;
  permissions: PermissionsContextValue;
};
