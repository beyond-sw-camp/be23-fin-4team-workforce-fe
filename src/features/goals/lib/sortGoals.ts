// DEPRECATED — KPI 시대 정렬. redesign 의 PerformancePage 는 사용 안 함.
import type { Goal } from '@/features/goals/model/types';

export type GoalListSortKey = 'endDate-asc' | 'endDate-desc' | 'progress-asc' | 'progress-desc';

export function sortGoals(goals: Goal[], _sort: GoalListSortKey): Goal[] {
  return goals;
}
