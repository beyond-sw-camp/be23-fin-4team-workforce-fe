import { httpClient } from '@/shared/api/httpClient';
import { normalizeArray } from '@/shared/api/normalize';
import { unwrapApiResponse } from '@/shared/api/response';
import type {
  Goal,
  GoalCreatePayload,
  GoalCycle,
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

function pickArr(o: any, ...keys: string[]): any[] {
  for (const k of keys) if (Array.isArray(o?.[k])) return o[k];
  return [];
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
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

function mapGoalCycleFromApi(c: any): GoalCycle {
  return {
    cycle: pickStr(c, 'cycle') as GoalCycle['cycle'],
    cycleStartDate: pickStr(c, 'cycleStartDate', 'cycle_start_date'),
    cycleEndDate: pickStr(c, 'cycleEndDate', 'cycle_end_date'),
    organizationGoalCount: pickNum(c, 'organizationGoalCount', 'organization_goal_count'),
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

  async listOrganizationGoalCycles(): Promise<GoalCycle[]> {
    const res = await httpClient.get('/goal/organization-cycles');
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'cycles', 'list', 'results']).map(mapGoalCycleFromApi);
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

  async getGoal(goalId: string): Promise<Goal> {
    const res = await httpClient.get(`/goal/${goalId}`);
    return mapGoalFromApi(unwrapApiResponse<unknown>(res.data));
  },

  async createGoal(payload: GoalCreatePayload): Promise<Goal> {
    const res = await httpClient.post('/goal', payload);
    return mapGoalFromApi(unwrapApiResponse<unknown>(res.data));
  },

  async updateGoal(goalId: string, payload: GoalUpdatePayload): Promise<Goal> {
    const res = await httpClient.patch(`/goal/${goalId}`, payload);
    return mapGoalFromApi(unwrapApiResponse<unknown>(res.data));
  },

  async deleteGoal(goalId: string): Promise<void> {
    await httpClient.delete(`/goal/${goalId}`);
  },

  async listOrgObjectives(params: ListOrgObjectivesParams): Promise<Goal[]> {
    const res = await httpClient.get('/goal/objectives/organization', { params });
    const raw = unwrapApiResponse<unknown>(res.data);
    return normalizeArray<unknown>(raw, ['items', 'data', 'goals', 'list', 'results']).map(mapGoalFromApi);
  },

  async listGoalApprovalBundles(): Promise<any[]> {
    return [];
  },
};
