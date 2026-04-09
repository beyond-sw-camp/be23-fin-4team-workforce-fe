import type { Goal } from '@/features/goals/model/types';

/** 현재 화면에 보이는 목표 집합 안에서만 조상 체인을 따라 깊이 계산 (부모가 목록 밖이면 0) */
export function goalDepthInList(goal: Goal, goalsInList: Goal[]): number {
  if (!goal?.id) return 0;
  const byId = new Map(
    goalsInList.filter((g) => g != null && g.id).map((g) => [g.id, g] as const),
  );
  let depth = 0;
  let pid: string | undefined =
    goal.parentGoalId != null && String(goal.parentGoalId).trim() !== ''
      ? String(goal.parentGoalId).trim()
      : undefined;
  const seen = new Set<string>([goal.id]);
  while (pid) {
    if (seen.has(pid)) break;
    seen.add(pid);
    if (!byId.has(pid)) break;
    depth++;
    const p = byId.get(pid)!;
    const next =
      p.parentGoalId != null && String(p.parentGoalId).trim() !== ''
        ? String(p.parentGoalId).trim()
        : undefined;
    pid = next;
  }
  return depth;
}

export type GoalWithDepth = { goal: Goal; depth: number };

export function attachGoalDepthInList(goals: Goal[]): GoalWithDepth[] {
  const list = goals.filter((g): g is Goal => g != null && Boolean(g.id));
  return list.map((goal) => ({ goal, depth: goalDepthInList(goal, list) }));
}

function normalizeParentId(goal: Goal): string {
  return goal.parentGoalId != null && String(goal.parentGoalId).trim() !== ''
    ? String(goal.parentGoalId).trim()
    : '';
}

function compareGoalsSiblingOrder(a: Goal, b: Goal): number {
  const t = a.title.localeCompare(b.title, 'ko', { sensitivity: 'base' });
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

/**
 * 목록 내 부모–자식 관계를 유지한 채 깊이 오름차순(전위 순회: 부모 먼저, 형제는 제목·id)으로 정렬합니다.
 */
export function sortGoalsByHierarchy(goals: Goal[]): Goal[] {
  const list = goals.filter((g): g is Goal => g != null && Boolean(g.id));
  if (list.length === 0) return [];

  const byId = new Map(list.map((g) => [g.id, g] as const));

  const roots: Goal[] = [];
  for (const g of list) {
    const p = normalizeParentId(g);
    if (!p || !byId.has(p)) roots.push(g);
  }
  roots.sort(compareGoalsSiblingOrder);

  const childrenByParent = new Map<string, Goal[]>();
  for (const g of list) {
    const p = normalizeParentId(g);
    if (!p || !byId.has(p)) continue;
    let arr = childrenByParent.get(p);
    if (!arr) {
      arr = [];
      childrenByParent.set(p, arr);
    }
    arr.push(g);
  }
  for (const arr of childrenByParent.values()) arr.sort(compareGoalsSiblingOrder);

  const out: Goal[] = [];
  const visited = new Set<string>();

  function dfs(g: Goal) {
    if (visited.has(g.id)) return;
    visited.add(g.id);
    out.push(g);
    for (const c of childrenByParent.get(g.id) ?? []) dfs(c);
  }

  for (const r of roots) dfs(r);

  for (const g of [...list].sort(compareGoalsSiblingOrder)) {
    if (!visited.has(g.id)) dfs(g);
  }

  return out;
}

export function goalTreeOrderedWithDepth(goals: Goal[]): GoalWithDepth[] {
  const sorted = sortGoalsByHierarchy(goals);
  return sorted.map((goal) => ({ goal, depth: goalDepthInList(goal, sorted) }));
}

/** 현재 목록에서 직속 하위가 하나라도 있는 목표 id */
export function parentIdsWithChildrenInList(goals: Goal[]): Set<string> {
  const ids = new Set(goals.filter((g) => g?.id).map((g) => g.id));
  const parents = new Set<string>();
  for (const g of goals) {
    if (!g?.id) continue;
    const p = normalizeParentId(g);
    if (p && ids.has(p)) parents.add(p);
  }
  return parents;
}

/**
 * `collapsedParentIds`에 포함된 목표의 모든 하위(재귀) 행을 제외합니다.
 */
export function filterRowsByCollapsedParents(
  rows: GoalWithDepth[],
  collapsedParentIds: ReadonlySet<string>,
): GoalWithDepth[] {
  if (collapsedParentIds.size === 0) return rows;

  const byId = new Map(rows.map(({ goal }) => [goal.id, goal] as const));

  function isUnderCollapsedAncestor(goal: Goal): boolean {
    let pid = normalizeParentId(goal);
    while (pid) {
      if (collapsedParentIds.has(pid)) return true;
      const p = byId.get(pid);
      if (!p) break;
      pid = normalizeParentId(p);
    }
    return false;
  }

  return rows.filter(({ goal }) => !isUnderCollapsedAncestor(goal));
}
