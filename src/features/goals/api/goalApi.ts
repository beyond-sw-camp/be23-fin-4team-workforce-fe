import type {
  AddGoalProgressUpdatePayload,
  BundleApprovalKind,
  GoalApprovalPolicy,
  GoalCompletionSubmitPayload,
  CreateGoalCommentPayload,
  CreateGoalPayload,
  CreateKpiTemplatePayload,
  Goal,
  GoalActivity,
  GoalApprovalBundleDetail,
  GoalApprovalBundleSummary,
  GoalApprovalDecisionPayload,
  GoalApprovalRequestPayload,
  GoalApprovalSummary,
  GoalApprovalWatchersPayload,
  GoalComment,
  GoalProgressUpdate,
  KpiCycle,
  KpiTemplate,
  MeasureType,
  UnitType,
  UpdateGoalPayload,
} from '@/features/goals/model/types';
import { httpClient } from '@/shared/api/httpClient';
import type { ApiError } from '@/shared/api/types';
import { unwrapApiResponse } from '@/shared/api/response';

export type ListGoalsTreeParams = {
  scope?: 'mine' | 'all' | string;
  orgId?: string;
  ownerId?: string;
  periodStart?: string;
  periodEnd?: string;
};

function normalizeArray<T>(payload: unknown, keys = ['items', 'content', 'goals', 'kpiTemplates', 'templates']): T[] {
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

async function requestWithApiPrefixFallback(path: string, method: 'get' | 'post', body?: unknown): Promise<any> {
  try {
    if (method === 'get') {
      return await httpClient.get(path);
    }
    return await httpClient.post(path, body ?? {});
  } catch (e: unknown) {
    const status = (e as ApiError).status;
    if (status === 404 && !path.startsWith('/api/')) {
      const fallback = `/api${path}`;
      if (method === 'get') {
        return await httpClient.get(fallback);
      }
      return await httpClient.post(fallback, body ?? {});
    }
    throw e;
  }
}

/** 백엔드가 `id` / `kpiTemplateId` 등 다른 키로 내려줄 수 있어 단일 형태로 맞춤 */
function mapKpiTemplateFromApi(raw: unknown): KpiTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const idVal = r.id ?? r.kpiTemplateId ?? r.templateId ?? r.kpi_template_id;
  if (idVal === undefined || idVal === null || String(idVal).trim() === '') return null;
  const id = String(idVal).trim();
  const nameRaw = r.name;
  const name = typeof nameRaw === 'string' ? nameRaw : nameRaw != null ? String(nameRaw) : '';
  const measureType = String(r.measureType ?? r.measure_type ?? 'HIGHER_BETTER') as MeasureType;
  let unitRaw = String(r.unitType ?? r.unit_type ?? 'NUMBER');
  if (unitRaw === 'CURRENCY') unitRaw = 'AMOUNT';
  const unitType = unitRaw as UnitType;
  const unitLabelRaw = r.unitLabel ?? r.unit_label;
  const unitLabel =
    unitLabelRaw !== undefined && unitLabelRaw !== null ? String(unitLabelRaw).trim() : '';
  const cycle = String(r.cycle ?? 'MONTHLY') as KpiCycle;
  const capPct =
    typeof r.capPct === 'number'
      ? r.capPct
      : typeof r.cap_pct === 'number'
        ? r.cap_pct
        : undefined;
  const companyRaw = r.companyId ?? r.company_id ?? null;
  const companyId =
    companyRaw === null ? null : companyRaw !== undefined && companyRaw !== '' ? String(companyRaw) : undefined;
  let isActive: boolean | undefined;
  if (typeof r.isActive === 'boolean') isActive = r.isActive;
  else if (typeof r.is_active === 'boolean') isActive = r.is_active;
  else if (typeof r.active === 'boolean') isActive = r.active;
  const specCycleType = r.specCycleType ?? r.spec_cycle_type;
  const targetTeamId = r.targetTeamId ?? r.target_team_id ?? null;
  const requireApproval =
    typeof r.requireApproval === 'boolean'
      ? r.requireApproval
      : typeof r.require_approval === 'boolean'
        ? r.require_approval
        : undefined;
  const kpisJson = r.kpisJson != null ? String(r.kpisJson) : r.kpis_json != null ? String(r.kpis_json) : null;
  const goalApprovalPolicyRaw = r.goalApprovalPolicy ?? r.goal_approval_policy;
  const goalApprovalPolicy: GoalApprovalPolicy | undefined =
    goalApprovalPolicyRaw != null && String(goalApprovalPolicyRaw).trim() !== ''
      ? (String(goalApprovalPolicyRaw).trim() as GoalApprovalPolicy)
      : undefined;
  return {
    id,
    companyId,
    name,
    measureType,
    unitType,
    unitLabel,
    cycle,
    capPct,
    isActive,
    specCycleType: specCycleType != null ? String(specCycleType) : undefined,
    targetTeamId: targetTeamId != null && String(targetTeamId).trim() !== '' ? String(targetTeamId) : null,
    requireApproval,
    goalApprovalPolicy,
    kpisJson,
  };
}

