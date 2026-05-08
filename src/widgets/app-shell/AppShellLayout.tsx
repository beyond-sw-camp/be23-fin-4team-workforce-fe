import {
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  CalendarOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  ControlOutlined,
  DashboardOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  FlagOutlined,
  FolderOpenOutlined,
  FormOutlined,
  GiftOutlined,
  GlobalOutlined,
  LineChartOutlined,
  PieChartOutlined,
  MoreOutlined,
  MessageOutlined,
  PartitionOutlined,
  PauseCircleOutlined,
  PoweroffOutlined,
  ProfileOutlined,
  ProjectOutlined,
  RobotOutlined,
  ScheduleOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShoppingOutlined,
  StarOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Empty, Layout, Menu, Popover, Spin, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useAuth } from '@/features/auth/useAuth';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import type { EsgConfig } from '@/features/esg/api/esgApi';
import { esgApi } from '@/features/esg/api/esgApi';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import { notificationApi } from '@/features/notification/api/notificationApi';
import {
  buildApprovalNotificationNavigate,
  buildGoalBundleNotificationNavigate,
} from '@/features/notification/lib/approvalNotificationRoute';
import {
  buildContractNotificationNavigate,
  isContractNotificationRoutable,
  resolveContractNotificationTargetId,
} from '@/features/notification/lib/contractNotificationRoute';
import { companyApi } from '@/features/organization/api/companyApi';
import { searchApi } from '@/features/search/api/searchApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { memberApi } from '@/features/member/api/memberApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { hasActiveNegotiationSalaryPolicy } from '@/features/salary-service/lib/salaryPolicyAccess';
// import {attendanceApi} from '@/features/salary-service/api/attendanceApi'; // leave-policies 호출 비활성화로 AppShell 503 방지
import {
  canAccessMemberDirectory,
  canAccessMemberDirectoryFromPermissionStrings,
} from '@/features/permissions/member-directory-access';
import {
  APP_BRAND_NAME,
  APP_MENU_ESG_GROUP_LABEL,
  APP_MENU_LABEL,
  APP_MENU_ORG_CHART_LABEL,
  APP_MENU_ORG_HR_GROUP_LABEL,
  APP_MENU_PATH_ORDER,
  APP_MENU_TALENT_HUB_LABEL,
  APP_MENU_LEAVE_GROUP_LABEL,
  APP_MENU_WORK_GROUP_LABEL,
  ESG_MENU_LABEL,
  ESG_MENU_PATH_ORDER,
} from '@/app/locale/app-ko';
import {
  APPROVAL_GUIDE_BOX_LABEL,
  APPROVAL_GUIDE_SECTION_ITEMS,
  APPROVAL_GUIDE_SECTION_LABEL,
  APPROVAL_GUIDE_SECTION_ORDER,
  approvalShellMenuItemKeyFromLocation,
  approvalShellSectionOpenKeyFromLocation,
  getApprovalShellSiderEntries,
} from '@/features/approvals/lib/approvalGuideNav';
import { AppSearchField } from '@/shared/ui/AppSearchField';
import { AiChatbotFab } from '@/widgets/app-shell/AiChatbotFab';
import { AiRecordingModal } from '@/widgets/app-shell/AiRecordingModal';
import { MemberChatProvider, useMemberChatOpener } from '@/widgets/app-shell/MemberChatOpener';
import { SessionAccessTimer } from '@/widgets/app-shell/SessionAccessTimer';
import { OrgChartModal } from '@/widgets/organization/OrgChartModal';
import { HeaderSearchMemberDetailModal } from '@/widgets/app-shell/HeaderSearchMemberDetailModal';
import {
  approvalSecondaryPanelOpenKeys,
  approvalSiderSelectedMenuKeys,
  buildApprovalMenuGroupChildren,
  decodeWfNavKey,
  encodeWfNavKey,
} from '@/widgets/app-shell/approvalSiderMenu';

/** 사이드바 접기용 패널 아이콘(접힘 시 본문 영역과 정렬). */
function SiderPanelToggleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      aria-hidden
    >
      <rect
        x="3.25"
        y="4.75"
        width="17.5"
        height="14.5"
        rx="2.5"
        ry="2.5"
        stroke="currentColor"
        strokeWidth="1.65"
      />
      <line
        x1="9.25"
        y1="6.5"
        x2="9.25"
        y2="17.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  );
}

const APP_MENU_ICONS: Record<string, ReactNode> = {
  '/app/dashboard': <DashboardOutlined className="tw-text-lg" />,
  '/app/insights': <PieChartOutlined className="tw-text-lg" />,
  '/app/calendar': <CalendarOutlined className="tw-text-lg" />,
  '/app/members': <TeamOutlined className="tw-text-lg" />,
  '/app/organization': <ApartmentOutlined className="tw-text-lg" />,
  '/app/attendance': <ClockCircleOutlined className="tw-text-lg" />,
  '/app/attendance/overtime': <ClockCircleOutlined className="tw-text-lg" />,
  '/app/attendance/work-time': <BarChartOutlined className="tw-text-lg" />,
  '/app/attendance/schedules/my': <ScheduleOutlined className="tw-text-lg" />,
  '/app/attendance/overtime-policies': <ControlOutlined className="tw-text-lg" />,
  '/app/attendance/flexible-slots': <ScheduleOutlined className="tw-text-lg" />,
  '/app/leave': <ScheduleOutlined className="tw-text-lg" />,
  '/app/approvals': <FileDoneOutlined className="tw-text-lg" />,
  '/app/contracts/send': <FormOutlined className="tw-text-lg" />,
  '/app/contracts': <SafetyCertificateOutlined className="tw-text-lg" />,
  '/app/approvals/department': <FolderOpenOutlined className="tw-text-lg" />,
  '/app/approvals/department-search': <FolderOpenOutlined className="tw-text-lg" />,
  '/app/payroll': <DollarOutlined className="tw-text-lg" />,
  '/app/payroll/annual': <BarChartOutlined className="tw-text-lg" />,
  '/app/payroll/allowances': <GiftOutlined className="tw-text-lg" />,
  '/app/income': <BankOutlined className="tw-text-lg" />,
  '/app/notifications': <BellOutlined className="tw-text-lg" />,
  '/app/performance': <LineChartOutlined className="tw-text-lg" />,
  '/app/evaluations': <StarOutlined className="tw-text-lg" />,
  '/app/meetings': <VideoCameraOutlined className="tw-text-lg" />,
  '/app/work-trips': <EnvironmentOutlined className="tw-text-lg" />,
};

const ESG_MENU_ICONS: Record<string, ReactNode> = {
  '/app/esg': <GlobalOutlined className="tw-text-lg" />,
  '/app/esg/shop': <ShoppingOutlined className="tw-text-lg" />,
  '/app/esg/admin': <ControlOutlined className="tw-text-lg" />,
};

function shouldShowEsgMenuItem(
  path: string,
  cfg: EsgConfig | null | undefined,
  isAdmin: boolean,
): boolean {
  if (path === '/app/esg/admin') {
    return isAdmin;
  }
  if (!cfg || cfg.esgEnabledYn !== 'YES') {
    return false;
  }
  return true;
}

const TALENT_HUB_GROUP_KEY = 'group-talent-hub';
const TALENT_HUB_PATHS = ['/app/performance', '/app/evaluations', '/app/meetings'] as const;
const TALENT_HUB_PATH_SET = new Set<string>(TALENT_HUB_PATHS);

const ORG_HR_GROUP_KEY = 'group-org-hr';
/** 인사 관리 서브메뉴 — 구성원·조직도 접근과 동일하게 `canAccessMemberDirectory` 로 노출 */
const ORG_HR_PATHS = ['/app/members', '/app/organization'] as const;
/** 계약 발송 라우트는 HR 그룹에만 속하며, 메뉴 순서는 `hrGroupExtraChildren`에서 결재 양식 다음에 둠 */
const ORG_HR_PATH_SET = new Set<string>([...ORG_HR_PATHS, '/app/contracts/send']);

const ESG_GROUP_KEY = 'group-esg';

/** 근무 그룹: 근태(초과·스케줄·월간 등) 및 출장 */
const WORK_GROUP_KEY = 'group-work';
const WORK_PATHS = ['/app/attendance', '/app/work-trips'] as const;
const WORK_PATH_SET = new Set<string>(WORK_PATHS);

/** 휴가·근태 설정 그룹(공휴일·유형·정책 등) */
const LEAVE_GROUP_KEY = 'group-leave';
const LEAVE_PATHS = ['/app/leave'] as const;
const LEAVE_PATH_SET = new Set<string>(LEAVE_PATHS);

/** 급여 그룹: 급여·소득 하위 메뉴 */
const PAYROLL_GROUP_KEY = 'group-payroll';
/** 급여 정산 관리 + 연봉 협상(연봉협상제일 때만) 사이드 서브메뉴 */
const PAYROLL_SETTLEMENT_MENU_KEY = 'group-payroll-settlement';

const APPROVAL_GROUP_KEY = 'group-approvals';
/** openKeys: 전자결재 하위 영역(ap-section-*). */
const isApprovalGuideSectionOpenKey = (key: string) => key.startsWith('ap-section-');
const APPROVAL_SHELL_MENU_ENTRIES = getApprovalShellSiderEntries();
const APPROVAL_NAV_BY_KEY = new Map(APPROVAL_SHELL_MENU_ENTRIES.map((e) => [e.key, e.navigate]));
const APPROVAL_SECTION_DEFAULT_NAV_BY_KEY = new Map(
  APPROVAL_GUIDE_SECTION_ORDER.map((section) => {
    const firstBox = APPROVAL_GUIDE_SECTION_ITEMS[section][0];
    return [`ap-section-${section}`, APPROVAL_NAV_BY_KEY.get(`ap-${firstBox}`)];
  }),
);

function approvalSectionIcon(section: (typeof APPROVAL_GUIDE_SECTION_ORDER)[number]) {
  if (section === 'do') return <FileTextOutlined className="tw-text-lg" />;
  if (section === 'personal') return <UserOutlined className="tw-text-lg" />;
  return <FolderOpenOutlined className="tw-text-lg" />;
}

