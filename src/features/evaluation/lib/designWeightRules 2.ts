/**
 * 평가 설계 가중치 규칙 — `SectionScorer` MANUAL 채점과 동일한 전제:
 * - 섹션 가중치(%) 합계 = 100
 * - 섹션 내 채점 문항(scale | grade | gap) 가중치(%) 합계 = 100 (미입력 시 균등 배분)
 * - 서술(text) 문항은 점수 미반영 → 가중치 0
 */

export const SCORED_QUESTION_TYPES = ['scale', 'grade', 'gap'] as const;

export function isScoredQuestionType(type: string | undefined | null): boolean {
  const t = String(type ?? '')
    .trim()
    .toLowerCase();
  return (SCORED_QUESTION_TYPES as readonly string[]).includes(t);
}

/** n개 채점 문항에 합 100이 되도록 정수 가중치 배분 (앞쪽부터 +1 분바 remainder). */
export function distributeWeights100(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const rem = 100 - base * n;
  return Array.from({length: n}, (_, i) => base + (i < rem ? 1 : 0));
}

export type DesignQuestionDraft = {
  text?: string;
  title?: string;
  type?: string;
  weight?: number | string | null;
  required?: boolean;
  description?: string;
  options?: unknown;
};

export type DesignSectionDraft = {
  title?: string;
  weight?: number | string | null;
  type?: string;
  questions?: DesignQuestionDraft[];
};

function roundNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * 설계 저장용 섹션 배열에 문항 가중치를 채움.
 * - 채점 문항에 weight가 하나도 없으면 균등 배분
 * - 일부만 있으면 오류로 간주하지 않고, 백엔드/프론트 공통 검증에서 걸리도록 그대로 둠 → 호출 전 validate 호출 권장
 */
export function assignDefaultQuestionWeights(sections: DesignSectionDraft[]): DesignSectionDraft[] {
  return sections.map((sec) => {
    const questions = [...(sec.questions ?? [])].map((q) => ({...q}));
    const scoredIndices: number[] = [];
    questions.forEach((q, i) => {
      const lower = String(q.type ?? 'scale')
        .trim()
        .toLowerCase();
      if (isScoredQuestionType(lower)) scoredIndices.push(i);
    });
    const dist = distributeWeights100(scoredIndices.length);
    const hasAnyWeight = scoredIndices.some((idx) => {
      const row = questions[idx];
      const w = row?.weight;
      return w != null && w !== '' && Number(w) > 0;
    });
    scoredIndices.forEach((qi, j) => {
      if (!hasAnyWeight) {
        questions[qi] = {...questions[qi], weight: dist[j] ?? 1};
      }
    });
    questions.forEach((q, i) => {
      if (!isScoredQuestionType(String(q.type ?? '').toLowerCase())) {
        questions[i] = {...q, weight: 0};
      }
    });
    return {...sec, questions};
  });
}

/** 상대평가 UI(%) 행 — 등급명이 있는 행만 합산, 합계 100% */
export function validateRelativeTargetDistributionPct(
  rows: Array<{grade?: string; pct?: number | string | null}> | undefined,
): string | null {
  if (!rows?.length) return '상대평가는 목표 분포 행이 최소 1개 필요합니다.';
  let sum = 0;
  for (const r of rows) {
    if (!String(r.grade ?? '').trim()) continue;
    sum += roundNum(r.pct);
  }
  if (sum !== 100) {
    return `상대평가 목표 분포(%) 합계는 정확히 100%여야 합니다. (현재 ${sum}%)`;
  }
  return null;
}

/** 저장 전 검증. 통과 시 null, 실패 시 한글 메시지. */
export function validateEvaluationDesignWeights(sections: DesignSectionDraft[]): string | null {
  if (!sections.length) return '섹션이 최소 1개 필요합니다.';
  let secSum = 0;
  for (const s of sections) {
    secSum += roundNum(s.weight);
  }
  if (secSum !== 100) {
    return `섹션 가중치 합계는 정확히 100%여야 합니다. (현재 ${secSum}%)`;
  }
  for (let si = 0; si < sections.length; si++) {
    const s = sections[si]!;
    const title = String(s.title ?? '').trim() || `섹션 ${si + 1}`;
    const qs = s.questions ?? [];
    const scored = qs.filter((q) => isScoredQuestionType(String(q.type ?? '').toLowerCase()));
    if (scored.length === 0) {
      return `"${title}" 섹션에는 점수에 반영되는 문항(scale/grade/gap)이 최소 1개 필요합니다.`;
    }
    const weights = scored.map((q) => {
      const w = q.weight;
      if (w == null || w === '') return null as number | null;
      const n = Number(w);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    });
    const allUnset = weights.every((w) => w == null);
    if (allUnset) continue;
    if (weights.some((w) => w == null)) {
      return `"${title}" 섹션의 채점 문항 가중치는 모두 입력하거나, 모두 비워 균등 배분하세요.`;
    }
    let qSum = 0;
    for (const w of weights) {
      qSum += w ?? 0;
    }
    if (qSum !== 100) {
      return `"${title}" 섹션의 채점 문항 가중치 합계는 100%여야 합니다. (현재 ${qSum}%)`;
    }
  }
  return null;
}
