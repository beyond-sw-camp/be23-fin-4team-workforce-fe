/**
 * 채팅 UI 에서 공통으로 쓰는 포맷터.
 * MemberChatPanel 분해 시 추출 — 동작은 변경하지 않는다.
 */

export function formatChatTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** 같은 로컬 날짜인지 비교용 키 */
export function startOfDayKey(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateSeparatorLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}
