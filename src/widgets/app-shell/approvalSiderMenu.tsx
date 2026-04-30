import { FormOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { OrgChartOrgNode } from '@/features/organization/api/organizationApi';

const WF_NAV_PREFIX = 'wf-nav:';

export type ApprovalNavPayload = {
  to: string;
  search?: Record<string, string | undefined>;
};

export const APPROVAL_SIDEBAR_ROOT_KEY = 'group-approval';

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
    return [encodeWfNavKey({ to: '/app/approvals' })];
  }
  if (pathname === '/app/approvals/department') {
    const organizationId = typeof rawSearch.organizationId === 'string' ? rawSearch.organizationId.trim() : '';
    const deptViewRaw = rawSearch.deptView;
    const deptView = deptViewRaw === 'received' ? 'received' : 'draft';
    if (organizationId) {
      return [navDepartment({ organizationId, deptView })];
    }
    return [navDepartment({ deptView })];
  }
  if (pathname !== '/app/approvals') return [];
  const tab = typeof rawSearch.tab === 'string' ? rawSearch.tab.trim() : '';
  if (tab === 'admin') {
    return [encodeWfNavKey({ to: '/app/approvals', search: { tab: 'admin' } })];
  }
  return [encodeWfNavKey({ to: '/app/approvals' })];
}

/** Secondary sider: which submenu should stay open for this route (single parent). */
export function approvalSecondaryPanelOpenKeys(pathname: string, rawSearch: Record<string, unknown>): string[] {
  const parent = approvalSecondaryOpenParentKey(pathname, rawSearch);
  return parent ? [parent] : [];
}

/** Exposed for AppShellLayout openKeys sync / onOpenChange guard. */
export function approvalSecondaryOpenParentKey(pathname: string, _rawSearch: Record<string, unknown>): string | null {
  if (!pathname.startsWith('/app/approvals')) return null;
  if (pathname === '/app/approvals/absence-proxy') return null;
  if (pathname !== '/app/approvals') return null;
  return null;
}

export function buildApprovalMenuGroupChildren(
  _organizations: OrgChartOrgNode[],
  _opts?: { myOrganizationId?: string; myOrganizationName?: string },
): NonNullable<MenuProps['items']> {
  return [
    {
      key: encodeWfNavKey({ to: '/app/approvals' }),
      icon: <FormOutlined className="tw-text-lg" />,
      label: '전자결재',
      title: '전자결재',
    },
    {
      key: '/app/contracts',
      icon: <SafetyCertificateOutlined className="tw-text-lg" />,
      label: '전자계약',
      title: '전자계약',
    },
  ];
}
