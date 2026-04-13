import { normalizeYnFlag } from '@/features/member/api/memberApi';

/** 연락처·주소 비공개(NO) 시 조회 화면에 표시하는 마스크 */
export const MEMBER_PRIVATE_FIELD_MASK = '*******';

function isPrivate(yn: unknown): boolean {
  return normalizeYnFlag(yn) === 'NO';
}

/** phonePublicYn 이 NO 면 마스크, YES 면 값 또는 빈 값이면 — */
export function displayPhoneByPublicYn(phoneNumber: string | null | undefined, phonePublicYn: unknown): string {
  if (isPrivate(phonePublicYn)) return MEMBER_PRIVATE_FIELD_MASK;
  const v = phoneNumber?.trim();
  return v && v.length > 0 ? v : '—';
}

/** addressPublicYn 이 NO 면 마스크, YES 면 값 또는 — */
export function displayAddressByPublicYn(address: string | null | undefined, addressPublicYn: unknown): string {
  if (isPrivate(addressPublicYn)) return MEMBER_PRIVATE_FIELD_MASK;
  const v = address?.trim();
  return v && v.length > 0 ? v : '—';
}

/** 상세 주소도 주소 공개 플래그와 동일하게 처리 */
export function displayDetailAddressByPublicYn(
  detailAddress: string | null | undefined,
  addressPublicYn: unknown,
): string {
  if (isPrivate(addressPublicYn)) return MEMBER_PRIVATE_FIELD_MASK;
  const v = detailAddress?.trim();
  return v && v.length > 0 ? v : '—';
}
