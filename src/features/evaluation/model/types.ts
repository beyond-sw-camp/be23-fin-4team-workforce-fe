// ── Enums ──
export type SeasonType = 'ANNUAL' | 'HALF_YEAR' | 'QUARTER';
export type SeasonStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
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

// ── Season ──
export type EvaluationSeason = {
  seasonId: string;
  companyId: string;
  name: string;
  type: SeasonType;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  resultPublishDate?: string;
  /** 결과 공개 시각 — null 이면 비공개 상태 */
  resultsPublishedAt?: string;
  schedule?: EvalSchedule;
};

export type CreateSeasonPayload = {
  name: string;
  type: SeasonType;
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

// [L-1] 섹션 유형 — 서버 enum SectionType 과 매칭
export type SectionType = 'MANUAL' | 'KPI_SCORE' | 'PEER_FEEDBACK';

export type DesignSection = {
  title: string;
  weight: number;
  questions: DesignQuestion[];
  /** [L-1] 섹션 유형 — 기본 MANUAL */
  type?: SectionType;
  /** [L-1] KPI_SCORE 섹션의 집계 범위 (ALL / TEMPLATE_ONLY / kpiTemplateId) */
  kpiFilter?: string;
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

// ── [L-1] Score Breakdown ──
export type SectionScoreType = 'MANUAL' | 'KPI_SCORE' | 'PEER_FEEDBACK';

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
  kpiTemplateId?: string;
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
