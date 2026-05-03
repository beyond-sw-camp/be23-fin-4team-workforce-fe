import type { KpiCycle } from '@/features/goals/model/types';

// ── Enums ──
export type SeasonType = 'ANNUAL' | 'HALF_YEAR' | 'QUARTER';
export type SeasonStatus =
  | 'DRAFT'
  | 'SELF_EVAL'
  | 'MANAGER_EVAL'
  | 'GRADE_CONFIRM'
  | 'RESULT_PUBLISHED'
  | 'INTERVIEW'
  | 'CLOSED';
export type EvalType = 'SELF' | 'DOWNWARD' | 'UPWARD' | 'PEER';
export type EvaluationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
export type GradeType = 'ABSOLUTE' | 'RELATIVE';
export type QuestionType = 'text' | 'scale' | 'grade' | 'gap';

// ── Schedule ──
export type EvalSchedule = {
  self?: { startDate: string; endDate: string };
  peer?: { startDate: string; endDate: string };
  upward?: { startDate: string; endDate: string };
  downward?: { startDate: string; endDate: string };
};

/** 백엔드 `EvaluationSchedule` / `StageTransitionScheduler` 와 동일한 `scheduleJson.phases` 계약 */
export type EvaluationScheduleStage =
  | 'SELF_PENDING'
  | 'SELF_SUBMITTED'
  | 'PEER_OPEN'
  | 'UPWARD_OPEN'
  | 'DOWNWARD_OPEN'
  | 'CALIBRATION_OPEN'
  | 'CALIBRATION_LOCKED'
  | 'CONFIRMED'
  | 'SKIPPED_LEAVER';

export type EvaluationPhaseRow = {
  stage: EvaluationScheduleStage;
  /** YYYY-MM-DD — Jackson LocalDate */
  start: string;
  end?: string;
};

export type EvaluationPhasesScheduleJson = {
  phases: EvaluationPhaseRow[];
};

// ── Season ──
export type EvaluationSeason = {
  seasonId: string;
  companyId: string;
  name: string;
  type: SeasonType;
  /** 봉인·조회 키 — Goal.cycle 과 동일 */
  targetCycle?: KpiCycle;
  /** 봉인·조회 키 — Goal.cycleStartDate 와 동일 */
  targetCycleStart?: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  resultPublishDate?: string;
  /** 결과 공개 시각 — null 이면 비공개 상태 */
  resultsPublishedAt?: string;
  /** 레거시 시즌: self/peer/upward/downward 객체 */
  schedule?: EvalSchedule;
  /** 신규 계약: `{ phases: [{ stage, start, end? }] }` */
  schedulePhases?: EvaluationPhasesScheduleJson;
};

export type CreateSeasonPayload = {
  name: string;
  type: SeasonType;
  /** 평가할 OKR 회차 시작일 (YYYY-MM-DD), 운영 기간과 별도 */
  targetCycleStart: string;
  startDate: string;
  endDate: string;
  resultPublishDate?: string;
  scheduleJson?: string;
};

export type UpdateSeasonPayload = Partial<CreateSeasonPayload>;

// ── Group ──
export type EvaluatorMap = {
  targetMemberId: string;
  evaluatorId: string;
  evaluationType: EvalType;
  targetMemberProfileUrl?: string;
  evaluatorProfileUrl?: string;
};

export type EvaluationGroup = {
  groupId: string;
  companyId: string;
  seasonId: string;
  name: string;
  evaluationTypes: EvalType[];
  targetMemberIds: string[];
  designId?: string;
  evaluatorMaps: EvaluatorMap[];
};

export type CreateGroupPayload = {
  name: string;
  evaluationTypes: string[];
  targetMemberIds: string[];
  designId?: string;
};

export type UpdateGroupPayload = Partial<CreateGroupPayload>;

// ── Design ──
export type QuestionOption = {
  scaleMin?: number;
  scaleMax?: number;
  gradeLabels?: string[];
};

export type DesignQuestion = {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  weight: number;
  options?: QuestionOption;
};

// 섹션 유형
export type SectionType = 'MANUAL' | 'PEER_FEEDBACK';

export type DesignSection = {
  title: string;
  weight: number;
  questions: DesignQuestion[];
  /** [L-1] 섹션 유형 — 기본 MANUAL */
  type?: SectionType;
  /** 섹션 식별자 — 서버 저장 시 채워질 수 있음 */
  sectionId?: string;
};

