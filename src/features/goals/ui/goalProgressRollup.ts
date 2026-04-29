// DEPRECATED — KPI 진행률 롤업. redesign 폐기.
import type { Goal } from '@/features/goals/model/types';

export type GoalDisplayProgress = { pct: number | null };

export function buildGoalDisplayProgressMap(_goals: Goal[]): Map<string, GoalDisplayProgress> {
  return new Map();
}