/** `GoalResDto` 는 `goalId` 만 있고 `id` 가 없음 → UI·API 경로는 `id` 기준 통일 */
function mapGoalFromApi(raw: unknown): Goal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const idVal = r.id ?? r.goalId ?? r.goal_id;
  if (idVal === undefined || idVal === null || String(idVal).trim() === '') return null;

  const num = (v: unknown): number | undefined => {
    if (v === undefined || v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const g = { ...r, id: String(idVal).trim() } as Goal;

  const measureType = String(r.measureType ?? r.measure_type ?? 'HIGHER_BETTER') as Goal['measureType'];
  let unitRaw = String(r.unitType ?? r.unit_type ?? 'NUMBER');
  if (unitRaw === 'CURRENCY') unitRaw = 'AMOUNT';
  const unitType = unitRaw as Goal['unitType'];
  const ownerTypeRaw = String(r.ownerType ?? r.owner_type ?? 'MEMBER').trim().toUpperCase();
  const ownerType = (ownerTypeRaw === 'ORGANIZATION' ? 'ORGANIZATION' : 'MEMBER') as Goal['ownerType'];
  const ownerIdRaw = r.ownerId ?? r.owner_id ?? r.memberId ?? r.member_id;
  const fromPayload =
    ownerIdRaw !== undefined && ownerIdRaw !== null && String(ownerIdRaw).trim() !== ''
      ? String(ownerIdRaw).trim()
      : undefined;
  let ownerId = '';
  if (fromPayload) ownerId = fromPayload;
  else if (typeof g.ownerId === 'string' && g.ownerId.trim() !== '') ownerId = g.ownerId.trim();

  const title = r.title != null ? String(r.title) : g.title ?? '';
  const startDate =
    r.startDate != null ? String(r.startDate) : r.start_date != null ? String(r.start_date) : g.startDate ?? '';
  const endDate =
    r.endDate != null ? String(r.endDate) : r.end_date != null ? String(r.end_date) : g.endDate ?? '';
  const visibility = String(r.visibility ?? g.visibility ?? 'PRIVATE') as Goal['visibility'];

  const statusRaw = r.status ?? r.goalStatus ?? r.goal_status;
  if (statusRaw != null && String(statusRaw).trim() !== '') {
    let su = String(statusRaw).trim().toUpperCase();
    if (su === 'ARCHIVED') su = 'CANCELLED';
    g.status = su;
  }

  const av = num(r.actualValue ?? r.actual_value);
  const tv = num(r.targetValue ?? r.target_value);
  const bl = num(r.baseline);
  const ap = num(
    r.achievementPct ??
      r.achievement_pct ??
      r.achievementRate ??
      r.achievement_rate ??
      r.progressPct ??
      r.progress_pct ??
      r.completionRate ??
      r.completion_rate,
  );
  const cap =
    typeof r.capPct === 'number'
      ? r.capPct
      : typeof r.cap_pct === 'number'
        ? r.cap_pct
        : undefined;
  const rolled =
    num(r.rolledAchievementPct ?? r.rolled_achievement_pct ?? r.rollupAchievementPct ?? r.rollup_achievement_pct) ?? null;
  const childCount = num(r.childCount ?? r.child_count);
  const depth = num(r.depth);
  const hasChildrenRaw = r.hasChildren ?? r.has_children;
  const rollupSourceRaw = r.rollupSource ?? r.rollup_source;
  const rollupPolicyRaw = r.rollupPolicy ?? r.rollup_policy;
  const approvalStatusRaw =
    r.goalApprovalStatus ?? r.goal_approval_status ?? r.approvalStatus ?? r.approval_status;

  g.measureType = measureType;
  g.unitType = unitType;
  g.ownerType = ownerType;
  g.ownerId = ownerId;
  g.title = title;
  g.startDate = startDate;
  g.endDate = endDate;
  g.visibility = visibility;

  if (av !== undefined) g.actualValue = av;
  if (tv !== undefined) g.targetValue = tv;
  if (bl !== undefined) g.baseline = bl;
  if (ap !== undefined) g.achievementPct = ap;
  if (cap !== undefined && Number.isFinite(cap)) g.capPct = cap;
  g.rolledAchievementPct = rolled;
  if (childCount !== undefined) g.childCount = Math.max(0, Math.trunc(childCount));
  if (depth !== undefined) g.depth = Math.max(0, Math.trunc(depth));
  if (typeof hasChildrenRaw === 'boolean') g.hasChildren = hasChildrenRaw;
  if (rollupSourceRaw != null && String(rollupSourceRaw).trim() !== '') g.rollupSource = String(rollupSourceRaw).trim();
  if (rollupPolicyRaw != null && String(rollupPolicyRaw).trim() !== '') g.rollupPolicy = String(rollupPolicyRaw).trim();
  if (approvalStatusRaw != null && String(approvalStatusRaw).trim() !== '') g.approvalStatus = String(approvalStatusRaw).trim();
  const pathRaw = r.path;
  if (Array.isArray(pathRaw)) {
    g.path = pathRaw
      .map((v) => (v != null ? String(v).trim() : ''))
      .filter((v) => v.length > 0);
  }
  const unitLabelRaw = r.unitLabel ?? r.unit_label;
  if (unitLabelRaw !== undefined && unitLabelRaw !== null && String(unitLabelRaw).trim() !== '') {
    g.unitLabel = String(unitLabelRaw).trim();
  }
  const parentRaw = r.parentGoalId ?? r.parent_goal_id;
  if (parentRaw !== undefined && parentRaw !== null && String(parentRaw).trim() !== '') {
    g.parentGoalId = String(parentRaw).trim();
  } else {
    g.parentGoalId = null;
  }
  const kpiTid = r.kpiTemplateId ?? r.kpi_template_id;
  if (kpiTid !== undefined && kpiTid !== null && String(kpiTid).trim() !== '') {
    g.kpiTemplateId = String(kpiTid).trim();
  }
  const prog = num(r.progress ?? r.progressPct);
  if (prog !== undefined) g.progress = prog;
  const gtype = r.type ?? r.goalKind ?? r.goal_kind;
  if (gtype != null && String(gtype).trim() !== '') g.type = String(gtype).trim().toLowerCase() as Goal['type'];
  if (typeof r.autoUpdate === 'boolean') g.autoUpdate = r.autoUpdate;
  else if (typeof r.auto_update === 'boolean') g.autoUpdate = r.auto_update;
  const hs = r.healthStatus ?? r.health_status;
  if (hs != null && String(hs).trim() !== '') g.healthStatus = String(hs).trim() as Goal['healthStatus'];
  const vteams = r.visibleTeamIds ?? r.visible_team_ids;
  if (Array.isArray(vteams)) {
    g.visibleTeamIds = vteams.map((x) => String(x)).filter(Boolean);
  }
  const pm = r.participantMemberIds ?? r.participant_member_ids;
  if (Array.isArray(pm)) {
    g.participantMemberIds = pm.map((x) => String(x)).filter(Boolean);
  }
  return g;
}

function commentReactionsToUiJson(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const rec = item as Record<string, unknown>;
      const emoji = String(rec.emoji ?? '').trim();
      const memberSource = rec.memberIds ?? rec.member_ids ?? rec.members;
      if (!emoji || !Array.isArray(memberSource)) return null;
      const memberIds = memberSource
        .map((v) => String(v ?? '').trim())
        .filter((v) => v.length > 0);
      return { emoji, memberIds };
    })
    .filter((row): row is { emoji: string; memberIds: string[] } => row !== null);
  return rows.length > 0 ? JSON.stringify(rows) : null;
}

