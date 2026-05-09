import type { NavigateOptions } from '@tanstack/react-router';
import type { ApprovalTabParam } from '@/app/router/approvalTabRoute';

export const APPROVAL_GUIDE_BOXES = [
  'do-pending',
  'do-acted',
  'do-upcoming',
  'per-all',
  'per-draft',
  'per-viewers',
  'per-official',
  'per-absence',
  'dept-all',
  'dept-received',
] as const;

export type ApprovalGuideBox = (typeof APPROVAL_GUIDE_BOXES)[number];

const BOX_SET = new Set<string>(APPROVAL_GUIDE_BOXES);

export function isApprovalGuideBox(v: string | undefined): v is ApprovalGuideBox {
  return v != null && BOX_SET.has(v);
}

export const APPROVAL_GUIDE_BOX_LABEL: Record<ApprovalGuideBox, string> = {
  'do-pending': '결재 대기 문서',
  'do-acted': '결재 완료 문서',
  'do-upcoming': '결재 예정 문서',
  'per-all': '내 기안 문서',
  'per-draft': '임시 저장함',
  'per-viewers': '참조/공람 문서',
  'per-official': '공문 문서함',
  'per-absence': '부재 위임(대결)',
  'dept-all': '부서 문서함',
  'dept-received': '공문 수신함',
};

export type ApprovalGuideSection = 'do' | 'personal' | 'dept';

export const APPROVAL_GUIDE_SECTION_LABEL: Record<ApprovalGuideSection, string> = {
  do: '결재하기',
  personal: '개인 문서함',
  dept: '부서 문서함',
};

export function sectionOfBox(box: ApprovalGuideBox): ApprovalGuideSection {
  if (box.startsWith('do-')) return 'do';
  if (box.startsWith('dept-')) return 'dept';
  return 'personal';
}

export const APPROVAL_GUIDE_SECTION_ITEMS: Record<ApprovalGuideSection, readonly ApprovalGuideBox[]> = {
  do: ['do-pending', 'do-acted', 'do-upcoming'],
  personal: [
    'per-all',
    'per-draft',
    'per-viewers',
    'per-absence',
    'per-official',
  ],
  dept: ['dept-all', 'dept-received'],
};

export const APPROVAL_GUIDE_SECTION_ORDER: readonly ApprovalGuideSection[] = ['do', 'personal', 'dept'];

export function defaultBoxForTab(tab: string): ApprovalGuideBox | undefined {
  if (tab === 'pending') return 'do-pending';
  if (tab === 'my') return 'per-all';
  if (tab === 'acted') return 'do-acted';
  return undefined;
}

/** Absence proxy and department inbox use other routes; those box keys are not tied to a main tab here. */
export function mainTabForGuideBox(box: ApprovalGuideBox): ApprovalTabParam | null {
  if (box === 'per-absence' || box.startsWith('dept-')) return null;
  return guideBoxToTabSearch(box).tab;
}

export function resolveGuideBox(tab: string, boxFromUrl: string | undefined): ApprovalGuideBox | undefined {
  if (tab === 'compose' || tab === 'admin') return undefined;
  if (isApprovalGuideBox(boxFromUrl)) {
    const main = mainTabForGuideBox(boxFromUrl);
    if (main === tab) return boxFromUrl;
  }
  return defaultBoxForTab(tab);
}

export function guideBoxToTabSearch(box: ApprovalGuideBox): {
  tab: ApprovalTabParam;
  search: Record<string, string | undefined>;
} {
  switch (box) {
    case 'do-pending':
    case 'do-upcoming':
      return { tab: 'pending', search: {} };
    case 'do-acted':
      return { tab: 'acted', search: {} };
    case 'per-all':
      return { tab: 'my', search: {} };
    case 'per-draft':
      return { tab: 'my', search: { myStatus: 'DRAFT' } };
    case 'per-viewers':
    case 'per-official':
      return { tab: 'my', search: {} };
    default:
      return { tab: 'pending', search: {} };
  }
}

export function mergeRequestsByRequestId<T extends { requestId: string; createdAt: string }>(
  lists: T[][],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const row of list) {
      const id = row.requestId?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out;
}

type InboxMergeSource = 'approver' | 'cc' | 'circulation';

function inboxSourceRank(s: InboxMergeSource): number {
  if (s === 'approver') return 0;
  if (s === 'cc') return 1;
  return 2;
}

/**
 * 수신 문서함: pending, acted, cc, circulation 네 가지 목록을 병합할 때 requestId 기준으로 중복을 제거하고,
 * 같은 문서는 결재자, 참조, 공람 순으로 우선합니다.
 */