function approvalLeafIcon(box: string) {
  if (box === 'do-pending') return <ClockCircleOutlined className="tw-text-lg" />;
  if (box === 'do-acted') return <FileDoneOutlined className="tw-text-lg" />;
  if (box === 'do-upcoming') return <CalendarOutlined className="tw-text-lg" />;
  if (box === 'per-all') return <FormOutlined className="tw-text-lg" />;
  if (box === 'per-draft') return <FolderOpenOutlined className="tw-text-lg" />;
  if (box === 'per-viewers') return <EyeOutlined className="tw-text-lg" />;
  if (box === 'per-absence') return <TeamOutlined className="tw-text-lg" />;
  if (box === 'per-official') return <SafetyCertificateOutlined className="tw-text-lg" />;
  if (box === 'dept-all') return <FormOutlined className="tw-text-lg" />;
  if (box === 'dept-received') return <SafetyCertificateOutlined className="tw-text-lg" />;
  return <FileTextOutlined className="tw-text-lg" />;
}

function buildAppShellMenuItems(
  isAdmin: boolean,
  approvalMenuChildren: NonNullable<MenuProps['items']> | undefined,
  canAccessMemberDirectory: boolean,
  hrGroupExtraChildren?: NonNullable<MenuProps['items']>,
  leavePromotionEnabled = false,
  showSalaryNegotiationSubmenu = false,
  talentHubChildren?: NonNullable<MenuProps['items']>,
): NonNullable<MenuProps['items']> {
  const items: NonNullable<MenuProps['items']> = [];
  let hubInserted = false;
  let orgInserted = false;
  let approvalInserted = false;
  let workInserted = false;
  let leaveInserted = false;

  for (const path of APP_MENU_PATH_ORDER) {
    if (TALENT_HUB_PATH_SET.has(path)) {
      if (!hubInserted) {
        hubInserted = true;
        items.push({
          key: TALENT_HUB_GROUP_KEY,
          icon: <ProjectOutlined className="tw-text-lg" />,
          label: APP_MENU_TALENT_HUB_LABEL,
          title: APP_MENU_TALENT_HUB_LABEL,
          children:
            talentHubChildren && talentHubChildren.length > 0
              ? talentHubChildren
              : TALENT_HUB_PATHS.map((p) => ({
                  key: p,
                  icon: APP_MENU_ICONS[p],
                  label: APP_MENU_LABEL[p],
                  title: APP_MENU_LABEL[p],
                })),
        });
      }
      continue;
    }
    if (ORG_HR_PATH_SET.has(path)) {
      if (!orgInserted) {
        const baseChildren: NonNullable<MenuProps['items']> = canAccessMemberDirectory
          ? ORG_HR_PATHS.map((p) => ({
              key: p,
              icon: APP_MENU_ICONS[p],
              label: APP_MENU_LABEL[p],
              title: APP_MENU_LABEL[p],
            }))
          : [];
        const extras = hrGroupExtraChildren ?? [];
        if (baseChildren.length === 0 && extras.length === 0) {
          continue;
        }
        orgInserted = true;
        items.push({
          key: ORG_HR_GROUP_KEY,
          icon: <TeamOutlined className="tw-text-lg" />,
          label: APP_MENU_ORG_HR_GROUP_LABEL,
          title: APP_MENU_ORG_HR_GROUP_LABEL,
          children: [...baseChildren, ...extras],
        });
      }
      continue;
    }
    if (WORK_PATH_SET.has(path)) {
      if (!workInserted) {
        workInserted = true;
        const workChildren: NonNullable<MenuProps['items']> = [];
        if (!isAdmin) {
          workChildren.push(
            {
              key: '/app/attendance',
              icon: APP_MENU_ICONS['/app/attendance'],
              label: APP_MENU_LABEL['/app/attendance'],
              title: APP_MENU_LABEL['/app/attendance'],
            },
            {
              key: '/app/attendance/overtime',
              icon: APP_MENU_ICONS['/app/attendance/overtime'],
              label: APP_MENU_LABEL['/app/attendance/overtime'],
              title: APP_MENU_LABEL['/app/attendance/overtime'],
            },
            {
              key: '/app/attendance/schedules/my',
              icon: APP_MENU_ICONS['/app/attendance/schedules/my'],
              label: APP_MENU_LABEL['/app/attendance/schedules/my'],
              title: APP_MENU_LABEL['/app/attendance/schedules/my'],
            },
            {
              key: '/app/leave',
              icon: APP_MENU_ICONS['/app/leave'],
              label: APP_MENU_LABEL['/app/leave'],
              title: APP_MENU_LABEL['/app/leave'],
            },
            // "휴가 계획 회신" 메뉴는 휴가 계획 관리(MyLeavePage) 안에 통합됨 — 사이드바 노출 제거
          );
        }
        if (isAdmin) {
          workChildren.push(
            {
              key: '/app/attendance/company',
              icon: <TeamOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/attendance/company'],
              title: APP_MENU_LABEL['/app/attendance/company'],
            },
            {
              key: '/app/attendance/schedules',
              icon: <ScheduleOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/attendance/schedules'],
              title: APP_MENU_LABEL['/app/attendance/schedules'],
            },
            {
              key: '/app/attendance/overtime-policies',
              icon: APP_MENU_ICONS['/app/attendance/overtime-policies'],
              label: APP_MENU_LABEL['/app/attendance/overtime-policies'],
              title: APP_MENU_LABEL['/app/attendance/overtime-policies'],
            },
          );
        }
        items.push({
          key: WORK_GROUP_KEY,
          icon: <ClockCircleOutlined className="tw-text-lg" />,
          label: APP_MENU_WORK_GROUP_LABEL,
          title: APP_MENU_WORK_GROUP_LABEL,
          children: workChildren,
        });
      }
      continue;
    }
    if (LEAVE_PATH_SET.has(path)) {
      if (!leaveInserted) {
        leaveInserted = true;
        const leaveChildren: NonNullable<MenuProps['items']> = [];
        if (!isAdmin) {
          // 일반 멤버 휴가 항목은 위쪽 '근무' 그룹으로 이동.
        }
        if (isAdmin) {
          leaveChildren.push(
            {
              key: '/app/attendance/holidays',
              icon: <FlagOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/attendance/holidays'],
              title: APP_MENU_LABEL['/app/attendance/holidays'],
            },
            {
              key: '/app/leave/types',
              icon: <ProfileOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/leave/types'],
              title: APP_MENU_LABEL['/app/leave/types'],
            },
            {
              key: '/app/leave/policies',
              icon: <FileTextOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/leave/policies'],
              title: APP_MENU_LABEL['/app/leave/policies'],
            },
            // 연차 촉진 알림 현황은 인사 관리 그룹으로 이동됨 (운영 모니터링 성격)
          );
        }
        if (leaveChildren.length === 0) {
          continue;
        }
        items.push({
          key: LEAVE_GROUP_KEY,
          icon: <ScheduleOutlined className="tw-text-lg" />,
          label: APP_MENU_LEAVE_GROUP_LABEL,
          title: APP_MENU_LEAVE_GROUP_LABEL,
          children: leaveChildren,
        });
      }
      continue;
    }
    if (path === '/app/approvals') {
      if (!approvalInserted) {
        approvalInserted = true;
        if (approvalMenuChildren && approvalMenuChildren.length > 0) {
          for (const entry of approvalMenuChildren) {
            items.push(entry);
          }
        } else {
          const composeEntry = APPROVAL_SHELL_MENU_ENTRIES[0];
          const guideLeaves = APPROVAL_SHELL_MENU_ENTRIES.slice(1);
          const leafByKey = new Map(guideLeaves.map((e) => [e.key, e]));
          items.push({
            key: APPROVAL_GROUP_KEY,
            icon: <FileDoneOutlined className="tw-text-lg" />,
            label: '전자결재',
            title: '전자결재',
            children: [
              {
                key: composeEntry.key,
                icon: <FormOutlined className="tw-text-lg" />,
                label: composeEntry.label,
                title: composeEntry.label,
              },
              ...APPROVAL_GUIDE_SECTION_ORDER.map((section) => ({
                key: `ap-section-${section}`,
                label: (
                  <span className="tw-inline-flex tw-min-w-0 tw-w-full tw-items-center tw-gap-3 [&_.anticon]:tw-shrink-0">
                    {approvalSectionIcon(section)}
                    <span className="tw-truncate">{APPROVAL_GUIDE_SECTION_LABEL[section]}</span>
                  </span>
                ),
                title: APPROVAL_GUIDE_SECTION_LABEL[section],
                children: APPROVAL_GUIDE_SECTION_ITEMS[section].map((box) => {
                  const e = leafByKey.get(`ap-${box}`)!;
                  return {
                    key: e.key,
                    icon: approvalLeafIcon(box),
                    label: APPROVAL_GUIDE_BOX_LABEL[box],
                    title: APPROVAL_GUIDE_BOX_LABEL[box],
                  };
                }),
              })),
            ],
          });
        }
      }
      continue;
    }
    if (path === '/app/payroll') {
      if (isAdmin) {
        items.push({
          key: PAYROLL_GROUP_KEY,
          icon: <DollarOutlined className="tw-text-lg" />,
          label: '급여 관리',
          title: '급여 관리',
          children: [
            {
              key: '/app/payroll/admin',
              icon: <DollarOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/payroll/admin'],
              title: APP_MENU_LABEL['/app/payroll/admin'],
            },
            {
              key: '/app/payroll/tax-summary',
              icon: <AuditOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/payroll/tax-summary'],
              title: APP_MENU_LABEL['/app/payroll/tax-summary'],
            },
            {
              key: '/app/salary/settings',
              icon: <SettingOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/salary/settings'],
              title: APP_MENU_LABEL['/app/salary/settings'],
            },
            {
              key: '/app/salary/retirement-policy',
              icon: <BankOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/salary/retirement-policy'],
              title: APP_MENU_LABEL['/app/salary/retirement-policy'],
            },
            {
              key: '/app/salary/bonus-policy',
              icon: <DollarOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/salary/bonus-policy'],
              title: APP_MENU_LABEL['/app/salary/bonus-policy'],
            },
          ],
        });
      } else {
        items.push({
          key: PAYROLL_GROUP_KEY,
          icon: <DollarOutlined className="tw-text-lg" />,
          label: '급여',
          title: '급여',
          children: [
            {
              key: '/app/payroll',
              icon: APP_MENU_ICONS['/app/payroll'],
              label: APP_MENU_LABEL['/app/payroll'],
              title: APP_MENU_LABEL['/app/payroll'],
            },
            {
              key: '/app/payroll/annual',
              icon: APP_MENU_ICONS['/app/payroll/annual'],
              label: APP_MENU_LABEL['/app/payroll/annual'],
              title: APP_MENU_LABEL['/app/payroll/annual'],
            },
            {
              key: '/app/payroll/retirement',
              icon: <BankOutlined className="tw-text-lg" />,
              label: APP_MENU_LABEL['/app/payroll/retirement'],
              title: APP_MENU_LABEL['/app/payroll/retirement'],
            },
          ],
        });
      }
      continue;
    }
    const leafLabel = APP_MENU_LABEL[path];
    items.push({
      key: path,
      icon: APP_MENU_ICONS[path],
      label: leafLabel,
      title: leafLabel,
    });
  }
  return items;
}

