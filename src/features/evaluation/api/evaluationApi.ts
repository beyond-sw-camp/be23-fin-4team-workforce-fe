import type {
  EvaluationSeason,
  EvaluationGroup,
  EvaluationDesign,
  GoalSummaryCard,
  CreateSeasonPayload,
  UpdateSeasonPayload,
  CreateGroupPayload,
  UpdateGroupPayload,
  CreateDesignPayload,
  UpdateDesignPayload,
  QuestionType,
  DesignQuestion,
  DesignSection,
  SectionType,
  EvalSchedule,
  EvaluationPhasesScheduleJson,
} from '@/features/evaluation/model/types';
import { assignDefaultQuestionWeights, type DesignSectionDraft } from '@/features/evaluation/lib/designWeightRules';
import { isEvaluationPhasesScheduleJson } from '@/features/evaluation/lib/evaluationPhaseSchedule';
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
  const sj = raw.scheduleJson;
  let schedule: EvalSchedule | undefined;
  let schedulePhases: EvaluationPhasesScheduleJson | undefined;
  if (typeof sj === 'string' && sj.trim()) {
    const parsed = safeJsonParse<unknown>(sj, undefined);
    if (isEvaluationPhasesScheduleJson(parsed)) {
      schedulePhases = parsed;
    } else if (parsed && typeof parsed === 'object') {
      schedule = parsed as EvalSchedule;
    }
  }
  return {
    seasonId: raw.seasonId,
    companyId: raw.companyId,
    name: raw.name,
    type: raw.type,
    targetCycle: raw.targetCycle ?? undefined,
    targetCycleStart: raw.targetCycleStart ?? raw.target_cycle_start ?? undefined,
    startDate: raw.startDate,
    endDate: raw.endDate,
    status: raw.status,
    resultPublishDate: raw.resultPublishDate,
    resultsPublishedAt: raw.resultsPublishedAt ?? undefined,
    schedule,
    schedulePhases,
  };
}

function mapEvaluatorMapsFromApi(raw: Record<string, unknown>): EvaluationGroup['evaluatorMaps'] {
  const fromVo = raw.evaluatorMaps;
  if (Array.isArray(fromVo)) {
    return fromVo.map((m: any) => ({
      targetMemberId: String(m.targetMemberId ?? m.target_member_id ?? ''),
      evaluatorId: String(m.evaluatorId ?? m.evaluator_id ?? ''),
      evaluationType: (m.evaluationType ?? m.evaluation_type) as EvaluationGroup['evaluatorMaps'][number]['evaluationType'],
      targetMemberProfileUrl: m.targetMemberProfileUrl ?? m.target_member_profile_url ?? undefined,
      evaluatorProfileUrl: m.evaluatorProfileUrl ?? m.evaluator_profile_url ?? undefined,
    }));
  }
  return [];
}

function mapGroup(raw: any): EvaluationGroup {
  const r = raw as Record<string, unknown>;
  return {
    groupId: raw.groupId,
    companyId: raw.companyId,
    seasonId: raw.seasonId,
    name: raw.name,
    evaluationTypes: safeJsonParse(raw.evaluationTypesJson, []),
    targetMemberIds: safeJsonParse(raw.targetMemberIdsJson, []),
    designId: raw.designId,
    evaluatorMaps: mapEvaluatorMapsFromApi(r),
  };
}

/** 백엔드 VO(EvaluationSection) 또는 `sectionsJson` 문자열 — 동일 규칙으로 정규화 */
function mapDesignSectionsFromApi(raw: Record<string, unknown>): EvaluationDesign['sections'] {
  const usedQuestionIds = new Set<string>();
  const vo = raw.sections;
  if (Array.isArray(vo)) {
    return vo.map((sec, si) => mapApiSection(sec, si, usedQuestionIds));
  }
  return [];
}

