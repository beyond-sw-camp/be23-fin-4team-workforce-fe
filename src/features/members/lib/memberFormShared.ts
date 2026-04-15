import type { EmploymentType } from '@/features/member/api/memberApi';
import type { OrganizationTreeNode } from '@/features/organization/api/organizationApi';
import { EMPLOYMENT_TYPE_KO } from '@/app/locale/app-ko';

export function pickOrgId(node: OrganizationTreeNode): string {
  const raw =
    node.id ??
    node.organizationId ??
    node.organization_id ??
    node.uuid ??
    node.organizationUuid ??
    node.organization_uuid;
  if (typeof raw === 'string' && raw) return raw;
  if (typeof raw === 'number') return String(raw);
  return '';
}

export function pickOrgName(node: OrganizationTreeNode): string {
  return typeof node.name === 'string' ? node.name : '';
}

export function pickOrgParentId(node: OrganizationTreeNode): string | null {
  const raw = node.parentId ?? node.parent_id;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  return null;
}

export function pickOrgChildren(node: OrganizationTreeNode): OrganizationTreeNode[] {
  const raw =
    node.children ??
    node.childOrganizations ??
    node.child_organizations ??
    node.subOrganizations ??
    node.sub_organizations;
  return Array.isArray(raw) ? (raw as OrganizationTreeNode[]) : [];
}

export function buildOrgOptions(nodes: OrganizationTreeNode[]): Array<{ value: string; label: string }> {
  if (!nodes.length) return [];
  const out: Array<{ value: string; label: string }> = [];
  const seen = new Set<string>();
  const hasNested = nodes.some((n) => pickOrgChildren(n).length > 0);

  if (hasNested) {
    const walk = (node: OrganizationTreeNode, depth: number) => {
      const id = pickOrgId(node);
      const name = pickOrgName(node) || '(이름 없음)';
      if (id && !seen.has(id)) {
        out.push({ value: id, label: `${'  '.repeat(depth)}${name}` });
        seen.add(id);
      }
      pickOrgChildren(node).forEach((child) => walk(child, depth + 1));
    };
    nodes.forEach((node) => walk(node, 0));
    return out;
  }

  const byId = new Map<string, { id: string; name: string; parentId: string | null }>();
  nodes.forEach((node) => {
    const id = pickOrgId(node);
    if (!id) return;
    byId.set(id, { id, name: pickOrgName(node) || '(이름 없음)', parentId: pickOrgParentId(node) });
  });
  const childrenMap = new Map<string, string[]>();
  byId.forEach((node) => {
    if (!node.parentId || !byId.has(node.parentId)) return;
    const arr = childrenMap.get(node.parentId) ?? [];
    arr.push(node.id);
    childrenMap.set(node.parentId, arr);
  });
  const roots = Array.from(byId.values()).filter((node) => !node.parentId || !byId.has(node.parentId));
  const walkFlat = (id: string, depth: number) => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return;
    out.push({ value: node.id, label: `${'  '.repeat(depth)}${node.name}` });
    seen.add(id);
    (childrenMap.get(id) ?? []).forEach((childId) => walkFlat(childId, depth + 1));
  };
  roots.forEach((root) => walkFlat(root.id, 0));
  byId.forEach((node) => {
    if (!seen.has(node.id)) out.push({ value: node.id, label: node.name });
  });
  return out;
}

export function pickRowId(row: Record<string, unknown>): string {
  const v = row.id ?? row.jobGradeId ?? row.job_grade_id ?? row.jobTitleId ?? row.job_title_id;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string' && v) return v;
  return '';
}

export function pickRowName(row: Record<string, unknown>): string {
  return typeof row.name === 'string' ? row.name : '';
}

export const MEMBER_FORM_EMPLOYMENT_TYPES: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

export const MEMBER_FORM_EMPLOYMENT_OPTIONS = MEMBER_FORM_EMPLOYMENT_TYPES.map((v) => ({
  value: v,
  label: EMPLOYMENT_TYPE_KO[v] ?? v,
}));