function useAppShellSiderMenuItems(currentPathname: string): {
  items: NonNullable<MenuProps['items']>;
  showSalaryNegotiationSubmenu: boolean;
} {
  const { status, user } = useAuth();
  const isAdmin = user?.isSystemAdmin === true;
  const { hasPermission } = usePermissions();
  /** 결재 양식 설정 메뉴: 시스템 관리자 + 문서함 + 결재 관리 권한 */
  const showApprovalFormSettings =
    isAdmin || hasPermission(PERM.APPROVAL_AD_READ) || canAccessMemberDirectory(hasPermission);
  const shouldQueryEsgConfig = status === 'authenticated' && currentPathname.startsWith('/app/esg');

  const { data: esgConfig } = useQuery({
    queryKey: ['esg', 'config'],
    queryFn: () => esgApi.getConfig(),
    enabled: shouldQueryEsgConfig,
    retry: false,
    staleTime: 60_000,
  });

  const { data: myDashboardProfile } = useQuery({
    queryKey: ['member', 'dashboard-profile'],
    queryFn: () => memberApi.dashboardProfile(),
    enabled: status === 'authenticated',
    retry: false,
    staleTime: 300_000,
  });

  const { data: approvalOrgChart } = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    enabled: status === 'authenticated',
    staleTime: 300_000,
  });

  const shouldQuerySalaryMenuData =
    status === 'authenticated' && currentPathname.startsWith('/app/salary-service');

  /** 연차 촉진 메뉴 노출용. 급여 서비스 화면에서만 조회해 다른 업무 화면의 콘솔 소음을 막음 */
  const { data: leavePoliciesForMenu } = useQuery({
    queryKey: ['salary', 'leave-policies'],
    queryFn: async () => {
      try {
        return await attendanceApi.leavePolicy.list();
      } catch {
        return [];
      }
    },
    enabled: shouldQuerySalaryMenuData,
    retry: false,
    staleTime: 60_000,
  });

  const { data: salaryPoliciesForMenu } = useQuery({
    queryKey: ['salary', 'salary-policies'],
    queryFn: () => salaryApi.salaryPolicy.list(),
    enabled: shouldQuerySalaryMenuData && isAdmin,
    staleTime: 60_000,
  });
  // `/leave-policies` 503(Service Unavailable) 회피를 위해 근태 서비스 호출 비활성화. 아래 useQuery 복원 시 leavePromotionEnabled를 policies 기반으로 되돌리기
  // const {data: leavePoliciesForMenu} = useQuery({
  //     queryKey: ['salary', 'leave-policies'],
  //     queryFn: () => attendanceApi.leavePolicy.list(),
  //     enabled: status === 'authenticated',
  //     staleTime: 60_000,
  // });

  return useMemo(() => {
    const esgPaths = ESG_MENU_PATH_ORDER.filter((p) =>
      shouldShowEsgMenuItem(p, esgConfig ?? null, isAdmin),
    );
    const approvalMenuChildren = buildApprovalMenuGroupChildren(
      approvalOrgChart?.organizations ?? [],
      {
        myOrganizationId: undefined,
        myOrganizationName: myDashboardProfile?.organizationName ?? user?.departmentName,
      },
    );
    const showMemberDirectoryMenu =
      isAdmin ||
      canAccessMemberDirectory(hasPermission) ||
      canAccessMemberDirectoryFromPermissionStrings(user?.permissions);
    const canManageGoals =
      isAdmin ||
      hasPermission({ resource: 'GOAL', action: 'CREATE', scope: 'team' }) ||
      hasPermission({ resource: 'GOAL', action: 'CREATE', scope: 'company' }) ||
      hasPermission({ resource: 'GOAL', action: 'UPDATE', scope: 'team' }) ||
      hasPermission({ resource: 'GOAL', action: 'UPDATE', scope: 'company' });
    const canManageEvaluation =
      canManageGoals &&
      (hasPermission(PERM.EVALUATION_CREATE) ||
        hasPermission(PERM.EVALUATION_UPDATE) ||
        hasPermission(PERM.EVALUATION_READ));
    const canViewCompanyGoals =
      isAdmin || hasPermission({ resource: 'GOAL', action: 'READ', scope: 'company' });
    const talentHubChildren: NonNullable<MenuProps['items']> = [
      {
        key: encodeWfNavKey({ to: '/app/performance', search: { view: 'my' } }),
        icon: <LineChartOutlined className="tw-text-lg" />,
        label: '내 목표',
        title: '내 목표',
      },
      ...(canManageGoals
        ? [
            {
              key: encodeWfNavKey({ to: '/app/performance', search: { view: 'org' } }),
              icon: <TeamOutlined className="tw-text-lg" />,
              label: '조직 목표 관리',
              title: '조직 목표 관리',
            },
          ]
        : []),
      ...(canViewCompanyGoals
        ? [
            {
              key: encodeWfNavKey({ to: '/app/performance', search: { view: 'company' } }),
              icon: <GlobalOutlined className="tw-text-lg" />,
              label: '전사 목표 현황',
              title: '전사 목표 현황',
            },
          ]
        : []),
      {
        key: '/app/evaluations',
        icon: <FormOutlined className="tw-text-lg" />,
        label: '내 평가',
        title: '내 평가',
      },
      {
        key: '/app/meetings',
        icon: <VideoCameraOutlined className="tw-text-lg" />,
        label: '면담',
        title: '면담',
      },
      ...(canManageEvaluation
        ? [
            {
              key: encodeWfNavKey({ to: '/app/evaluations', search: { view: 'overview' } }),
              icon: <CalendarOutlined className="tw-text-lg" />,
              label: '평가 운영 관리',
              title: '평가 운영 관리',
            },
          ]
        : []),
    ];
    const contractSendMenuItem = {
      key: '/app/contracts/send' as const,
      icon: APP_MENU_ICONS['/app/contracts/send'],
      label: APP_MENU_LABEL['/app/contracts/send'],
      title: APP_MENU_LABEL['/app/contracts/send'],
    };
    let hrGroupExtraChildren: NonNullable<MenuProps['items']> | undefined;
    if (showApprovalFormSettings) {
      hrGroupExtraChildren = [
        {
          key: encodeWfNavKey({ to: '/app/approvals', search: { tab: 'admin' } }),
          icon: <SettingOutlined className="tw-text-lg" />,
          label: '결재 양식 설정',
          title: '결재 양식 설정',
        },
        ...(showMemberDirectoryMenu ? [contractSendMenuItem] : []),
        ...(isAdmin
          ? [
              {
                key: '/app/leave/absence',
                icon: <PauseCircleOutlined className="tw-text-lg" />,
                label: APP_MENU_LABEL['/app/leave/absence'],
                title: APP_MENU_LABEL['/app/leave/absence'],
              },
              // 연차 촉진 알림 현황 - 운영 모니터링 메뉴 (인사 관리 그룹)
              {
                key: '/app/leave/promotion-no-response',
                icon: <BellOutlined className="tw-text-lg" />,
                label: APP_MENU_LABEL['/app/leave/promotion-no-response'],
                title: APP_MENU_LABEL['/app/leave/promotion-no-response'],
              },
            ]
          : []),
      ];
    } else if (showMemberDirectoryMenu) {
      hrGroupExtraChildren = [contractSendMenuItem];
    } else {
      hrGroupExtraChildren = undefined;
    }
    const leavePromotionEnabled = (leavePoliciesForMenu ?? []).some((p) => p.isPromotionYn === 'Y');
    const showSalaryNegotiationSubmenu = hasActiveNegotiationSalaryPolicy(salaryPoliciesForMenu);
    const items = buildAppShellMenuItems(
      isAdmin,
      approvalMenuChildren,
      showMemberDirectoryMenu,
      hrGroupExtraChildren,
      leavePromotionEnabled,
      showSalaryNegotiationSubmenu,
      talentHubChildren,
    );

    const esgMenuItem =
      esgPaths.length > 0
        ? {
            key: ESG_GROUP_KEY,
            icon: <GlobalOutlined className="tw-text-lg" />,
            label: APP_MENU_ESG_GROUP_LABEL,
            title: APP_MENU_ESG_GROUP_LABEL,
            children: esgPaths.map((p) => ({
              key: p,
              icon: ESG_MENU_ICONS[p],
              label: ESG_MENU_LABEL[p],
              title: ESG_MENU_LABEL[p],
            })),
          }
        : null;

    if (!isAdmin) {
      return {
        items: esgMenuItem ? [...items, esgMenuItem] : items,
        showSalaryNegotiationSubmenu: false,
      };
    }

    /** 시스템 관리자: HR 정책 문서 항목을 메뉴 끝에 ESG 다음에 배치 */
    const doc = {
      key: '/app/ai-documents',
      icon: <RobotOutlined className="tw-text-lg" />,
      label: 'HR 정책 문서',
      title: 'HR 정책 문서',
    };
    // 자동 작업 관리 - HR 정책 문서 다음 (시스템 설정 영역)
    const batchSchedule = {
      key: '/app/admin/batch-schedule',
      icon: <ScheduleOutlined className="tw-text-lg" />,
      label: APP_MENU_LABEL['/app/admin/batch-schedule'],
      title: APP_MENU_LABEL['/app/admin/batch-schedule'],
    };

    if (esgMenuItem) {
      return { items: [...items, esgMenuItem, doc, batchSchedule], showSalaryNegotiationSubmenu };
    }
    return { items: [...items, doc, batchSchedule], showSalaryNegotiationSubmenu };
  }, [
    esgConfig,
    isAdmin,
    approvalOrgChart,
    status,
    user?.permissions,
    myDashboardProfile?.organizationName,
    user?.departmentName,
    showApprovalFormSettings,
    leavePoliciesForMenu,
    salaryPoliciesForMenu,
    hasPermission,
  ]);
}

