import type {
  CalibrationLog,
  ConfirmEvaluationPayload,
  CreateCalibrationPayload,
  CreateEvaluationPayload,
  CreateEvaluationPolicyPayload,
  CreatePeerAssignmentPayload,
  EvalCycle,
  EvalType,
  Evaluation,
  EvaluationPolicy,
  GradeType,
  PatchEvaluationScoresPayload,
  PeerAssignment,
} from '@/features/evaluation/model/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

function normalizeArray<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

function num(r: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = r[k];
    if (v === undefined || v === null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function str(r: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
}

function bool(r: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

/** 백엔드 enum + 구 스펙/문서 별칭 정규화 */
function normalizeEvalCycle(raw: unknown): EvalCycle {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (v === 'MONTHLY') return 'MONTHLY';
  if (v === 'QUARTERLY') return 'QUARTERLY';
  if (v === 'SEMI_ANNUAL' || v === 'HALF_YEARLY') return 'SEMI_ANNUAL';
  if (v === 'ANNUAL' || v === 'YEARLY') return 'ANNUAL';
  return 'ANNUAL';
}

function mapPolicyFromApi(raw: unknown): EvaluationPolicy | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r, 'id', 'policyId', 'evaluationPolicyId');
  const companyId = str(r, 'companyId', 'company_id');
  const policyName = str(r, 'policyName', 'policy_name', 'name');
  if (!id || !companyId || !policyName) return null;
  return {
    id,
    companyId,
    policyName,
    evalCycle: normalizeEvalCycle(r.evalCycle ?? r.eval_cycle),
    periodStart: String(r.periodStart ?? r.period_start ?? ''),
    periodEnd: String(r.periodEnd ?? r.period_end ?? ''),
    resultOpenDate: String(r.resultOpenDate ?? r.result_open_date ?? ''),
    editAllowedDays: num(r, 'editAllowedDays', 'edit_allowed_days'),
    quantWeightPct: num(r, 'quantWeightPct', 'quant_weight_pct'),
    qualWeightPct: num(r, 'qualWeightPct', 'qual_weight_pct'),
    selfWeightPct: num(r, 'selfWeightPct', 'self_weight_pct'),
    supervisorWeightPct: num(r, 'supervisorWeightPct', 'supervisor_weight_pct'),
    peerWeightPct: num(r, 'peerWeightPct', 'peer_weight_pct'),
    gradeType: (str(r, 'gradeType', 'grade_type') ?? 'ABSOLUTE') as GradeType,
    gradeConfigJson: str(r, 'gradeConfigJson', 'grade_config_json'),
    approvalRequired: bool(r, 'approvalRequired', 'approval_required'),
    biasCheckEnabled: bool(r, 'biasCheckEnabled', 'bias_check_enabled'),
    peerCountMin: num(r, 'peerCountMin', 'peer_count_min'),
    peerCountMax: num(r, 'peerCountMax', 'peer_count_max'),
    active: bool(r, 'active', 'isActive', 'is_active'),
  };
}

function mapEvaluationFromApi(raw: unknown): Evaluation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r, 'id', 'evaluationId', 'evaluation_id');
  const evaluationPolicyId = str(r, 'evaluationPolicyId', 'evaluation_policy_id', 'policyId');
  const evaluateeId = str(r, 'evaluateeId', 'evaluatee_id');
  const evaluatorId = str(r, 'evaluatorId', 'evaluator_id');
  if (!id || !evaluationPolicyId || !evaluateeId || !evaluatorId) return null;
  return {
    id,
    evaluationPolicyId,
    evaluateeId,
    evaluatorId,
    evalType: String(r.evalType ?? r.eval_type ?? 'SELF') as EvalType,
    status: str(r, 'status', 'evaluationStatus', 'evaluation_status'),
    quantScore: num(r, 'quantScore', 'quant_score'),
    qualScore: num(r, 'qualScore', 'qual_score'),
    goalScoresJson: str(r, 'goalScoresJson', 'goal_scores_json'),
    rubricScoresJson: str(r, 'rubricScoresJson', 'rubric_scores_json'),
    comment: str(r, 'comment', 'overallComment'),
    strengthComment: str(r, 'strengthComment', 'strength_comment'),
    improveComment: str(r, 'improveComment', 'improve_comment', 'improvementComment'),
    finalScore: num(r, 'finalScore', 'final_score'),
    grade: str(r, 'grade', 'finalGrade'),
  };
}

function mapPeerFromApi(raw: unknown): PeerAssignment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r, 'id', 'peerAssignmentId', 'peer_assignment_id');
  const evaluationId = str(r, 'evaluationId', 'evaluation_id');
  const evaluateeId = str(r, 'evaluateeId', 'evaluatee_id');
  const peerMemberId = str(r, 'peerMemberId', 'peer_member_id');
  if (!id || !evaluationId || !evaluateeId || !peerMemberId) return null;
  return {
    id,
    evaluationId,
    evaluateeId,
    peerMemberId,
    status: str(r, 'status', 'assignmentStatus'),
  };
}

