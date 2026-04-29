import type { SeasonType } from '../model/types';
import type { KpiCycle } from '@/features/goals/model/types';

export function seasonTypeToKpiCycle(type: SeasonType): KpiCycle {
  switch (type) {
    case 'QUARTER':
      return 'QUARTERLY';
    case 'HALF_YEAR':
      return 'HALF_YEARLY';
    case 'ANNUAL':
      return 'YEARLY';
  }
}
