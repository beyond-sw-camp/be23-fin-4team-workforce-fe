import type { RolePermissionItem } from '@/features/member/model/role-permission';
import { permissionEntryToCode } from '@/features/permissions/normalize-permission-codes';

/** 역할 상세의 permissions 항목을 JWT·Redis와 동일한 `RESOURCE:ACTION:RANGE` 문자열로 변환 */
export function rolePermissionItemsToCodes(items: RolePermissionItem[]): string[] {
  return items.map((p) => {
    const r = String(p.resource).trim().toUpperCase();
    const a = String(p.action).trim().toUpperCase();
    const g = String(p.permissionRange).trim().toUpperCase();
    return `${r}:${a}:${g}`;
  });
}

export function mergePermissionStrings(...groups: (readonly unknown[] | undefined)[]): string[] {
  const set = new Set<string>();
  for (const g of groups) {
    if (!g) continue;
    for (const s of g) {
      const t = typeof s === 'string' ? s.trim() : permissionEntryToCode(s);
      if (t) set.add(t);
    }
  }
  return [...set];
}
