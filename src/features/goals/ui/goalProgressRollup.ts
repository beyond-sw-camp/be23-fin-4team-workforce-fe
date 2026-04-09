import type { Goal } from '@/features/goals/model/types';
import { computeGoalProgressPercent } from '@/features/goals/ui/goalProgressDisplay';

export type GoalDisplayProgress = {
  pct: number | null;
  rolledFromChildren: boolean;
};

function pctFromServerRollup(goal: Goal): { pct: number; fromChildren: boolean } | null {
  const raw = goal.rolledAchievementPct;
  if (raw === undefined || raw === null || !Number.isFinite(Number(raw))) return null;
  let n = Number(raw);
  if (n > 0 && n <= 1) n *= 100;
  const cap = goal.capPct != null && Number.isFinite(Number(goal.capPct)) ? Number(goal.capPct) : 200;
  const pct = Math.min(cap, Math.max(0, n));
  const src = String(goal.rollupSource ?? '');
  const fromChildren = src.includes('CHILDREN');
  return { pct, fromChildren };
}

/**
 * 상위 목표는 "직속 하위 목표의 평균 달성률"을 우선 표시하고,
 * 하위가 없으면 기존 목표 자체 달성률을 사용합니다.
 */
export function buildGoalDisplayProgressMap(goals: Goal[]): Map<string, GoalDisplayProgress> {
  const byId = new Map(goals.map((g) => [g.id, g] as const));
  const childrenByParent = new Map<string, Goal[]>();

  for (const g of goals) {
    const parentId =
      g.parentGoalId != null && String(g.parentGoalId).trim() !== ''
        ? String(g.parentGoalId).trim()
        : '';
    if (!parentId || !byId.has(parentId)) continue;
    const arr = childrenByParent.get(parentId) ?? [];
    arr.push(g);
    childrenByParent.set(parentId, arr);
  }

  const memo = new Map<string, GoalDisplayProgress>();
  const visiting = new Set<string>();

  function resolve(goalId: string): GoalDisplayProgress {
    const cached = memo.get(goalId);
    if (cached) return cached;
    const goal = byId.get(goalId);
    if (!goal) return { pct: null, rolledFromChildren: false };

    if (visiting.has(goalId)) {
      const safe = { pct: computeGoalProgressPercent(goal), rolledFromChildren: false };
      memo.set(goalId, safe);
      return safe;
    }
    visiting.add(goalId);

    const children = childrenByParent.get(goalId) ?? [];
    const childPcts = children
      .map((c) => resolve(c.id).pct)
      .filter((p): p is number => p != null && Number.isFinite(p));

    if (childPcts.length > 0) {
      const next: GoalDisplayProgress = {
        pct: childPcts.reduce((a, b) => a + b, 0) / childPcts.length,
        rolledFromChildren: true,
      };
      visiting.delete(goalId);
      memo.set(goalId, next);
      return next;
    }

    const serverRoll = pctFromServerRollup(goal);
    if (serverRoll) {
      const next = { pct: serverRoll.pct, rolledFromChildren: serverRoll.fromChildren };
      visiting.delete(goalId);
      memo.set(goalId, next);
      return next;
    }

    const next: GoalDisplayProgress = {
      pct: computeGoalProgressPercent(goal),
      rolledFromChildren: false,
    };

    visiting.delete(goalId);
    memo.set(goalId, next);
    return next;
  }

  for (const g of goals) resolve(g.id);
  return memo;
}
