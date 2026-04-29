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
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { hasActiveNegotiationSalaryPolicy } from '@/features/salary-service/lib/salaryPolicyAccess';
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
import EvaluationsHubPage from '@/pages/app/evaluations/EvaluationsHubPage';
import EvaluationSeasonDetailPage from '@/pages/app/evaluations/EvaluationSeasonDetailPage';
import PerformancePage from '@/pages/app/PerformancePage';
import { ApprovalsPage } from '@/pages/app/ApprovalsPage';
import { AbsenceProxyPage } from '@/pages/app/AbsenceProxyPage';
import { DepartmentApprovalSearchPage } from '@/pages/app/DepartmentApprovalSearchPage';
import { MyApprovalRequestsPage } from '@/pages/app/MyApprovalRequestsPage';
import { GenericPage } from '@/pages/app/GenericPage';
import { AiDocumentsAdminPage } from '@/pages/app/AiDocumentsAdminPage';
import { AdminAttendancePage } from '@/pages/app/salary-service/admin/AdminAttendancePage';
import { AdminAttendanceCorrectionPage } from '@/pages/app/salary-service/admin/AdminAttendanceCorrectionPage';
import { AdminBonusPolicyPage } from '@/pages/app/salary-service/admin/AdminBonusPolicyPage';
import { AdminComprehensiveOvertimePage } from '@/pages/app/salary-service/admin/AdminComprehensiveOvertimePage';
import { AdminCompanyHolidaysPage } from '@/pages/app/salary-service/admin/AdminCompanyHolidaysPage';
import { AdminFlexibleSlotsPage } from '@/pages/app/salary-service/admin/AdminFlexibleSlotsPage';
import { AdminLeavePromotionNoResponsePage } from '@/pages/app/salary-service/admin/AdminLeavePromotionNoResponsePage';
import { AdminCompanyLeaveTypesPage } from '@/pages/app/salary-service/admin/AdminCompanyLeaveTypesPage';
import { AdminLeaveOfAbsencePage } from '@/pages/app/salary-service/admin/AdminLeaveOfAbsencePage';
import { AdminPayGradeTablePage } from '@/pages/app/salary-service/admin/AdminPayGradeTablePage';
import { AdminLeavePoliciesPage } from '@/pages/app/salary-service/admin/AdminLeavePoliciesPage';
import { AdminOvertimePoliciesPage } from '@/pages/app/salary-service/admin/AdminOvertimePoliciesPage';
import { AdminPayrollManagePage } from '@/pages/app/salary-service/admin/AdminPayrollManagePage';
import { AdminPayrollPage } from '@/pages/app/salary-service/admin/AdminPayrollPage';
import { AdminPayrollTaxSummaryPage } from '@/pages/app/salary-service/admin/AdminPayrollTaxSummaryPage';
import { AdminRetirementPolicyPage } from '@/pages/app/salary-service/admin/AdminRetirementPolicyPage';
import { AdminMemberAllowancePage } from '@/pages/app/salary-service/admin/AdminMemberAllowancePage';
import { AdminSalaryNegotiationsPage } from '@/pages/app/salary-service/admin/AdminSalaryNegotiationsPage';
import { AdminSalarySettingsPage } from '@/pages/app/salary-service/admin/AdminSalarySettingsPage';
import { AdminUnusedLeavePayoutPage } from '@/pages/app/salary-service/admin/AdminUnusedLeavePayoutPage';
import { AdminWorkSchedulesPage } from '@/pages/app/salary-service/admin/AdminWorkSchedulesPage';
import { MyAttendanceMonthlyPage } from '@/pages/app/salary-service/my/MyAttendanceMonthlyPage';
import { MyAttendancePage } from '@/pages/app/salary-service/my/MyAttendancePage';
import { MyLeavePage } from '@/pages/app/salary-service/my/MyLeavePage';
import { MyLeavePromotionPage } from '@/pages/app/salary-service/my/MyLeavePromotionPage';
import { MyOvertimeRequestsPage } from '@/pages/app/salary-service/my/MyOvertimeRequestsPage';
import { MyAnnualSalaryPage } from '@/pages/app/salary-service/my/MyAnnualSalaryPage';
import { MyNegotiationHistoryPage } from '@/pages/app/salary-service/my/MyNegotiationHistoryPage';
import { MyIncomeManagementPage } from '@/pages/app/salary-service/my/MyIncomeManagementPage';
import { MyPayrollPage } from '@/pages/app/salary-service/my/MyPayrollPage';
import { MyRetirementInquiryPage } from '@/pages/app/salary-service/my/MyRetirementInquiryPage';
import { MyScheduleSelectionsPage } from '@/pages/app/salary-service/my/MyScheduleSelectionsPage';
import { MyWorkTimePage } from '@/pages/app/salary-service/my/MyWorkTimePage';
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
const findPasswordRoute = createRoute({ getParentRoute: () => homeRoute, path: 'find-password', component: FindPasswordPage });
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
const performanceRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/performance',
  validateSearch: z.object({
    view: z.enum(['my-kr', 'my-objective', 'company', 'member-kr', 'integrated']).optional(),
    bundleId: z.string().optional(),
  }),
  component: PerformancePage,
});

