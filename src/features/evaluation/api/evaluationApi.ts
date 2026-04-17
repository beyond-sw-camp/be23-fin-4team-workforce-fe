import type {
  EvaluationSeason,
  EvaluationGroup,
  EvaluationDesign,
  EvaluationResponse,
  GoalSummaryCard,
  CreateSeasonPayload,
  UpdateSeasonPayload,
  CreateGroupPayload,
  UpdateGroupPayload,
  CreateDesignPayload,
  UpdateDesignPayload,
  SaveResponsePayload,
  CalibrationAdjustPayload,
  CalibrationBaselinePayload,
} from '@/features/evaluation/model/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

// ── Helpers ──
function safeJsonParse<T>(json: unknown, fallback: T): T {
  if (!json || typeof json !== 'string') return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function mapSeason(raw: any): EvaluationSeason {
  return {
    seasonId: raw.seasonId,
    companyId: raw.companyId,
    name: raw.name,
    type: raw.type,
    startDate: raw.startDate,
    endDate: raw.endDate,
    status: raw.status,
    phase: raw.phase ?? 'NOT_STARTED',
    phaseUpdatedAt: raw.phaseUpdatedAt ?? undefined,
    resultPublishDate: raw.resultPublishDate,
    schedule: safeJsonParse(raw.scheduleJson, undefined),
  };
}

function mapGroup(raw: any): EvaluationGroup {
  return {
    groupId: raw.groupId,
    companyId: raw.companyId,
    seasonId: raw.seasonId,
    name: raw.name,
    evaluationTypes: safeJsonParse(raw.evaluationTypesJson, []),
    targetMemberIds: safeJsonParse(raw.targetMemberIdsJson, []),
    designId: raw.designId,
    evaluatorMaps: safeJsonParse(raw.evaluatorMapsJson, []),
  };
}

function mapDesign(raw: any): EvaluationDesign {
  return {
    designId: raw.designId,
    companyId: raw.companyId,
    name: raw.name,
    sections: safeJsonParse(raw.sectionsJson, []),
    gradeConfig: safeJsonParse(raw.gradeConfigJson, undefined),
  };
}

function mapResponse(raw: any): EvaluationResponse {
  return {
    responseId: raw.responseId,
    companyId: raw.companyId,
    seasonId: raw.seasonId ?? undefined,
    groupId: raw.groupId,
    designId: raw.designId ?? undefined,
    targetMemberId: raw.targetMemberId,
    evaluatorId: raw.evaluatorId,
    evaluationType: raw.evaluationType,
    status: raw.status,
    submittedAt: raw.submittedAt,
    lastRemindedAt: raw.lastRemindedAt,
    answers: safeJsonParse(raw.answersJson, []),
    calibration: safeJsonParse(raw.calibrationJson, undefined),
    normalizedScore: raw.normalizedScore ?? undefined,
    targetGoalIds: safeJsonParse(raw.targetGoalIdsJson, undefined),
    goalSnapshot: safeJsonParse(raw.goalSnapshotJson, undefined),
  };
}

function mapGoalSummaryCard(raw: any): GoalSummaryCard {
  return {
    goalId: raw.goalId,
    snapshot: raw.snapshot ?? undefined,
    current: raw.current ?? undefined,
    changedSinceSnapshot: raw.changedSinceSnapshot ?? false,
    changeSummary: raw.changeSummary ?? [],
  };
}

function normalizeArray<T>(payload: unknown, mapFn: (r: any) => T): T[] {
  if (Array.isArray(payload)) return payload.map(mapFn);
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of ['items', 'content', 'data', 'list']) {
      if (Array.isArray(o[k])) return (o[k] as any[]).map(mapFn);
    }
  }
  return [];
}