function mapGoalCommentFromApi(raw: unknown): GoalComment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const cid = r.commentId ?? r.comment_id ?? r.id;
  const gid = r.goalId ?? r.goal_id;
  const aid = r.authorId ?? r.author_id;
  if (cid == null || gid == null || aid == null) return null;
  return {
    commentId: String(cid).trim(),
    goalId: String(gid).trim(),
    authorId: String(aid).trim(),
    body: r.body != null ? String(r.body) : '',
    reactionsJson:
      commentReactionsToUiJson(r.reactions) ??
      commentReactionsToUiJson(r.reactionsJson) ??
      commentReactionsToUiJson(r.reactions_json),
    createdAt: r.createdAt != null ? String(r.createdAt) : r.created_at != null ? String(r.created_at) : undefined,
    updatedAt: r.updatedAt != null ? String(r.updatedAt) : r.updated_at != null ? String(r.updated_at) : undefined,
  };
}

function mapGoalProgressUpdateFromApi(raw: unknown): GoalProgressUpdate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const uid = r.updateId ?? r.update_id ?? r.id;
  const gid = r.goalId ?? r.goal_id;
  if (gid == null) return null;
  const vRaw = r.value ?? r.valuePct ?? r.value_pct;
  const v = vRaw != null ? Number(vRaw) : NaN;
  if (!Number.isFinite(v)) return null;
  const st = r.status ?? r.healthStatus ?? r.health_status;
  const resolvedId =
    uid != null && String(uid).trim() !== '' ? String(uid).trim() : `temp-${String(gid).trim()}-${Date.now()}`;
  return {
    updateId: resolvedId,
    goalId: String(gid).trim(),
    value: v,
    status: st != null ? String(st).trim() : 'ON_TRACK',
    note: r.note != null ? String(r.note) : null,
    createdBy: (() => {
      const cb = r.createdBy ?? r.created_by;
      return cb != null && String(cb).trim() !== '' ? String(cb).trim() : undefined;
    })(),
    createdAt: r.createdAt != null ? String(r.createdAt) : r.created_at != null ? String(r.created_at) : undefined,
  };
}