// === redesign 신규 라우트 ===
const evaluationFlowRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/evaluation-flow',
  beforeLoad: () => {
    throw redirect({ to: '/app/evaluations', search: { view: 'self' } });
  },
});
const myEvaluationResultV2Route = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/my-evaluation-result-v2',
  beforeLoad: () => {
    throw redirect({ to: '/app/evaluations', search: { view: 'results' } });
  },
});
const evaluationAdminRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/evaluation-admin',
  beforeLoad: () => {
    throw redirect({ to: '/app/evaluations', search: { view: 'overview' } });
  },
});

const approvalsSearchSchema = z.object({
  tab: z.string().optional(),
  myStatus: z.string().optional(),
  compose: z.string().optional(),
  sideNav: z.string().optional(),
  docId: z.string().optional(),
  box: z.string().optional(),
  /** 전자결재 알림 라우팅: 작성 허브에서 전체보기 모달 자동 오픈 키 */
  approvalModal: z.string().optional(),
  /** 같은 모달 재오픈을 위한 트리거 값 */
  approvalOpenAt: z.string().optional(),
  /** 알림 등에서 전달된 결재 요청 ID — 상세 모달 자동 오픈 */
  approvalRequestId: z.string().optional(),
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

const myApprovalRequestsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/approvals/my-requests',
  validateSearch: z.object({
    query: z.string().optional(),
    status: z.string().optional(),
    requestType: z.string().optional(),
    page: z.number().optional(),
    size: z.number().optional(),
    embed: z.string().optional(),
  }),
  component: MyApprovalRequestsPage,
});

const departmentApprovalsSearchSchema = z.object({
  organizationId: z.string().optional(),
  /** 부서 문서함 탭(기안/발송/수신) — `DepartmentApprovalsInboxPage` 등 */
  deptView: z.enum(['draft', 'sent', 'received']).optional(),
  query: z.string().optional(),
  status: z.string().optional(),
  requestType: z.string().optional(),
  page: z.number().optional(),
  size: z.number().optional(),
  fromHome: z.string().optional(),
  embed: z.string().optional(),
});

const departmentApprovalsInboxRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/approvals/department',
  validateSearch: departmentApprovalsSearchSchema,
  component: DepartmentApprovalSearchPage,
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
  validateSearch: z.object({
    view: z
      .string()
      .optional()
      .transform((v) => (v === 'self' || v === 'results' || v === 'overview' ? v : undefined)),
    adminTab: z.enum(['seasons', 'designs', 'operations']).optional(),
  }),
  component: EvaluationsHubPage,
});

const evaluationSeasonDetailRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/evaluations/seasons/$seasonId',
  validateSearch: z.object({
    tab: z.enum(['groups']).optional(),
  }),
  component: EvaluationSeasonDetailPage,
  beforeLoad: ({ context }) => {
    // 시즌 상세는 평가 관리 권한(EVALUATION READ/UPDATE/CREATE 중 하나) 필요.
    // 권한이 없으면 허브로 리다이렉트.
    const canManage =
      context.permissions.hasPermission(PERM.EVALUATION_READ) ||
      context.permissions.hasPermission(PERM.EVALUATION_UPDATE) ||
      context.permissions.hasPermission(PERM.EVALUATION_CREATE);
    if (!canManage) {
      throw redirect({ to: '/app/evaluations' });
    }
  },
});

const myEvaluationResultsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/evaluations/my-results',
  beforeLoad: () => {
    throw redirect({ to: '/app/evaluations', search: { view: 'results' } });
  },
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

const myWorkTimeRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/work-time',
  component: MyWorkTimePage,
});

/** 구 monthly 라우트 → 통합 페이지로 영구 리다이렉트 (북마크/외부 링크 호환) */
const adminAttendanceMonthlyRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/company/monthly',
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
    throw redirect({ to: '/app/attendance/company' });
  },
  component: AdminAttendancePage,
});

const adminAttendanceDailyRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/company',
  component: AdminAttendancePage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
  },
});

const adminAttendanceCorrectionRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/corrections',
  component: AdminAttendanceCorrectionPage,
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

const adminComprehensiveOvertimeRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/overtime-status',
  component: AdminComprehensiveOvertimePage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
  },
});

/** 구 경로 호환용 리다이렉트 */
const adminComprehensiveOvertimeLegacyRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/attendance/comprehensive-ot',
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/attendance' });
    }
    throw redirect({ to: '/app/attendance/overtime-status' });
  },
  component: AdminComprehensiveOvertimePage,
});

const myLeaveRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/leave',
  component: MyLeavePage,
});

