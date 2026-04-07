import type {
  CreateGoalPayload,
  CreateKpiTemplatePayload,
  Goal,
  KpiCycle,
  KpiTemplate,
  MeasureType,
  PerformanceInputType,
  PerformanceRecord,
  ReviewPerformancePayload,
  SubmitPerformancePayload,
  UnitType,
} from '@/features/goals/model/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

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
  return { id, companyId, name, measureType, unitType, cycle, capPct };
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
  const ownerType = String(r.ownerType ?? r.owner_type ?? 'MEMBER') as Goal['ownerType'];
  const ownerIdRaw = r.ownerId ?? r.owner_id ?? r.memberId ?? r.member_id;
  const ownerId =
    ownerIdRaw !== undefined && ownerIdRaw !== null && String(ownerIdRaw).trim() !== ''
      ? String(ownerIdRaw).trim()
      : g.ownerId;

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
  return g;
}

/** `PerformanceRecordResDto` 는 `performanceRecordId` 사용 */
function mapPerformanceRecordFromApi(raw: unknown): PerformanceRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const idVal = r.id ?? r.performanceRecordId ?? r.performance_record_id;
  if (idVal === undefined || idVal === null || String(idVal).trim() === '') return null;

  const numOpt = (v: unknown): number | undefined => {
    if (v === undefined || v === null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const reviewRaw = r.reviewStatus ?? r.review_status;
  const rs = typeof reviewRaw === 'string' ? reviewRaw.toUpperCase() : '';
  const confirmed = rs === 'CONFIRMED' ? true : rs === 'REJECTED' ? false : null;

  const selfScore = numOpt(r.selfScore ?? r.self_score);
  const convertedScore = numOpt(r.convertedScore ?? r.converted_score) ?? null;
  const actualNum = numOpt(r.actualValue ?? r.actual_value);

  return {
    id: String(idVal).trim(),
    goalId: r.goalId != null ? String(r.goalId) : r.goal_id != null ? String(r.goal_id) : undefined,
    actualValue: actualNum ?? 0,
    description: r.description != null ? String(r.description) : undefined,
    selfScore,
    inputType: String(r.inputType ?? r.input_type ?? 'NUMBER') as PerformanceInputType,
    confirmed,
    convertedScore,
    rejectReason: r.rejectReason != null ? String(r.rejectReason) : r.reject_reason != null ? String(r.reject_reason) : null,
    createdAt: r.createdAt != null ? String(r.createdAt) : r.created_at != null ? String(r.created_at) : undefined,
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
    return unwrapApiResponse<KpiTemplate>(response.data);
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

  async createGoal(body: CreateGoalPayload): Promise<Goal> {
    const response = await httpClient.post('/goal', body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const goal = mapGoalFromApi(raw);
    if (!goal) {
      throw new Error('목표 생성 응답을 해석할 수 없습니다.');
    }
    return goal;
  },

  async activateGoal(goalId: string): Promise<Goal | undefined> {
    const response = await httpClient.patch(`/goal/${goalId}/activate`);
    const raw = unwrapApiResponse<unknown>(response.data);
    return mapGoalFromApi(raw) ?? undefined;
  },

  async listPerformanceRecords(goalId: string): Promise<PerformanceRecord[]> {
    const response = await httpClient.get(`/goal/${goalId}/performance-record`);
    const raw = unwrapApiResponse<unknown>(response.data);
    const rows = Array.isArray(raw) ? raw : normalizeArray<unknown>(raw, ['items', 'content', 'data', 'list']);
    return rows.map(mapPerformanceRecordFromApi).filter((x): x is PerformanceRecord => x !== null);
  },

  async submitPerformance(goalId: string, body: SubmitPerformancePayload): Promise<PerformanceRecord> {
    const response = await httpClient.post(`/goal/${goalId}/performance-record`, body);
    const raw = unwrapApiResponse<unknown>(response.data);
    const rec = mapPerformanceRecordFromApi(raw);
    if (!rec) {
      throw new Error('실적 입력 응답을 해석할 수 없습니다.');
    }
    return rec;
  },

  async reviewPerformance(
    goalId: string,
    performanceRecordId: string,
    body: ReviewPerformancePayload,
  ): Promise<PerformanceRecord> {
    const response = await httpClient.post(
      `/goal/${goalId}/performance-record/${performanceRecordId}/review`,
      body,
    );
    const raw = unwrapApiResponse<unknown>(response.data);
    const rec = mapPerformanceRecordFromApi(raw);
    if (!rec) {
      throw new Error('실적 검토 응답을 해석할 수 없습니다.');
    }
    return rec;
  },
};
