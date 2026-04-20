import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import type { AppRouterContext } from '@/app/router/types';
import { requireAuth, requireMemberDirectoryAccess, requirePermissions } from '@/app/router/guards';
import { PERM } from '@/features/permissions/backend-permissions';
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
import { HrInsightsPage } from '@/pages/app/HrInsightsPage';
import { EsgAdminPage } from '@/pages/app/esg/EsgAdminPage';
import { EsgHomePage } from '@/pages/app/esg/EsgHomePage';
import { EsgShopPage } from '@/pages/app/esg/EsgShopPage';
import { MembersPage } from '@/pages/app/MembersPage';
import { MemberDetailPage } from '@/pages/app/MemberDetailPage';
import { MemberEditPage } from '@/pages/app/MemberEditPage';
import { NotificationsPage } from '@/pages/app/NotificationsPage';
import { MemberChatAdminPage } from '@/pages/app/MemberChatAdminPage';
import EvaluationsPage from '@/pages/app/EvaluationsPage';
import { EvaluationWritePage } from '@/pages/app/EvaluationWritePage';
import PerformancePage from '@/pages/app/PerformancePage';
import { GoalApprovalDetailPage } from '@/pages/app/GoalApprovalDetailPage';
import { GoalApprovalsListPage } from '@/pages/app/GoalApprovalsListPage';
import { ApprovalsPage } from '@/pages/app/ApprovalsPage';
import { AbsenceProxyPage } from '@/pages/app/AbsenceProxyPage';
import { DepartmentApprovalsInboxPage } from '@/pages/app/DepartmentApprovalsInboxPage';
import { GenericPage } from '@/pages/app/GenericPage';
import { AiDocumentsAdminPage } from '@/pages/app/AiDocumentsAdminPage';
import { AdminAttendanceDailyPage } from '@/pages/app/salary-service/admin/AdminAttendanceDailyPage';
import { AdminAllowanceRequestsPage } from '@/pages/app/salary-service/admin/AdminAllowanceRequestsPage';
import { AdminAttendanceMonthlyPage } from '@/pages/app/salary-service/admin/AdminAttendanceMonthlyPage';
import { AdminCompanyHolidaysPage } from '@/pages/app/salary-service/admin/AdminCompanyHolidaysPage';
import { AdminFlexibleSlotsPage } from '@/pages/app/salary-service/admin/AdminFlexibleSlotsPage';
import { AdminLeaveGrantPage } from '@/pages/app/salary-service/admin/AdminLeaveGrantPage';
import { AdminLeavePoliciesPage } from '@/pages/app/salary-service/admin/AdminLeavePoliciesPage';
import { AdminOvertimePoliciesPage } from '@/pages/app/salary-service/admin/AdminOvertimePoliciesPage';
import { AdminPayrollManagePage } from '@/pages/app/salary-service/admin/AdminPayrollManagePage';
import { AdminPayrollPage } from '@/pages/app/salary-service/admin/AdminPayrollPage';
import { AdminSalarySettingsPage } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';
import { AdminUnusedLeavePayoutPage } from '@/pages/app/salary-service/admin/AdminUnusedLeavePayoutPage';
import { AdminWorkSchedulesPage } from '@/pages/app/salary-service/admin/AdminWorkSchedulesPage';
import { MyAttendanceMonthlyPage } from '@/pages/app/salary-service/my/MyAttendanceMonthlyPage';
import { MyAttendancePage } from '@/pages/app/salary-service/my/MyAttendancePage';
import { MyLeavePage } from '@/pages/app/salary-service/my/MyLeavePage';
import { MyOvertimeRequestsPage } from '@/pages/app/salary-service/my/MyOvertimeRequestsPage';
import { MyPayrollPage } from '@/pages/app/salary-service/my/MyPayrollPage';
import { MyScheduleSelectionsPage } from '@/pages/app/salary-service/my/MyScheduleSelectionsPage';
import { MyWorkTripsPage } from '@/pages/app/salary-service/my/MyWorkTripsPage';
import { MyAllowancesPage } from '@/pages/app/salary-service/my/MyAllowancesPage';
import { PayrollDetailPage } from '@/pages/app/salary-service/my/PayrollDetailPage';
import { OrganizationPage } from '@/pages/app/OrganizationPage';
import { MyProfilePage } from '@/pages/app/MyProfilePage';
import { MyProfileEditPage } from '@/pages/app/MyProfileEditPage';
import OnboardingStepperPage from '@/pages/app/OnboardingStepperPage';
import MeetingsPage from '@/pages/app/MeetingsPage';
import MeetingDetailPage from '@/pages/app/MeetingDetailPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { APP_POST_LOGIN_PATH } from '@/app/config/paths';
import { APP_GENERIC_PAGE_COPY } from '@/app/locale/app-ko';
import AppShellLayout from '@/widgets/app-shell/AppShellLayout';

