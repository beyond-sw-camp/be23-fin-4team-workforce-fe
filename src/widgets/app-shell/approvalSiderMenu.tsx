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

export function isQaRoomOrgName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (n === 'QA실') return true;
  return /^QA\s*실$/i.test(n);
}

function collectNonQaRootOrgs(nodes: OrgChartOrgNode[]): OrgChartOrgNode[] {
  return nodes.filter((n) => !isQaRoomOrgName(n.name));
}

function findOrgNodeById(nodes: OrgChartOrgNode[], organizationId: string): OrgChartOrgNode | null {
  const target = organizationId.trim();
  if (!target) return null;
  for (const node of nodes) {
    if (node.organizationId === target) return node;
    const child = findOrgNodeById(node.children ?? [], target);
    if (child) return child;
  }
  return null;
}

function navApprovals(partial: Record<string, string | undefined>): string {
  return encodeWfNavKey({ to: '/app/approvals', search: partial });
}

function navDepartment(search: Record<string, string | undefined>): string {
  return encodeWfNavKey({ to: '/app/approvals/department', search });
}

/** 현재 URL과 일치하는 전자결재·부서함 leaf 메뉴 key */
export function approvalSiderSelectedMenuKeys(pathname: string, rawSearch: Record<string, unknown>): string[] {
  if (pathname === '/app/approvals/absence-proxy') {
    return [encodeWfNavKey({ to: '/app/approvals/absence-proxy' })];
  }
  if (pathname === '/app/approvals/department') {
    const organizationId = typeof rawSearch.organizationId === 'string' ? rawSearch.organizationId.trim() : '';
    const deptViewRaw = rawSearch.deptView;
    const deptView =
      deptViewRaw === 'draft' || deptViewRaw === 'ref' || deptViewRaw === 'official' ? deptViewRaw : 'draft';
    if (organizationId) {
      return [navDepartment({ organizationId, deptView })];
    }
    return [navDepartment({})];
  }
  if (pathname !== '/app/approvals') return [];

  const tab = typeof rawSearch.tab === 'string' && rawSearch.tab ? rawSearch.tab : 'compose';
  const myStatus =
    typeof rawSearch.myStatus === 'string' && rawSearch.myStatus ? rawSearch.myStatus : undefined;
  const compose = typeof rawSearch.compose === 'string' && rawSearch.compose ? rawSearch.compose : undefined;
  const sideNav = typeof rawSearch.sideNav === 'string' && rawSearch.sideNav ? rawSearch.sideNav : undefined;

  const search: Record<string, string | undefined> = { tab };
  if (myStatus) search.myStatus = myStatus;
  if (compose) search.compose = compose;
  if (sideNav) search.sideNav = sideNav;

  return [encodeWfNavKey({ to: '/app/approvals', search })];
}

export function approvalDeptOrgSubKey(organizationId: string): string {
  return `approval-dept-org-${organizationId}`;
}

/** 전자결재 메뉴 펼침 키 (중첩 서브메뉴 포함) */
export function approvalSiderOpenKeys(pathname: string, rawSearch: Record<string, unknown>): string[] {
  if (!pathname.startsWith('/app/approvals')) return [];
  const keys = [
    APPROVAL_SIDEBAR_ROOT_KEY,
    APPROVAL_SUBMENU_DO_KEY,
    APPROVAL_SUBMENU_PERSONAL_KEY,
    APPROVAL_SUBMENU_DEPT_KEY,
  ];
  if (pathname === '/app/approvals/department') {
    const organizationId = typeof rawSearch.organizationId === 'string' ? rawSearch.organizationId.trim() : '';
    if (organizationId) keys.push(approvalDeptOrgSubKey(organizationId));
  }
  return keys;
}

export function buildApprovalMenuGroupChildren(
  organizations: OrgChartOrgNode[],
  opts?: { myOrganizationId?: string; myOrganizationName?: string },
): NonNullable<MenuProps['items']> {
  const deptRoots = collectNonQaRootOrgs(organizations);
  const myOrgId = opts?.myOrganizationId?.trim() ?? '';
  const myOrgName = opts?.myOrganizationName?.trim() ?? '';
  const myOrgNode = myOrgId ? findOrgNodeById(deptRoots, myOrgId) : null;
  const deptOrgNodes = myOrgNode ? [myOrgNode] : deptRoots;

  const deptChildren: NonNullable<MenuProps['items']> =
    deptOrgNodes.length === 0
      ? [
          {
            key: navDepartment({}),
            label: '부서 문서함',
            title: '부서 문서함',
          },
        ]
      : deptOrgNodes.map((org) => ({
          key: approvalDeptOrgSubKey(org.organizationId),
          label: myOrgNode && myOrgName ? myOrgName : org.name,
          title: myOrgNode && myOrgName ? myOrgName : org.name,
          children: [
            {
              key: navDepartment({ organizationId: org.organizationId, deptView: 'draft' }),
              label: '기안 완료함',
              title: '기안 완료함',
            },
            {
              key: navDepartment({ organizationId: org.organizationId, deptView: 'ref' }),
              label: '부서 참조함',
              title: '부서 참조함',
            },
            {
              key: navDepartment({ organizationId: org.organizationId, deptView: 'official' }),
              label: '공문 발송함',
              title: '공문 발송함',
            },
          ],
        }));

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
          type: 'group',
          label: '<기본 문서함>',
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
