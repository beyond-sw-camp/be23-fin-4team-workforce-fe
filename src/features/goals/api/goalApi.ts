import { httpClient } from '@/shared/api/httpClient';
import { normalizeArray } from '@/shared/api/normalize';
import { unwrapApiResponse } from '@/shared/api/response';
import type {
  Goal,
  GoalAggregate,
  GoalCreatePayload,
  GoalProgressUpdate,
  GoalProgressUpdatePayload,
  GoalSeasonReadiness,
  GoalSeasonReadinessIssue,
  GoalStatus,
  GoalUpdatePayload,
  ListCompanyGoalsParams,
  ListMyGoalsParams,
  ListObjectiveParams,
  ListOrgGoalsParams,
  ListOrgObjectivesParams,
} from '../model/types';
import { resolveCycleKey } from '../lib/cycleKey';

function pickStr(o: any, ...keys: string[]): string {
  for (const k of keys) if (o?.[k] != null) return String(o[k]);
  return '';
}

function pickNum(o: any, ...keys: string[]): number {
  for (const k of keys) if (o?.[k] != null) return Number(o[k]);
  return 0;
}

function pickNullableNum(o: any, ...keys: string[]): number | null {
  for (const k of keys) if (o?.[k] != null) return Number(o[k]);
  return null;
}

function pickArr(o: any, ...keys: string[]): any[] {
  for (const k of keys) if (Array.isArray(o?.[k])) return o[k];
  return [];
}

function fromApiVisibility(v: string): Goal['visibility'] {
  const x = String(v ?? '').toUpperCase();
  if (x === 'COMPANY') return 'COMPANY';
  if (x === 'TEAM') return 'TEAM';
  return 'PRIVATE';
}

function toApiVisibility(v: string): 'COMPANY' | 'TEAM' | 'PRIVATE' {
  const x = String(v ?? '').toUpperCase();
  if (x === 'COMPANY') return 'COMPANY';
  if (x === 'TEAM') return 'TEAM';
  return 'PRIVATE';
}

