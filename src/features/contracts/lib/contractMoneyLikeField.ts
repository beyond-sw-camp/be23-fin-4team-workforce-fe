import type { FormFieldSchema } from '@/features/approvals/lib/approvalFormSchema';

const MONEY_NAME = /salary|pay|wage|amount|money|bonus|allowance|compensation|remuneration|fee|price|cost|incentive|stipend|premium/i;
const MONEY_LABEL = /금액|연봉|급여|보수|급료|봉급|수당|상여|인센티브/i;

/** 계약 ADMIN_INPUT 중 원 단위 금액으로 쓰이는 number 필드 여부(이름·라벨 휴리스틱). */
export function isContractMoneyLikeNumberField(field: FormFieldSchema): boolean {
  if (field.type !== 'number') return false;
  const labelNorm = field.label.replace(/\s+/g, '');
  return MONEY_NAME.test(field.name) || MONEY_LABEL.test(labelNorm);
}