// 직원 본인이 받은 연차 사용 촉진 통보 회신 페이지
const myLeavePromotionRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/leave/my-promotion',
  component: MyLeavePromotionPage,
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

// 관리자 연차 통보 미응답자 강제 지정 페이지
const adminLeavePromotionNoResponseRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/leave/promotion-no-response',
  component: AdminLeavePromotionNoResponsePage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/leave' });
    }
  },
});

const adminLeaveOfAbsenceRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/leave/absence',
  component: AdminLeaveOfAbsencePage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/leave' });
    }
  },
});

const adminCompanyLeaveTypesRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/leave/types',
  component: AdminCompanyLeaveTypesPage,
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
  validateSearch: z.object({
    // 어느 탭에서 진입했는지 — 뒤로가기 시 동일 탭으로 복귀
    tab: z.enum(['company', 'member', 'salary']).optional(),
  }),
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
  validateSearch: z.object({
    // 정산 화면 활성 탭: company(이번달 정산) | member(정산 이력) | salary(직원 급여 관리)
    tab: z.enum(['company', 'member', 'salary']).optional(),
  }),
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/payroll' });
    }
  },
});

// 4대보험 + 원천세 월별 집계 화면
const payrollTaxSummaryRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/tax-summary',
  component: AdminPayrollTaxSummaryPage,
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

// 직원 본인 연봉 조회
const myAnnualSalaryRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/annual',
  component: MyAnnualSalaryPage,
});

// 직원 본인 소득관리 (은행 계좌 + 원천징수 세액 조정)
const myIncomeManagementRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/income',
  component: MyIncomeManagementPage,
});

const myRetirementInquiryRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/retirement',
  component: MyRetirementInquiryPage,
});

// 직원 본인 연봉 협상 이력
const myNegotiationHistoryRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/negotiations',
  component: MyNegotiationHistoryPage,
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

const adminMemberAllowanceRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/payroll/admin/allowances',
  component: AdminMemberAllowancePage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/payroll' });
    }
  },
});

const adminPayGradeTableRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/salary/pay-grade-table',
  component: AdminPayGradeTablePage,
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

const adminRetirementPolicyRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/salary/retirement-policy',
  component: AdminRetirementPolicyPage,
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/payroll' });
    }
  },
});

const adminSalaryNegotiationsRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/salary/negotiations',
  component: AdminSalaryNegotiationsPage,
  beforeLoad: async ({ context }) => {
    if (!context.auth.user?.isSystemAdmin) {
      throw redirect({ to: '/app/payroll' });
    }
    const policies = await salaryApi.salaryPolicy.list();
    if (!hasActiveNegotiationSalaryPolicy(policies)) {
      throw redirect({ to: '/app/payroll/admin' });
    }
  },
});

const adminBonusPolicyRoute = createRoute({
  getParentRoute: () => appBaseRoute,
  path: '/salary/bonus-policy',
  component: AdminBonusPolicyPage,
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
      performanceRoute,
      // === 통합 워크플로우 라우트 ===
      evaluationFlowRoute,
      myEvaluationResultV2Route,
      evaluationAdminRoute,
      approvalsAdminRoute,
      myApprovalRequestsRoute,
      absenceProxyRoute,
      departmentApprovalsInboxRoute,
      evaluationsRoute,
      evaluationSeasonDetailRoute,
      myEvaluationResultsRoute,
      organizationRoute,
      rolesRoute,
      meetingsRoute,
      meetingDetailRoute,
      aiDocumentsAdminRoute,
      myAttendanceRoute,
      myAttendanceMonthlyRoute,
      myScheduleSelectionsRoute,
      myOvertimeRequestsRoute,
      myWorkTimeRoute,
      adminAttendanceMonthlyRoute,
      adminAttendanceDailyRoute,
      adminAttendanceCorrectionRoute,
      adminCompanyHolidaysRoute,
      adminWorkSchedulesRoute,
      adminOvertimePoliciesRoute,
      adminFlexibleSlotsRoute,
      adminComprehensiveOvertimeRoute,
      adminComprehensiveOvertimeLegacyRoute,
      myLeaveRoute,
      myLeavePromotionRoute,
      adminLeavePoliciesRoute,
      adminLeavePromotionNoResponseRoute,
      adminLeaveOfAbsenceRoute,
      adminCompanyLeaveTypesRoute,
      myWorkTripsRoute,
      adminMemberAllowanceRoute,
      payrollAdminManageRoute,
      payrollAdminRoute,
      payrollTaxSummaryRoute,
      payrollDetailRoute,
      myPayrollRoute,
      myAnnualSalaryRoute,
      myIncomeManagementRoute,
      myAllowancesRoute,
      myRetirementInquiryRoute,
      myNegotiationHistoryRoute,
      adminSalarySettingsRoute,
      adminPayGradeTableRoute,
      adminUnusedLeavePayoutRoute,
      adminRetirementPolicyRoute,
      adminSalaryNegotiationsRoute,
      adminBonusPolicyRoute,
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
