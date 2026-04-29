import type { KpiCycle } from '../model/types';

export function resolveCycleKey(cycle: KpiCycle, startDateIso: string): string {
  const d = new Date(startDateIso);
  if (isNaN(d.getTime())) throw new Error(`invalid cycleStartDate: ${startDateIso}`);
  const partial = !isCanonicalStart(cycle, d);
  const base = canonical(cycle, d);
  return partial ? `${base}-PARTIAL` : base;
}

export function resolveCanonicalCycleKey(cycle: KpiCycle, startDateIso: string): string {
  return canonical(cycle, new Date(startDateIso));
}

function canonical(cycle: KpiCycle, d: Date): string {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  switch (cycle) {
    case 'QUARTERLY': {
      const q = Math.floor((month - 1) / 3) + 1;
      return `${year}-Q${q}`;
    }
    case 'HALF_YEARLY':
      return `${year}-H${month <= 6 ? 1 : 2}`;
    case 'YEARLY':
      return `${year}`;
  }
}

function isCanonicalStart(cycle: KpiCycle, d: Date): boolean {
  if (d.getDate() !== 1) return false;
  const month = d.getMonth() + 1;
  switch (cycle) {
    case 'QUARTERLY':
      return [1, 4, 7, 10].includes(month);
    case 'HALF_YEARLY':
      return [1, 7].includes(month);
    case 'YEARLY':
      return month === 1;
  }
}

export function describeCycleKey(cycle: KpiCycle, startDateIso: string): string {
  const key = resolveCycleKey(cycle, startDateIso);
  const label = cycle === 'QUARTERLY' ? '분기' : cycle === 'HALF_YEARLY' ? '반기' : '연간';
  return `${key} (${label})`;
}
