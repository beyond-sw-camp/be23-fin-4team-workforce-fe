import { type OrgChartMember, type OrgChartOrgNode, ORG_CHART_HIDDEN_JOB_GRADE } from '@/features/organization/api/organizationApi';

export function visibleOrgMembers(members: OrgChartMember[]): OrgChartMember[] {
  return members.filter((m) => m.jobGradeName.trim() !== ORG_CHART_HIDDEN_JOB_GRADE);
}

/** 직속 구성원 수(숨김 직급 제외) */
export function countDirectMembers(org: OrgChartOrgNode): number {
  return visibleOrgMembers(org.members).length;
}

/** 하위 조직까지 재귀 합산(숨김 직급 제외) */
export function countSubtreeMembers(org: OrgChartOrgNode): number {
  let n = countDirectMembers(org);
  for (const c of org.children) {
    n += countSubtreeMembers(c);
  }
  return n;
}

export function orgMemberCount(org: OrgChartOrgNode, mode: 'direct' | 'subtree'): number {
  return mode === 'direct' ? countDirectMembers(org) : countSubtreeMembers(org);
}
