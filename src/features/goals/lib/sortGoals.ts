import dayjs from 'dayjs';
import type { Goal } from '@/features/goals/model/types';
import { computeGoalProgressPercent } from '@/features/goals/ui/goalProgressDisplay';

export type GoalListSortKey = 'endDate-asc' | 'endDate-desc' | 'progress-asc' | 'progress-desc';

function endTs(g: Goal): number {
  return dayjs(g.endDate).valueOf();
}

function progressForSort(g: Goal): number {
  const p = computeGoalProgressPercent(g);
  return p != null && Number.isFinite(p) ? p : -1;
}

function tieBreak(a: Goal, b: Goal): number {
  return a.id.localeCompare(b.id);
}

/** 필터된 목표 배열을 정렬(원본 변경 없이 새 배열). */
export function sortGoals(list: Goal[], key: GoalListSortKey): Goal[] {
  const arr = [...list];
  switch (key) {
    case 'endDate-asc':
      return arr.sort((a, b) => endTs(a) - endTs(b) || tieBreak(a, b));
    case 'endDate-desc':
      return arr.sort((a, b) => endTs(b) - endTs(a) || tieBreak(a, b));
    case 'progress-asc':
      return arr.sort((a, b) => progressForSort(a) - progressForSort(b) || tieBreak(a, b));
    case 'progress-desc':
      return arr.sort((a, b) => progressForSort(b) - progressForSort(a) || tieBreak(a, b));
    default:
      return arr;
  }
}
