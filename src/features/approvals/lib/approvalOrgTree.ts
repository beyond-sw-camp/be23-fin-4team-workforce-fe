import type { DataNode } from 'antd/es/tree';
import type { OrgChartOrgNode } from '@/features/organization/api/organizationApi';

export type OrgPickerMemberRow = {
  memberId: string;
  name: string;
  jobTitleName: string;
  organizationName: string;
};

/** 해당 조직 노드에 직접 매달린 멤버만 (하위 부서 제외) */
function collectDirectMembersOfNode(node: OrgChartOrgNode): OrgPickerMemberRow[] {
  const rows: OrgPickerMemberRow[] = [];
  for (const g of node.jobGrades) {
    for (const m of g.members) {
      rows.push({
        memberId: m.memberId,
        name: m.name,
        jobTitleName: m.jobTitleName,
        organizationName: node.name,
      });
    }
  }
  return rows;
}

/** 전체 조직도에서 직접 소속 멤버만 모아 memberId 기준 중복 제거 (검색용) */
export function flattenDirectMembersDeduped(roots: OrgChartOrgNode[]): OrgPickerMemberRow[] {
  const seen = new Set<string>();
  const out: OrgPickerMemberRow[] = [];
  const walk = (n: OrgChartOrgNode) => {
    for (const r of collectDirectMembersOfNode(n)) {
      if (seen.has(r.memberId)) continue;
      seen.add(r.memberId);
      out.push(r);
    }
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

/** 조직 트리 + 각 조직 아래 소속 멤버를 자식 노드로 표시 */
export function buildOrgTreeWithMemberLeaves(nodes: OrgChartOrgNode[]): DataNode[] {
  const mapNode = (node: OrgChartOrgNode): DataNode => {
    const childOrgs = node.children.map(mapNode);
    const memberLeaves: DataNode[] = [];
    for (const g of node.jobGrades) {
      for (const m of g.members) {
        memberLeaves.push({
          key: `member:${node.organizationId}:${m.memberId}`,
          title: `${m.name}${m.jobTitleName ? ` (${m.jobTitleName})` : ''}`,
          isLeaf: true,
        });
      }
    }
    return {
      key: node.organizationId,
      title: node.name,
      children: [...childOrgs, ...memberLeaves],
    };
  };
  return nodes.map(mapNode);
}
