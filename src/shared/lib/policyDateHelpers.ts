import dayjs, { type Dayjs } from 'dayjs';

/**
 * 정책 종료일 검증 헬퍼 (Salary / Bonus / Overtime / WorkSchedule 공용)
 * 규칙
 *  - 오늘 이전(과거) 날짜 차단
 *  - 그 달의 말일만 선택 가능 (월 단위 검증)
 */

/** DatePicker disabledDate 용 - 오늘 이전 또는 말일이 아닌 날짜 차단 */
export function disabledPolicyEffectiveTo(d: Dayjs | null): boolean {
  if (!d) return false;
  const today = dayjs().startOf('day');
  if (d.isBefore(today)) return true; // 오늘 이전 차단
  // 그 달의 말일이 아닌 날짜 차단
  if (d.date() !== d.endOf('month').date()) return true;
  return false;
}

/** 종료일 - 그 달 말일로 자동 보정 */
export function snapToMonthEnd(d: Dayjs | null | undefined): Dayjs | null {
  if (!d) return null;
  return d.endOf('month').startOf('day');
}

/** 종료일 검증 - 위반 시 에러 메시지 반환, OK 면 null */
export function validatePolicyEffectiveTo(d: Dayjs | null | undefined): string | null {
  if (!d) return null; // 미입력 = 계속 적용 (허용)
  const today = dayjs().startOf('day');
  if (d.isBefore(today)) return '종료일은 오늘 이후 날짜만 선택할 수 있습니다.';
  if (d.date() !== d.endOf('month').date()) return '종료일은 그 달의 말일로 지정해야 합니다.';
  return null;
}
