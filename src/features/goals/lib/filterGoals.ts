import dayjs from 'dayjs';
import type { Goal, Visibility } from '@/features/goals/model/types';

export type GoalListFilters = {
  search: string;
  /** 비어 있으면 전체 상태 */
  statuses: string[];
  /** 'all'이면 전체 */
  visibility: 'all' | Visibility[];
  owner: 'all' | 'mine';
  /** 목표 기간이 이 구간과 겹치는 것만 (둘 다 있어야 적용) */
  period: [dayjs.Dayjs, dayjs.Dayjs] | null;
};

export const defaultGoalListFilters = (): GoalListFilters => ({
  search: '',
  statuses: [],
  visibility: 'all',
  owner: 'all',
  period: null,
});

function overlapsPeriod(goal: Goal, from: dayjs.Dayjs, to: dayjs.Dayjs): boolean {
  const s = dayjs(goal.startDate);
  const e = dayjs(goal.endDate);
  return !s.isAfter(to, 'day') && !e.isBefore(from, 'day');
}

export function filterGoals(goals: Goal[], f: GoalListFilters, memberId: string): Goal[] {
  const q = f.search.trim().toLowerCase();
  return goals.filter((g) => {
    const st = (g.status ?? 'DRAFT').toUpperCase();
    if (f.statuses.length > 0 && !f.statuses.map((x) => x.toUpperCase()).includes(st)) return false;

    if (f.visibility !== 'all') {
      const allowed = new Set(f.visibility);
      if (!allowed.has(g.visibility)) return false;
    }

    if (f.owner === 'mine' && g.ownerId !== memberId) return false;

    if (f.period) {
      const [a, b] = f.period;
      const from = a.isBefore(b) ? a : b;
      const to = b.isAfter(a) ? b : a;
      if (!overlapsPeriod(g, from, to)) return false;
    }

    if (q) {
      const title = (g.title ?? '').toLowerCase();
      const desc = (g.description ?? '').toLowerCase();
      if (!title.includes(q) && !desc.includes(q)) return false;
    }

    return true;
  });
}
