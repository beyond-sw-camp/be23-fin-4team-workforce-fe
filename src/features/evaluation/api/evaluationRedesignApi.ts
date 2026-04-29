import { httpClient } from '@/shared/api/httpClient';
import { normalizeArray } from '@/shared/api/normalize';
import { unwrapApiResponse } from '@/shared/api/response';
import { isEvaluationPhasesScheduleJson } from '@/features/evaluation/lib/evaluationPhaseSchedule';
import type {
  CreateDesignPayload,
  CreateGroupPayload,
  CreateSeasonPayload,
  EvaluationDesign,
  EvaluationGroup,
  GoalSummaryCard,
  UpdateDesignPayload,
  UpdateGroupPayload,
} from '../model/types';
import type {
  CalibrationUpsertPayload,
  ConfirmPayload,
  EvaluationCalibration,
  EvaluationFlowResponse,
  EvaluationSeasonFlow,
  GoalSnapshot,
  SelfAnswersPayload,
} from '../model/workflowTypes';
import { evaluationApi } from './evaluationApi';

function pickStr(o: any, ...keys: string[]): string {
  for (const k of keys) if (o?.[k] != null) return String(o[k]);
  return '';
}

function pickBool(o: any, ...keys: string[]): boolean {
  for (const k of keys) if (o?.[k] != null) return Boolean(o[k]);
  return false;
}

function pickNum(o: any, ...keys: string[]): number | null {
  for (const k of keys) if (o?.[k] != null) return Number(o[k]);
  return null;
}

function safeParseSnapshot(json?: string | null): GoalSnapshot | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as GoalSnapshot;
  } catch {
    return null;
  }
}

