import type { OrgChartOrgNode } from '@/features/organization/api/organizationApi';

function eqMemberId(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/-/g, '').trim().toLowerCase();
  const x = norm(a);
  const y = norm(b);
  return Boolean(x && y && x === y);
}

/** 조직도 트리에서 해당 멤버가 속한 조직의 `organizationId` (없으면 null) */
export function findMemberOrganizationId(roots: OrgChartOrgNode[], memberId: string): string | null {
  const id = memberId.trim();
  if (!id) return null;
  for (const node of roots) {
    const jobGrades = Array.isArray(node.jobGrades) ? node.jobGrades : [];
    for (const g of jobGrades) {
      const members = Array.isArray(g.members) ? g.members : [];
      for (const m of members) {
        if (eqMemberId(m.memberId, id)) return node.organizationId;
      }
    }
    const children = Array.isArray(node.children) ? node.children : [];
    const sub = findMemberOrganizationId(children, memberId);
    if (sub) return sub;
  }
  return null;
}
