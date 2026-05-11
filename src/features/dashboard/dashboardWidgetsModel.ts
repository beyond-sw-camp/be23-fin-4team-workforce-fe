export const DASHBOARD_WIDGET_STORAGE_KEY = 'workforce.dashboard.widgets.v1';
export const DASHBOARD_LAYOUT_STORAGE_KEY = 'workforce.dashboard.layout.v1';

export const ALL_DASHBOARD_WIDGET_IDS = [
  'profile',
  'performanceGoals',
  'approvalInbox',
  'calendar',
  'attendance',
  'leave',
  'notifications',
] as const;

export type DashboardWidgetId = (typeof ALL_DASHBOARD_WIDGET_IDS)[number];
export type DashboardColumnKey = 'left' | 'mid' | 'right';
export type DashboardGridPreset = 'equal-3' | 'ratio-121';

export type DashboardLayoutItem = {
  instanceId: string;
  id: DashboardWidgetId;
  column: DashboardColumnKey;
};

export type DashboardLayout = {
  preset: DashboardGridPreset;
  items: DashboardLayoutItem[];
};

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  profile: '프로필',
  performanceGoals: '내 목표 현황',
  approvalInbox: '전자결재 문서함',
  calendar: '캘린더 일정',
  attendance: '근태',
  leave: '휴가',
  notifications: '최근 알림',
};

const LEFT_COLUMN: DashboardWidgetId[] = ['profile', 'performanceGoals'];
const MID_COLUMN: DashboardWidgetId[] = ['approvalInbox', 'attendance', 'leave'];
const RIGHT_COLUMN: DashboardWidgetId[] = ['calendar', 'notifications'];

