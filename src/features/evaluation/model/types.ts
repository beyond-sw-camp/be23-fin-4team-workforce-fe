// ── Enums ──
export type SeasonType = 'ANNUAL' | 'HALF_YEAR' | 'QUARTER';
export type SeasonStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type SeasonPhase =
  | 'NOT_STARTED'
  | 'SELF_EVAL'
  | 'PEER_EVAL'
  | 'UPWARD_EVAL'
  | 'DOWNWARD_EVAL'
  | 'CALIBRATION'
  | 'CONFIRMED'
  | 'PUBLISHED';
export type EvalType = 'SELF' | 'DOWNWARD' | 'UPWARD' | 'PEER';
export type EvaluationStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
export type GradeType = 'ABSOLUTE' | 'RELATIVE';
export type QuestionType = 'text' | 'scale' | 'grade' | 'gap';
export type AnomalyType = 'all_same' | 'too_short' | 'insincere' | 'contradiction';
export type AnomalySeverity = 'info' | 'warning' | 'critical';

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
  phase: SeasonPhase;
  phaseUpdatedAt?: string;
  resultPublishDate?: string;
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

export type DesignSection = {
  title: string;
  weight: number;
  questions: DesignQuestion[];
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
  flagged?: boolean;
  anomalyType?: AnomalyType;
  anomalySeverity?: AnomalySeverity;
};

export type Calibration = {
  originalGrade?: string;
  adjustedGrade?: string;
  adjustmentReason?: string;
  confirmedAt?: string;
};

export type EvaluationResponse = {
  responseId: string;
  companyId: string;
  /** 그룹이 속한 평가 시즌 */
  seasonId?: string;
  groupId: string;
  /** 그룹에 연결된 평가 설계 ID — 작성 화면에서 문항 로드 */
  designId?: string;
  targetMemberId: string;
  evaluatorId: string;
  evaluationType: EvalType;
  status: EvaluationStatus;
  submittedAt?: string;
  lastRemindedAt?: string;
  answers: Answer[];
  calibration?: Calibration;
  normalizedScore?: number;
  targetGoalIds?: string[];
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