export function mergeInboxCombinedRequests<T extends { requestId: string; createdAt: string }>(
  pending: T[],
  acted: T[],
  cc: T[],
  circulation: T[],
): T[] {
  const map = new Map<string, { row: T; source: InboxMergeSource }>();
  const trySet = (row: T, source: InboxMergeSource) => {
    const id = row.requestId?.trim();
    if (!id) return;
    const prev = map.get(id);
    if (!prev || inboxSourceRank(source) < inboxSourceRank(prev.source)) {
      map.set(id, { row, source });
    }
  };
  for (const r of pending) trySet(r, 'approver');
  for (const r of acted) trySet(r, 'approver');
  for (const r of cc) trySet(r, 'cc');
  for (const r of circulation) trySet(r, 'circulation');
  const out = [...map.values()].map((v) => v.row);
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out;
}

type ApprovalsLocationSearch = {
  tab?: string;
  box?: string;
  myStatus?: string;
  compose?: string;
  sideNav?: string;
};

function approvalsSearchForGuideBox(box: ApprovalGuideBox): ApprovalsLocationSearch {
  const { tab, search: extra } = guideBoxToTabSearch(box);
  const next: ApprovalsLocationSearch = { tab, box };
  if (typeof extra.myStatus === 'string' && extra.myStatus) {
    next.myStatus = extra.myStatus;
  }
  return next;
}

export function buildNavigateForGuideBox(
  box: ApprovalGuideBox,
):
  | NavigateOptions
  | { to: '/app/approvals/absence-proxy'; replace?: boolean }
  | { to: '/app/approvals/department'; search: { deptView: 'draft' | 'sent' | 'received' }; replace?: boolean } {
  if (box === 'per-absence') {
    return { to: '/app/approvals/absence-proxy', replace: true };
  }
  if (box === 'dept-all') {
    return { to: '/app/approvals/department', search: { deptView: 'draft' }, replace: true };
  }
  if (box === 'dept-received') {
    return { to: '/app/approvals/department', search: { deptView: 'received' }, replace: true };
  }
  const nextSearch = approvalsSearchForGuideBox(box);
  return {
    to: '/app/approvals',
    search: nextSearch,
    replace: true,
  } as NavigateOptions;
}

export type ApprovalShellSiderEntry = {
  key: string;
  label: string;
  navigate: ReturnType<typeof buildNavigateForGuideBox> | NavigateOptions;
};

/** 앱 셸 전자결재 하위 메뉴 항목(가이드 전체). 첫 항목은 항상 결재 작성(compose). */
export function getApprovalShellSiderEntries(): [ApprovalShellSiderEntry, ...ApprovalShellSiderEntry[]] {
  const compose: ApprovalShellSiderEntry = {
    key: 'ap-compose',
    label: '결재 요청 작성',
    navigate: { to: '/app/approvals', search: { tab: 'compose' }, replace: true } as NavigateOptions,
  };
  const fromGuide: ApprovalShellSiderEntry[] = APPROVAL_GUIDE_SECTION_ORDER.flatMap((section) =>
    APPROVAL_GUIDE_SECTION_ITEMS[section].map((box) => ({
      key: `ap-${box}`,
      label: APPROVAL_GUIDE_BOX_LABEL[box],
      navigate: buildNavigateForGuideBox(box),
    })),
  );
  return [compose, ...fromGuide];
}

/** 앱 사이드바: 현재 문서함이 속한 가이드 섹션(결재하기·개인 문서함·부서 문서함). antd SubMenu openKeys용 */
export function approvalShellSectionOpenKeyFromLocation(
  pathname: string,
  search: { tab?: string; box?: string; myStatus?: string; deptView?: string },
): string | null {
  const leaf = approvalShellMenuItemKeyFromLocation(pathname, search);
  if (!leaf || leaf === 'ap-compose') return null;
  const raw = leaf.replace(/^ap-/, '');
  if (!isApprovalGuideBox(raw)) return null;
  const section = sectionOfBox(raw);
  return `ap-section-${section}`;
}

export function approvalShellMenuItemKeyFromLocation(
  pathname: string,
  search: { tab?: string; box?: string; myStatus?: string; deptView?: string },
): string {
  if (pathname === '/app/approvals/absence-proxy') return 'ap-per-absence';
  if (pathname === '/app/approvals/department') {
    const dv = search.deptView;
    if (dv === 'received') return 'ap-dept-received';
    return 'ap-dept-all';
  }
  if (pathname === '/app/approvals/department-search') return 'ap-dept-all';
  if (pathname !== '/app/approvals') return '';
  const tab = search.tab ?? 'compose';
  if (tab === 'compose') return 'ap-compose';
  if (tab === 'admin') return '';
  const box = search.box;
  if (tab === 'pending') {
    if (box && isApprovalGuideBox(box) && mainTabForGuideBox(box) === 'pending') return `ap-${box}`;
    return 'ap-do-pending';
  }
  if (tab === 'acted') {
    return 'ap-do-acted';
  }
  if (tab === 'my') {
    if (box && isApprovalGuideBox(box) && mainTabForGuideBox(box) === 'my') return `ap-${box}`;
    if (String(search.myStatus).toUpperCase() === 'DRAFT') return 'ap-per-draft';
    return 'ap-per-all';
  }
  return 'ap-compose';
}