function pickDefinedUpdateGoalBody(body: UpdateGoalPayload): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (body.title !== undefined) o.title = body.title;
  if (body.description !== undefined) o.description = body.description;
  if (body.visibility !== undefined) o.visibility = body.visibility;
  if (body.weightPct !== undefined) o.weightPct = body.weightPct;
  if (body.contributionPct !== undefined) o.contributionPct = body.contributionPct;
  if (body.parentGoalId !== undefined) o.parentGoalId = body.parentGoalId;
  if (body.cycle !== undefined) o.cycle = body.cycle;
  if (body.rollupPolicy !== undefined) o.rollupPolicy = body.rollupPolicy;
  if (body.goalKind !== undefined) o.goalKind = body.goalKind;
  if (body.autoUpdate !== undefined) o.autoUpdate = body.autoUpdate;
  if (body.healthStatus !== undefined) o.healthStatus = body.healthStatus;
  if (body.visibleTeamIds !== undefined) o.visibleTeamIds = body.visibleTeamIds;
  if (body.memberIds !== undefined) o.memberIds = body.memberIds;
  return o;
}

function mapGoalApprovalSummaryFromApi(raw: unknown): GoalApprovalSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const goalIdRaw = r.goalId ?? r.goal_id;
  if (goalIdRaw == null || String(goalIdRaw).trim() === '') return null;
  const goalId = String(goalIdRaw).trim();
  const requestIdRaw =
    r.requestId ??
    r.request_id ??
    r.approvalRequestId ??
    r.approval_request_id ??
    r.currentRequestId ??
    r.current_request_id;
  const approvalStatusRaw = r.goalApprovalStatus ?? r.goal_approval_status ?? r.approvalStatus ?? r.approval_status;
  const approvalStatus =
    approvalStatusRaw != null && String(approvalStatusRaw).trim() !== ''
      ? String(approvalStatusRaw).trim()
      : 'NOT_REQUESTED';
  const approverIdRaw = r.approverId ?? r.approver_id;
  const decisionRaw = r.decision;
  const decidedAtRaw = r.decidedAt ?? r.decided_at;
  const commentRaw = r.comment ?? r.commentText ?? r.comment_text ?? r.memo;
  const watchersRaw = r.watchers;
  const watchers = Array.isArray(watchersRaw)
    ? watchersRaw
        .map((w) => {
          if (!w || typeof w !== 'object') return null;
          const o = w as Record<string, unknown>;
          const memberIdRaw = o.memberId ?? o.member_id;
          if (memberIdRaw == null || String(memberIdRaw).trim() === '') return null;
          return { memberId: String(memberIdRaw).trim() };
        })
        .filter((x): x is { memberId: string } => x !== null)
    : undefined;
  const approvalKindRaw = r.approvalKind ?? r.approval_kind;
  return {
    goalId,
    requestId: requestIdRaw != null && String(requestIdRaw).trim() !== '' ? String(requestIdRaw).trim() : undefined,
    approvalStatus,
    approvalKind: approvalKindRaw != null && String(approvalKindRaw).trim() !== ''
      ? (String(approvalKindRaw).trim() as BundleApprovalKind)
      : undefined,
    approverId: approverIdRaw != null && String(approverIdRaw).trim() !== '' ? String(approverIdRaw).trim() : undefined,
    decision: decisionRaw != null && String(decisionRaw).trim() !== '' ? String(decisionRaw).trim() : undefined,
    decidedAt: decidedAtRaw != null && String(decidedAtRaw).trim() !== '' ? String(decidedAtRaw).trim() : null,
    comment: commentRaw != null && String(commentRaw).trim() !== '' ? String(commentRaw).trim() : null,
    completionSummary:
      r.completionSummary != null && String(r.completionSummary).trim() !== ''
        ? String(r.completionSummary).trim()
        : r.completion_summary != null && String(r.completion_summary).trim() !== ''
          ? String(r.completion_summary).trim()
          : null,
    completionEvidenceFiles:
      r.completionEvidenceFiles != null && String(r.completionEvidenceFiles).trim() !== ''
        ? String(r.completionEvidenceFiles).trim()
        : r.completion_evidence_files != null && String(r.completion_evidence_files).trim() !== ''
          ? String(r.completion_evidence_files).trim()
          : null,
    watchers,
  };
}