function mapCalibrationFromApi(raw: unknown): CalibrationLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const evaluationId = str(r, 'evaluationId', 'evaluation_id');
  if (!evaluationId) return null;
  return {
    id: str(r, 'id', 'calibrationId'),
    evaluationId,
    beforeGrade: str(r, 'beforeGrade', 'before_grade'),
    afterGrade: str(r, 'afterGrade', 'after_grade'),
    beforeScore: num(r, 'beforeScore', 'before_score'),
    afterScore: num(r, 'afterScore', 'after_score'),
    reason: str(r, 'reason', 'comment'),
  };
}

const LIST_KEYS = ['items', 'content', 'data', 'list', 'results', 'evaluations', 'policies', 'policyList'];

export const evaluationApi = {
  async createPolicy(body: CreateEvaluationPolicyPayload): Promise<EvaluationPolicy> {
    const response = await httpClient.post('/evaluation/policy', body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const p = mapPolicyFromApi(raw);
    if (!p) throw new Error('평가 정책 생성 응답을 해석할 수 없습니다.');
    return p;
  },

  async listPolicies(activeOnly = false): Promise<EvaluationPolicy[]> {
    const response = await httpClient.get('/evaluation/policy', { params: { activeOnly } });
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = normalizeArray<unknown>(raw, LIST_KEYS);
    return rows.map(mapPolicyFromApi).filter((p): p is EvaluationPolicy => p !== null);
  },

  async deactivatePolicy(policyId: string): Promise<void> {
    await httpClient.patch(`/evaluation/policy/${policyId}/deactivate`);
  },

  async createEvaluation(body: CreateEvaluationPayload): Promise<Evaluation> {
    const response = await httpClient.post('/evaluation', body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const ev = mapEvaluationFromApi(raw);
    if (!ev) throw new Error('평가 생성 응답을 해석할 수 없습니다.');
    return ev;
  },

  async getEvaluation(evaluationId: string): Promise<Evaluation> {
    const response = await httpClient.get(`/evaluation/${evaluationId}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const ev = mapEvaluationFromApi(raw);
    if (!ev) throw new Error('평가 상세를 불러올 수 없습니다.');
    return ev;
  },

  async patchScores(evaluationId: string, body: PatchEvaluationScoresPayload): Promise<Evaluation> {
    const response = await httpClient.patch(`/evaluation/${evaluationId}/scores`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const ev = mapEvaluationFromApi(raw);
    if (!ev) throw new Error('평가 저장 응답을 해석할 수 없습니다.');
    return ev;
  },

  async submitEvaluation(evaluationId: string): Promise<Evaluation> {
    const response = await httpClient.patch(`/evaluation/${evaluationId}/submit`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const ev = mapEvaluationFromApi(raw);
    if (!ev) throw new Error('평가 제출 응답을 해석할 수 없습니다.');
    return ev;
  },

  async confirmEvaluation(evaluationId: string, body: ConfirmEvaluationPayload): Promise<Evaluation> {
    const response = await httpClient.patch(`/evaluation/${evaluationId}/confirm`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const ev = mapEvaluationFromApi(raw);
    if (!ev) throw new Error('평가 확정 응답을 해석할 수 없습니다.');
    return ev;
  },

  async listEvaluationsByPolicy(policyId: string): Promise<Evaluation[]> {
    const response = await httpClient.get(`/evaluation/policy/${policyId}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = normalizeArray<unknown>(raw, LIST_KEYS);
    return rows.map(mapEvaluationFromApi).filter((e): e is Evaluation => e !== null);
  },

  async listMyEvaluations(): Promise<Evaluation[]> {
    const response = await httpClient.get('/evaluation/evaluator/me');
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = normalizeArray<unknown>(raw, LIST_KEYS);
    return rows.map(mapEvaluationFromApi).filter((e): e is Evaluation => e !== null);
  },

  async createPeerAssignment(body: CreatePeerAssignmentPayload): Promise<PeerAssignment> {
    const response = await httpClient.post('/evaluation/peer-assignment', body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const pa = mapPeerFromApi(raw);
    if (!pa) throw new Error('동료 평가 배정 응답을 해석할 수 없습니다.');
    return pa;
  },

  async listPeerAssignments(evaluationId: string, evaluateeId: string): Promise<PeerAssignment[]> {
    const response = await httpClient.get('/evaluation/peer-assignment', {
      params: { evaluationId, evaluateeId },
    });
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = normalizeArray<unknown>(raw, LIST_KEYS);
    return rows.map(mapPeerFromApi).filter((p): p is PeerAssignment => p !== null);
  },

  async completePeerAssignment(peerAssignmentId: string): Promise<void> {
    await httpClient.patch(`/evaluation/peer-assignment/${peerAssignmentId}/complete`);
  },

  async declinePeerAssignment(peerAssignmentId: string): Promise<void> {
    await httpClient.patch(`/evaluation/peer-assignment/${peerAssignmentId}/decline`);
  },

  async createCalibration(body: CreateCalibrationPayload): Promise<CalibrationLog> {
    const response = await httpClient.post('/evaluation/calibration', body);
    const raw = unwrapApiResponse<unknown>(response.data);
    return mapCalibrationFromApi(raw) ?? (raw as CalibrationLog);
  },

  async listCalibrations(evaluationId: string): Promise<CalibrationLog[]> {
    const response = await httpClient.get(`/evaluation/calibration/${evaluationId}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = normalizeArray<unknown>(raw, LIST_KEYS);
    return rows.map(mapCalibrationFromApi).filter((c): c is CalibrationLog => c !== null);
  },
};
