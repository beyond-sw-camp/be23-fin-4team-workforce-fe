/**
 * JWT·로그인 응답의 permissions 가 문자열 배열이 아니라
 * `{ resource, action, permissionRange }` 객체 배열일 때 `MEMBER:READ:COMPANY` 형으로 통일합니다.
 */
export function permissionEntryToCode(entry: unknown): string | undefined {
  if (typeof entry === 'string') {
    const t = entry.trim();
    return t ? t.toUpperCase() : undefined;
  }
  if (!entry || typeof entry !== 'object') return undefined;
  const o = entry as Record<string, unknown>;
  const direct = o.code ?? o.permissionCode ?? o.permission ?? o.name ?? o.value ?? o.authority;
  if (typeof direct === 'string' && direct.trim()) return direct.trim().toUpperCase();

  const resource = o.resource ?? o.permissionResource;
  const action = o.action;
  const range = o.permissionRange ?? o.permission_range ?? o.scope ?? o.range;
  if (typeof resource === 'string' && typeof action === 'string') {
    const r = resource.trim().toUpperCase();
    const a = action.trim().toUpperCase();
    if (typeof range === 'string' && range.trim()) {
      return `${r}:${a}:${range.trim().toUpperCase()}`;
    }
    return `${r}:${a}`;
  }
  return undefined;
}

export function normalizePermissionList(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const c = permissionEntryToCode(x);
    if (c) out.push(c);
  }
  return out;
}

/** 여러 필드(JWT·로그인 본문의 루트·중첩)에서 권한 문자열을 한 번에 수집 */
export function normalizePermissionSources(...sources: unknown[]): string[] {
  const set = new Set<string>();
  for (const src of sources) {
    for (const c of normalizePermissionList(src)) {
      set.add(c);
    }
  }
  return [...set];
}
