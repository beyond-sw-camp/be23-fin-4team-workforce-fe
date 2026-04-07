import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import type { AppRouterContext } from '@/app/router/types';
import { requireAuth } from '@/app/router/guards';
import { HomePublicLayout } from '@/pages/public/HomePublicLayout';
import { LandingHomePage } from '@/pages/public/LandingHomePage';
import LoginPage from '@/pages/public/LoginPage';
import { FindPasswordPage } from '@/pages/public/FindPasswordPage';
import { ResetPasswordPage } from '@/pages/public/ResetPasswordPage';
import { VerifyEmailPage } from '@/pages/public/VerifyEmailPage';
import { CompanyOnboardingPage } from '@/pages/public/CompanyOnboardingPage';
import { DashboardPage } from '@/pages/app/DashboardPage';
import { MembersPage } from '@/pages/app/MembersPage';
import { MemberDetailPage } from '@/pages/app/MemberDetailPage';
import { NotificationsPage } from '@/pages/app/NotificationsPage';
import { EvaluationsPage } from '@/pages/app/EvaluationsPage';
import { PerformancePage } from '@/pages/app/PerformancePage';
import { GenericPage } from '@/pages/app/GenericPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { APP_GENERIC_PAGE_COPY } from '@/app/locale/app-ko';
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

/** pathless layout: `path: '/'`를 부모·자식에 동시에 두면 id `/public/`가 중복되어 런타임 오류가 납니다. */
const homeRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  id: 'home',
  component: HomePublicLayout,
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: '/app/dashboard' });
    }
  },
});
const homeIndexRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: '/',
  component: LandingHomePage,
});
const loginRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: 'login',
  component: () => <LoginPage embedded />,
});
const findPasswordRoute = createRoute({ getParentRoute: () => publicLayoutRoute, path: '/find-password', component: FindPasswordPage });
const resetPasswordRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/reset-password',
  validateSearch: z.object({ forced: z.boolean().optional() }),
  component: ResetPasswordPage,
});
const verifyEmailRoute = createRoute({ getParentRoute: () => publicLayoutRoute, path: '/verify-email', component: VerifyEmailPage });
const companyOnboardingRoute = createRoute({
  getParentRoute: () => homeRoute,
  path: 'company/onboarding',
  component: () => <CompanyOnboardingPage embedded />,
});

const appBaseRoute = createRoute({ getParentRoute: () => appLayoutRoute, path: '/app', component: Outlet });

const dashboardRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/dashboard',
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
  component: MembersPage,
});

const memberDetailRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/members/$memberId',
  component: MemberDetailPage,
});
const notificationsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/notifications',
  component: NotificationsPage,
});

const performanceRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/performance',
  component: PerformancePage,
});

const evaluationsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/evaluations',
  component: EvaluationsPage,
});

const genericPaths = [
  '/organization',
  '/attendance',
  '/leave',
  '/approvals',
  '/payroll',
  '/mail',
  '/ai-assistant',
  '/settings',
] as const;

const genericRoutes = genericPaths.map((path) => {
  const copy = APP_GENERIC_PAGE_COPY[path] ?? { title: '페이지', description: '준비 중입니다.' };
  return createRoute({
    getParentRoute: () => appBaseRoute,
    path,
    component: () => <GenericPage title={copy.title} description={copy.description} />,
  });
});

const forbiddenRoute = createRoute({ getParentRoute: () => rootRoute, path: '/403', component: ForbiddenPage });
const notFoundRoute = createRoute({ getParentRoute: () => rootRoute, path: '/404', component: NotFoundPage });

const routeTree = rootRoute.addChildren([
  publicLayoutRoute.addChildren([
    homeRoute.addChildren([homeIndexRoute, loginRoute, companyOnboardingRoute]),
    findPasswordRoute,
    resetPasswordRoute,
    verifyEmailRoute,
  ]),
  appLayoutRoute.addChildren([
    appBaseRoute.addChildren([
      dashboardRoute,
      membersRoute,
      memberDetailRoute,
      notificationsRoute,
      performanceRoute,
      evaluationsRoute,
      ...genericRoutes,
    ]),
  ]),
  forbiddenRoute,
  notFoundRoute,
]);

export function createAppRouter(context: AppRouterContext) {
  return createRouter({ routeTree, context, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
