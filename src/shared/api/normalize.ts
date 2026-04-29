/**
 * 백엔드 응답이 배열일 수도 있고, { items: [...] } / { data: [...] } / { content: [...] } 등
 * 다양한 wrapper 키로 감싸여 올 수도 있어 평탄화 헬퍼.
 *
 *  사용 예:
 *    const raw = unwrapApiResponse<unknown>(res.data);
 *    const rows = normalizeArray<MyType>(raw, ['items', 'data', 'list']);
 */
export function normalizeArray<T>(raw: unknown, candidateKeys: string[] = ['items', 'data', 'list', 'content', 'results']): T[] {
  if (Array.isArray(raw)) {
    return raw as T[];
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const k of candidateKeys) {
      const v = obj[k];
      if (Array.isArray(v)) return v as T[];
    }
    // 한 단계 더 깊은 wrapper (예: { data: { items: [...] } })
    for (const k of candidateKeys) {
      const v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner = v as Record<string, unknown>;
        for (const k2 of candidateKeys) {
          const v2 = inner[k2];
          if (Array.isArray(v2)) return v2 as T[];
        }
      }
    }
  }
  return [];
}
