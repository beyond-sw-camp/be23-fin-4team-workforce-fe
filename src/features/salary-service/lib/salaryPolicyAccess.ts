import dayjs from 'dayjs';
import type { SalaryPolicy } from '@/features/salary-service/types';

/** ref 날짜(기본 오늘)에 적용 중인 급여 정책 행인지 */
export function isSalaryPolicyEffectiveOnDate(
  p: Pick<SalaryPolicy, 'effectiveFrom' | 'effectiveTo'>,
  ref = dayjs(),
): boolean {
  if (p.effectiveFrom && ref.isBefore(dayjs(p.effectiveFrom), 'day')) return false;
  if (p.effectiveTo && ref.isAfter(dayjs(p.effectiveTo), 'day')) return false;
  return true;
}

/** 오늘 유효한 정책 중 연봉협상제(usePayGradeYn === 'N')가 있으면 true */
export function hasActiveNegotiationSalaryPolicy(
  policies: SalaryPolicy[] | undefined | null,
): boolean {
  return (policies ?? []).some(
    (p) => p.usePayGradeYn === 'N' && isSalaryPolicyEffectiveOnDate(p),
  );
}

/** 오늘 유효한 정책 중 호봉제(usePayGradeYn === 'Y')가 있으면 true */
export function hasActivePayGradeSalaryPolicy(
  policies: SalaryPolicy[] | undefined | null,
): boolean {
  return (policies ?? []).some(
    (p) => p.usePayGradeYn === 'Y' && isSalaryPolicyEffectiveOnDate(p),
  );
}
