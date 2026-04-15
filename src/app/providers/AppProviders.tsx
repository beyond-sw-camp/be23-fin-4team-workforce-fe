import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
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

  if (auth.status === 'loading') {
    return <div className="tw-h-[100dvh] tw-bg-slate-50" aria-busy="true" />;
  }

  return <RouterProvider router={router} />;
}

export function AppProviders() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PermissionsProvider>
            <ConfigProvider locale={koKR} theme={antdTheme}>
              <AntdApp>
                <InnerRouterProvider />
              </AntdApp>
            </ConfigProvider>
          </PermissionsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
