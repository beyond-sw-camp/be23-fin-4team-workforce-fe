import type { MenuProps } from 'antd';
import type { OrgChartOrgNode } from '@/features/organization/api/organizationApi';

const WF_NAV_PREFIX = 'wf-nav:';

export type ApprovalNavPayload = {
  to: string;
  search?: Record<string, string | undefined>;
};

export const APPROVAL_SIDEBAR_ROOT_KEY = 'group-approval';
export const APPROVAL_SUBMENU_DO_KEY = 'approval-sub-do';
export const APPROVAL_SUBMENU_PERSONAL_KEY = 'approval-sub-personal';
export const APPROVAL_SUBMENU_DEPT_KEY = 'approval-sub-dept';

export function encodeWfNavKey(payload: ApprovalNavPayload): string {
  return `${WF_NAV_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeWfNavKey(key: string): ApprovalNavPayload | null {
  if (!key.startsWith(WF_NAV_PREFIX)) return null;
  try {
    const v = JSON.parse(key.slice(WF_NAV_PREFIX.length)) as ApprovalNavPayload;
    if (!v || typeof v.to !== 'string') return null;
    return v;
  } catch {
    return null;
  }
}

const APPROVAL_PATH_TABS = new Set(['compose', 'my', 'pending', 'acted', 'admin']);

function navApprovals(partial: Record<string, string | undefined>): string {
  const tabRaw = partial.tab ?? 'compose';
  const tab = APPROVAL_PATH_TABS.has(tabRaw) ? tabRaw : 'compose';
  const { tab: _omitTab, ...rest } = partial;
  const search = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v != null && String(v).trim() !== ''),
  ) as Record<string, string | undefined>;
  return encodeWfNavKey({ to: '/app/approvals', search: { tab, ...search } });
}

function navDepartment(search: Record<string, string | undefined>): string {
  return encodeWfNavKey({ to: '/app/approvals/department', search });
}

/** Current URL leaf menu key for approvals / department inbox */
export function approvalSiderSelectedMenuKeys(pathname: string, rawSearch: Record<string, unknown>): string[] {
  if (pathname === '/app/approvals/absence-proxy') {
    return [encodeWfNavKey({ to: '/app/approvals/absence-proxy' })];
  }
  if (pathname === '/app/approvals/department') {
    const organizationId = typeof rawSearch.organizationId === 'string' ? rawSearch.organizationId.trim() : '';
    const deptViewRaw = rawSearch.deptView;
    const deptView =
      deptViewRaw === 'ref' || deptViewRaw === 'official' ? deptViewRaw : 'draft';
    if (organizationId) {
      return [navDepartment({ organizationId, deptView })];
    }
    return [navDepartment({ deptView })];
  }
  if (pathname !== '/app/approvals') return [];
  const tabRaw = typeof rawSearch.tab === 'string' ? rawSearch.tab : 'compose';
  const segment = APPROVAL_PATH_TABS.has(tabRaw) ? tabRaw : 'compose';
  const myStatus =
    typeof rawSearch.myStatus === 'string' && rawSearch.myStatus ? rawSearch.myStatus : undefined;
  const compose = typeof rawSearch.compose === 'string' && rawSearch.compose ? rawSearch.compose : undefined;
  const sideNav = typeof rawSearch.sideNav === 'string' && rawSearch.sideNav ? rawSearch.sideNav : undefined;

  const search: Record<string, string | undefined> = {};
  if (myStatus) search.myStatus = myStatus;
  if (compose) search.compose = compose;
  if (sideNav) search.sideNav = sideNav;

  return [encodeWfNavKey({ to: '/app/approvals', search: { tab: segment, ...search } })];
}

/** Secondary sider: which submenu should stay open for this route (single parent). */
export function approvalSecondaryPanelOpenKeys(pathname: string, rawSearch: Record<string, unknown>): string[] {
  const parent = approvalSecondaryOpenParentKey(pathname, rawSearch);
  return parent ? [parent] : [];
}

/** Exposed for AppShellLayout openKeys sync / onOpenChange guard. */
export function approvalSecondaryOpenParentKey(pathname: string, rawSearch: Record<string, unknown>): string | null {
  if (!pathname.startsWith('/app/approvals')) return null;
  if (pathname === '/app/approvals/absence-proxy') return APPROVAL_SUBMENU_PERSONAL_KEY;
  if (pathname === '/app/approvals/department') return APPROVAL_SUBMENU_DEPT_KEY;

  if (pathname !== '/app/approvals') return null;
  const tabRaw = typeof rawSearch.tab === 'string' ? rawSearch.tab : 'compose';
  const segment = APPROVAL_PATH_TABS.has(tabRaw) ? tabRaw : 'compose';
  const myStatus =
    typeof rawSearch.myStatus === 'string' && rawSearch.myStatus.trim() ? rawSearch.myStatus.trim() : undefined;
  const compose =
    typeof rawSearch.compose === 'string' && rawSearch.compose.trim() ? rawSearch.compose.trim() : undefined;
  const sideNav =
    typeof rawSearch.sideNav === 'string' && rawSearch.sideNav.trim() ? rawSearch.sideNav.trim() : undefined;

  if (segment === 'pending') {
    return sideNav === 'inbox' ? APPROVAL_SUBMENU_PERSONAL_KEY : APPROVAL_SUBMENU_DO_KEY;
  }
  if (segment === 'my') {
    if (myStatus === 'WAIT') return APPROVAL_SUBMENU_DO_KEY;
    if (myStatus === 'ALL' && sideNav === 'cc-wait') return APPROVAL_SUBMENU_DO_KEY;
    return APPROVAL_SUBMENU_PERSONAL_KEY;
  }
  if (segment === 'compose') {
    return compose === 'scheduled' ? APPROVAL_SUBMENU_DO_KEY : APPROVAL_SUBMENU_PERSONAL_KEY;
  }
  return null;
}

export function buildApprovalMenuGroupChildren(
  _organizations: OrgChartOrgNode[],
  opts?: { myOrganizationId?: string; myOrganizationName?: string },
): NonNullable<MenuProps['items']> {
  const myOrgId = opts?.myOrganizationId?.trim() ?? '';

  const deptSearchBase = myOrgId ? { organizationId: myOrgId } : {};
  const deptChildren: NonNullable<MenuProps['items']> = [
    {
      key: navDepartment({ ...deptSearchBase, deptView: 'draft' }),
      label: '기안 완료함',
      title: '기안 완료함',
    },
    {
      key: navDepartment({ ...deptSearchBase, deptView: 'ref' }),
      label: '부서 참조함',
      title: '부서 참조함',
    },
    {
      key: navDepartment({ ...deptSearchBase, deptView: 'official' }),
      label: '공문 발송함',
      title: '공문 발송함',
    },
  ];

  return [
    {
      key: APPROVAL_SUBMENU_DO_KEY,
      label: '결재하기',
      title: '결재하기',
      children: [
        {
          key: navApprovals({ tab: 'pending' }),
          label: '결재 대기 문서',
          title: '결재 대기 문서',
        },
        {
          key: navApprovals({ tab: 'my', myStatus: 'WAIT' }),
          label: '결재 수신 문서',
          title: '결재 수신 문서',
        },
        {
          key: navApprovals({ tab: 'my', myStatus: 'ALL', sideNav: 'cc-wait' }),
          label: '참조/열람 대기 문서',
          title: '참조/열람 대기 문서',
        },
        {
          key: navApprovals({ tab: 'compose', compose: 'scheduled' }),
          label: '결재 예정 문서',
          title: '결재 예정 문서',
        },
      ],
    },
    {
      key: APPROVAL_SUBMENU_PERSONAL_KEY,
      label: '개인 문서함',
      title: '개인 문서함',
      children: [
        {
          key: navApprovals({ tab: 'compose' }),
          label: '기안 문서함',
          title: '기안 문서함',
        },
        {
          key: navApprovals({ tab: 'my', myStatus: 'DRAFT' }),
          label: '임시 저장함',
          title: '임시 저장함',
        },
        {
          key: navApprovals({ tab: 'my', myStatus: 'APPROVED' }),
          label: '결재 문서함',
          title: '결재 문서함',
        },
        {
          key: navApprovals({ tab: 'my', myStatus: 'ALL', sideNav: 'cc-box' }),
          label: '참조/열람 문서함',
          title: '참조/열람 문서함',
        },
        {
          key: navApprovals({ tab: 'pending', sideNav: 'inbox' }),
          label: '수신 문서함',
          title: '수신 문서함',
        },
        {
          key: navApprovals({ tab: 'my', myStatus: 'ALL', sideNav: 'sent' }),
          label: '발송 문서함',
          title: '발송 문서함',
        },
        {
          key: encodeWfNavKey({ to: '/app/approvals/absence-proxy' }),
          label: '부재 위임(대결)',
          title: '부재 위임(대결)',
        },
        {
          key: navApprovals({ tab: 'compose', compose: 'official' }),
          label: '공문 문서함',
          title: '공문 문서함',
        },
      ],
    },
    {
      key: APPROVAL_SUBMENU_DEPT_KEY,
      label: '부서 문서함',
      title: '부서 문서함',
      children: deptChildren,
    },
  ];
}