function mapGoalActivityFromApi(raw: unknown): GoalActivity | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const idRaw = r.activityId ?? r.activity_id ?? r.id;
  if (idRaw == null || String(idRaw).trim() === '') return null;
  return {
    activityId: String(idRaw).trim(),
    type:
      r.type != null && String(r.type).trim() !== ''
        ? String(r.type).trim()
        : r.activityType != null && String(r.activityType).trim() !== ''
          ? String(r.activityType).trim()
          : 'COMMENT_ADDED',
    actorId:
      r.actorId != null && String(r.actorId).trim() !== ''
        ? String(r.actorId).trim()
        : r.actor_id != null && String(r.actor_id).trim() !== ''
          ? String(r.actor_id).trim()
          : undefined,
    createdAt:
      r.createdAt != null && String(r.createdAt).trim() !== ''
        ? String(r.createdAt).trim()
        : r.created_at != null && String(r.created_at).trim() !== ''
          ? String(r.created_at).trim()
          : undefined,
    summary:
      r.summary != null && String(r.summary).trim() !== ''
        ? String(r.summary).trim()
        : r.message != null && String(r.message).trim() !== ''
          ? String(r.message).trim()
          : undefined,
    meta: (() => {
      const m = r.meta;
      if (m == null) return undefined;
      if (typeof m === 'string' && m.trim() !== '') {
        try {
          const parsed = JSON.parse(m) as unknown;
          return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : { raw: parsed };
        } catch {
          return { raw: m };
        }
      }
      if (typeof m === 'object' && !Array.isArray(m)) return m as Record<string, unknown>;
      return undefined;
    })(),
  };
}