export function createDashboardInstanceId(widgetId: DashboardWidgetId): string {
  return `${widgetId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function orderedEnabledWidgets(enabled: ReadonlySet<DashboardWidgetId>): DashboardWidgetId[] {
  return ALL_DASHBOARD_WIDGET_IDS.filter((id) => enabled.has(id));
}

// 시스템 관리자에게는 노출 안 할 위젯 (개인 근태/휴가)
const SYSTEM_ADMIN_HIDDEN_WIDGETS: ReadonlySet<DashboardWidgetId> = new Set(['attendance', 'leave']);

function isSystemAdminUser(): boolean {
  try {
    const token = localStorage.getItem('workforce.accessToken');
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1])) as Record<string, unknown>;
    return payload.isSystemAdmin === 'YES' || payload.isSystemAdmin === true;
  } catch {
    return false;
  }
}

function applySystemAdminFilter(ids: DashboardWidgetId[]): DashboardWidgetId[] {
  if (!isSystemAdminUser()) return ids;
  return ids.filter((id) => !SYSTEM_ADMIN_HIDDEN_WIDGETS.has(id));
}

export function loadDashboardWidgets(): DashboardWidgetId[] {
  try {
    const raw = localStorage.getItem(DASHBOARD_WIDGET_STORAGE_KEY);
    if (!raw) return applySystemAdminFilter([...ALL_DASHBOARD_WIDGET_IDS]);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return applySystemAdminFilter([...ALL_DASHBOARD_WIDGET_IDS]);
    const filtered = parsed.filter(
      (x): x is DashboardWidgetId =>
        typeof x === 'string' && (ALL_DASHBOARD_WIDGET_IDS as readonly string[]).includes(x),
    );
    const dedup = orderedEnabledWidgets(new Set(filtered));
    const base = dedup.length > 0 ? dedup : [...ALL_DASHBOARD_WIDGET_IDS];
    return applySystemAdminFilter(base);
  } catch {
    return applySystemAdminFilter([...ALL_DASHBOARD_WIDGET_IDS]);
  }
}

export function saveDashboardWidgets(ids: DashboardWidgetId[]): void {
  const next = orderedEnabledWidgets(new Set(ids));
  localStorage.setItem(DASHBOARD_WIDGET_STORAGE_KEY, JSON.stringify(next));
}

function defaultLayoutFromIds(ids: DashboardWidgetId[]): DashboardLayout {
  const enabled = new Set(ids);
  const items: DashboardLayoutItem[] = [
    ...LEFT_COLUMN
      .filter((id) => enabled.has(id))
      .map((id) => ({ instanceId: createDashboardInstanceId(id), id, column: 'left' as const })),
    ...MID_COLUMN
      .filter((id) => enabled.has(id))
      .map((id) => ({ instanceId: createDashboardInstanceId(id), id, column: 'mid' as const })),
    ...RIGHT_COLUMN
      .filter((id) => enabled.has(id))
      .map((id) => ({ instanceId: createDashboardInstanceId(id), id, column: 'right' as const })),
  ];
  return { preset: 'ratio-121', items };
}

function preferredColumnOf(widgetId: DashboardWidgetId): DashboardColumnKey {
  if (LEFT_COLUMN.includes(widgetId)) return 'left';
  if (MID_COLUMN.includes(widgetId)) return 'mid';
  return 'right';
}

function withMissingDefaultWidgets(layout: DashboardLayout): DashboardLayout {
  const existing = new Set(layout.items.map((item) => item.id));
  let missing = ALL_DASHBOARD_WIDGET_IDS.filter((id) => !existing.has(id));
  // 시스템 관리자에게는 숨김 위젯을 자동 추가하지 않음
  if (isSystemAdminUser()) {
    missing = missing.filter((id) => !SYSTEM_ADMIN_HIDDEN_WIDGETS.has(id));
  }
  if (missing.length === 0) return layout;
  return {
    ...layout,
    items: [
      ...layout.items,
      ...missing.map((id) => ({
        instanceId: createDashboardInstanceId(id),
        id,
        column: preferredColumnOf(id),
      })),
    ],
  };
}

export function createDefaultDashboardLayout(): DashboardLayout {
  return defaultLayoutFromIds([...ALL_DASHBOARD_WIDGET_IDS]);
}

function normalizeLayout(raw: DashboardLayout): DashboardLayout {
  const seen = new Set<string>();
  const items: DashboardLayoutItem[] = [];
  for (const entry of raw.items) {
    const widgetId = entry.id;
    if (!(ALL_DASHBOARD_WIDGET_IDS as readonly string[]).includes(widgetId)) continue;
    const instanceId =
      typeof entry.instanceId === 'string' && entry.instanceId.trim().length > 0
        ? entry.instanceId.trim()
        : createDashboardInstanceId(widgetId);
    if (seen.has(instanceId)) continue;
    if (!(ALL_DASHBOARD_WIDGET_IDS as readonly string[]).includes(entry.id)) continue;
    if (entry.column !== 'left' && entry.column !== 'mid' && entry.column !== 'right') continue;
    seen.add(instanceId);
    items.push({ instanceId, id: entry.id, column: entry.column });
  }
  const preset: DashboardGridPreset = raw.preset === 'equal-3' ? 'equal-3' : 'ratio-121';
  return { preset, items };
}

export function loadDashboardLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DashboardLayout;
      const layout = withMissingDefaultWidgets(normalizeLayout(parsed));
      // 시스템 관리자는 숨김 위젯 제거
      if (isSystemAdminUser()) {
        return {
          ...layout,
          items: layout.items.filter((item) => !SYSTEM_ADMIN_HIDDEN_WIDGETS.has(item.id)),
        };
      }
      return layout;
    }
  } catch {
    // ignore and fallback
  }
  return defaultLayoutFromIds(loadDashboardWidgets());
}

export function saveDashboardLayout(layout: DashboardLayout): void {
  const normalized = normalizeLayout(layout);
  localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(normalized));
  saveDashboardWidgets(normalized.items.map((x) => x.id));
}

export function widgetsForColumn(
  column: 'left' | 'mid' | 'right',
  enabled: ReadonlySet<DashboardWidgetId>,
): DashboardWidgetId[] {
  const list = column === 'left' ? LEFT_COLUMN : column === 'mid' ? MID_COLUMN : RIGHT_COLUMN;
  return list.filter((id) => enabled.has(id));
}