export type GradeConfig = {
  type: GradeType;
  grades: { label: string; minScore: number; maxScore: number; color: string }[];
  targetDistribution?: Record<string, number>;
};

export type EvaluationDesign = {
  designId: string;
  companyId: string;
  name: string;
  sections: DesignSection[];
  gradeConfig?: GradeConfig;
  /** 화면 표시용 버전 라벨 (예: v2) */
  designVersion?: string;
  /** 기본 템플릿 여부 */
  defaultTemplate?: boolean;
  /** 최근 수정 시각 */
  updatedAt?: string;
};

export type CreateDesignPayload = {
  name: string;
  sectionsJson: string;
  gradeConfigJson?: string;
};

export type UpdateDesignPayload = Partial<CreateDesignPayload>;

// ── Response (Answer) ──
export type Answer = {
  questionId: string;
  textValue?: string;
  scaleValue?: number;
  gradeValue?: string;
};

export type Calibration = {
  originalGrade?: string;
  adjustedGrade?: string;
  adjustmentReason?: string;
  confirmedAt?: string;
};

// ── Score Breakdown ──
export type SectionScoreType = 'MANUAL' | 'PEER_FEEDBACK';

export type SectionScore = {
  sectionId?: string;
  title?: string;
  type?: SectionScoreType;
  weight?: number;
  score?: number;
  skipped?: boolean;
  reason?: string;
  sampleSize?: number;
};

export type ScoreBreakdown = {
  totalScore?: number;
  sections?: SectionScore[];
};

export type EvaluationResponse = {
  responseId: string;
  companyId: string;
  seasonId?: string;
  seasonName?: string;
  seasonStatus?: SeasonStatus;
  seasonResultsPublishedAt?: string;
  groupId: string;
  designId?: string;
  targetMemberId: string;
  targetMemberName?: string;
  targetMemberDepartment?: string;
  targetMemberProfileUrl?: string;
  evaluatorId: string;
  evaluatorName?: string;
  evaluatorDepartment?: string;
  evaluatorProfileUrl?: string;
  evaluationType: EvalType;
  status: EvaluationStatus;
  submittedAt?: string;
  lastRemindedAt?: string;
  answers: Answer[];
  calibration?: Calibration;
  normalizedScore?: number;
  goalSnapshot?: GoalSnapshotItem[];
  scoreBreakdown?: ScoreBreakdown;
};

// ── Goal Snapshot (평가 시점 목표 캡처) ──
export type GoalSnapshotItem = {
  goalId: string;
  title: string;
  description?: string;
  goalKind?: string;
  statusAtSnapshot?: string;
  cycle?: string;
  measureType?: string;
  unitType?: string;
  unitLabel?: string;
  baseline?: number;
  targetValue?: number;
  actualValueAtSnapshot?: number;
  achievementPctAtSnapshot?: number;
  rolledAchievementPctAtSnapshot?: number;
  weightPct?: number;
  contributionPct?: number;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  snapshotTakenAt?: string;
};

// ── Goal Summary Card (스냅샷 vs 현재 비교) ──
export type GoalSummaryCard = {
  goalId: string;
  snapshot?: GoalSnapshotItem;
  current?: {
    title: string;
    status: string;
    targetValue?: number;
    actualValue?: number;
    achievementPct?: number;
    rolledAchievementPct?: number;
    weightPct?: number;
    unitLabel?: string;
  };
  changedSinceSnapshot: boolean;
  changeSummary: string[];
};

export type SaveResponsePayload = {
  answersJson: string;
};

// ── Calibration ──
export type CalibrationAdjustment = {
  responseId: string;
  adjustedGrade: string;
  adjustmentReason: string;
};

export type CalibrationAdjustPayload = {
  adjustments: CalibrationAdjustment[];
};

export type CalibrationBaselinePayload = {
  range: string;
  baselineValue: number;
};

export type CalibrationDistributionOverview = {
  targetDistribution: Record<string, number>;
  currentDistribution: Record<string, number>;
};

export type RelativePreviewAdjustment = {
  responseId: string;
  normalizedScore?: number;
  currentGrade?: string;
  predictedGrade?: string;
};

export type RelativeDistributionPreview = {
  targetDistribution: Record<string, number>;
  currentDistribution: Record<string, number>;
  predictedDistribution: Record<string, number>;
  adjustments: RelativePreviewAdjustment[];
};
