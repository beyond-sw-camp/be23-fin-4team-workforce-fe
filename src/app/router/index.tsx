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
import { ChangePasswordPage } from '@/pages/public/ChangePasswordPage';
import { ResetPasswordPage } from '@/pages/public/ResetPasswordPage';
import { VerifyEmailPage } from '@/pages/public/VerifyEmailPage';
import { CompanyOnboardingPage } from '@/pages/public/CompanyOnboardingPage';
import { CalendarPage } from '@/pages/app/CalendarPage';
import { DashboardPage } from '@/pages/app/DashboardPage';
import { EsgActivitiesPage } from '@/pages/app/esg/EsgActivitiesPage';
import { EsgAdminPage } from '@/pages/app/esg/EsgAdminPage';
import { EsgCampaignsPage } from '@/pages/app/esg/EsgCampaignsPage';
import { EsgHomePage } from '@/pages/app/esg/EsgHomePage';
import { EsgShopPage } from '@/pages/app/esg/EsgShopPage';
import { MembersPage } from '@/pages/app/MembersPage';
import { MemberDetailPage } from '@/pages/app/MemberDetailPage';
import { NotificationsPage } from '@/pages/app/NotificationsPage';
import { EvaluationsPage } from '@/pages/app/EvaluationsPage';
import { PerformancePage } from '@/pages/app/PerformancePage';
import { GenericPage } from '@/pages/app/GenericPage';
import { AiDocumentsAdminPage } from '@/pages/app/AiDocumentsAdminPage';
import { OrganizationPage } from '@/pages/app/OrganizationPage';
import { RolesPage } from '@/pages/app/RolesPage';
import { MyProfilePage } from '@/pages/app/MyProfilePage';
import { MyProfileEditPage } from '@/pages/app/MyProfileEditPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { APP_POST_LOGIN_PATH } from '@/app/config/paths';
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
      throw redirect({ to: APP_POST_LOGIN_PATH });
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
const changePasswordRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/change-password',
  validateSearch: z.object({ forced: z.boolean().optional() }),
  beforeLoad: ({ context, search }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' });
    }
    const must = context.auth.user?.flags?.mustChangePassword;
    if (!must && search.forced !== true) {
      throw redirect({ to: APP_POST_LOGIN_PATH });
    }
  },
  component: ChangePasswordPage,
});
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

const calendarRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/calendar',
  component: CalendarPage,
});

const esgHomeRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/esg',
  component: EsgHomePage,
});
const esgActivitiesRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/esg/activities',
  component: EsgActivitiesPage,
});
const esgCampaignsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/esg/campaigns',
  component: EsgCampaignsPage,
});
const esgShopRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/esg/shop',
  component: EsgShopPage,
});
const esgAdminRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/esg/admin',
  component: EsgAdminPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/esg' });
    }
  },
});

const myProfileEditRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/me/edit',
  component: MyProfileEditPage,
});

const myProfileRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/me',
  component: MyProfilePage,
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

const organizationRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/organization',
  component: OrganizationPage,
});

const rolesRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/roles',
  component: RolesPage,
});

const aiDocumentsAdminRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/ai-documents',
  component: AiDocumentsAdminPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/403' });
    }
  },
});

const genericPaths = [
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
    changePasswordRoute,
    resetPasswordRoute,
    verifyEmailRoute,
  ]),
  appLayoutRoute.addChildren([
    appBaseRoute.addChildren([
      dashboardRoute,
      calendarRoute,
      esgHomeRoute,
      esgActivitiesRoute,
      esgCampaignsRoute,
      esgShopRoute,
      esgAdminRoute,
      myProfileEditRoute,
      myProfileRoute,
      membersRoute,
      memberDetailRoute,
      notificationsRoute,
      performanceRoute,
      evaluationsRoute,
      organizationRoute,
      rolesRoute,
      aiDocumentsAdminRoute,
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
