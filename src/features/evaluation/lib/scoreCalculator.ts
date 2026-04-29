import type { Grade } from '@/features/goals/model/types';
import type { GoalSnapshot } from '../model/workflowTypes';

export const DEFAULT_GRADE_SCALE: Record<Grade, number> = { S: 100, A: 85, B: 70, C: 55 };

export function gradeScore(grade: Grade | null | undefined, scale = DEFAULT_GRADE_SCALE): number {
  if (!grade) return 0;
  return scale[grade] ?? 0;
}

/**
 * v2 단순화: 한 목표의 점수 = 목표 등급의 매핑 점수.
 */
export function calcGoalScore(grade: Grade | null | undefined, scale = DEFAULT_GRADE_SCALE): number {
  return gradeScore(grade, scale);
}

/**
 * 전체 최종 점수 = Σ goalScore × goal.weightPct / 100.
 */
export function calcFinalScore(
  snapshot: GoalSnapshot | null | undefined,
  goalGrades: Record<string, Grade>,
  scale = DEFAULT_GRADE_SCALE
): number {
  if (!snapshot?.goals?.length) return 0;
  let sum = 0;
  for (const g of snapshot.goals) {
    const grade = goalGrades[g.goalId];
    sum += gradeScore(grade, scale) * (g.weightPct / 100);
  }
  return round2(sum);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scoreToGrade(score: number): Grade {
  if (score >= 92) return 'S';
  if (score >= 78) return 'A';
  if (score >= 63) return 'B';
  return 'C';
}