function mapGoalFromApi(g: any): Goal {
  const cycle = pickStr(g, 'cycle') as Goal['cycle'];
  const cycleStartDate = pickStr(g, 'cycleStartDate', 'cycle_start_date', 'startDate');
  const cycleKey =
    pickStr(g, 'cycleKey') || (cycle && cycleStartDate ? resolveCycleKey(cycle as any, cycleStartDate) : '');

  return {
    goalId: pickStr(g, 'goalId', 'id'),
    id: pickStr(g, 'goalId', 'id'),
    companyId: pickStr(g, 'companyId'),
    ownerType: pickStr(g, 'ownerType') as Goal['ownerType'],
    ownerId: pickStr(g, 'ownerId'),
    alignedOrgGoalId: g.alignedOrgGoalId ?? null,
    parentGoalId: g.alignedOrgGoalId ?? g.parentGoalId ?? null,
    title: pickStr(g, 'title'),
    description: pickStr(g, 'description', 'content'),
    cycle,
    cycleStartDate,
    cycleEndDate: pickStr(g, 'cycleEndDate', 'cycle_end_date', 'endDate'),
    cycleKey,
    startDate: cycleStartDate,
    endDate: pickStr(g, 'cycleEndDate', 'cycle_end_date', 'endDate'),
    visibility: fromApiVisibility(pickStr(g, 'visibility')),
    weightPct: pickNum(g, 'weightPct', 'weight_pct'),
    status: pickStr(g, 'status') as Goal['status'],
    goalApprovalStatus: pickStr(g, 'goalApprovalStatus', 'approvalStatus') as Goal['goalApprovalStatus'],
    approvalStatus: pickStr(g, 'goalApprovalStatus', 'approvalStatus'),
    approvedBy: g.approvedBy ?? null,
    approvedAt: g.approvedAt ?? null,
    visibleTeamIds: pickArr(g, 'visibleTeamIds', 'visible_team_ids').map(String),
    participantMemberIds: pickArr(g, 'participantMemberIds', 'participant_member_ids').map(String),
    gradeS: pickStr(g, 'gradeS', 'gradeSCriteria', 'grade_s_criteria') || undefined,
    gradeA: pickStr(g, 'gradeA', 'gradeACriteria', 'grade_a_criteria') || undefined,
    gradeB: pickStr(g, 'gradeB', 'gradeBCriteria', 'grade_b_criteria') || undefined,
    gradeC: pickStr(g, 'gradeC', 'gradeCCriteria', 'grade_c_criteria') || undefined,
    objectiveTitle: pickStr(g, 'objectiveTitle') || undefined,
    objectiveGradeS: pickStr(g, 'objectiveGradeS') || undefined,
    objectiveGradeA: pickStr(g, 'objectiveGradeA') || undefined,
    objectiveGradeB: pickStr(g, 'objectiveGradeB') || undefined,
    objectiveGradeC: pickStr(g, 'objectiveGradeC') || undefined,
    actualValue: pickNullableNum(g, 'actualValue', 'actual_value'),
    achievementPct: pickNullableNum(g, 'achievementPct', 'achievement_pct'),
    rolledAchievementPct: pickNullableNum(g, 'rolledAchievementPct', 'rolled_achievement_pct'),
    healthStatus: g.healthStatus ?? g.health_status ?? null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

function mapGoalProgressUpdateFromApi(raw: any): GoalProgressUpdate {
  return {
    updateId: raw?.updateId != null ? String(raw.updateId) : null,
    goalId: String(raw?.goalId ?? ''),
    value: raw?.value != null ? Number(raw.value) : null,
    status: raw?.status ?? null,
    note: raw?.note ?? null,
    createdBy: raw?.createdBy != null ? String(raw.createdBy) : null,
    createdAt: raw?.createdAt ?? null,
  };
}

function mapReadinessIssues(raw: unknown): GoalSeasonReadinessIssue[] {
  return Array.isArray(raw)
    ? raw.map((item: any) => ({
        memberId: String(item?.memberId ?? ''),
        reason: String(item?.reason ?? ''),
        weightSum: item?.weightSum != null ? Number(item.weightSum) : null,
        goalCount: item?.goalCount != null ? Number(item.goalCount) : null,
      }))
    : [];
}

function mapGoalSeasonReadinessFromApi(raw: any, seasonId: string): GoalSeasonReadiness {
  return {
    seasonId: String(raw?.seasonId ?? seasonId),
    ready: Boolean(raw?.ready),
    targetMemberCount: Number(raw?.targetMemberCount ?? 0),
    activeGoalCount: Number(raw?.activeGoalCount ?? 0),
    blockerCount: Number(raw?.blockerCount ?? 0),
    warningCount: Number(raw?.warningCount ?? 0),
    missingGoals: mapReadinessIssues(raw?.missingGoals),
    weightIssues: mapReadinessIssues(raw?.weightIssues),
    pendingBundles: mapReadinessIssues(raw?.pendingBundles),
    missingProgressUpdates: mapReadinessIssues(raw?.missingProgressUpdates),
    missingLeads: mapReadinessIssues(raw?.missingLeads),
  };
}

export const goalApi = {
  async listMyGoals(params?: ListMyGoalsParams): Promise<Goal[]> {
    const res = await httpClient.get('/goal/me', { params });
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'goals', 'list', 'results']).map(mapGoalFromApi);
  },

  async listCompanyGoals(params?: ListCompanyGoalsParams): Promise<Goal[]> {
    const res = await httpClient.get('/goal/company', { params });
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'goals', 'list', 'results']).map(mapGoalFromApi);
  },

  async listOrgGoals(params: ListOrgGoalsParams): Promise<Goal[]> {
    const res = await httpClient.get('/goal/organization', { params });
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'goals', 'list', 'results']).map(mapGoalFromApi);
  },

  async listMyObjectives(params?: ListObjectiveParams): Promise<Goal[]> {
    const res = await httpClient.get('/goal/objectives/me', { params });
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'goals', 'list', 'results']).map(mapGoalFromApi);
  },

  async listAvailableObjectives(params?: ListObjectiveParams): Promise<Goal[]> {
    const res = await httpClient.get('/goal/objectives/available', { params });
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'goals', 'list', 'results']).map(mapGoalFromApi);
  },

  async getGoal(goalId: string): Promise<Goal> {
    const res = await httpClient.get(`/goal/${goalId}`);
    return mapGoalFromApi(unwrapApiResponse<unknown>(res.data));
  },

  async createGoal(payload: GoalCreatePayload): Promise<Goal> {
    const res = await httpClient.post('/goal', {
      ...payload,
      visibility: toApiVisibility(payload.visibility),
    });
    return mapGoalFromApi(unwrapApiResponse<unknown>(res.data));
  },

  async updateGoal(goalId: string, payload: GoalUpdatePayload): Promise<Goal> {
    const res = await httpClient.patch(`/goal/${goalId}`, {
      ...payload,
      visibility: payload.visibility ? toApiVisibility(payload.visibility) : undefined,
    });
    return mapGoalFromApi(unwrapApiResponse<unknown>(res.data));
  },

  async deleteGoal(goalId: string): Promise<void> {
    await httpClient.delete(`/goal/${goalId}`);
  },

  async getAggregate(orgGoalId: string): Promise<GoalAggregate> {
    const res = await httpClient.get(`/goal/${orgGoalId}/aggregate`);
    const raw = unwrapApiResponse<any>(res.data);
    const byStatus = (raw?.childCountByStatus ?? {}) as Record<string, number>;
    const normByStatus: Record<GoalStatus, number> = {
      DRAFT: byStatus.DRAFT ?? 0,
      PENDING: byStatus.PENDING ?? 0,
      ACTIVE: byStatus.ACTIVE ?? 0,
      COMPLETED: byStatus.COMPLETED ?? 0,
      CANCELLED: byStatus.CANCELLED ?? 0,
      SKIPPED: byStatus.SKIPPED ?? 0,
    };
    return {
      orgGoalId: String(raw?.orgGoalId ?? orgGoalId),
      childCount: Number(raw?.childCount ?? 0),
      confirmedCount: Number(raw?.confirmedCount ?? 0),
      weightedAvgScore: raw?.weightedAvgScore != null ? Number(raw.weightedAvgScore) : null,
      simpleAvgScore: raw?.simpleAvgScore != null ? Number(raw.simpleAvgScore) : null,
      childGoalIds: Array.isArray(raw?.childGoalIds) ? raw.childGoalIds.map(String) : [],
      childCountByStatus: normByStatus,
    };
  },

  async listOrgObjectives(params: ListOrgObjectivesParams): Promise<Goal[]> {
    const res = await httpClient.get('/goal/objectives/organization', { params });
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'goals', 'list', 'results']).map(mapGoalFromApi);
  },

  async listObjectiveChildren(goalId: string): Promise<Goal[]> {
    const res = await httpClient.get(`/goal/${goalId}/children`);
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'goals', 'list', 'results']).map(mapGoalFromApi);
  },

  async addProgressUpdate(goalId: string, payload: GoalProgressUpdatePayload): Promise<GoalProgressUpdate> {
    const res = await httpClient.post(`/goal/${goalId}/updates`, payload);
    return mapGoalProgressUpdateFromApi(unwrapApiResponse<unknown>(res.data));
  },

  async listProgressUpdates(goalId: string): Promise<GoalProgressUpdate[]> {
    const res = await httpClient.get(`/goal/${goalId}/updates`);
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'updates', 'list', 'results']).map(mapGoalProgressUpdateFromApi);
  },

  async getSeasonReadiness(seasonId: string): Promise<GoalSeasonReadiness> {
    const res = await httpClient.get(`/goal/seasons/${seasonId}/readiness`);
    return mapGoalSeasonReadinessFromApi(unwrapApiResponse<unknown>(res.data), seasonId);
  },

  async listGoalApprovalBundles(): Promise<any[]> {
    return [];
  },
};