function mapGradeConfigFromApi(raw: Record<string, unknown>): EvaluationDesign['gradeConfig'] {
  const vo = raw.gradeConfig ?? raw.grade_config;
  if (vo && typeof vo === 'object' && !Array.isArray(vo)) {
    const g = vo as Record<string, unknown>;
    const gradesRaw = g.grades;
    const grades = Array.isArray(gradesRaw)
      ? gradesRaw.map((x: any) => ({
          label: String(x.label ?? ''),
          minScore: Number(x.minScore ?? x.min_score ?? 0),
          maxScore: Number(x.maxScore ?? x.max_score ?? 0),
          color: String(x.color ?? '#94a3b8'),
        }))
      : [];
    const td = g.targetDistribution ?? g.target_distribution;
    let targetDistribution: Record<string, number> | undefined;
    if (td && typeof td === 'object' && !Array.isArray(td)) {
      targetDistribution = {};
      for (const [k, v] of Object.entries(td as Record<string, unknown>)) {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isNaN(n)) targetDistribution[k] = n;
      }
    }
    const t = String(g.type ?? 'ABSOLUTE').toUpperCase();
    return {
      type: t === 'RELATIVE' ? 'RELATIVE' : 'ABSOLUTE',
      grades,
      targetDistribution,
    };
  }
  return undefined;
}