export const goalApi = {
  async listKpiTemplates(): Promise<KpiTemplate[]> {
    const response = await httpClient.get('/goal/kpi-template');
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = normalizeArray<unknown>(raw, [
      'items',
      'content',
      'kpiTemplates',
      'templates',
      'data',
      'list',
      'results',
    ]);
    return rows.map(mapKpiTemplateFromApi).filter((x): x is KpiTemplate => x !== null);
  },

  async createKpiTemplate(body: CreateKpiTemplatePayload): Promise<KpiTemplate> {
    const response = await httpClient.post('/goal/kpi-template', body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const mapped = mapKpiTemplateFromApi(raw);
    if (!mapped) {
      throw new Error('KPI 템플릿 응답을 해석할 수 없습니다.');
    }
    return mapped;
  },

  async getKpiTemplate(kpiTemplateId: string): Promise<KpiTemplate> {
    const response = await httpClient.get(`/goal/kpi-template/${kpiTemplateId}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const mapped = mapKpiTemplateFromApi(raw);
    if (!mapped) {
      throw new Error('KPI 템플릿 응답을 해석할 수 없습니다.');
    }
    return mapped;
  },

  async deactivateKpiTemplate(kpiTemplateId: string): Promise<void> {
    await httpClient.patch(`/goal/kpi-template/${kpiTemplateId}/deactivate`);
  },

  async generateGoalsFromTemplate(kpiTemplateId: string): Promise<void> {
    await httpClient.post(`/goal/kpi-template/${kpiTemplateId}/generate`);
  },

  async listGoals(): Promise<Goal[]> {
    const response = await httpClient.get('/goal');
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = normalizeArray<unknown>(raw, [
      'items',
      'content',
      'goals',
      'data',
      'list',
      'results',
    ]);
    return rows.map(mapGoalFromApi).filter((x): x is Goal => x !== null);
  },

  async listGoalsTree(params?: ListGoalsTreeParams): Promise<Goal[]> {
    const response = await httpClient.get('/goal/tree', { params });
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = normalizeArray<unknown>(raw, ['items', 'content', 'goals', 'data', 'list', 'results']);
    return rows.map(mapGoalFromApi).filter((x): x is Goal => x !== null);
  },

  async getGoal(goalId: string): Promise<Goal> {
    const response = await httpClient.get(`/goal/${goalId}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const goal = mapGoalFromApi(raw);
    if (!goal) throw new Error('목표 상세 응답을 해석할 수 없습니다.');
    return goal;
  },

  async createGoal(body: CreateGoalPayload): Promise<Goal> {
    const response = await httpClient.post('/goal', body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const goal = mapGoalFromApi(raw);
    if (!goal) {
      throw new Error('목표 생성 응답을 해석할 수 없습니다.');
    }
    return goal;
  },

  async updateGoal(goalId: string, body: UpdateGoalPayload): Promise<Goal> {
    const response = await httpClient.patch(`/goal/${goalId}`, pickDefinedUpdateGoalBody(body));
    const raw = unwrapApiResponse<unknown>(response.data);
    const goal = mapGoalFromApi(raw);
    if (!goal) throw new Error('목표 수정 응답을 해석할 수 없습니다.');
    return goal;
  },

  async activateGoal(goalId: string): Promise<Goal | undefined> {
    const response = await httpClient.patch(`/goal/${goalId}/activate`);
    const raw = unwrapApiResponse<unknown>(response.data);
    return mapGoalFromApi(raw) ?? undefined;
  },

  async completeGoal(goalId: string): Promise<Goal> {
    const response = await httpClient.patch(`/goal/${goalId}/complete`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const g = mapGoalFromApi(raw);
    if (!g) throw new Error('목표 완료 응답을 해석할 수 없습니다.');
    return g;
  },

  async cancelGoal(goalId: string): Promise<Goal> {
    const response = await httpClient.patch(`/goal/${goalId}/cancel`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const g = mapGoalFromApi(raw);
    if (!g) throw new Error('목표 취소 응답을 해석할 수 없습니다.');
    return g;
  },

  async recalculateGoal(goalId: string): Promise<Goal> {
    const response = await httpClient.post(`/goal/${goalId}/recalculate`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const g = mapGoalFromApi(raw);
    if (!g) throw new Error('롤업 재계산 응답을 해석할 수 없습니다.');
    return g;
  },

  async getApproval(goalId: string): Promise<GoalApprovalSummary> {
    const empty = (): GoalApprovalSummary => ({
      goalId,
      approvalStatus: 'NOT_REQUESTED',
      approverId: undefined,
      decision: undefined,
      decidedAt: null,
      comment: null,
    });
    try {
      const response = await httpClient.get(`/goal/${goalId}/approval`);
      const raw = unwrapApiResponse<unknown>(response.data);
      const mapped = mapGoalApprovalSummaryFromApi(raw);
      if (mapped) return mapped;
      return empty();
    } catch (e: unknown) {
      const status = (e as ApiError).status;
      if (status === 404) return empty();
      throw e;
    }
  },

  async requestApproval(goalId: string, body: GoalApprovalRequestPayload): Promise<GoalApprovalSummary> {
    const response = await httpClient.post(`/goal/${goalId}/approval/request`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const mapped = mapGoalApprovalSummaryFromApi(raw);
    if (!mapped) throw new Error('승인 요청 응답을 해석할 수 없습니다.');
    return mapped;
  },

  async approveGoal(goalId: string, requestId: string, body: GoalApprovalDecisionPayload): Promise<GoalApprovalSummary> {
    const response = await httpClient.post(`/goal/${goalId}/approval/${requestId}/approve`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const mapped = mapGoalApprovalSummaryFromApi(raw);
    if (!mapped) throw new Error('승인 처리 응답을 해석할 수 없습니다.');
    return mapped;
  },

  async rejectGoal(goalId: string, requestId: string, body: GoalApprovalDecisionPayload): Promise<GoalApprovalSummary> {
    const response = await httpClient.post(`/goal/${goalId}/approval/${requestId}/reject`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const mapped = mapGoalApprovalSummaryFromApi(raw);
    if (!mapped) throw new Error('반려 처리 응답을 해석할 수 없습니다.');
    return mapped;
  },

  async setApprovalWatchers(
    goalId: string,
    requestId: string,
    body: GoalApprovalWatchersPayload,
  ): Promise<GoalApprovalSummary> {
    const response = await httpClient.post(`/goal/${goalId}/approval/${requestId}/watchers`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const mapped = mapGoalApprovalSummaryFromApi(raw);
    if (!mapped) throw new Error('참조자 설정 응답을 해석할 수 없습니다.');
    return mapped;
  },

  async listGoalOrgSummary(params?: { periodStart?: string; periodEnd?: string }): Promise<unknown[]> {
    const response = await httpClient.get('/goal/summary/by-org', { params });
    const raw = unwrapApiResponse<unknown>(response.data);
    return Array.isArray(raw) ? raw : normalizeArray<unknown>(raw, ['items', 'content', 'data', 'list']);
  },

  async listActivities(goalId: string, params?: { page?: number; size?: number }): Promise<GoalActivity[] | Record<string, unknown>> {
    const response = await httpClient.get(`/goal/${goalId}/activities`, { params });
    const raw = unwrapApiResponse<unknown>(response.data);
    if (params?.page != null && params?.size != null && raw && typeof raw === 'object' && 'content' in raw) {
      return raw as Record<string, unknown>;
    }
    const rows = Array.isArray(raw) ? raw : normalizeArray<unknown>(raw, ['items', 'content', 'activities', 'data', 'list']);
    return rows.map(mapGoalActivityFromApi).filter((x): x is GoalActivity => x !== null);
  },

  async listComments(goalId: string): Promise<GoalComment[]> {
    const response = await httpClient.get(`/goal/${goalId}/comments`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = Array.isArray(raw) ? raw : normalizeArray<unknown>(raw, ['items', 'content', 'data', 'list']);
    return rows.map(mapGoalCommentFromApi).filter((x): x is GoalComment => x !== null);
  },

  async createComment(goalId: string, body: CreateGoalCommentPayload): Promise<GoalComment> {
    const response = await httpClient.post(`/goal/${goalId}/comments`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const c = mapGoalCommentFromApi(raw);
    if (!c) throw new Error('댓글 응답을 해석할 수 없습니다.');
    return c;
  },

  async updateComment(goalId: string, commentId: string, body: { content: string }): Promise<GoalComment> {
    const response = await httpClient.patch(`/goal/${goalId}/comments/${commentId}`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const c = mapGoalCommentFromApi(raw);
    if (!c) throw new Error('댓글 수정 응답을 해석할 수 없습니다.');
    return c;
  },

  async deleteComment(goalId: string, commentId: string): Promise<void> {
    await httpClient.delete(`/goal/${goalId}/comments/${commentId}`);
  },

  async toggleCommentReaction(goalId: string, commentId: string, emoji: string, memberId: string): Promise<GoalComment> {
    const response = await httpClient.post(`/goal/${goalId}/comments/${commentId}/reactions`, { emoji, memberId });
    const raw = unwrapApiResponse<unknown>(response.data);
    const c = mapGoalCommentFromApi(raw);
    if (!c) throw new Error('댓글 리액션 응답을 해석할 수 없습니다.');
    return c;
  },

  async listProgressUpdates(goalId: string): Promise<GoalProgressUpdate[]> {
    const response = await httpClient.get(`/goal/${goalId}/updates`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = Array.isArray(raw) ? raw : normalizeArray<unknown>(raw, ['items', 'content', 'data', 'list']);
    return rows.map(mapGoalProgressUpdateFromApi).filter((x): x is GoalProgressUpdate => x !== null);
  },

  async addProgressUpdate(goalId: string, body: AddGoalProgressUpdatePayload): Promise<GoalProgressUpdate> {
    const response = await httpClient.post(`/goal/${goalId}/updates`, {
      value: body.value,
      status: body.status,
      note: body.note,
    });
    const raw = unwrapApiResponse<unknown>(response.data);
    const u = mapGoalProgressUpdateFromApi(raw);
    if (!u) throw new Error('진행률 업데이트 응답을 해석할 수 없습니다.');
    return u;
  },

  async submitCompletion(goalId: string, body: GoalCompletionSubmitPayload): Promise<Goal> {
    const response = await httpClient.post(`/goal/${goalId}/completion/submit`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const g = mapGoalFromApi(raw);
    if (!g) throw new Error('완료 제출 응답을 해석할 수 없습니다.');
    return g;
  },

  async uploadCompletionFiles(files: File[]): Promise<string[]> {
    if (files.length === 0) return [];
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const response = await httpClient.post('/goal/completion/files', fd);
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = Array.isArray(raw) ? raw : normalizeArray<unknown>(raw, ['items', 'data', 'list']);
    return rows.map((x) => String(x ?? '').trim()).filter((x) => x.length > 0);
  },

  async deleteGoal(goalId: string): Promise<void> {
    await httpClient.delete(`/goal/${goalId}`);
  },

  async listApprovalRequests(): Promise<GoalApprovalBundleSummary[]> {
    const response = await httpClient.get('/goal/approval-requests');
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = Array.isArray(raw) ? raw : normalizeArray<unknown>(raw, ['items', 'data', 'list']);
    return rows.map(mapApprovalBundleSummaryFromApi).filter((x): x is GoalApprovalBundleSummary => x !== null);
  },

  async listApprovalRequestsHistory(): Promise<GoalApprovalBundleSummary[]> {
    const response = await httpClient.get('/goal/approval-requests/history');
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = Array.isArray(raw) ? raw : normalizeArray<unknown>(raw, ['items', 'data', 'list']);
    return rows.map(mapApprovalBundleSummaryFromApi).filter((x): x is GoalApprovalBundleSummary => x !== null);
  },

  async getApprovalRequest(requestId: string): Promise<GoalApprovalBundleDetail> {
    const response = await httpClient.get(`/goal/approval-requests/${requestId}`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const mapped = mapApprovalBundleDetailFromApi(raw);
    if (!mapped) throw new Error('승인 요청 상세를 해석할 수 없습니다.');
    return mapped;
  },

  async approveApprovalRequest(requestId: string, body?: GoalApprovalDecisionPayload): Promise<GoalApprovalBundleDetail> {
    const response = await httpClient.post(`/goal/approval-requests/${requestId}/approve`, body ?? {});
    const raw = unwrapApiResponse<unknown>(response.data);
    const mapped = mapApprovalBundleDetailFromApi(raw);
    if (!mapped) throw new Error('승인 응답을 해석할 수 없습니다.');
    return mapped;
  },

  async rejectApprovalRequest(requestId: string, body?: GoalApprovalDecisionPayload): Promise<GoalApprovalBundleDetail> {
    const response = await httpClient.post(`/goal/approval-requests/${requestId}/reject`, body ?? {});
    const raw = unwrapApiResponse<unknown>(response.data);
    const mapped = mapApprovalBundleDetailFromApi(raw);
    if (!mapped) throw new Error('반려 응답을 해석할 수 없습니다.');
    return mapped;
  },

};

function mapApprovalBundleSummaryFromApi(raw: unknown): GoalApprovalBundleSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = r.requestId ?? r.request_id ?? r.bundleId ?? r.bundle_id;
  if (id == null || String(id).trim() === '') return null;
  const goalCount = typeof r.goalCount === 'number' ? r.goalCount : Number(r.goal_count) || 0;
  const akRaw = r.approvalKind ?? r.approval_kind;
  return {
    requestId: String(id).trim(),
    status: String(r.status ?? 'pending'),
    approvalKind: akRaw != null && String(akRaw).trim() !== ''
      ? (String(akRaw).trim() as BundleApprovalKind)
      : undefined,
    goalCount,
    requestedAt:
      r.requestedAt != null ? String(r.requestedAt) : r.requested_at != null ? String(r.requested_at) : undefined,
    completionSummary:
      r.completionSummary != null && String(r.completionSummary).trim() !== ''
        ? String(r.completionSummary).trim()
        : r.completion_summary != null && String(r.completion_summary).trim() !== ''
          ? String(r.completion_summary).trim()
          : null,
    completionEvidenceFiles:
      r.completionEvidenceFiles != null && String(r.completionEvidenceFiles).trim() !== ''
        ? String(r.completionEvidenceFiles).trim()
        : r.completion_evidence_files != null && String(r.completion_evidence_files).trim() !== ''
          ? String(r.completion_evidence_files).trim()
          : null,
  };
}

function mapApprovalBundleDetailFromApi(raw: unknown): GoalApprovalBundleDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rid = r.requestId ?? r.request_id;
  if (rid == null || String(rid).trim() === '') return null;
  const goalsRaw = r.goals;
  const goals = Array.isArray(goalsRaw)
    ? goalsRaw.map(mapGoalFromApi).filter((x): x is Goal => x !== null)
    : [];
  const approverIdRaw = r.approverId ?? r.approver_id;
  const decisionRaw = r.decision;
  const decidedAtRaw = r.decidedAt ?? r.decided_at;
  const commentRaw = r.comment ?? r.commentText ?? r.comment_text ?? r.memo;
  const watchersRaw = r.watchers;
  const watchers = Array.isArray(watchersRaw)
    ? watchersRaw
        .map((w) => {
          if (!w || typeof w !== 'object') return null;
          const o = w as Record<string, unknown>;
          const mid = o.memberId ?? o.member_id;
          if (mid == null) return null;
          return { memberId: String(mid).trim() };
        })
        .filter((x): x is { memberId: string } => x !== null)
    : undefined;
  const detailAkRaw = r.approvalKind ?? r.approval_kind;
  return {
    requestId: String(rid).trim(),
    status: String(r.status ?? ''),
    approvalKind: detailAkRaw != null && String(detailAkRaw).trim() !== ''
      ? (String(detailAkRaw).trim() as BundleApprovalKind)
      : undefined,
    rejectionReason: r.rejectionReason != null ? String(r.rejectionReason) : null,
    goals,
    approverId: approverIdRaw != null && String(approverIdRaw).trim() !== '' ? String(approverIdRaw).trim() : undefined,
    decision: decisionRaw != null && String(decisionRaw).trim() !== '' ? String(decisionRaw).trim() : undefined,
    decidedAt: decidedAtRaw != null && String(decidedAtRaw).trim() !== '' ? String(decidedAtRaw).trim() : null,
    comment: commentRaw != null && String(commentRaw).trim() !== '' ? String(commentRaw).trim() : null,
    completionSummary:
      r.completionSummary != null && String(r.completionSummary).trim() !== ''
        ? String(r.completionSummary).trim()
        : r.completion_summary != null && String(r.completion_summary).trim() !== ''
          ? String(r.completion_summary).trim()
          : null,
    completionEvidenceFiles:
      r.completionEvidenceFiles != null && String(r.completionEvidenceFiles).trim() !== ''
        ? String(r.completionEvidenceFiles).trim()
        : r.completion_evidence_files != null && String(r.completion_evidence_files).trim() !== ''
          ? String(r.completion_evidence_files).trim()
          : null,
    watchers,
  };
}
