import dayjs from 'dayjs';
import type { Goal, Visibility } from '@/features/goals/model/types';

/** 사이클 종류 — goalCycleBadge 로직과 일치 */
export type GoalCycleKey = 'YEARLY' | 'HALF' | 'QUARTERLY' | 'MONTHLY' | 'CUSTOM';

export type GoalListFilters = {
  search: string;
  /** 비어 있으면 전체 상태 */
  statuses: string[];
  /** 'all'이면 전체 */
  visibility: 'all' | Visibility[];
  owner: 'all' | 'mine';
  /** 목표 기간이 이 구간과 겹치는 것만 (둘 다 있어야 적용) */
  period: [dayjs.Dayjs, dayjs.Dayjs] | null;
  /** 사이클 필터 — 비어 있으면 전체 */
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

/** 시작·종료일로부터 사이클 키를 결정 */
export function detectGoalCycleKey(startDate: string, endDate: string): GoalCycleKey {
  const s = dayjs(startDate);
  const e = dayjs(endDate);
  if (!s.isValid() || !e.isValid()) return 'CUSTOM';
  const sameYear = s.year() === e.year();
  const diffDays = e.diff(s, 'day');
  if (sameYear && s.month() === 0 && s.date() === 1 && e.month() === 11 && e.date() === 31) return 'YEARLY';
  if (diffDays >= 170 && diffDays <= 190) return 'HALF';
  if (diffDays >= 80 && diffDays <= 100) return 'QUARTERLY';
  if (diffDays >= 25 && diffDays <= 35) return 'MONTHLY';
  return 'CUSTOM';
}

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

    if (f.cycles.length > 0) {
      const ck = detectGoalCycleKey(g.startDate, g.endDate);
      if (!f.cycles.includes(ck)) return false;
    }

    if (q) {
      const title = (g.title ?? '').toLowerCase();
      const desc = (g.description ?? '').toLowerCase();
      if (!title.includes(q) && !desc.includes(q)) return false;
    }

    return true;
  });
}
