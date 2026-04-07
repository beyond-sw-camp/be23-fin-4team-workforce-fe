export type KanbanColumnKey = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

/** 컬럼 키가 OTHER→CANCELLED로 바뀌어 버전 갱신 */
const STORAGE_KEY = 'workforce:goal-kanban-order:v2';

export type StoredKanbanOrder = Partial<Record<KanbanColumnKey, string[]>>;

export function loadKanbanOrder(companyId: string | undefined): StoredKanbanOrder {
  if (!companyId) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredKanbanOrder>;
    return parsed[companyId] ?? {};
  } catch {
    return {};
  }
}

export function saveKanbanOrder(companyId: string | undefined, order: StoredKanbanOrder) {
  if (!companyId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all: Record<string, StoredKanbanOrder> = raw ? (JSON.parse(raw) as Record<string, StoredKanbanOrder>) : {};
    all[companyId] = order;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}

export function mergeColumnIds(saved: string[] | undefined, currentIds: string[]): string[] {
  if (!saved?.length) return [...currentIds];
  const set = new Set(currentIds);
  const out: string[] = [];
  for (const id of saved) {
    if (set.has(id)) out.push(id);
  }
  for (const id of currentIds) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