function mapDesign(raw: any): EvaluationDesign {
  const r = raw as Record<string, unknown>;
  return {
    designId: raw.designId,
    companyId: raw.companyId,
    name: raw.name,
    sections: mapDesignSectionsFromApi(r),
    gradeConfig: mapGradeConfigFromApi(r),
    designVersion: raw.designVersion ?? undefined,
    defaultTemplate: raw.defaultTemplate ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
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

/** 백엔드 `DesignQuestion.type` — 소문자 (text|scale|grade|gap) */
const QUESTION_TYPE_UPPER_TO_LOWER: Record<string, string> = {
  TEXT: 'text',
  SCALE: 'scale',
  GRADE: 'grade',
  GAP: 'gap',
};

/** goal-service `DesignQuestion` + 레거시 JSON(text / SCALE 등) 통합 */
function normalizeEvalQuestionType(raw: unknown): QuestionType {
  const u = String(raw ?? 'text').trim().toUpperCase();
  if (QUESTION_TYPE_UPPER_TO_LOWER[u]) return QUESTION_TYPE_UPPER_TO_LOWER[u] as QuestionType;
  const l = String(raw ?? 'text').trim().toLowerCase();
  if (l === 'text' || l === 'scale' || l === 'grade' || l === 'gap') return l as QuestionType;
  return 'text';
}

function parseQuestionOptions(raw: unknown): DesignQuestion['options'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const scaleMinRaw = o.scaleMin ?? o.scale_min;
  const scaleMaxRaw = o.scaleMax ?? o.scale_max;
  const scaleMin = scaleMinRaw != null ? Number(scaleMinRaw) : undefined;
  const scaleMax = scaleMaxRaw != null ? Number(scaleMaxRaw) : undefined;
  const gl = o.gradeLabels ?? o.grade_labels;
  let gradeLabels: string[] | undefined;
  if (Array.isArray(gl)) {
    gradeLabels = gl
      .map((x) => (typeof x === 'string' ? x : x != null && typeof x === 'object' && 'label' in x ? String((x as {label?: unknown}).label ?? '') : String(x ?? '')))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (
    (scaleMin != null && Number.isFinite(scaleMin)) ||
    (scaleMax != null && Number.isFinite(scaleMax)) ||
    (gradeLabels && gradeLabels.length > 0)
  ) {
    const opts: NonNullable<DesignQuestion['options']> = {};
    if (scaleMin != null && Number.isFinite(scaleMin)) opts.scaleMin = scaleMin;
    if (scaleMax != null && Number.isFinite(scaleMax)) opts.scaleMax = scaleMax;
    if (gradeLabels && gradeLabels.length > 0) opts.gradeLabels = gradeLabels;
    return opts;
  }
  return undefined;
}

/**
 * 단일 문항 — `id` 는 서버 값 우선, 없으면 `s{sectionIndex}-q{questionIndex}`.
 * 설계 JSON 에 동일 id 가 여러 번 나오면(레거시) 전역 `usedQuestionIds` 기준으로 `__2` 접미사 부여.
 */
function mapApiQuestion(
  q: unknown,
  sectionIndex: number,
  questionIndex: number,
  usedQuestionIds: Set<string>,
): DesignQuestion {
  const qn = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>;
  const idRaw = qn.id ?? qn.questionId;
  const idStr = idRaw != null ? String(idRaw).trim() : '';
  let id =
    idStr !== '' && idStr !== 'null' && idStr !== 'undefined'
      ? idStr
      : `s${sectionIndex}-q${questionIndex}`;
  if (usedQuestionIds.has(id)) {
    let n = 2;
    while (usedQuestionIds.has(`${id}__${n}`)) n += 1;
    id = `${id}__${n}`;
  }
  usedQuestionIds.add(id);
  const titleRaw = qn.title ?? qn.text;
  const title = titleRaw != null && String(titleRaw).trim() !== '' ? String(titleRaw).trim() : '(문항)';
  const type = normalizeEvalQuestionType(qn.type);
  const required = qn.required !== false;
  let weight = 0;
  if (typeof qn.weight === 'number' && Number.isFinite(qn.weight)) weight = qn.weight;
  else if (qn.weight != null) weight = Number(qn.weight) || 0;
  const description = qn.description != null && String(qn.description).trim() !== '' ? String(qn.description) : undefined;
  const options = parseQuestionOptions(qn.options);
  return {
    id,
    type,
    title,
    description,
    required,
    weight,
    options,
  };
}

function mapApiSection(sec: unknown, sectionIndex: number, usedQuestionIds: Set<string>): DesignSection {
  const s = (sec && typeof sec === 'object' ? sec : {}) as Record<string, unknown>;
  const questionsRaw = s.questions;
  const questions = Array.isArray(questionsRaw)
    ? questionsRaw.map((q, qi) => mapApiQuestion(q, sectionIndex, qi, usedQuestionIds))
    : [];
  const typeRaw = s.type;
  const typeStr = typeRaw != null ? String(typeRaw).trim().toUpperCase() : '';
  const type: SectionType | undefined =
    typeStr === 'MANUAL' || typeStr === 'PEER_FEEDBACK' ? (typeStr as SectionType) : undefined;
  return {
    sectionId: s.sectionId != null && String(s.sectionId).trim() !== '' ? String(s.sectionId) : undefined,
    title: String(s.title ?? ''),
    weight: typeof s.weight === 'number' && Number.isFinite(s.weight) ? s.weight : Number(s.weight ?? 0) || 0,
    type,
    questions,
  };
}

/**
 * 라벨만 있는 등급 목록 → `GradeConfig.GradeBand[]` (goal-service `GradeConfig` 와 동일)
 * 프론트가 `grades: ["S","A"]` 처럼 문자열 배열을 보내면 Jackson 이 GradeBand 로 변환하지 못해 400 발생함.
 */
function buildGradeBandsFromLabels(labels: string[]): {label: string; minScore: number; maxScore: number; color: string}[] {
  const cleaned = labels.map((s) => s.trim()).filter(Boolean);
  const n = cleaned.length;
  if (n === 0) return [];
  const colors = ['#22c55e', '#84cc16', '#eab308', '#fb923c', '#ef4444', '#64748b', '#94a3b8'];
  return cleaned.map((label, i) => {
    const minScore = Math.round((100 * i) / n);
    const maxScore = i === n - 1 ? 100 : Math.round((100 * (i + 1)) / n);
    return {label, minScore, maxScore, color: colors[Math.min(i, colors.length - 1)] ?? '#64748b'};
  });
}

/** `sectionsJson` — 문항 `text`→`title`, 문항 타입 대문자→소문자 (서버 DesignQuestion) */
function normalizeSectionsJsonForBackend(sectionsJson: string): string {
  try {
    const parsed = JSON.parse(sectionsJson) as unknown;
    if (!Array.isArray(parsed)) return sectionsJson;
    const usedIds = new Set<string>();
    const out = parsed.map((sec, secIdx) => {
      if (!sec || typeof sec !== 'object') return sec;
      const s = sec as Record<string, unknown>;
      const questionsRaw = s.questions;
      const questions = Array.isArray(questionsRaw)
        ? questionsRaw.map((q, idx) => {
            if (!q || typeof q !== 'object') return q;
            const qn = q as Record<string, unknown>;
            const titleRaw = qn.title ?? qn.text;
            const title = titleRaw != null ? String(titleRaw) : '';
            const tr = String(qn.type ?? 'scale').toUpperCase();
            const type = QUESTION_TYPE_UPPER_TO_LOWER[tr] ?? String(qn.type ?? 'scale').toLowerCase();
            const idRaw = qn.id ?? qn.questionId;
            const idStr = idRaw != null ? String(idRaw).trim() : '';
            let id =
              idStr !== '' && idStr !== 'null' && idStr !== 'undefined'
                ? idStr
                : `s${secIdx}-q${idx}`;
            if (usedIds.has(id)) {
              let n = 2;
              while (usedIds.has(`${id}__${n}`)) n += 1;
              id = `${id}__${n}`;
            }
            usedIds.add(id);
            const row: Record<string, unknown> = {
              id,
              type,
              title,
              required: qn.required !== false,
            };
            if (qn.description != null) row.description = String(qn.description);
            if (qn.weight != null && qn.weight !== '') row.weight = Number(qn.weight);
            if (qn.options && typeof qn.options === 'object') row.options = qn.options;
            return row;
          })
        : [];
      return {...s, questions};
    });
    const withWeights = assignDefaultQuestionWeights(out as DesignSectionDraft[]);
    return JSON.stringify(withWeights);
  } catch {
    return sectionsJson;
  }
}

/**
 * `gradeConfigJson` — `type` 을 ABSOLUTE|RELATIVE 로, `grades` 를 GradeBand[], 분포는 비율(0~1)로.
 */
function normalizeGradeConfigJsonForBackend(gradeConfigJson: string): string {
  try {
    const g = JSON.parse(gradeConfigJson) as Record<string, unknown>;
    const typeRaw = String(g.type ?? 'ABSOLUTE').toLowerCase();
    const type = typeRaw === 'relative' ? 'RELATIVE' : 'ABSOLUTE';
    const out: Record<string, unknown> = {type};

    const gradesRaw = g.grades;
    if (Array.isArray(gradesRaw) && gradesRaw.length > 0) {
      const first = gradesRaw[0];
      if (typeof first === 'string') {
        out.grades = buildGradeBandsFromLabels(gradesRaw as string[]);
      } else if (first && typeof first === 'object') {
        const f = first as Record<string, unknown>;
        if (f.label != null || f.minScore != null || f.maxScore != null) {
          out.grades = gradesRaw.map((x) => {
            const o = x as Record<string, unknown>;
            return {
              label: String(o.label ?? ''),
              minScore: Number(o.minScore ?? 0),
              maxScore: Number(o.maxScore ?? 100),
              color: String(o.color ?? '#94a3b8'),
            };
          });
        } else if ('grade' in f) {
          const labels = (gradesRaw as Record<string, unknown>[]).map((x) => String(x.grade ?? ''));
          out.grades = buildGradeBandsFromLabels(labels);
        } else {
          out.grades = [];
        }
      }
    }

    const td = g.targetDistribution;
    if (td && typeof td === 'object' && !Array.isArray(td)) {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(td as Record<string, unknown>)) {
        const num = typeof v === 'number' ? v : Number(v);
        if (Number.isNaN(num)) continue;
        next[k] = num > 1 ? num / 100 : num;
      }
      out.targetDistribution = next;
    }

    return JSON.stringify(out);
  } catch {
    return gradeConfigJson;
  }
}

function normalizeCreateDesignBody(body: CreateDesignPayload): Record<string, unknown> {
  const normalizedSectionsJson = normalizeSectionsJsonForBackend(body.sectionsJson);
  const sections = safeJsonParse<unknown[]>(normalizedSectionsJson, []);
  const gradeConfig = body.gradeConfigJson
    ? safeJsonParse<Record<string, unknown>>(
        normalizeGradeConfigJsonForBackend(body.gradeConfigJson),
        undefined,
      )
    : undefined;
  return {
    name: body.name.trim(),
    sections,
    gradeConfig,
  };
}

function normalizeUpdateDesignBody(body: UpdateDesignPayload): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (body.name != null) o.name = body.name.trim();
  if (body.sectionsJson != null) {
    o.sections = safeJsonParse<unknown[]>(
      normalizeSectionsJsonForBackend(body.sectionsJson),
      [],
    );
  }
  if (body.gradeConfigJson != null) {
    o.gradeConfig = safeJsonParse<Record<string, unknown>>(
      normalizeGradeConfigJsonForBackend(body.gradeConfigJson),
      undefined,
    );
  }
  return o;
}

// ── API ──
export const evaluationApi = {
  // ── Seasons ──
  async listSeasons(): Promise<EvaluationSeason[]> {
    const res = await httpClient.get('/evaluation/seasons');
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapSeason);
  },

  async createSeason(body: CreateSeasonPayload): Promise<EvaluationSeason> {
    const payload = {...body};
    if (payload.scheduleJson == null || payload.scheduleJson === '') {
      delete (payload as {scheduleJson?: string}).scheduleJson;
    }
    const res = await httpClient.post('/evaluation/seasons', payload);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async getSeason(seasonId: string): Promise<EvaluationSeason> {
    const res = await httpClient.get(`/evaluation/seasons/${seasonId}`);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async updateSeason(seasonId: string, body: UpdateSeasonPayload): Promise<EvaluationSeason> {
    const res = await httpClient.patch(`/evaluation/seasons/${seasonId}`, body);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async startSeason(seasonId: string): Promise<EvaluationSeason> {
    const res = await httpClient.post(`/evaluation/seasons/${seasonId}/activate`);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async closeSeason(seasonId: string, opts?: {publishResults?: boolean}): Promise<EvaluationSeason> {
    const qs = opts?.publishResults ? '?publishResults=true' : '';
    const res = await httpClient.post(`/evaluation/seasons/${seasonId}/close${qs}`);
    return mapSeason(unwrapApiResponse<any>(res.data));
  },

  async publishResults(seasonId: string): Promise<void> {
    await httpClient.post(`/evaluation/seasons/${seasonId}/publish`);
  },

  // ── Groups ──
  async listGroups(seasonId: string): Promise<EvaluationGroup[]> {
    const res = await httpClient.get(`/evaluation/seasons/${seasonId}/groups`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapGroup);
  },

  async createGroup(seasonId: string, body: CreateGroupPayload): Promise<EvaluationGroup> {
    const res = await httpClient.post(`/evaluation/seasons/${seasonId}/groups`, body);
    return mapGroup(unwrapApiResponse<any>(res.data));
  },

  async updateGroup(
    seasonId: string,
    groupId: string,
    body: UpdateGroupPayload,
  ): Promise<EvaluationGroup> {
    const res = await httpClient.patch(
      `/evaluation/seasons/${seasonId}/groups/${groupId}`,
      body,
    );
    return mapGroup(unwrapApiResponse<any>(res.data));
  },

  async deleteGroup(seasonId: string, groupId: string): Promise<void> {
    await httpClient.delete(`/evaluation/seasons/${seasonId}/groups/${groupId}`);
  },

  /** `basis`: goal-service `EvaluatorMapAutoReqDto` — `direct_leader` | `team_leader` | `job_grade` */
  async autoAssignEvaluators(
    seasonId: string,
    groupId: string,
    basis: string,
  ): Promise<EvaluationGroup> {
    const res = await httpClient.post(
      `/evaluation/seasons/${seasonId}/groups/${groupId}/evaluator-maps/auto`,
      { basis },
    );
    return mapGroup(unwrapApiResponse<any>(res.data));
  },

  async updateEvaluatorMaps(
    seasonId: string,
    groupId: string,
    evaluatorMaps: EvaluationGroup['evaluatorMaps'],
  ): Promise<EvaluationGroup> {
    const res = await httpClient.patch(
      `/evaluation/seasons/${seasonId}/groups/${groupId}/evaluator-maps`,
      { evaluatorMaps },
    );
    return mapGroup(unwrapApiResponse<any>(res.data));
  },

  // ── Designs ──
  async listDesigns(): Promise<EvaluationDesign[]> {
    const res = await httpClient.get('/evaluation/designs');
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapDesign);
  },

  async createDesign(body: CreateDesignPayload): Promise<EvaluationDesign> {
    const res = await httpClient.post('/evaluation/designs', normalizeCreateDesignBody(body));
    return mapDesign(unwrapApiResponse<any>(res.data));
  },

  async getDesign(designId: string): Promise<EvaluationDesign> {
    const res = await httpClient.get(`/evaluation/designs/${designId}`);
    return mapDesign(unwrapApiResponse<any>(res.data));
  },

  async updateDesign(designId: string, body: UpdateDesignPayload): Promise<EvaluationDesign> {
    const res = await httpClient.patch(`/evaluation/designs/${designId}`, normalizeUpdateDesignBody(body));
    return mapDesign(unwrapApiResponse<any>(res.data));
  },

  async duplicateDesign(designId: string): Promise<EvaluationDesign> {
    const res = await httpClient.post(`/evaluation/designs/${designId}/duplicate`);
    return mapDesign(unwrapApiResponse<any>(res.data));
  },

  async deleteDesign(designId: string): Promise<void> {
    await httpClient.delete(`/evaluation/designs/${designId}`);
  },

  // ── Responses ──

  /** 평가 응답에 포함된 목표 스냅샷 vs 현재 값 비교 요약 카드 */
  async getGoalSummaries(responseId: string): Promise<GoalSummaryCard[]> {
    const res = await httpClient.get(`/evaluation/responses/${responseId}/goal-summaries`);
    return normalizeArray(unwrapApiResponse<unknown>(res.data), mapGoalSummaryCard);
  },

};
