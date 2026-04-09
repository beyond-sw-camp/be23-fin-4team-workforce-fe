import type { Goal } from '@/features/goals/model/types';

/** 목표 수치 옆에 붙일 단위 — `unitLabel` 우선, 없으면 `unitType` 코드 */
export function goalValueUnitSuffix(goal: Goal): string {
  const custom = goal.unitLabel?.trim();
  if (custom) return ` · ${custom}`;
  if (goal.unitType) return ` · ${goal.unitType}`;
  return '';
}
