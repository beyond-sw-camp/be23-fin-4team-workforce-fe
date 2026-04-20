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
    for (const g of node.jobGrades) {
      for (const m of g.members) {
        if (eqMemberId(m.memberId, id)) return node.organizationId;
      }
    }
    const sub = findMemberOrganizationId(node.children, memberId);
    if (sub) return sub;
  }
  return null;
}
