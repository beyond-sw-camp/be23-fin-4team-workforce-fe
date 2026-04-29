// DEPRECATED — Kanban 보드 폐기. redesign 에선 카드 리스트만 사용.
export type KanbanColumnKey = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type StoredKanbanOrder = Partial<Record<KanbanColumnKey, string[]>>;

export function loadKanbanOrder(_companyId: string | undefined): StoredKanbanOrder {
  return {};
}
export function saveKanbanOrder(_companyId: string | undefined, _order: StoredKanbanOrder): void {}