// ── API ──
export const evaluationApi = {
  // ── Seasons ──
  async listSeasons(): Promise<EvaluationSeason[]> {
    const res = await httpClient.get('/evaluation/evaluation-seasons');
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapSeason);
  },

  async createSeason(body: CreateSeasonPayload): Promise<EvaluationSeason> {
    const payload = { ...body, scheduleJson: body.scheduleJson ?? JSON.stringify({}) };
    const res = await httpClient.post('/evaluation/evaluation-seasons', payload);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async getSeason(seasonId: string): Promise<EvaluationSeason> {
    const res = await httpClient.get(`/evaluation/evaluation-seasons/${seasonId}`);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async updateSeason(seasonId: string, body: UpdateSeasonPayload): Promise<EvaluationSeason> {
    const res = await httpClient.patch(`/evaluation/evaluation-seasons/${seasonId}`, body);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async startSeason(seasonId: string): Promise<EvaluationSeason> {
    const res = await httpClient.post(`/evaluation/evaluation-seasons/${seasonId}/start`);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async closeSeason(seasonId: string): Promise<EvaluationSeason> {
    const res = await httpClient.post(`/evaluation/evaluation-seasons/${seasonId}/close`);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async transitionPhase(seasonId: string, next: string): Promise<EvaluationSeason> {
    const res = await httpClient.post(`/evaluation/evaluation-seasons/${seasonId}/phase?next=${next}`);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async publishResults(seasonId: string): Promise<void> {
    await httpClient.post(`/evaluation/evaluation-seasons/${seasonId}/publish`);
  },

  // ── Groups ──
  async listGroups(seasonId: string): Promise<EvaluationGroup[]> {
    const res = await httpClient.get(`/evaluation/evaluation-seasons/${seasonId}/groups`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapGroup);
  },

  async createGroup(seasonId: string, body: CreateGroupPayload): Promise<EvaluationGroup> {
    const res = await httpClient.post(`/evaluation/evaluation-seasons/${seasonId}/groups`, body);
    return mapGroup(unwrapApiResponse<any>(res.data));
  },

  async updateGroup(
    seasonId: string,
    groupId: string,
    body: UpdateGroupPayload,
  ): Promise<EvaluationGroup> {
    const res = await httpClient.patch(
      `/evaluation/evaluation-seasons/${seasonId}/groups/${groupId}`,
      body,
    );
    return mapGroup(unwrapApiResponse<any>(res.data));
  },

  async deleteGroup(seasonId: string, groupId: string): Promise<void> {
    await httpClient.delete(`/evaluation/evaluation-seasons/${seasonId}/groups/${groupId}`);
  },

  async autoAssignEvaluators(
    seasonId: string,
    groupId: string,
    basis: string,
  ): Promise<EvaluationGroup> {
    const res = await httpClient.post(
      `/evaluation/evaluation-seasons/${seasonId}/groups/${groupId}/evaluator-maps/auto`,
      { basis },
    );
    return mapGroup(unwrapApiResponse<any>(res.data));
  },

  async updateEvaluatorMaps(
    seasonId: string,
    groupId: string,
    evaluatorMapsJson: string,
  ): Promise<EvaluationGroup> {
    const res = await httpClient.patch(
      `/evaluation/evaluation-seasons/${seasonId}/groups/${groupId}/evaluator-maps`,
      { evaluatorMapsJson },
    );
    return mapGroup(unwrapApiResponse<any>(res.data));
  },

  // ── Designs ──
  async listDesigns(): Promise<EvaluationDesign[]> {
    const res = await httpClient.get('/evaluation/evaluation-designs');
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapDesign);
  },

  async createDesign(body: CreateDesignPayload): Promise<EvaluationDesign> {
    const res = await httpClient.post('/evaluation/evaluation-designs', body);
    return mapDesign(unwrapApiResponse<any>(res.data));
  },

  async getDesign(designId: string): Promise<EvaluationDesign> {
    const res = await httpClient.get(`/evaluation/evaluation-designs/${designId}`);
    return mapDesign(unwrapApiResponse<any>(res.data));
  },

  async updateDesign(designId: string, body: UpdateDesignPayload): Promise<EvaluationDesign> {
    const res = await httpClient.patch(`/evaluation/evaluation-designs/${designId}`, body);
    return mapDesign(unwrapApiResponse<any>(res.data));
  },

  // ── Responses ──
  async listMyResponses(): Promise<EvaluationResponse[]> {
    const res = await httpClient.get('/evaluation/evaluation-responses');
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapResponse);
  },

  async getResponse(responseId: string): Promise<EvaluationResponse> {
    const res = await httpClient.get(`/evaluation/evaluation-responses/${responseId}`);
    return mapResponse(unwrapApiResponse<any>(res.data));
  },

  async saveResponse(responseId: string, body: SaveResponsePayload): Promise<EvaluationResponse> {
    const res = await httpClient.patch(`/evaluation/evaluation-responses/${responseId}`, body);
    return mapResponse(unwrapApiResponse<any>(res.data));
  },

  async submitResponse(responseId: string): Promise<EvaluationResponse> {
    const res = await httpClient.post(`/evaluation/evaluation-responses/${responseId}/submit`);
    return mapResponse(unwrapApiResponse<any>(res.data));
  },

  async reopenResponse(responseId: string): Promise<EvaluationResponse> {
    const res = await httpClient.post(`/evaluation/evaluation-responses/${responseId}/reopen`);
    return mapResponse(unwrapApiResponse<any>(res.data));
  },

  /** 평가 응답에 포함된 목표 스냅샷 vs 현재 값 비교 요약 카드 */
  async getGoalSummaries(responseId: string): Promise<GoalSummaryCard[]> {
    const res = await httpClient.get(`/evaluation/evaluation-responses/${responseId}/goal-summaries`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapGoalSummaryCard);
  },

  // ── Reminders ──
  async sendBulkReminder(seasonId: string): Promise<void> {
    await httpClient.post(`/evaluation/evaluation-responses/seasons/${seasonId}/reminders`);
  },

  async sendReminder(seasonId: string, memberId: string): Promise<void> {
    await httpClient.post(`/evaluation/evaluation-responses/seasons/${seasonId}/reminders/${memberId}`);
  },

  // ── Calibration ──
  async getCalibrationOverview(seasonId: string): Promise<EvaluationResponse[]> {
    const res = await httpClient.get(`/evaluation/evaluation-responses/seasons/${seasonId}/calibration`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapResponse);
  },

  async applyBaseline(seasonId: string, body: CalibrationBaselinePayload): Promise<void> {
    await httpClient.post(
      `/evaluation/evaluation-responses/seasons/${seasonId}/calibration/baseline`,
      body,
    );
  },

  async adjustCalibrations(seasonId: string, body: CalibrationAdjustPayload): Promise<void> {
    await httpClient.patch(
      `/evaluation/evaluation-responses/seasons/${seasonId}/calibration/adjustments`,
      body,
    );
  },

  async confirmCalibration(seasonId: string): Promise<void> {
    await httpClient.post(`/evaluation/evaluation-responses/seasons/${seasonId}/calibration/confirm`);
  },

  // ── Progress & Anomalies ──
  async getProgress(seasonId: string): Promise<EvaluationResponse[]> {
    const res = await httpClient.get(`/evaluation/evaluation-responses/seasons/${seasonId}/progress`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapResponse);
  },

  async listAnomalies(seasonId: string): Promise<EvaluationResponse[]> {
    const res = await httpClient.get(`/evaluation/evaluation-responses/seasons/${seasonId}/anomalies`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapResponse);
  },

  async requestReview(seasonId: string, responseId: string): Promise<EvaluationResponse> {
    const res = await httpClient.post(
      `/evaluation/evaluation-responses/seasons/${seasonId}/anomalies/${responseId}/request-review`,
    );
    return mapResponse(unwrapApiResponse<any>(res.data));
  },
};
