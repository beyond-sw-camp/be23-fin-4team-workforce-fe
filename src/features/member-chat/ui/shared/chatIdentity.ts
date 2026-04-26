/**
 * 채팅 UI 공통 상수·식별 유틸.
 */

/**
 * 플로팅 채팅 패널(z≈1060) 위에 확인 모달·툴팁이 뜨도록 잡아둔 베이스.
 * 컨텍스트 메뉴 등은 여기에 +N offset 을 더해 사용한다.
 */
export const MEMBER_CHAT_OVERLAY_Z = 10_080;

/**
 * JWT·API 혼용으로 UUID 문자열 형식이 달라질 수 있어 비교 시 정규화.
 */
export function sameMemberUuid(a?: string | null, b?: string | null): boolean {
  const x = a?.trim();
  const y = b?.trim();
  if (!x || !y) return false;
  return x.replace(/-/g, '').toLowerCase() === y.replace(/-/g, '').toLowerCase();
}