function resolvePostAuthPath(user: AppRouterContext['auth']['user']) {
  if (user?.flags?.mustChangePassword) return '/change-password' as const;
  if (user?.flags?.onboardingRequired) return '/app/onboarding' as const;
  return APP_POST_LOGIN_PATH;
}

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
      const to = resolvePostAuthPath(context.auth.user);
      if (to === '/change-password') {
        throw redirect({ to, search: { forced: true } });
      }
      throw redirect({ to });
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
  validateSearch: z.object({
    email: z.string().optional(),
    from: z.string().optional(),
    forced: z.boolean().optional(),
  }),
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

const onboardingStepperRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/onboarding',
  component: OnboardingStepperPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/403' });
    }
  },
});

const hrInsightsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/insights',
  component: HrInsightsPage,
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
  beforeLoad: ({ context }) => {
    requireMemberDirectoryAccess(context);
  },
});

const memberDetailRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/members/$memberId',
  component: MemberDetailPage,
  beforeLoad: ({ context }) => {
    requireMemberDirectoryAccess(context);
  },
});

const memberEditRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/members/$memberId/edit',
  component: MemberEditPage,
  beforeLoad: ({ context }) => {
    requirePermissions(context, [PERM.MEMBER_UPDATE]);
  },
});
const notificationsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/notifications',
  component: NotificationsPage,
});
const memberChatAdminRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/member-chat/admin',
  component: MemberChatAdminPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/403' });
    }
  },
});

const performanceRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/performance',
  component: PerformancePage,
});

const goalApprovalsListRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/performance/approvals',
  component: GoalApprovalsListPage,
});

const goalApprovalDetailRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/performance/approvals/$requestId',
  component: GoalApprovalDetailPage,
});

const approvalsSearchSchema = z.object({
  tab: z.string().optional(),
  myStatus: z.string().optional(),
  compose: z.string().optional(),
  sideNav: z.string().optional(),
  box: z.string().optional(),
  /** 참조/공람 문서함: `cc` 참조만, `circ` 공람만, 없으면 참조 탭 */
  viewerSub: z.string().optional(),
  fromHome: z.string().optional(),
  /** 작성 허브 모달 iframe에서 앱 셸 없이 본문만 표시 */
  embed: z.string().optional(),
});

const approvalsAdminRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/approvals',
  validateSearch: approvalsSearchSchema,
  component: ApprovalsPage,
});

const departmentApprovalsSearchSchema = z.object({
  organizationId: z.string().optional(),
  deptView: z.enum(['draft', 'sent', 'received']).optional(),
  fromHome: z.string().optional(),
  embed: z.string().optional(),
});

const departmentApprovalsInboxRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/approvals/department',
  validateSearch: departmentApprovalsSearchSchema,
  component: DepartmentApprovalsInboxPage,
});

const absenceProxySearchSchema = z.object({
  embed: z.string().optional(),
});

const absenceProxyRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/approvals/absence-proxy',
  validateSearch: absenceProxySearchSchema,
  component: AbsenceProxyPage,
});

const evaluationsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/evaluations',
  component: EvaluationsPage,
});

const evaluationWriteRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/evaluations/$responseId/write',
  component: EvaluationWritePage,
});

const organizationSearchSchema = z.object({
  tab: z.enum(['structure', 'grades', 'titles', 'roles']).optional(),
});

const organizationRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/organization',
  validateSearch: organizationSearchSchema,
  component: OrganizationPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/403' });
    }
  },
});

/** 이전 `/app/roles` 경로 — 조직 설정의 역할·권한 탭으로 통합 */
const rolesRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/roles',
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/403' });
    }
    throw redirect({ to: '/app/organization', search: { tab: 'roles' } });
  },
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

const meetingsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/meetings',
  component: MeetingsPage,
});

const meetingDetailRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/meetings/$meetingId',
  component: MeetingDetailPage,
});

const myAttendanceRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance',
  component: MyAttendancePage,
});

const myAttendanceMonthlyRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/monthly',
  component: MyAttendanceMonthlyPage,
});
const myScheduleSelectionsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/schedules/my',
  component: MyScheduleSelectionsPage,
});

const myOvertimeRequestsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/overtime',
  component: MyOvertimeRequestsPage,
});

const adminAttendanceMonthlyRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/company/monthly',
  component: AdminAttendanceMonthlyPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
  },
});

const adminAttendanceDailyRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/company',
  component: AdminAttendanceDailyPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
  },
});

const adminCompanyHolidaysRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/holidays',
  component: AdminCompanyHolidaysPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
  },
});

const adminWorkSchedulesRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/schedules',
  component: AdminWorkSchedulesPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
  },
});

const adminOvertimePoliciesRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/overtime-policies',
  component: AdminOvertimePoliciesPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
  },
});

const adminFlexibleSlotsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/flexible-slots',
  component: AdminFlexibleSlotsPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
  },
});

const myLeaveRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/leave',
  component: MyLeavePage,
});

const adminLeaveGrantRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/leave/grant',
  component: AdminLeaveGrantPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/leave' });
    }
  },
});

const adminLeavePoliciesRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/leave/policies',
  component: AdminLeavePoliciesPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/leave' });
    }
  },
});

const myWorkTripsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/work-trips',
  component: MyWorkTripsPage,
});

const payrollAdminManageRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/admin/$payrollId',
  component: AdminPayrollManagePage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/payroll' });
    }
  },
});

const payrollAdminRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/admin',
  component: AdminPayrollPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/payroll' });
    }
  },
});

const payrollDetailRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/$payrollId',
  component: PayrollDetailPage,
});

const myPayrollRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll',
  component: MyPayrollPage,
});

const myAllowancesRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/allowances',
  component: MyAllowancesPage,
});

const adminAllowanceRequestsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/allowances/admin',
  component: AdminAllowanceRequestsPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/payroll' });
    }
  },
});

const adminSalarySettingsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/salary/settings',
  component: AdminSalarySettingsPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/payroll' });
    }
  },
});

const adminUnusedLeavePayoutRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/salary/unused-leave',
  component: AdminUnusedLeavePayoutPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/payroll' });
    }
  },
});

const genericPaths = ['/mail', '/ai-assistant', '/settings'] as const;

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
      onboardingStepperRoute,
      hrInsightsRoute,
      calendarRoute,
      esgHomeRoute,
      esgShopRoute,
      esgAdminRoute,
      myProfileEditRoute,
      myProfileRoute,
      membersRoute,
      memberDetailRoute,
      memberEditRoute,
      notificationsRoute,
      memberChatAdminRoute,
      performanceRoute,
      approvalsAdminRoute,
      absenceProxyRoute,
      departmentApprovalsInboxRoute,
      goalApprovalsListRoute,
      goalApprovalDetailRoute,
      evaluationsRoute,
      evaluationWriteRoute,
      organizationRoute,
      rolesRoute,
      meetingsRoute,
      meetingDetailRoute,
      aiDocumentsAdminRoute,
      myAttendanceRoute,
      myAttendanceMonthlyRoute,
      myScheduleSelectionsRoute,
      myOvertimeRequestsRoute,
      adminAttendanceMonthlyRoute,
      adminAttendanceDailyRoute,
      adminCompanyHolidaysRoute,
      adminWorkSchedulesRoute,
      adminOvertimePoliciesRoute,
      adminFlexibleSlotsRoute,
      myLeaveRoute,
      adminLeaveGrantRoute,
      adminLeavePoliciesRoute,
      myWorkTripsRoute,
      payrollAdminManageRoute,
      payrollAdminRoute,
      payrollDetailRoute,
      myPayrollRoute,
      myAllowancesRoute,
      adminAllowanceRequestsRoute,
      adminSalarySettingsRoute,
      adminUnusedLeavePayoutRoute,
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
