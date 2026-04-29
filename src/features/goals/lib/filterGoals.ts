// DEPRECATED — KPI 시대 필터. redesign 의 PerformancePage 는 사용 안 함.
// stub: 어떤 import 도 컴파일은 되지만 실제 동작 안 함.
import type { Goal } from '@/features/goals/model/types';

export type GoalCycleKey = 'YEARLY' | 'HALF' | 'QUARTERLY' | 'MONTHLY' | 'CUSTOM';

export type GoalListFilters = {
  search: string;
  statuses: string[];
  visibility: 'all' | string[];
  owner: 'all' | 'mine';
  period: any | null;
  cycles: GoalCycleKey[];
};

export const defaultGoalListFilters = (): GoalListFilters => ({
  search: '',
  statuses: [],
  visibility: 'all',
  owner: 'all',
  period: null,
  cycles: [],
});

export function filterGoals(goals: Goal[], _filters: GoalListFilters): Goal[] {
  return goals;
}
