export type ApprovalTabParam = 'compose' | 'my' | 'pending' | 'acted' | 'admin';

/** 실제 라우트는 `/app/approvals` + `search.tab` 입니다. */
export function toApprovalTabNavigate(opts: {
  tab: ApprovalTabParam;
  search?: Record<string, string | undefined>;
  replace?: boolean;
}) {
  const search: Record<string, string | undefined> = { tab: opts.tab, ...opts.search };
  return {
    to: '/app/approvals' as const,
    search,
    ...(opts.replace ? { replace: true as const } : {}),
  };
}
