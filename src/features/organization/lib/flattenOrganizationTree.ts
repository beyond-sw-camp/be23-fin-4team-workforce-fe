import type { OrganizationTreeNode } from '@/features/organization/api/organizationApi';

export type OrganizationFlatRow = {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
};

function pickOrgId(node: OrganizationTreeNode): string {
  const r = node as Record<string, unknown>;
  const raw =
    r.id ??
    r.organizationId ??
    r.organization_id ??
    r.uuid ??
    r.organizationUuid ??
    r.organization_uuid;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'number') return String(raw);
  return '';
}

function pickOrgName(node: OrganizationTreeNode): string {
  const raw =
    (node as Record<string, unknown>).name ??
    (node as Record<string, unknown>).organizationName ??
    (node as Record<string, unknown>).organization_name;
  return typeof raw === 'string' ? raw.trim() : '';
}

function pickParentIdFromFlatRow(node: OrganizationTreeNode): string | null {
  const r = node as Record<string, unknown>;
  const p =
    r.parentId ??
    r.parent_id ??
    r.parentOrganizationId ??
    r.parent_organization_id;
  if (p === null || p === undefined || p === '') return null;
  return String(p).trim() || null;
}

const NESTED_CHILD_KEYS = ['children', 'childOrganizations', 'childList', 'organizationChildren'] as const;

function getNestedChildren(node: OrganizationTreeNode): OrganizationTreeNode[] {
  const r = node as Record<string, unknown>;
  for (const k of NESTED_CHILD_KEYS) {
    const v = r[k];
    if (Array.isArray(v) && v.length > 0) return v as OrganizationTreeNode[];
  }
  return [];
}

function hasNestedChildren(roots: OrganizationTreeNode[]): boolean {
  return roots.some((n) => getNestedChildren(n).length > 0);
}

function visitNestedTreeWithDepth(roots: OrganizationTreeNode[]): OrganizationFlatRow[] {
  const out: OrganizationFlatRow[] = [];
  const seen = new Set<string>();

  const walk = (nodes: OrganizationTreeNode[], parentId: string | null, depth: number) => {
    const sorted = [...nodes].sort((a, b) =>
      (pickOrgName(a) || pickOrgId(a)).localeCompare(pickOrgName(b) || pickOrgId(b), 'ko', {
        sensitivity: 'base',
      }),
    );
    for (const n of sorted) {
      const id = pickOrgId(n);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        name: pickOrgName(n) || id,
        parentId,
        depth,
      });
      const ch = getNestedChildren(n);
      if (ch.length) walk(ch, id, depth + 1);
    }
  };

  walk(roots, null, 0);
  return out;
}

function assignDepthByTreeOrder(
  rows: Pick<OrganizationFlatRow, 'id' | 'name' | 'parentId'>[],
): OrganizationFlatRow[] {
  const ordered: OrganizationFlatRow[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const children = rows
      .filter((x) => (x.parentId ?? null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko', { sensitivity: 'base' }));
    for (const c of children) {
      ordered.push({ ...c, depth });
      visit(c.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}

/**
 * `GET /organization/list` 가 (1) 루트 배열 + `children` 중첩 또는 (2) 전체 평탄 배열 + `parentId` 인 경우 모두
 * 동일한 “전체 조직” 목록으로 펼칩니다. 목표 생성 Select·이름 맵·부모 맵에 사용합니다.
 */
export function flattenOrganizationsWithMeta(roots: OrganizationTreeNode[]): OrganizationFlatRow[] {
  if (!roots.length) return [];

  if (hasNestedChildren(roots)) {
    return visitNestedTreeWithDepth(roots);
  }

  const flat = roots
    .map((n) => {
      const id = pickOrgId(n);
      if (!id) return null;
      return {
        id,
        name: pickOrgName(n) || id,
        parentId: pickParentIdFromFlatRow(n),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return assignDepthByTreeOrder(flat);
}
