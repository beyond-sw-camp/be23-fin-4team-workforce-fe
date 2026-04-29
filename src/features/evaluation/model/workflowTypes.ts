import type { Grade, KpiCycle } from '@/features/goals/model/types';
import type { EvaluationPhasesScheduleJson } from '@/features/evaluation/model/types';

export type EvaluationStage =
  | 'SELF_PENDING'
  | 'SELF_SUBMITTED'
  | 'PEER_OPEN'
  | 'UPWARD_OPEN'
  | 'DOWNWARD_OPEN'
  | 'CALIBRATION_OPEN'
  | 'CALIBRATION_LOCKED'
  | 'CONFIRMED'
  | 'SKIPPED_LEAVER';

export type CalibrationRole = 'LEAD' | 'ASSISTANT';
export type EvaluationSeasonFlowStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export type EvaluationSeasonFlow = {
  seasonId: string;
  companyId: string;
  name: string;
  type: 'ANNUAL' | 'HALF_YEAR' | 'QUARTER';
  targetCycle: KpiCycle;
  targetCycleStart: string;
  startDate: string;
  endDate: string;
  status: EvaluationSeasonFlowStatus;
  resultPublishDate?: string | null;
  resultsPublishedAt?: string | null;
  /** `scheduleJson` 이 `{ phases: [...] }` 계약일 때만 채움 */
  schedulePhases?: EvaluationPhasesScheduleJson;
};

export type GoalSnapshotEntry = {
  goalId: string;
  title: string;
  description: string;
  weightPct: number;
  objectiveGoalId?: string | null;
  objectiveTitle?: string | null;
  gradeS: string;
  gradeA: string;
  gradeB: string;
  gradeC: string;
};

export type GoalSnapshot = { goals: GoalSnapshotEntry[] };

export type EvaluationFlowResponse = {
  responseId: string;
  companyId: string;
  groupId?: string | null;
  /** v4 — BE enrichment: group 의 season 정보 */
  seasonId?: string | null;
  seasonName?: string | null;
  resultsPublishedAt?: string | null;
  targetMemberId: string;
  evaluatorId: string;
  stage: EvaluationStage;
  selfEvalEmpty: boolean;
  submittedAt?: string | null;
  answersJson?: string | null;
  goalSnapshotJson?: string | null;
  goalSnapshot?: GoalSnapshot | null;
  confirmedGrade?: Grade | null;
  finalScoreSnapshot?: number | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SelfGoalAnswer = {
  goalId: string;
  grade: Grade;
  comment?: string;
};

export type SelfAnswersPayload = {
  items: SelfGoalAnswer[];
  overallComment?: string;
};

export type EvaluationCalibration = {
  calibrationId: string;
  responseId: string;
  evaluatorId: string;
  role: CalibrationRole;
  suggestedGrades: Record<string, Grade>;
  finalGrades: Record<string, Grade>;
  comment?: string | null;
  submittedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CalibrationUpsertPayload = {
  suggestedGrades?: Record<string, Grade>;
  finalGrades?: Record<string, Grade>;
  comment?: string;
  submit?: boolean;
};

export type ConfirmPayload = { confirmedGrade?: Grade; comment?: string };