function safeParseGradeMap(json?: string | null): Record<string, any> {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function mapResponse(r: any): EvaluationFlowResponse {
  const snapshotJson = r.goalSnapshotJson ?? null;
  return {
    responseId: pickStr(r, 'responseId', 'id'),
    companyId: pickStr(r, 'companyId'),
    groupId: r.groupId ?? null,
    seasonId: r.seasonId ?? null,
    seasonName: r.seasonName ?? null,
    resultsPublishedAt: r.resultsPublishedAt ?? null,
    targetMemberId: pickStr(r, 'targetMemberId'),
    evaluatorId: pickStr(r, 'evaluatorId'),
    stage: pickStr(r, 'stage') as EvaluationFlowResponse['stage'],
    selfEvalEmpty: pickBool(r, 'selfEvalEmpty'),
    submittedAt: r.submittedAt ?? null,
    answersJson: r.answersJson ?? null,
    goalSnapshotJson: snapshotJson,
    goalSnapshot: safeParseSnapshot(snapshotJson),
    confirmedGrade: (r.confirmedGrade ?? null) as EvaluationFlowResponse['confirmedGrade'],
    finalScoreSnapshot: pickNum(r, 'finalScoreSnapshot'),
    confirmedBy: r.confirmedBy ?? null,
    confirmedAt: r.confirmedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function mapCalibration(c: any): EvaluationCalibration {
  return {
    calibrationId: pickStr(c, 'calibrationId', 'id'),
    responseId: pickStr(c, 'responseId'),
    evaluatorId: pickStr(c, 'evaluatorId'),
    role: pickStr(c, 'role') as EvaluationCalibration['role'],
    suggestedGrades: safeParseGradeMap(c.suggestedGradeJson),
    finalGrades: safeParseGradeMap(c.finalGradeJson),
    comment: c.comment ?? null,
    submittedAt: c.submittedAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function mapSeason(s: any): EvaluationSeasonFlow {
  const scheduleJson = s.scheduleJson;
  let schedulePhases: EvaluationSeasonFlow['schedulePhases'];
  if (typeof scheduleJson === 'string' && scheduleJson.trim()) {
    try {
      const parsed = JSON.parse(scheduleJson) as unknown;
      if (isEvaluationPhasesScheduleJson(parsed)) schedulePhases = parsed;
    } catch {
      // ignore malformed schedule
    }
  }
  return {
    seasonId: pickStr(s, 'seasonId', 'id'),
    companyId: pickStr(s, 'companyId'),
    name: pickStr(s, 'name'),
    type: pickStr(s, 'type') as EvaluationSeasonFlow['type'],
    targetCycle: pickStr(s, 'targetCycle', 'target_cycle') as EvaluationSeasonFlow['targetCycle'],
    targetCycleStart: pickStr(s, 'targetCycleStart', 'target_cycle_start'),
    startDate: pickStr(s, 'startDate'),
    endDate: pickStr(s, 'endDate'),
    status: pickStr(s, 'status') as EvaluationSeasonFlow['status'],
    resultPublishDate: s.resultPublishDate ?? null,
    resultsPublishedAt: s.resultsPublishedAt ?? null,
    schedulePhases,
  };
}

export const evaluationRedesignApi = {
  async listSeasons(): Promise<EvaluationSeasonFlow[]> {
    const res = await httpClient.get('/evaluation/seasons');
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'list']).map(mapSeason);
  },

  async getSeason(seasonId: string): Promise<EvaluationSeasonFlow> {
    const res = await httpClient.get(`/evaluation/seasons/${seasonId}`);
    return mapSeason(unwrapApiResponse<unknown>(res.data));
  },

  async activateSeason(seasonId: string): Promise<void> {
    await httpClient.post(`/evaluation/seasons/${seasonId}/activate`);
  },

  async closeSeason(seasonId: string): Promise<void> {
    await httpClient.post(`/evaluation/seasons/${seasonId}/close`);
  },

  async publishSeason(seasonId: string): Promise<void> {
    await httpClient.post(`/evaluation/seasons/${seasonId}/publish`);
  },

  async listMySelf(): Promise<EvaluationFlowResponse[]> {
    const res = await httpClient.get('/evaluation/responses/me/self');
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'list']).map(mapResponse);
  },

  async listMyReceived(): Promise<EvaluationFlowResponse[]> {
    const res = await httpClient.get('/evaluation/responses/me/received');
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'list']).map(mapResponse);
  },

  async listMyEvaluatorAssignments(): Promise<EvaluationFlowResponse[]> {
    const res = await httpClient.get('/evaluation/responses/me/evaluator-assignments');
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'list']).map(mapResponse);
  },

  async saveSelf(responseId: string, payload: SelfAnswersPayload): Promise<EvaluationFlowResponse> {
    const res = await httpClient.patch(`/evaluation/responses/${responseId}/self/save`, payload);
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async submitSelf(responseId: string, payload: SelfAnswersPayload): Promise<EvaluationFlowResponse> {
    const res = await httpClient.post(`/evaluation/responses/${responseId}/self/submit`, payload);
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async listCalibrations(responseId: string): Promise<EvaluationCalibration[]> {
    const res = await httpClient.get(`/evaluation/responses/${responseId}/calibrations`);
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'list']).map(mapCalibration);
  },

  async upsertCalibration(responseId: string, payload: CalibrationUpsertPayload): Promise<EvaluationCalibration> {
    const res = await httpClient.patch(`/evaluation/responses/${responseId}/calibrations`, payload);
    return mapCalibration(unwrapApiResponse<unknown>(res.data));
  },

  async confirmResponse(responseId: string, payload: ConfirmPayload): Promise<EvaluationFlowResponse> {
    const res = await httpClient.post(`/evaluation/responses/${responseId}/confirm`, payload);
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async unconfirmResponse(responseId: string): Promise<EvaluationFlowResponse> {
    const res = await httpClient.post(`/evaluation/responses/${responseId}/unconfirm`);
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async createFeedback(responseId: string, content: string): Promise<void> {
    await httpClient.post(`/evaluation/responses/${responseId}/feedback`, { content });
  },

  async createSeason(body: CreateSeasonPayload) {
    return evaluationApi.createSeason(body);
  },

  async listGroups(seasonId: string): Promise<EvaluationGroup[]> {
    return evaluationApi.listGroups(seasonId);
  },

  async createGroup(seasonId: string, body: CreateGroupPayload): Promise<EvaluationGroup> {
    return evaluationApi.createGroup(seasonId, body);
  },

  async updateGroup(seasonId: string, groupId: string, body: UpdateGroupPayload): Promise<EvaluationGroup> {
    return evaluationApi.updateGroup(seasonId, groupId, body);
  },

  async deleteGroup(seasonId: string, groupId: string): Promise<void> {
    return evaluationApi.deleteGroup(seasonId, groupId);
  },

  async autoAssignEvaluators(seasonId: string, groupId: string, basis: string): Promise<EvaluationGroup> {
    return evaluationApi.autoAssignEvaluators(seasonId, groupId, basis);
  },

  async updateEvaluatorMaps(
    seasonId: string,
    groupId: string,
    evaluatorMaps: EvaluationGroup['evaluatorMaps'],
  ): Promise<EvaluationGroup> {
    return evaluationApi.updateEvaluatorMaps(seasonId, groupId, evaluatorMaps);
  },

  async listDesigns(): Promise<EvaluationDesign[]> {
    return evaluationApi.listDesigns();
  },

  async createDesign(body: CreateDesignPayload): Promise<EvaluationDesign> {
    return evaluationApi.createDesign(body);
  },

  async updateDesign(designId: string, body: UpdateDesignPayload): Promise<EvaluationDesign> {
    return evaluationApi.updateDesign(designId, body);
  },

  async duplicateDesign(designId: string): Promise<EvaluationDesign> {
    return evaluationApi.duplicateDesign(designId);
  },

  async deleteDesign(designId: string): Promise<void> {
    return evaluationApi.deleteDesign(designId);
  },

  async getResponse(responseId: string): Promise<EvaluationFlowResponse> {
    const res = await httpClient.get(`/evaluation/responses/${responseId}`);
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async getDesign(designId: string): Promise<EvaluationDesign> {
    return evaluationApi.getDesign(designId);
  },

  async getGoalSummaries(responseId: string): Promise<GoalSummaryCard[]> {
    return evaluationApi.getGoalSummaries(responseId);
  },

  async getPublishBlockers(seasonId: string): Promise<{
    seasonId: string;
    totalResponses: number;
    byStage: Record<string, number>;
    blockers: Array<{
      responseId: string;
      targetMemberId: string;
      evaluatorId: string;
      stage: EvaluationFlowResponse['stage'];
    }>;
    publishable: boolean;
  }> {
    const res = await httpClient.get(`/evaluation/seasons/${seasonId}/publish-blockers`);
    const raw = unwrapApiResponse<any>(res.data) ?? {};
    return {
      seasonId: pickStr(raw, 'seasonId') || seasonId,
      totalResponses: Number(raw.totalResponses ?? 0),
      byStage: (raw.byStage ?? {}) as Record<string, number>,
      blockers: Array.isArray(raw.blockers)
        ? raw.blockers.map((item: any) => ({
            responseId: pickStr(item, 'responseId'),
            targetMemberId: pickStr(item, 'targetMemberId'),
            evaluatorId: pickStr(item, 'evaluatorId'),
            stage: pickStr(item, 'stage') as EvaluationFlowResponse['stage'],
          }))
        : [],
      publishable: Boolean(raw.publishable),
    };
  },

  async getMeetingSeasonStatus(seasonId: string): Promise<{
    createdCount: number;
    completedCount: number;
    uncompletedCount: number;
    unscheduledCount: number;
  }> {
    const res = await httpClient.get(`/evaluation/seasons/${seasonId}/meetings/status`);
    const raw = unwrapApiResponse<any>(res.data) ?? {};
    return {
      createdCount: Number(raw.createdCount ?? 0),
      completedCount: Number(raw.completedCount ?? 0),
      uncompletedCount: Number(raw.uncompletedCount ?? 0),
      unscheduledCount: Number(raw.unscheduledCount ?? 0),
    };
  },

  async getOperationalAlerts(seasonId: string): Promise<{
    seasonId: string;
    totalAlerts: number;
    alerts: Array<{
      alertType: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW' | string;
      responseId: string;
      targetMemberId: string;
      evaluatorId: string;
      targetMemberStatus?: string | null;
      evaluatorStatus?: string | null;
      message: string;
      recommendedAction?: string | null;
    }>;
  }> {
    const res = await httpClient.get(`/evaluation/seasons/${seasonId}/operational-alerts`);
    const raw = unwrapApiResponse<any>(res.data) ?? {};
    return {
      seasonId: pickStr(raw, 'seasonId') || seasonId,
      totalAlerts: Number(raw.totalAlerts ?? 0),
      alerts: Array.isArray(raw.alerts)
        ? raw.alerts.map((item: any) => ({
            alertType: pickStr(item, 'alertType'),
            severity: pickStr(item, 'severity') || 'LOW',
            responseId: pickStr(item, 'responseId'),
            targetMemberId: pickStr(item, 'targetMemberId'),
            evaluatorId: pickStr(item, 'evaluatorId'),
            targetMemberStatus: item.targetMemberStatus ?? null,
            evaluatorStatus: item.evaluatorStatus ?? null,
            message: pickStr(item, 'message'),
            recommendedAction: item.recommendedAction ?? null,
          }))
        : [],
    };
  },

  async regenerateFeedbackMeetings(seasonId: string): Promise<void> {
    await httpClient.post(`/evaluation/seasons/${seasonId}/meetings/regenerate`);
  },

  async reassignLead(responseId: string, evaluatorId: string, reason?: string): Promise<EvaluationFlowResponse> {
    const res = await httpClient.post(`/evaluation/responses/${responseId}/lead`, { evaluatorId, reason });
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async skipLeaver(responseId: string, reason?: string): Promise<EvaluationFlowResponse> {
    const res = await httpClient.post(`/evaluation/responses/${responseId}/skip-leaver`, {
      reason,
    });
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async reopenForCorrection(responseId: string, reason?: string): Promise<EvaluationFlowResponse> {
    const res = await httpClient.post(`/evaluation/responses/${responseId}/reopen`, { reason });
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async requestObjection(responseId: string, message: string): Promise<EvaluationFlowResponse> {
    const res = await httpClient.post(`/evaluation/responses/${responseId}/objection`, { message });
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async reviewObjection(responseId: string): Promise<EvaluationFlowResponse> {
    const res = await httpClient.post(`/evaluation/responses/${responseId}/objection/review`);
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },

  async resolveObjection(responseId: string, resolution: string): Promise<EvaluationFlowResponse> {
    const res = await httpClient.post(`/evaluation/responses/${responseId}/objection/resolve`, { resolution });
    return mapResponse(unwrapApiResponse<unknown>(res.data));
  },
};
