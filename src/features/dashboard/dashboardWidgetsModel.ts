export const DASHBOARD_WIDGET_STORAGE_KEY = 'workforce.dashboard.widgets.v1';
export const DASHBOARD_LAYOUT_STORAGE_KEY = 'workforce.dashboard.layout.v1';

export const ALL_DASHBOARD_WIDGET_IDS = [
  'profile',
  'performanceGoals',
  'evaluationTasks',
  'feedbackMeetings',
  'approvalInbox',
  'calendar',
  'attendance',
  'leave',
  'notifications',
  // 시스템 관리자에게만 의미 있는 위젯. 백엔드 권한 없으면 카드가 0명으로 보일 수 있음.
  'payrollNewHires',
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
  evaluationTasks: '평가 진행',
  feedbackMeetings: '피드백 면담',
  approvalInbox: '전자결재 문서함',
  calendar: '캘린더 일정',
  attendance: '근태',
  leave: '휴가',
  notifications: '최근 알림',
  payrollNewHires: '급여 미등록 신규 입사자',
};

const LEFT_COLUMN: DashboardWidgetId[] = ['profile', 'performanceGoals'];
const MID_COLUMN: DashboardWidgetId[] = ['approvalInbox', 'evaluationTasks', 'attendance', 'leave'];
const RIGHT_COLUMN: DashboardWidgetId[] = ['calendar', 'feedbackMeetings', 'notifications', 'payrollNewHires'];

export function createDashboardInstanceId(widgetId: DashboardWidgetId): string {
  return `${widgetId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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
  const missing = ALL_DASHBOARD_WIDGET_IDS.filter((id) => !existing.has(id));
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
      return withMissingDefaultWidgets(normalizeLayout(parsed));
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
