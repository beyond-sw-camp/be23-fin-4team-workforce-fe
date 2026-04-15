export const DASHBOARD_WIDGET_STORAGE_KEY = 'workforce.dashboard.widgets.v1';

export const ALL_DASHBOARD_WIDGET_IDS = [
  'profile',
  'approvalInbox',
  'calendar',
  'attendance',
  'leave',
  'notifications',
] as const;

export type DashboardWidgetId = (typeof ALL_DASHBOARD_WIDGET_IDS)[number];

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  profile: '프로필',
  approvalInbox: '전자결재 문서함',
  calendar: '캘린더 일정',
  attendance: '근태',
  leave: '휴가',
  notifications: '최근 알림',
};

const LEFT_COLUMN: DashboardWidgetId[] = ['profile'];
const MID_COLUMN: DashboardWidgetId[] = ['approvalInbox', 'attendance', 'leave'];
const RIGHT_COLUMN: DashboardWidgetId[] = ['calendar', 'notifications'];

export function orderedEnabledWidgets(enabled: ReadonlySet<DashboardWidgetId>): DashboardWidgetId[] {
  return ALL_DASHBOARD_WIDGET_IDS.filter((id) => enabled.has(id));
}

export function loadDashboardWidgets(): DashboardWidgetId[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_WIDGET_STORAGE_KEY);
    if (!raw) return [...ALL_DASHBOARD_WIDGET_IDS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...ALL_DASHBOARD_WIDGET_IDS];
    const filtered = parsed.filter(
      (x): x is DashboardWidgetId =>
        typeof x === 'string' && (ALL_DASHBOARD_WIDGET_IDS as readonly string[]).includes(x),
    );
    const dedup = orderedEnabledWidgets(new Set(filtered));
    return dedup.length > 0 ? dedup : [...ALL_DASHBOARD_WIDGET_IDS];
  } catch {
    return [...ALL_DASHBOARD_WIDGET_IDS];
  }
}

export function saveDashboardWidgets(ids: DashboardWidgetId[]): void {
  const next = orderedEnabledWidgets(new Set(ids));
  localStorage.setItem(DASHBOARD_WIDGET_STORAGE_KEY, JSON.stringify(next));
}

export function widgetsForColumn(
  column: 'left' | 'mid' | 'right',
  enabled: ReadonlySet<DashboardWidgetId>,
): DashboardWidgetId[] {
  const list = column === 'left' ? LEFT_COLUMN : column === 'mid' ? MID_COLUMN : RIGHT_COLUMN;
  return list.filter((id) => enabled.has(id));
}
