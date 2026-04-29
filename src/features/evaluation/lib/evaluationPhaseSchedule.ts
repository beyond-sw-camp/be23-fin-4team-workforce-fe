import type {EvaluationPhasesScheduleJson, EvaluationPhaseRow} from '@/features/evaluation/model/types';

function utcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD + 일수 (UTC 달력일) */
export function addCalendarDays(ymd: string, delta: number): string {
  const [y, mo, d] = ymd.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, mo - 1, d + delta));
  return utcYmd(dt);
}

export function daysBetweenInclusive(start: string, end: string): number {
  const a = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const b = Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)));
  return Math.max(0, Math.round((b - a) / 86400000));
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function maxYmd(a: string, b: string): string {
  return a >= b ? a : b;
}

/**
 * 운영 기간만으로 캘리브레이션 창 기본값.
 * - 시작: 운영 시작 + 7일 과 (운영 종료 − 14일) 중 이른 날
 * - 종료: (시작 + 최대 14일) 과 (운영 종료 − 3일) 중 이른 날 이전 쪽 = 둘 중 작은 값
 */
export function suggestCalibrationWindow(opsStart: string, opsEnd: string): {calibrationStart: string; calibrationEnd: string} {
  const span = daysBetweenInclusive(opsStart, opsEnd);
  if (span <= 0) {
    return {calibrationStart: opsStart, calibrationEnd: opsEnd};
  }
  const weekIn = addCalendarDays(opsStart, 7);
  const twoWeeksBeforeEnd = addCalendarDays(opsEnd, -14);
  let calibrationStart = minYmd(weekIn, twoWeeksBeforeEnd);
  calibrationStart = maxYmd(calibrationStart, opsStart);

  const capByOps = addCalendarDays(opsEnd, -3);
  const capByLength = addCalendarDays(calibrationStart, 14);
  let calibrationEnd = minYmd(capByOps, capByLength);
  calibrationEnd = maxYmd(calibrationEnd, calibrationStart);
  calibrationEnd = minYmd(calibrationEnd, opsEnd);
  return {calibrationStart, calibrationEnd};
}

/**
 * 백엔드 `EvaluationSchedule` / `StageTransitionScheduler` 계약 JSON.
 * `SELF_SUBMITTED` → `CALIBRATION_OPEN` 전이는 CALIBRATION_OPEN phase 의 `start` 가 도래했을 때 일괄 적용.
 */
export function buildEvaluationPhasesScheduleJson(input: {
  opsStart: string;
  opsEnd: string;
  calibrationStart: string;
  calibrationEnd: string;
}): EvaluationPhasesScheduleJson {
  const {opsStart, opsEnd} = input;
  let {calibrationStart, calibrationEnd} = input;
  if (calibrationStart > calibrationEnd) {
    [calibrationStart, calibrationEnd] = [calibrationEnd, calibrationStart];
  }
  calibrationStart = maxYmd(minYmd(calibrationStart, opsEnd), opsStart);
  calibrationEnd = maxYmd(minYmd(calibrationEnd, opsEnd), calibrationStart);

  let selfSubmittedEnd = addCalendarDays(calibrationStart, -1);
  if (selfSubmittedEnd < opsStart) {
    selfSubmittedEnd = opsStart;
  }
  const selfSubmittedStart = opsStart;

  let confirmedStart = addCalendarDays(calibrationEnd, 1);
  if (confirmedStart > opsEnd) {
    confirmedStart = opsEnd;
  }
  const confirmedEnd = opsEnd;

  const phases: EvaluationPhaseRow[] = [
    {stage: 'SELF_SUBMITTED', start: selfSubmittedStart, end: selfSubmittedEnd},
    {stage: 'CALIBRATION_OPEN', start: calibrationStart, end: calibrationEnd},
    {stage: 'CONFIRMED', start: confirmedStart, end: confirmedEnd},
  ];
  return {phases};
}

export function isEvaluationPhasesScheduleJson(v: unknown): v is EvaluationPhasesScheduleJson {
  if (!v || typeof v !== 'object') return false;
  const phases = (v as {phases?: unknown}).phases;
  if (!Array.isArray(phases) || phases.length === 0) return false;
  return phases.every(
    (p) =>
      p &&
      typeof p === 'object' &&
      typeof (p as {stage?: unknown}).stage === 'string' &&
      typeof (p as {start?: unknown}).start === 'string',
  );
}
