/** goal-service EvalCycle (백엔드 enum과 동일) */
export type EvalCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';

/** 등급 산정 방식 */
export type GradeType = 'ABSOLUTE' | 'RELATIVE';

/** 평가 유형 */
export type EvalType = 'SELF' | 'SUPERVISOR' | 'PEER';

/** 평가 진행 상태(백엔드 enum에 맞춤) */
export type EvaluationStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | string;

export type EvaluationPolicy = {
  id: string;
  companyId: string;
  policyName: string;
  evalCycle: EvalCycle;
  periodStart: string;
  periodEnd: string;
  resultOpenDate: string;
  editAllowedDays?: number;
  quantWeightPct?: number;
  qualWeightPct?: number;
  selfWeightPct?: number;
  supervisorWeightPct?: number;
  peerWeightPct?: number;
  gradeType?: GradeType;
  gradeConfigJson?: string;
  approvalRequired?: boolean;
  biasCheckEnabled?: boolean;
  peerCountMin?: number;
  peerCountMax?: number;
  active?: boolean;
};

export type CreateEvaluationPolicyPayload = {
  companyId: string;
  policyName: string;
  evalCycle: EvalCycle;
  periodStart: string;
  periodEnd: string;
  resultOpenDate: string;
  editAllowedDays: number;
  quantWeightPct: number;
  qualWeightPct: number;
  selfWeightPct: number;
  supervisorWeightPct: number;
  peerWeightPct: number;
  gradeType: GradeType;
  gradeConfigJson: string;
  approvalRequired: boolean;
  biasCheckEnabled: boolean;
  peerCountMin: number;
  peerCountMax: number;
};

export type Evaluation = {
  id: string;
  evaluationPolicyId: string;
  evaluateeId: string;
  evaluatorId: string;
  evalType: EvalType;
  status?: EvaluationStatus;
  quantScore?: number;
  qualScore?: number;
  goalScoresJson?: string;
  rubricScoresJson?: string;
  comment?: string;
  strengthComment?: string;
  improveComment?: string;
  finalScore?: number;
  grade?: string;
};

export type CreateEvaluationPayload = {
  evaluationPolicyId: string;
  evaluateeId: string;
  evalType: EvalType;
};

export type PatchEvaluationScoresPayload = {
  quantScore?: number;
  qualScore?: number;
  goalScoresJson?: string;
  rubricScoresJson?: string;
  comment?: string;
  strengthComment?: string;
  improveComment?: string;
};

export type ConfirmEvaluationPayload = {
  finalScore: number;
  grade: string;
};

export type PeerAssignment = {
  id: string;
  evaluationId: string;
  evaluateeId: string;
  peerMemberId: string;
  status?: string;
};

export type CreatePeerAssignmentPayload = {
  evaluationId: string;
  evaluateeId: string;
  peerMemberId: string;
};

export type CreateCalibrationPayload = {
  evaluationId: string;
  beforeGrade?: string;
  afterGrade?: string;
  beforeScore?: number;
  afterScore?: number;
  reason: string;
};

export type CalibrationLog = {
  id?: string;
  evaluationId: string;
  beforeGrade?: string;
  afterGrade?: string;
  beforeScore?: number;
  afterScore?: number;
  reason?: string;
};