const headerGhostIconClass =
  'tw-flex tw-size-11 tw-appearance-none tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-transparent tw-text-slate-500 tw-shadow-none tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-800 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#2563EB]';

const headerSearchFieldClass =
  'tw-max-w-[560px] !tw-h-12 !tw-rounded-[24px] !tw-bg-white !tw-px-4 !tw-shadow-[inset_0_0_0_1px_#D8E1F1] hover:!tw-bg-white hover:!tw-shadow-[inset_0_0_0_1px_#B9C8DE] focus-within:!tw-bg-white focus-within:!tw-shadow-[inset_0_0_0_2px_#2563EB,0_0_0_3px_rgba(37,99,235,0.08)] [&_.ant-input]:!tw-bg-transparent [&_.ant-input]:!tw-text-slate-800 [&_.ant-input]:tw-placeholder:!tw-text-slate-400';

const headerAiRecordButtonClass =
  'tw-inline-flex tw-h-10 tw-appearance-none tw-items-center tw-justify-center tw-gap-1.5 tw-rounded-full tw-border-0 tw-bg-gradient-to-r tw-from-[#1598ff] tw-via-[#2563eb] tw-to-[#8b5cf6] tw-px-4 tw-text-sm tw-font-bold tw-text-white tw-shadow-[0_8px_18px_rgba(37,99,235,0.20)] tw-transition-[background,box-shadow,filter] hover:tw-brightness-105 hover:tw-shadow-[0_10px_22px_rgba(99,102,241,0.24)] focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#60a5fa]';

const headerAiRecordActiveButtonClass =
  'tw-inline-flex tw-h-10 tw-appearance-none tw-items-center tw-justify-center tw-gap-2 tw-rounded-full tw-border tw-border-solid tw-border-blue-200 tw-bg-white tw-px-3.5 tw-text-sm tw-font-bold tw-text-[#0f2542] tw-shadow-[0_10px_24px_rgba(15,23,42,0.10)] tw-transition-[border-color,box-shadow,transform] hover:tw-border-blue-300 hover:tw-shadow-[0_12px_28px_rgba(37,99,235,0.16)] focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[#60a5fa]';

const headerAiRecordHintClass =
  'tw-pointer-events-none tw-absolute tw-left-1/2 tw-top-[calc(100%+10px)] tw-z-[1070] -tw-translate-x-1/2 tw-translate-y-1 tw-whitespace-nowrap tw-rounded-2xl tw-bg-white tw-px-3.5 tw-py-2 tw-text-xs tw-font-semibold tw-text-slate-700 tw-shadow-[0_10px_24px_rgba(15,23,42,0.14)] tw-ring-1 tw-ring-slate-200/80 tw-opacity-0 tw-transition-all tw-duration-200 before:tw-absolute before:tw-bottom-full before:tw-left-1/2 before:-tw-translate-x-1/2 before:tw-border-x-[6px] before:tw-border-b-[7px] before:tw-border-x-transparent before:tw-border-b-white group-hover:tw-translate-y-0 group-hover:tw-opacity-100 group-focus-within:tw-translate-y-0 group-focus-within:tw-opacity-100';

function SiderBrandHeader({
  collapsed,
  onClick,
  onToggleSider,
}: {
  collapsed?: boolean;
  onClick?: () => void;
  onToggleSider?: () => void;
}) {
  const { user, status } = useAuth();
  const { data: companyInfo } = useQuery({
    queryKey: ['company', 'info'],
    queryFn: () => companyApi.getCompanyInfo(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
    retry: false,
  });

  const companyName =
    companyInfo?.companyName?.trim() || user?.companyName?.trim() || APP_BRAND_NAME;

  const logoUrl = (() => {
    if (companyInfo) {
      const u = companyInfo.logoUrl;
      if (typeof u === 'string' && u.trim()) return u.trim();
      return undefined;
    }
    return user?.companyLogoUrl?.trim();
  })();

  const domainLine = companyInfo?.companyDomain?.trim() || 'WORKFORCE HRMS';

  const initial = (companyName[0] ?? 'W').toUpperCase();

  const avatar = (
    <Avatar
      src={logoUrl || undefined}
      alt=""
      shape="square"
      size={collapsed ? 40 : 36}
      className={
        logoUrl
          ? 'tw-shrink-0 tw-rounded-xl tw-bg-white [&_img]:tw-h-full [&_img]:tw-w-full [&_img]:tw-object-contain'
          : 'tw-shrink-0 tw-rounded-xl tw-bg-[#2563EB] tw-text-sm tw-font-bold tw-text-white'
      }
    >
      {initial}
    </Avatar>
  );

  if (collapsed) {
    const slotClass =
      'tw-absolute tw-inset-0 tw-flex tw-items-center tw-justify-center tw-rounded-xl tw-transition-opacity tw-duration-200 tw-ease-out';
    return (
      <Tooltip title={companyName} placement="right">
        <div className="tw-group tw-relative tw-mx-auto tw-flex tw-size-10 tw-shrink-0 tw-items-center tw-justify-center">
          <button
            type="button"
            className={`${slotClass} tw-z-[1] tw-cursor-pointer tw-border-0 tw-bg-transparent tw-opacity-100 tw-pointer-events-auto group-hover:tw-pointer-events-none group-hover:tw-opacity-0`}
            onClick={onClick}
            aria-label="대시보드로 이동"
          >
            {avatar}
          </button>
          <button
            type="button"
            aria-label="사이드바 펼치기"
            className={`${slotClass} tw-z-[2] tw-cursor-pointer tw-border-0 tw-bg-slate-100 tw-text-slate-600 tw-opacity-0 tw-pointer-events-none group-hover:tw-pointer-events-auto group-hover:tw-opacity-100 hover:tw-bg-slate-200`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSider?.();
            }}
          >
            <SiderPanelToggleIcon className="tw-text-[20px]" />
          </button>
        </div>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      className="tw-flex tw-min-w-0 tw-flex-1 tw-cursor-pointer tw-items-center tw-gap-2 tw-border-0 tw-bg-transparent tw-p-0 tw-text-left"
      onClick={onClick}
      aria-label="대시보드로 이동"
    >
      {avatar}
      <div className="tw-flex tw-min-w-0 tw-flex-col tw-leading-tight">
        <span
          className="tw-truncate tw-text-base tw-font-semibold tw-tracking-tight tw-text-slate-900"
          title={companyName}
        >
          {companyName}
        </span>
        <span
          className="tw-truncate tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-[0.08em] tw-text-slate-500"
          title={domainLine}
        >
          {domainLine}
        </span>
      </div>
    </button>
  );
}

function SiderAccountPopoverContent({
  onClose,
  profileSrc,
  nameLine,
  departmentLine,
  emailLine,
  onMyPage,
  onLogout,
}: {
  onClose: () => void;
  profileSrc?: string;
  nameLine: string;
  departmentLine: string;
  emailLine: string;
  onMyPage: () => void;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="tw-relative tw-w-[min(100vw-24px,288px)] tw-max-w-[288px] tw-px-4 tw-pb-5 tw-pt-2">
      <button
        type="button"
        className="tw-absolute tw-right-2 tw-top-2 tw-flex tw-size-8 tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-transparent tw-text-slate-400 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-700"
        aria-label="닫기"
        onClick={onClose}
      >
        <CloseOutlined />
      </button>
      <div className="tw-flex tw-flex-col tw-items-center tw-px-2 tw-pt-8">
        <Avatar
          src={profileSrc || undefined}
          alt=""
          shape="square"
          size={88}
          icon={
            !profileSrc ? <UserOutlined className="tw-text-3xl tw-text-slate-500" /> : undefined
          }
          className={
            profileSrc
              ? '[&_img]:tw-h-full [&_img]:tw-w-full [&_img]:tw-object-cover tw-rounded-2xl'
              : 'tw-rounded-2xl tw-bg-slate-100'
          }
        />
        <div
          className="tw-mt-4 tw-text-center tw-text-base tw-font-bold tw-text-slate-900"
          title={nameLine}
        >
          {nameLine}
        </div>
        <div className="tw-mt-1 tw-text-center tw-text-sm tw-text-slate-700" title={departmentLine}>
          {departmentLine}
        </div>
        <div className="tw-mt-1 tw-text-center tw-text-xs tw-text-slate-500" title={emailLine}>
          {emailLine}
        </div>
      </div>
      <div className="tw-mt-8 tw-flex tw-w-full tw-flex-wrap tw-justify-center tw-gap-x-6 tw-gap-y-3">
        <button
          type="button"
          className="group tw-flex tw-flex-col tw-items-center tw-gap-2 tw-border-0 tw-bg-transparent tw-p-0 tw-text-slate-700 tw-transition-colors hover:tw-text-slate-900"
          onClick={() => {
            onClose();
            onMyPage();
          }}
        >
          <span className="tw-flex tw-size-14 tw-items-center tw-justify-center tw-rounded-full tw-bg-slate-100 tw-text-lg tw-text-slate-600 tw-transition-colors group-hover:tw-bg-slate-200">
            <UserOutlined />
          </span>
          <span className="tw-text-xs tw-font-medium tw-text-slate-600">마이페이지</span>
        </button>
        <button
          type="button"
          className="group tw-flex tw-flex-col tw-items-center tw-gap-2 tw-border-0 tw-bg-transparent tw-p-0 tw-text-slate-700 tw-transition-colors hover:tw-text-slate-900"
          onClick={() => {
            onClose();
            void onLogout();
          }}
        >
          <span className="tw-flex tw-size-14 tw-items-center tw-justify-center tw-rounded-full tw-bg-slate-100 tw-text-lg tw-text-slate-600 tw-transition-colors group-hover:tw-bg-slate-200">
            <PoweroffOutlined />
          </span>
          <span className="tw-text-xs tw-font-medium tw-text-slate-600">로그아웃</span>
        </button>
      </div>
    </div>
  );
}

/** 헤더 우측 계정 아바타·설정·로그아웃 (기존 사이드바 하단 계정 영역 이동) */
function AppShellAccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  const memberId = user?.id?.trim();

  const { data: memberProfile } = useQuery({
    queryKey: ['member', 'dashboard-profile', memberId],
    queryFn: () => memberApi.dashboardProfile(),
    enabled: Boolean(memberId),
    retry: false,
  });

  const handleLogout = async () => {
    await logout();
    await navigate({ to: '/login' });
  };

  const name = user?.name?.trim() || '사용자';
  const jobTitle =
    memberProfile?.jobTitleName?.trim() ||
    memberProfile?.jobGradeName?.trim() ||
    user?.jobTitle?.trim() ||
    '';
  const nameLine = jobTitle ? `${name} ${jobTitle}` : name;
  const orgLine =
    memberProfile?.organizationName?.trim() ||
    user?.departmentName?.trim() ||
    user?.companyName?.trim() ||
    '소속 정보 없음';
  const emailLine = user?.email?.trim() || '이메일 정보 없음';
  const profileSrc =
    memberProfile?.profileUrl?.trim() || user?.profileImageUrl?.trim() || undefined;

  const avatar = (
    <Avatar
      src={profileSrc || undefined}
      alt=""
      icon={!profileSrc ? <UserOutlined className="tw-text-base tw-text-slate-500" /> : undefined}
      className={profileSrc ? '[&_img]:tw-object-cover' : 'tw-bg-slate-100'}
      size={36}
    />
  );

  const popoverContent = (
    <SiderAccountPopoverContent
      onClose={() => setAccountPopoverOpen(false)}
      profileSrc={profileSrc}
      nameLine={nameLine}
      departmentLine={orgLine}
      emailLine={emailLine}
      onMyPage={() => {
        void navigate({ to: '/app/me' });
      }}
      onLogout={handleLogout}
    />
  );

  const popoverCommon = {
    open: accountPopoverOpen,
    onOpenChange: setAccountPopoverOpen,
    trigger: 'click' as const,
    arrow: false,
    getPopupContainer: () => document.body,
    styles: { body: { padding: 0 } } as const,
    content: popoverContent,
  };

  return (
    <div className="tw-relative tw-ml-0.5 tw-inline-flex tw-shrink-0 tw-pl-2.5 md:tw-pl-3 before:tw-pointer-events-none before:tw-absolute before:tw-left-0 before:tw-top-1/2 before:tw-z-0 before:tw-h-[22px] before:tw-w-px before:-tw-translate-y-1/2 before:tw-bg-slate-200 before:tw-content-['']">
      <Popover {...popoverCommon} placement="bottomRight" align={{ offset: [0, 6] }}>
        <div
          className="tw-relative tw-z-[1] tw-flex tw-min-w-0 tw-max-w-[min(100vw-96px,280px)] tw-shrink-0 tw-cursor-pointer tw-items-center tw-gap-2 tw-rounded-lg tw-py-1 tw-pr-1.5 tw-outline-none hover:tw-bg-slate-100/90 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-500/30 md:tw-gap-2.5 md:tw-pr-2.5"
          role="button"
          tabIndex={0}
          aria-label="계정 정보"
          aria-expanded={accountPopoverOpen}
          aria-haspopup="dialog"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setAccountPopoverOpen((o) => !o);
            }
          }}
        >
          {avatar}
          <div className="tw-hidden tw-min-w-0 tw-flex-1 md:tw-block">
            <div
              className="tw-truncate tw-text-left tw-text-sm tw-font-semibold tw-text-slate-900"
              title={name}
            >
              {name}
            </div>
            <div className="tw-truncate tw-text-left tw-text-xs tw-text-slate-500" title={orgLine}>
              {orgLine}
            </div>
          </div>
        </div>
      </Popover>
    </div>
  );
}

