import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { useMemo } from 'react';
import { queryClient } from '@/app/config/queryClient';
import { createAppRouter } from '@/app/router';
import { antdTheme } from '@/app/styles/antd-theme';
import { AuthProvider } from '@/features/auth/auth-provider';
import { useAuth } from '@/features/auth/useAuth';
import { PermissionsProvider } from '@/features/permissions/usePermissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { AppErrorBoundary } from '@/shared/ui/AppErrorBoundary';

function InnerRouterProvider() {
  const auth = useAuth();
  const permissions = usePermissions();

  const router = useMemo(
    () =>
      createAppRouter({
        queryClient,
        auth,
        permissions,
      }),
    [auth, permissions],
  );

  return <RouterProvider router={router} />;
}

export function AppProviders() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PermissionsProvider>
            <ConfigProvider theme={antdTheme}>
              <InnerRouterProvider />
            </ConfigProvider>
          </PermissionsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
