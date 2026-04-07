/** 백엔드 ESG 월별 집계·이력 행 (EsgScoreResDto 등) */
export type EsgScoreHistoryRow = {
  esgScoreId?: string;
  yearMonth?: string;
  totalScore?: number;
  grade?: string;
  gradeDescription?: string;
  [key: string]: unknown;
};

const GRADE_KO: Record<string, string> = {
  IRON: '아이언',
  BRONZE: '브론즈',
  SILVER: '실버',
  GOLD: '골드',
  PLATINUM: '플래티넘',
  DIAMOND: '다이아몬드',
  MASTER: '마스터',
  CHALLENGER: '챌린저',
};

function pickStr(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickNum(r: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function pickEsgScoreRowId(row: EsgScoreHistoryRow): string {
  const r = row as Record<string, unknown>;
  return pickStr(r, ['esgScoreId', 'esg_score_id', 'id']);
}

export function pickYearMonth(row: EsgScoreHistoryRow): string {
  const r = row as Record<string, unknown>;
  const s = pickStr(r, ['yearMonth', 'year_month', 'ym']);
  return s || '—';
}

export function pickTotalScore(row: EsgScoreHistoryRow): string {
  const r = row as Record<string, unknown>;
  const n = pickNum(r, ['totalScore', 'total_score', 'score']);
  if (n === undefined) return '—';
  return n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

export function formatEsgScoreGradeKo(grade: unknown): string {
  if (grade == null || grade === '') return '—';
  const key = String(grade).trim().toUpperCase();
  return GRADE_KO[key] ?? String(grade);
}

export function pickGrade(row: EsgScoreHistoryRow): string {
  const r = row as Record<string, unknown>;
  const raw = r.grade ?? r.scoreGrade;
  return formatEsgScoreGradeKo(raw);
}

export function pickGradeDescription(row: EsgScoreHistoryRow): string {
  const r = row as Record<string, unknown>;
  const s = pickStr(r, ['gradeDescription', 'grade_description', 'gradeDesc']);
  return s || '—';
}
