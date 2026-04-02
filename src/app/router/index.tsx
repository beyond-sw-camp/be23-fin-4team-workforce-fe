import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import type { AppRouterContext } from '@/app/router/types';
import { requireAuth, requirePermissions } from '@/app/router/guards';
import LoginPage from '@/pages/public/LoginPage';
import { FindPasswordPage } from '@/pages/public/FindPasswordPage';
import { ResetPasswordPage } from '@/pages/public/ResetPasswordPage';
import { VerifyEmailPage } from '@/pages/public/VerifyEmailPage';
import { CompanyOnboardingPage } from '@/pages/public/CompanyOnboardingPage';
import { DashboardPage } from '@/pages/app/DashboardPage';
import { MembersPage } from '@/pages/app/MembersPage';
import { MemberDetailPage } from '@/pages/app/MemberDetailPage';
import { NotificationsPage } from '@/pages/app/NotificationsPage';
import { GenericPage } from '@/pages/app/GenericPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AppShellLayout } from '@/widgets/app-shell/AppShellLayout';

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
});

const publicLayoutRoute = createRoute({ getParentRoute: () => rootRoute, id: 'public', component: Outlet });
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app-layout',
  component: AppShellLayout,
  beforeLoad: ({ context }) => {
    requireAuth(context);
  },
});

const loginRoute = createRoute({ getParentRoute: () => publicLayoutRoute, path: '/login', component: LoginPage });
const findPasswordRoute = createRoute({ getParentRoute: () => publicLayoutRoute, path: '/find-password', component: FindPasswordPage });
const resetPasswordRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/reset-password',
  validateSearch: z.object({ forced: z.boolean().optional() }),
  component: ResetPasswordPage,
});
const verifyEmailRoute = createRoute({ getParentRoute: () => publicLayoutRoute, path: '/verify-email', component: VerifyEmailPage });
const companyOnboardingRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/company/onboarding',
  component: CompanyOnboardingPage,
});

const appBaseRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: '/app', component: Outlet });

const dashboardRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/dashboard',
  beforeLoad: ({ context }) => requirePermissions(context, ['dashboard.read']),
  component: DashboardPage,
});

const membersRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/members',
  validateSearch: z.object({
    page: z.number().catch(1),
    pageSize: z.number().catch(20),
    keyword: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
  beforeLoad: ({ context }) => requirePermissions(context, ['members.read']),
  component: MembersPage,
});

const memberDetailRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/members/$memberId',
  beforeLoad: ({ context }) => requirePermissions(context, ['members.read']),
  component: MemberDetailPage,
});
const notificationsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/notifications',
  component: NotificationsPage,
});

const genericPaths = [
  '/organization',
  '/attendance',
  '/leave',
  '/approvals',
  '/payroll',
  '/mail',
  '/performance',
  '/evaluations',
  '/ai-assistant',
  '/settings',
] as const;

const genericRoutes = genericPaths.map((path) =>
  createRoute({
    getParentRoute: () => appBaseRoute,
    path,
    component: () => <GenericPage title={path.replace('/', '').replace('-', ' ')} />,
  }),
);

const forbiddenRoute = createRoute({ getParentRoute: () => rootRoute, path: '/403', component: ForbiddenPage });
const notFoundRoute = createRoute({ getParentRoute: () => rootRoute, path: '/404', component: NotFoundPage });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: '/app/dashboard' });
    }
    throw redirect({ to: '/login' });
  },
});

const routeTree = rootRoute.addChildren([
  publicLayoutRoute.addChildren([loginRoute, findPasswordRoute, resetPasswordRoute, verifyEmailRoute, companyOnboardingRoute]),
  appLayoutRoute.addChildren([appBaseRoute.addChildren([dashboardRoute, membersRoute, memberDetailRoute, notificationsRoute, ...genericRoutes])]),
  forbiddenRoute,
  notFoundRoute,
  indexRoute,
]);

export function createAppRouter(context: AppRouterContext) {
  return createRouter({ routeTree, context, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