function AppShellHeader({ hideSearch = false }: { hideSearch?: boolean }) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openMemberChat } = useMemberChatOpener();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [headerDetailMemberId, setHeaderDetailMemberId] = useState<string | null>(null);
  const [notificationPopoverOpen, setNotificationPopoverOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<'all' | 'unread'>('all');
  const [aiRecordingModalOpen, setAiRecordingModalOpen] = useState(false);
  const [aiRecordingRestoreSignal, setAiRecordingRestoreSignal] = useState(0);
  const [aiRecordingState, setAiRecordingState] = useState({
    isRecording: false,
    elapsedSec: 0,
    minimized: false,
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data: searchResult, isFetching: searchLoading } = useQuery({
    queryKey: ['search', 'employees', debouncedSearch],
    queryFn: () => searchApi.searchEmployees(debouncedSearch, 0, 10),
    enabled: debouncedSearch.length > 0,
    staleTime: 10_000,
  });

  const list = searchResult?.content ?? [];
  const showSearchPanel = search.trim().length > 0;

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => notificationApi.unreadCount(),
    enabled: status === 'authenticated',
    staleTime: 10_000,
  });
  const { data: notifications = [], isFetching: notificationsLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationApi.list(),
    enabled: status === 'authenticated',
    staleTime: 10_000,
  });
  const markNotificationAsRead = useMutation({
    mutationFn: (notificationId: string) => notificationApi.markAsRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const deleteNotificationM = useMutation({
    mutationFn: (notificationId: string) => notificationApi.deleteNotification(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  /**
   * 헤더 채팅 아이콘 배지에 모든 방의 unreadCount 합산.
   * `MemberChatPanel` 과 동일한 query key 를 공유하므로 캐시/invalidate 가 자동으로 맞춤.
   */
  const { data: myChatRooms = [] } = useQuery({
    queryKey: ['member-chat', 'rooms'],
    queryFn: () => memberChatApi.listMyRooms(),
    enabled: status === 'authenticated',
    // 1차 동기화는 MemberChatLiveSyncAgent 가 STOMP 구독으로 처리(메시지 수신 시 즉시 invalidate).
    // 백업은 STOMP 미연결·네트워크 끊김 대비 폴링(30s) 융합.
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const chatUnreadTotal = myChatRooms.reduce(
    (sum, r) => sum + (typeof r.unreadCount === 'number' ? r.unreadCount : 0),
    0,
  );

  useEffect(() => {
    if (status !== 'authenticated') return;
    const unsubscribe = notificationApi.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return unsubscribe;
  }, [queryClient, status]);

  const isApprovalNotification = (type: string): boolean => {
    const t = String(type ?? '').toUpperCase();
    return t.startsWith('APPROVAL_');
  };
  const isGoalBundleNotification = (type: string, targetType?: string): boolean => {
    const t = String(type ?? '').toUpperCase();
    const tt = String(targetType ?? '').toUpperCase();
    // 과거/향후 스키마 모두 지원:
    // 1) notificationType=GOAL_BUNDLE_*
    // 2) notificationType=GOAL_EVALUATED + targetType=GOAL_BUNDLE_*
    return t.startsWith('GOAL_BUNDLE_') || tt.startsWith('GOAL_BUNDLE_');
  };
  const isRoutableNotification = (item: (typeof notifications)[number]): boolean => {
    return (
      isApprovalNotification(item.notificationType) ||
      isGoalBundleNotification(item.notificationType, item.targetType) ||
      isContractNotificationRoutable(item)
    );
  };
  const filteredNotifications =
    notificationTab === 'unread'
      ? notifications.filter((item) => item.isRead !== 'YES')
      : notifications;
  const latestNotifications = filteredNotifications.slice(0, 8);
  const aiRecordingMm = String(Math.floor(aiRecordingState.elapsedSec / 60)).padStart(2, '0');
  const aiRecordingSs = String(aiRecordingState.elapsedSec % 60).padStart(2, '0');

  const routeApprovalNotification = async (item: (typeof notifications)[number]) => {
    if (item.isRead !== 'YES') {
      await markNotificationAsRead.mutateAsync(item.notificationId);
    }
    if (isContractNotificationRoutable(item)) {
      await navigate(buildContractNotificationNavigate(resolveContractNotificationTargetId(item)));
      setNotificationPopoverOpen(false);
      return;
    }
    if (isGoalBundleNotification(item.notificationType, item.targetType)) {
      await navigate(
        buildGoalBundleNotificationNavigate({
          notificationType: item.notificationType,
          targetType: item.targetType,
          title: item.title,
          content: item.content,
          targetId: item.targetId,
        }),
      );
    } else {
      await navigate(
        buildApprovalNotificationNavigate({
          notificationType: item.notificationType,
          targetType: item.targetType,
          title: item.title,
          content: item.content,
          targetId: item.targetId,
        }),
      );
    }
    setNotificationPopoverOpen(false);
  };

  const notificationPopoverContent = (
    <div className="tw-w-[360px] tw-max-w-[86vw] tw-space-y-3 tw-p-1">
      <div className="tw-flex tw-items-center tw-justify-between">
        <div className="tw-text-sm tw-font-semibold tw-text-slate-900">알림 센터</div>
        <button
          type="button"
          className="tw-cursor-pointer tw-border-0 tw-bg-transparent tw-text-xs tw-font-medium tw-text-blue-600 hover:tw-text-blue-700"
          onClick={() => {
            setNotificationPopoverOpen(false);
            void navigate({ to: '/app/notifications' });
          }}
        >
          전체 페이지
        </button>
      </div>
      <div className="tw-inline-flex tw-w-full tw-rounded-lg tw-bg-slate-100 tw-p-1">
        <button
          type="button"
          className={`tw-flex-1 tw-rounded-md tw-border-0 tw-px-3 tw-py-1.5 tw-text-sm tw-font-medium ${
            notificationTab === 'all'
              ? 'tw-bg-white tw-text-slate-900 tw-shadow-sm'
              : 'tw-bg-transparent tw-text-slate-500'
          }`}
          onClick={() => setNotificationTab('all')}
        >
          전체 알림
        </button>
        <button
          type="button"
          className={`tw-flex-1 tw-rounded-md tw-border-0 tw-px-3 tw-py-1.5 tw-text-sm tw-font-medium ${
            notificationTab === 'unread'
              ? 'tw-bg-white tw-text-slate-900 tw-shadow-sm'
              : 'tw-bg-transparent tw-text-slate-500'
          }`}
          onClick={() => setNotificationTab('unread')}
        >
          읽지 않은 알림
        </button>
      </div>
      <div className="tw-max-h-[380px] tw-space-y-2 tw-overflow-y-auto tw-pr-1">
        {notificationsLoading ? (
          <div className="tw-flex tw-items-center tw-justify-center tw-py-6">
            <Spin size="small" />
          </div>
        ) : latestNotifications.length === 0 ? (
          <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-5 tw-text-center tw-text-sm tw-text-slate-500">
            {notificationTab === 'unread' ? '읽지 않은 알림이 없습니다.' : '알림이 없습니다.'}
          </div>
        ) : (
          latestNotifications.map((item) => {
            const unread = item.isRead !== 'YES';
            const routable = isRoutableNotification(item);
            return (
              <div
                key={item.notificationId}
                role={routable ? 'button' : undefined}
                tabIndex={routable ? 0 : undefined}
                className={`tw-rounded-xl tw-border tw-px-3 tw-py-2.5 tw-transition-opacity ${
                  unread
                    ? 'tw-border-blue-200 tw-bg-blue-50/50 tw-opacity-100'
                    : 'tw-border-slate-200 tw-bg-white tw-opacity-60'
                } ${routable ? 'tw-cursor-pointer hover:tw-bg-slate-50' : ''}`}
                onClick={() => {
                  if (!routable) return;
                  void routeApprovalNotification(item);
                }}
                onKeyDown={(e) => {
                  if (!(e.key === 'Enter' || e.key === ' ')) return;
                  e.preventDefault();
                  if (!routable) return;
                  void routeApprovalNotification(item);
                }}
              >
                <div className="tw-flex tw-items-start tw-justify-between tw-gap-2">
                  <div className="tw-min-w-0">
                    <div className="tw-flex tw-items-center tw-gap-1.5">
                      <div
                        className={`tw-truncate tw-text-sm ${unread ? 'tw-font-semibold tw-text-slate-900' : 'tw-font-medium tw-text-slate-600'}`}
                      >
                        {item.title}
                      </div>
                      {unread ? (
                        <span className="tw-size-1.5 tw-rounded-full tw-bg-red-500" />
                      ) : null}
                    </div>
                    <div className="tw-mt-1 tw-line-clamp-2 tw-text-xs tw-text-slate-600">
                      {item.content}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="tw-shrink-0 tw-cursor-pointer tw-border-0 tw-bg-transparent tw-text-[11px] tw-font-medium tw-text-rose-600 hover:tw-text-rose-700"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void deleteNotificationM.mutateAsync(item.notificationId);
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <Layout.Header className="tw-m-0 tw-flex tw-h-16 tw-shrink-0 tw-items-center tw-gap-3 tw-overflow-visible tw-border-0 tw-border-b tw-border-solid tw-border-slate-200 tw-bg-white tw-px-4 tw-leading-none tw-shadow-none md:tw-gap-6 md:tw-px-7">
      {hideSearch ? (
        <div className="tw-flex-1" />
      ) : (
        <div className="tw-relative tw-flex tw-min-w-0 tw-flex-1 tw-justify-start">
          <AppSearchField
            className={headerSearchFieldClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="메뉴, 동료, 문서 검색"
            aria-label="메뉴, 동료, 문서 검색"
            prefix={<SearchOutlined className="tw-text-[22px] tw-text-[#2563EB]" />}
          />
          {showSearchPanel && (
            <div className="tw-absolute tw-left-0 tw-top-[calc(100%+8px)] tw-z-50 tw-w-full tw-max-w-2xl tw-overflow-hidden tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-shadow-xl">
              {searchLoading ? (
                <div className="tw-flex tw-items-center tw-justify-center tw-p-6">
                  <Spin size="small" />
                </div>
              ) : list.length === 0 ? (
                <div className="tw-p-4">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="검색 결과가 없습니다." />
                </div>
              ) : (
                <div className="tw-max-h-[420px] tw-overflow-y-auto tw-py-1">
                  {list.map((row) => {
                    if (!row.memberId) return null;
                    return (
                      <div
                        key={row.memberId}
                        role="button"
                        tabIndex={0}
                        className="tw-flex tw-cursor-pointer tw-items-start tw-gap-3 tw-px-4 tw-py-3 hover:tw-bg-slate-50"
                        onClick={() => {
                          setHeaderDetailMemberId(row.memberId);
                          setSearch('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setHeaderDetailMemberId(row.memberId);
                            setSearch('');
                          }
                        }}
                      >
                        <Avatar
                          src={row.profileUrl || undefined}
                          icon={!row.profileUrl ? <UserOutlined /> : undefined}
                          size={32}
                          className={row.profileUrl ? '[&_img]:tw-object-cover' : 'tw-bg-slate-100'}
                        />
                        <div className="tw-min-w-0 tw-flex-1">
                          <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">
                            {row.name ?? '이름 없음'}
                          </div>
                          <div className="tw-truncate tw-text-xs tw-text-slate-500">
                            {row.email ?? '이메일 정보 없음'}
                          </div>
                          <div className="tw-truncate tw-text-xs tw-text-slate-400">
                            {[row.organizationName, row.jobTitleName, row.memberStatus]
                              .filter(Boolean)
                              .join(' · ') || '소속 정보 없음'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <HeaderSearchMemberDetailModal
        open={headerDetailMemberId != null}
        memberId={headerDetailMemberId}
        onClose={() => setHeaderDetailMemberId(null)}
      />

      <div className="tw-flex tw-shrink-0 tw-items-center tw-gap-3 tw-overflow-visible md:tw-gap-3.5">
        <SessionAccessTimer />
        <div className="tw-group tw-relative tw-inline-flex tw-overflow-visible">
          <button
            type="button"
            className={aiRecordingState.isRecording ? headerAiRecordActiveButtonClass : headerAiRecordButtonClass}
            aria-label="AI 회의록"
            aria-describedby="header-ai-record-hint"
            onClick={() => {
              setAiRecordingRestoreSignal((v) => v + 1);
              setAiRecordingModalOpen(true);
            }}
          >
            {aiRecordingState.isRecording ? (
              <>
                <span className="tw-size-2 tw-shrink-0 tw-rounded-full tw-bg-red-500 tw-shadow-[0_0_0_4px_rgba(239,68,68,0.12)]" />
                <span className="tw-whitespace-nowrap">AI 녹음 중</span>
                <span className="tw-rounded-full tw-bg-blue-50 tw-px-2 tw-py-0.5 tw-text-xs tw-font-extrabold tw-tabular-nums tw-text-blue-600">
                  {aiRecordingMm}:{aiRecordingSs}
                </span>
              </>
            ) : (
              <>
                <svg
                  className="tw-size-3.5 tw-shrink-0 tw-origin-center tw-transition-transform tw-duration-200 group-hover:tw-scale-125 group-focus-within:tw-scale-125"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M8 1.75L9.18 5.28L12.75 6.5L9.18 7.72L8 11.25L6.82 7.72L3.25 6.5L6.82 5.28L8 1.75Z"
                    fill="currentColor"
                  />
                  <path
                    d="M3.15 9.8L3.62 11.18L5 11.65L3.62 12.12L3.15 13.5L2.68 12.12L1.3 11.65L2.68 11.18L3.15 9.8Z"
                    fill="currentColor"
                    opacity="0.9"
                  />
                </svg>
                <span className="tw-whitespace-nowrap">AI 회의록</span>
              </>
            )}
          </button>
          <div id="header-ai-record-hint" className={headerAiRecordHintClass}>
            {aiRecordingState.isRecording
              ? '녹음 중인 회의록 화면으로 돌아갑니다.'
              : '녹음 원문을 정리해 AI 회의록을 만들어드려요.'}
          </div>
        </div>
        <Tooltip title="멤버 채팅">
          <Badge
            count={chatUnreadTotal}
            color="#EF4444"
            offset={[-8, 8]}
            showZero={false}
            overflowCount={99}
          >
            <button
              type="button"
              className={headerGhostIconClass}
              aria-label={`멤버 채팅${chatUnreadTotal > 0 ? ` (읽지 않은 메시지 ${chatUnreadTotal}건)` : ''}`}
              onClick={() => openMemberChat()}
            >
              <MessageOutlined className="tw-text-[20px]" />
            </button>
          </Badge>
        </Tooltip>
        <Popover
          trigger="click"
          placement="bottomRight"
          open={notificationPopoverOpen}
          onOpenChange={setNotificationPopoverOpen}
          content={notificationPopoverContent}
          overlayClassName="tw-z-[1060]"
        >
          <Badge
            count={unreadCount}
            color="#EF4444"
            offset={[-8, 8]}
            showZero={false}
            overflowCount={99}
          >
            <button
              type="button"
              className={headerGhostIconClass}
              aria-label={`알림${unreadCount > 0 ? ` (읽지 않은 알림 ${unreadCount}건)` : ''}`}
            >
              <BellOutlined className="tw-text-[20px]" />
            </button>
          </Badge>
        </Popover>
        <AppShellAccountMenu />
      </div>
      <AiRecordingModal
        open={aiRecordingModalOpen}
        restoreSignal={aiRecordingRestoreSignal}
        onRecordingStateChange={setAiRecordingState}
        onClose={() => setAiRecordingModalOpen(false)}
      />
    </Layout.Header>
  );
}

function menuSelectedKeyFromPath(pathname: string, search: Record<string, unknown>): string[] {
  if (/^\/app\/members\/[^/]+$/.test(pathname)) return ['/app/members'];
  if (/^\/app\/meetings\/[^/]+$/.test(pathname)) return ['/app/meetings'];
  if (pathname === '/app/performance') {
    const view = typeof search.view === 'string' ? search.view : 'my';
    if (view === 'org')
      return [encodeWfNavKey({ to: '/app/performance', search: { view: 'org' } })];
    if (view === 'company')
      return [encodeWfNavKey({ to: '/app/performance', search: { view: 'company' } })];
    return [encodeWfNavKey({ to: '/app/performance', search: { view: 'my' } })];
  }
  if (/^\/app\/performance\//.test(pathname))
    return [encodeWfNavKey({ to: '/app/performance', search: { view: 'my' } })];
  if (/^\/app\/evaluations\/seasons\//.test(pathname)) {
    return [encodeWfNavKey({ to: '/app/evaluations', search: { view: 'overview' } })];
  }
  if (pathname === '/app/evaluations') {
    const view = typeof search.view === 'string' ? search.view : '';
    if (view === 'overview')
      return [encodeWfNavKey({ to: '/app/evaluations', search: { view: 'overview' } })];
    return ['/app/evaluations'];
  }
  if (/^\/app\/evaluation-flow(\/|$)/.test(pathname)) return ['/app/evaluations'];
  if (/^\/app\/my-evaluation-result-v2(\/|$)/.test(pathname)) return ['/app/evaluations'];
  if (/^\/app\/evaluation-admin(\/|$)/.test(pathname)) return ['/app/evaluations'];
  if (pathname === '/app/attendance/monthly') return ['/app/attendance'];
  if (pathname === '/app/attendance/schedules/my') return ['/app/attendance/schedules/my'];
  if (pathname === '/app/attendance/overtime') return ['/app/attendance/overtime'];
  // 월간·근무시간 등 근무 하위를 근무 그룹에 매칭 (직접 URL 진입 시에도 해당 메뉴 선택)
  if (pathname === '/app/attendance/work-time') return ['/app/attendance'];
  if (pathname === '/app/attendance/company/monthly') return ['/app/attendance/company'];
  if (pathname === '/app/attendance/company') return ['/app/attendance/company'];
  if (pathname === '/app/attendance/holidays') return ['/app/attendance/holidays'];
  if (pathname === '/app/attendance/schedules') return ['/app/attendance/schedules'];
  if (pathname === '/app/attendance/overtime-policies')
    return ['/app/attendance/overtime-policies'];
  if (pathname === '/app/attendance/flexible-slots') return ['/app/attendance/schedules'];
  if (pathname === '/app/attendance/overtime-status') return ['/app/attendance/company'];
  if (pathname === '/app/attendance/comprehensive-ot') return ['/app/attendance/company'];
  if (pathname === '/app/attendance') return ['/app/attendance'];
  if (pathname === '/app/work-trips') return ['/app/work-trips'];
  if (pathname === '/app/leave/policies') return ['/app/leave/policies'];
  if (pathname === '/app/leave/absence') return ['/app/leave/absence'];
  if (pathname === '/app/leave/types') return ['/app/leave/types'];
  // 사이드바 노출 제거 — 부모 메뉴 /app/leave 로 하이라이트
  if (pathname === '/app/leave/my-promotion') return ['/app/leave'];
  if (pathname === '/app/leave/promotion-no-response') return ['/app/leave/promotion-no-response'];
  if (pathname === '/app/leave') return ['/app/leave'];
  if (pathname === '/app/salary/unused-leave') return ['/app/payroll/admin'];
  if (pathname === '/app/salary/settings') return ['/app/salary/settings'];
  if (pathname === '/app/salary/pay-grade-table') return ['/app/salary/settings'];
  if (pathname === '/app/salary/retirement-policy') return ['/app/salary/retirement-policy'];
  if (pathname === '/app/salary/negotiations') return ['/app/salary/negotiations'];
  if (pathname === '/app/salary/bonus-policy') return ['/app/salary/bonus-policy'];
  if (pathname === '/app/payroll/allowances') return ['/app/payroll/allowances'];
  if (pathname === '/app/payroll/retirement') return ['/app/payroll/retirement'];
  if (pathname === '/app/payroll/negotiations') return ['/app/payroll/negotiations'];
  if (pathname === '/app/payroll/annual') return ['/app/payroll/annual'];
  if (pathname === '/app/income') return ['/app/income'];
  if (pathname === '/app/payroll/tax-summary') return ['/app/payroll/tax-summary'];
  // 수당 관리는 월 급여대장의 탭으로 통합 — 사이드바는 월 급여대장 메뉴를 활성화
  if (pathname === '/app/payroll/admin/allowances') return ['/app/payroll/admin'];
  if (pathname.startsWith('/app/payroll/admin')) return ['/app/payroll/admin'];
  if (pathname === '/app/payroll' || /^\/app\/payroll\/[^/]+$/.test(pathname))
    return ['/app/payroll'];
  if (pathname.startsWith('/app/approvals')) {
    const wfKeys = approvalSiderSelectedMenuKeys(pathname, search);
    if (wfKeys.length > 0) return wfKeys;
    const leaf = approvalShellMenuItemKeyFromLocation(pathname, {
      tab: typeof search.tab === 'string' ? search.tab : undefined,
      box: typeof search.box === 'string' ? search.box : undefined,
      myStatus: typeof search.myStatus === 'string' ? search.myStatus : undefined,
      deptView: typeof search.deptView === 'string' ? search.deptView : undefined,
    });
    return leaf ? [leaf] : [];
  }
  const menuPaths = new Set<string>([
    ...APP_MENU_PATH_ORDER,
    ...ESG_MENU_PATH_ORDER,
    '/app/ai-documents',
    '/app/contracts/send',
    '/app/contracts',
  ]);
  if (menuPaths.has(pathname)) return [pathname];
  return [];
}

function menuOpenKeysForPath(
  pathname: string,
  search: Record<string, unknown>,
  opts?: { isSystemAdmin?: boolean; showSalaryNegotiationSubmenu?: boolean },
): string[] {
  const keys: string[] = [];
  const isSystemAdmin = opts?.isSystemAdmin === true;
  if (
    TALENT_HUB_PATH_SET.has(pathname) ||
    /^\/app\/(meetings|performance|evaluations|evaluation-flow|my-evaluation-result-v2|evaluation-admin)\//.test(
      pathname,
    )
  ) {
    keys.push(TALENT_HUB_GROUP_KEY);
  }
  if (ORG_HR_PATH_SET.has(pathname) || /^\/app\/members\/[^/]+$/.test(pathname)) {
    keys.push(ORG_HR_GROUP_KEY);
  }
  if (pathname === '/app/leave/absence') {
    keys.push(ORG_HR_GROUP_KEY);
  }
  // 연차 촉진 알림 현황은 인사 관리 그룹으로 이동됨
  if (pathname === '/app/leave/promotion-no-response') {
    keys.push(ORG_HR_GROUP_KEY);
  }
  if (
    (pathname.startsWith('/app/attendance') && pathname !== '/app/attendance/holidays') ||
    pathname === '/app/work-trips'
  ) {
    keys.push(WORK_GROUP_KEY);
  }
  if (
    isSystemAdmin &&
    ((pathname.startsWith('/app/leave') &&
      pathname !== '/app/leave/absence' &&
      pathname !== '/app/leave/promotion-no-response') ||
      pathname === '/app/attendance/holidays')
  ) {
    keys.push(LEAVE_GROUP_KEY);
  }
  if (!isSystemAdmin && pathname.startsWith('/app/leave')) {
    keys.push(WORK_GROUP_KEY);
  }
  if (
    isSystemAdmin &&
    (pathname.startsWith('/app/payroll') ||
      pathname === '/app/salary/unused-leave' ||
      pathname === '/app/salary/settings' ||
      pathname === '/app/salary/pay-grade-table' ||
      pathname === '/app/salary/retirement-policy' ||
      pathname === '/app/salary/negotiations' ||
      pathname === '/app/salary/bonus-policy')
  ) {
    keys.push(PAYROLL_GROUP_KEY);
  }
  if (
    isSystemAdmin &&
    opts?.showSalaryNegotiationSubmenu === true &&
    (pathname === '/app/payroll/admin' || pathname === '/app/salary/negotiations')
  ) {
    keys.push(PAYROLL_SETTLEMENT_MENU_KEY);
  }
  if (
    !isSystemAdmin &&
    (pathname === '/app/payroll' ||
      pathname === '/app/payroll/annual' ||
      pathname === '/app/payroll/allowances' ||
      pathname === '/app/payroll/retirement' ||
      pathname === '/app/payroll/negotiations' ||
      pathname === '/app/income')
  ) {
    keys.push(PAYROLL_GROUP_KEY);
  }
  if (pathname.startsWith('/app/esg')) keys.push(ESG_GROUP_KEY);
  if (pathname.startsWith('/app/approvals')) {
    const approvalsTab = typeof search.tab === 'string' ? search.tab : undefined;
    if (approvalsTab === 'admin') {
      keys.push(ORG_HR_GROUP_KEY);
    }
    keys.push(
      ...approvalSecondaryPanelOpenKeys(pathname, {
        tab: approvalsTab,
        myStatus: typeof search.myStatus === 'string' ? search.myStatus : undefined,
        compose: typeof search.compose === 'string' ? search.compose : undefined,
        sideNav: typeof search.sideNav === 'string' ? search.sideNav : undefined,
        deptView: typeof search.deptView === 'string' ? search.deptView : undefined,
      }),
    );
  }
  return keys;
}

/** `/app/approvals` 이하 경로(부서 문서함·부서 결재 등)를 포함하는지 */
function isApprovalsShellPathname(pathname: string): boolean {
  return pathname === '/app/approvals' || pathname.startsWith('/app/approvals/');
}

const SIDER_COLLAPSED_STORAGE_KEY = 'wf-app-shell-sider-collapsed';

function AppShellLayout() {
  /** TanStack Router location 과 메뉴 selectedKeys/openKeys 를 URL과 동기화(AppShell 레이아웃, Outlet만 분리). */
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  const search = location.search as Record<string, unknown>;
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSystemAdmin = user?.isSystemAdmin === true;

  useEffect(() => {
    if (pathname !== '/app/onboarding') return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [pathname]);
  const menuSelectedKey = useMemo(
    () => menuSelectedKeyFromPath(pathname, search),
    [pathname, search],
  );
  const { items: appShellMenuItems, showSalaryNegotiationSubmenu } =
    useAppShellSiderMenuItems(pathname);
  const [orgChartModalOpen, setOrgChartModalOpen] = useState(false);

  const [siderCollapsed, setSiderCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDER_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDER_COLLAPSED_STORAGE_KEY, siderCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [siderCollapsed]);

  /**
   * TanStack Router location 변경 시 menuOpenKeysForPath로 현재 경로에 필요한 부모 서브메뉴만 openKeys에 병합.
   */
  const [menuOpenKeys, setMenuOpenKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      if (window.localStorage.getItem(SIDER_COLLAPSED_STORAGE_KEY) === '1') return [];
    } catch {
      /* ignore */
    }
    return menuOpenKeysForPath(pathname, search, {
      isSystemAdmin,
      showSalaryNegotiationSubmenu: false,
    });
  });

  useEffect(() => {
    if (siderCollapsed) {
      setMenuOpenKeys([]);
      return;
    }
    setMenuOpenKeys((prev) => {
      const pathKeys = menuOpenKeysForPath(pathname, search, {
        isSystemAdmin,
        showSalaryNegotiationSubmenu,
      });
      const merged = new Set(prev);
      for (const k of pathKeys) merged.add(k);
      if (pathname === '/app/leave/promotion-no-response') {
        merged.delete(LEAVE_GROUP_KEY);
      }
      return [...merged];
    });
  }, [pathname, search, siderCollapsed, isSystemAdmin, showSalaryNegotiationSubmenu]);

  /** 전자결재 작성 팝업만 iframe 내 임베드 시(헤더·사이드 없이 본문만 전체 화면과 같이). */
  const embedComposeModal =
    typeof search?.embed === 'string' &&
    search.embed === 'compose-modal' &&
    isApprovalsShellPathname(pathname);
  if (embedComposeModal) {
    return (
      <Layout className="tw-flex tw-h-[100dvh] tw-min-h-0 tw-bg-white">
        <Layout.Content className="wf-scrollbar tw-min-h-0 tw-flex-1 tw-overflow-y-auto tw-bg-white tw-p-0">
          <Outlet />
        </Layout.Content>
      </Layout>
    );
  }

  // 관리자 최초 로그인 온보딩 전용 화면(헤더만 표시, 사이드바/FAB 숨김)
  if (pathname === '/app/onboarding') {
    return (
      <MemberChatProvider>
        <Layout className="tw-flex tw-h-[100dvh] tw-min-h-0 tw-overflow-hidden tw-bg-slate-50">
          <Layout className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-overflow-hidden tw-bg-slate-50">
            <AppShellHeader hideSearch />
            <Layout.Content className="wf-scrollbar tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-y-auto tw-overflow-x-hidden tw-overscroll-contain tw-bg-transparent tw-p-6">
              <Outlet />
            </Layout.Content>
          </Layout>
        </Layout>
      </MemberChatProvider>
    );
  }

  return (
    <MemberChatProvider>
      <Layout className="tw-flex tw-h-[100dvh] tw-min-h-0 tw-bg-slate-50">
        <Layout.Sider
          theme="light"
          width={248}
          collapsedWidth={76}
          collapsible
          collapsed={siderCollapsed}
          onCollapse={setSiderCollapsed}
          trigger={null}
          className="tw-h-full tw-min-h-0 tw-overflow-hidden tw-border-0 tw-bg-transparent tw-shadow-none [&_.ant-layout-sider-children]:tw-flex [&_.ant-layout-sider-children]:tw-h-full [&_.ant-layout-sider-children]:tw-w-full [&_.ant-layout-sider-children]:tw-min-h-0 [&_.ant-layout-sider-children]:tw-flex-col"
        >
          <div className="tw-flex tw-h-full tw-w-full tw-min-h-0 tw-max-h-full tw-flex-col tw-bg-white tw-shadow-[inset_-1px_0_0_0_rgba(226,232,240,1)]">
            <div
              className={`tw-flex tw-h-16 tw-w-full tw-shrink-0 tw-items-center tw-gap-2 ${
                siderCollapsed ? 'tw-justify-center tw-px-2' : 'tw-px-4'
              }`}
            >
              <SiderBrandHeader
                collapsed={siderCollapsed}
                onClick={() => {
                  window.location.assign('/app/dashboard');
                }}
                onToggleSider={() => setSiderCollapsed((c) => !c)}
              />
              {!siderCollapsed && (
                <Tooltip title="사이드바 접기" placement="top">
                  <button
                    type="button"
                    aria-label="사이드바 접기"
                    className="tw-ml-auto tw-flex tw-size-8 tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-slate-50 tw-text-slate-600 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-800"
                    onClick={() => setSiderCollapsed(true)}
                  >
                    <SiderPanelToggleIcon className="tw-text-lg" />
                  </button>
                </Tooltip>
              )}
            </div>
            <div className="wf-scrollbar tw-min-h-0 tw-w-full tw-flex-1 tw-overflow-y-auto tw-overflow-x-hidden">
              <Menu
                className="tw-mt-2 tw-w-full !tw-border-0 tw-bg-transparent tw-px-2 tw-pb-3 [&_.ant-menu-item::after]:tw-hidden [&_.ant-menu-submenu-title]:tw-px-3 [&_.ant-menu-submenu-title]:tw-rounded-lg [&_.ant-menu-item-only-child]:tw-rounded-lg"
                theme="light"
                mode="inline"
                inlineCollapsed={siderCollapsed}
                {...(siderCollapsed ? { triggerSubMenuAction: 'click' as const } : {})}
                getPopupContainer={() => document.body}
                selectedKeys={menuSelectedKey}
                // 접힘 시 openKeys를 비우면 팝업 서브메뉴가 닫히지 않는 등 깨짐이 없고, 펼침과 동일한 상태로 팝업/오버레이 전환
                openKeys={menuOpenKeys}
                onOpenChange={(keys) => {
                  setMenuOpenKeys(keys as string[]);
                }}
                items={appShellMenuItems}
                onClick={({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  const keyStr = String(key);
                  if (keyStr === PAYROLL_SETTLEMENT_MENU_KEY) {
                    void navigate({ to: '/app/payroll/admin' });
                    if (siderCollapsed) setMenuOpenKeys([]);
                    return;
                  }
                  const groupDefaultPath =
                    keyStr === TALENT_HUB_GROUP_KEY
                      ? '/app/performance'
                      : keyStr === ORG_HR_GROUP_KEY
                        ? '/app/members'
                        : keyStr === ESG_GROUP_KEY
                          ? '/app/esg'
                          : keyStr === WORK_GROUP_KEY
                            ? '/app/attendance'
                            : keyStr === LEAVE_GROUP_KEY
                              ? '/app/leave'
                              : keyStr === PAYROLL_GROUP_KEY
                                ? '/app/payroll'
                                : null;
                  if (groupDefaultPath) {
                    void navigate({ to: groupDefaultPath });
                    if (siderCollapsed) setMenuOpenKeys([]);
                    return;
                  }
                  if (keyStr === APPROVAL_GROUP_KEY) {
                    const rootNav = APPROVAL_NAV_BY_KEY.get('ap-compose');
                    if (rootNav) {
                      void navigate(rootNav as never);
                      if (siderCollapsed) setMenuOpenKeys([]);
                      return;
                    }
                  }
                  if (keyStr.startsWith('ap-section-')) {
                    const sectionNav = APPROVAL_SECTION_DEFAULT_NAV_BY_KEY.get(keyStr);
                    if (sectionNav) {
                      void navigate(sectionNav as never);
                      if (siderCollapsed) setMenuOpenKeys([]);
                      return;
                    }
                  }
                  const apNav = APPROVAL_NAV_BY_KEY.get(String(key));
                  if (apNav) {
                    void navigate(apNav as never);
                    if (siderCollapsed) {
                      setMenuOpenKeys([]);
                    }
                    return;
                  }
                  const wfNav = decodeWfNavKey(keyStr);
                  if (wfNav) {
                    void navigate(wfNav as never);
                    if (siderCollapsed) {
                      setMenuOpenKeys([]);
                    }
                    return;
                  }
                  if (siderCollapsed) {
                    setMenuOpenKeys([]);
                  }
                  void navigate({ to: key });
                }}
              />
            </div>
            <div className="tw-flex tw-shrink-0 tw-border-t tw-border-slate-100 tw-px-2 tw-py-1.5">
              <Tooltip
                title={APP_MENU_ORG_CHART_LABEL}
                placement={siderCollapsed ? 'right' : 'top'}
              >
                <Button
                  type="text"
                  block
                  className="!tw-flex !tw-h-auto !tw-min-h-9 !tw-w-full !items-center !justify-center !tw-rounded-lg !tw-bg-slate-50 !tw-py-2 !tw-text-slate-600 hover:!tw-bg-slate-100 hover:!tw-text-slate-800"
                  onClick={() => setOrgChartModalOpen(true)}
                  aria-label={APP_MENU_ORG_CHART_LABEL}
                >
                  <span className="tw-flex tw-w-full tw-items-center tw-justify-center tw-gap-2">
                    <PartitionOutlined className="tw-shrink-0 tw-text-lg" />
                    {siderCollapsed ? null : (
                      <span className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-600">
                        {APP_MENU_ORG_CHART_LABEL}
                      </span>
                    )}
                  </span>
                </Button>
              </Tooltip>
            </div>
          </div>
        </Layout.Sider>
        <Layout className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-bg-slate-50">
          <AppShellHeader />
          <Layout.Content className="wf-scrollbar tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-y-auto tw-bg-transparent tw-px-6 tw-pt-6 tw-pb-40 [scroll-padding-bottom:10rem]">
            <Outlet />
          </Layout.Content>
        </Layout>
        <AiChatbotFab />
        <OrgChartModal open={orgChartModalOpen} onClose={() => setOrgChartModalOpen(false)} />
      </Layout>
    </MemberChatProvider>
  );
}

export default AppShellLayout;
