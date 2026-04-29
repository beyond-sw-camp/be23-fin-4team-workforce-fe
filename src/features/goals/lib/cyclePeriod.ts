import dayjs from 'dayjs';
import type { KpiCycle } from '../model/types';

export type CycleSegmentQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type CycleSegmentHalf = 'H1' | 'H2';
export type CycleFormSegment = CycleSegmentQuarter | CycleSegmentHalf;

export function cycleSegmentFrom(cycle: KpiCycle, startDate: string): CycleFormSegment | undefined {
  const d = dayjs(startDate);
  const month = d.month() + 1;
  if (cycle === 'QUARTERLY') {
    if (month <= 3) return 'Q1';
    if (month <= 6) return 'Q2';
    if (month <= 9) return 'Q3';
    return 'Q4';
  }
  if (cycle === 'HALF_YEARLY') {
    return month <= 6 ? 'H1' : 'H2';
  }
  return undefined;
}

export function safeToCyclePeriod(
  cycle: KpiCycle,
  cycleYear?: number,
  cycleSegment?: CycleFormSegment,
): { cycleStartDate: string; cycleEndDate: string } | null {
  try {
    if (!cycleYear) return null;
    return toCyclePeriod(cycle, cycleYear, cycleSegment);
  } catch {
    return null;
  }
}

export function toCyclePeriod(
  cycle: KpiCycle,
  cycleYear: number,
  cycleSegment?: CycleFormSegment,
): { cycleStartDate: string; cycleEndDate: string } {
  if (cycle === 'YEARLY') {
    const start = dayjs(`${cycleYear}-01-01`);
    const end = start.endOf('year');
    return { cycleStartDate: start.format('YYYY-MM-DD'), cycleEndDate: end.format('YYYY-MM-DD') };
  }
  if (cycle === 'HALF_YEARLY') {
    if (cycleSegment !== 'H1' && cycleSegment !== 'H2') {
      throw new Error('half segment required');
    }
    const startMonth = cycleSegment === 'H1' ? 1 : 7;
    const start = dayjs(`${cycleYear}-${String(startMonth).padStart(2, '0')}-01`);
    const end = start.add(5, 'month').endOf('month');
    return { cycleStartDate: start.format('YYYY-MM-DD'), cycleEndDate: end.format('YYYY-MM-DD') };
  }
  if (cycleSegment !== 'Q1' && cycleSegment !== 'Q2' && cycleSegment !== 'Q3' && cycleSegment !== 'Q4') {
    throw new Error('quarter segment required');
  }
  const startMonthByQuarter: Record<CycleSegmentQuarter, number> = {
    Q1: 1,
    Q2: 4,
    Q3: 7,
    Q4: 10,
  };
  const start = dayjs(`${cycleYear}-${String(startMonthByQuarter[cycleSegment]).padStart(2, '0')}-01`);
  const end = start.add(2, 'month').endOf('month');
  return { cycleStartDate: start.format('YYYY-MM-DD'), cycleEndDate: end.format('YYYY-MM-DD') };
}
