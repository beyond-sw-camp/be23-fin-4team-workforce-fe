import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

/** GET /organization/list 트리 노드 (백엔드 필드에 맞게 확장 가능) */
export type OrganizationTreeNode = Record<string, unknown>;

export type CreateOrganizationPayload = {
  name: string;
  parentId: string | null;
};

export type UpdateOrganizationPayload = {
  name: string;
};

export type CreateJobGradePayload = {
  name: string;
  displayOrder: number;
};

export type UpdateJobGradePayload = {
  name: string;
  displayOrder: number;
};

export type CreateJobTitlePayload = {
  name: string;
  displayOrder: number;
};

export type UpdateJobTitlePayload = {
  name: string;
  displayOrder: number;
};

/** 조직도 UI 트리에 직원 노드로 노출하지 않는 직급명(시스템 관리자 등) */
export const ORG_CHART_HIDDEN_JOB_GRADE = '관리자';

/** GET /organization/org-chart — 조직 직속 멤버(백엔드에서 직급 displayOrder 순으로 정렬) */
export type OrgChartMember = {
  memberId: string;
  name: string;
  /** 표시용 직급/직책명 (API 필드명이 jobTitle·jobGrade 등으로 섞여 올 수 있음) */
  jobGradeName: string;
  /** 직책명 (인사발령 직책 변경에 사용) */
  jobTitleName?: string | null;
  /** 있으면 재직만 보기 필터에 사용 */
  memberStatus?: string;
  /** 구성원 프로필 이미지 URL(백엔드 org-chart 응답 등) */
  profileUrl?: string;
};

export type OrgChartJobGrade = {
  jobGradeName: string;
  displayOrder?: number;
  members: OrgChartMember[];
};

export type OrgChartOrgNode = {
  organizationId: string;
  name: string;
  jobGrades: OrgChartJobGrade[];
  /** jobGrades를 펼친 직속 멤버(검색·트리 UI 호환) */
  members: OrgChartMember[];
  children: OrgChartOrgNode[];
};

export type OrgChartData = {
  companyName: string;
  organizations: OrgChartOrgNode[];
};

function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickMemberId(o: Record<string, unknown>): string {
  const fromKeys = pickStr(o, ['memberId', 'member_id', 'userId', 'user_id', 'employeeId', 'employee_id']);
  if (fromKeys) return fromKeys;
  const id = o.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return '';
}

function normalizeOrgChartMember(raw: unknown): OrgChartMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const memberId = pickMemberId(o);
  const name = pickStr(o, [
    'name',
    'memberName',
    'member_name',
    'userName',
    'user_name',
    'fullName',
    'full_name',
    'displayName',
    'display_name',
    'employeeName',
    'employee_name',
  ]);
  if (!memberId || !name) return null;
  const jobGradeName =
    pickStr(o, [
      'jobTitleName',
      'job_title_name',
      'jobTitle',
      'job_title',
      'jobGradeName',
      'job_grade_name',
      'positionName',
      'position_name',
      'title',
    ]) || '—';
  const memberStatus = pickStr(o, ['memberStatus', 'member_status', 'status', 'employmentStatus', 'employment_status']);
  const profileUrl = pickStr(o, [
    'profileUrl',
    'profile_url',
    'profileImageUrl',
    'profile_image_url',
    'avatarUrl',
    'avatar_url',
    'photoUrl',
    'photo_url',
    'imageUrl',
    'image_url',
  ]);
  return {
    memberId,
    name,
    jobGradeName,
    ...(memberStatus ? { memberStatus } : {}),
    ...(profileUrl ? { profileUrl } : {}),
  };
}

function normalizeOrgChartJobGrade(raw: unknown): OrgChartJobGrade | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const jobGradeName =
    pickStr(o, ['jobGradeName', 'job_grade_name', 'gradeName', 'grade_name', 'jobGrade', 'label']) || '미분류';
  const displayOrderRaw = o.displayOrder ?? o.display_order;
  const displayOrder =
    typeof displayOrderRaw === 'number'
      ? displayOrderRaw
      : typeof displayOrderRaw === 'string' && displayOrderRaw.trim() !== ''
        ? Number(displayOrderRaw)
        : undefined;
  const membersRaw = o.members ?? o.memberList ?? o.member_list ?? o.employees ?? o.staff;
  const members = Array.isArray(membersRaw)
    ? membersRaw.map(normalizeOrgChartMember).filter((m): m is OrgChartMember => m != null)
    : [];
  return {
    jobGradeName,
    ...(displayOrder !== undefined && Number.isFinite(displayOrder) ? { displayOrder } : {}),
    members,
  };
}

function normalizeOrgChartNode(raw: unknown): OrgChartOrgNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const organizationId = pickStr(o, ['organizationId', 'organization_id']);
  const name = pickStr(o, ['name']);
  if (!organizationId || !name) return null;
  const jobGradesRaw = o.jobGrades ?? o.job_grades;
  let jobGrades: OrgChartJobGrade[] = Array.isArray(jobGradesRaw)
    ? jobGradesRaw.map(normalizeOrgChartJobGrade).filter((g): g is OrgChartJobGrade => g != null)
    : [];

  const membersInGrades = jobGrades.reduce((n, g) => n + g.members.length, 0);
  const directMembersRaw = o.members ?? o.memberList ?? o.member_list ?? o.orgMembers ?? o.organizationMembers;
  if (membersInGrades === 0 && Array.isArray(directMembersRaw) && directMembersRaw.length > 0) {
    const direct = directMembersRaw.map(normalizeOrgChartMember).filter((m): m is OrgChartMember => m != null);
    if (direct.length > 0) {
      jobGrades = [{ jobGradeName: '소속', members: direct }, ...jobGrades];
    }
  }

  const members = jobGrades.flatMap((g) => g.members);

  const childrenRaw = o.children;
  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeOrgChartNode).filter((c): c is OrgChartOrgNode => c != null)
    : [];
  return { organizationId, name, jobGrades, members, children };
}

function normalizeOrgChartDataPayload(raw: unknown): OrgChartData {
  if (!raw || typeof raw !== 'object') {
    return { companyName: '', organizations: [] };
  }
  const o = raw as Record<string, unknown>;
  const companyName = pickStr(o, ['companyName', 'company_name']);
  const orgsRaw = o.organizations ?? o.organizationList;
  const organizations = Array.isArray(orgsRaw)
    ? orgsRaw.map(normalizeOrgChartNode).filter((n): n is OrgChartOrgNode => n != null)
    : [];
  return { companyName: companyName || '—', organizations };
}

function mapOrgChartTree(node: OrgChartOrgNode): OrgChartOrgNode {
  return {
    ...node,
    jobGrades: node.jobGrades.map((g) => ({
      ...g,
      members: [...g.members],
    })),
    members: [...node.members],
    children: node.children.map(mapOrgChartTree),
  };
}

/**
 * 게이트웨이/서비스별로 배열이 한 겹 더 감싸져 있을 수 있음.
 * unwrap 후에도 `{ tree: [] }`, `{ data: { list: [] } }` 등 처리.
 */
function normalizeOrgListPayload(raw: unknown, depth = 0): OrganizationTreeNode[] {
  if (depth > 6) return [];
  if (Array.isArray(raw)) {
    return raw as OrganizationTreeNode[];
  }
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const keys = [
    'list',
    'items',
    'organizations',
    'organizationList',
    'content',
    'tree',
    'rows',
    'data',
    'result',
    'payload',
  ];
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) {
      return normalizeOrgListPayload(v, depth + 1);
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = normalizeOrgListPayload(v, depth + 1);
      if (inner.length > 0) return inner;
    }
  }
  return [];
}

/**
 * 조직·직급·직책 API.
 * X-User-UUID, X-User-MemberPositionId 는 `httpClient` 요청 인터셉터에서 AT·저장소 기준으로 붙습니다.
 */
export const organizationApi = {
  async create(payload: CreateOrganizationPayload) {
    const response = await httpClient.post('/organization/create', payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },

  async list() {
    const response = await httpClient.get('/organization/list', {
      params: { _: Date.now() },
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const arr = normalizeOrgListPayload(unwrapped);
    return Array.isArray(arr) ? arr : [];
  },

  /**
   * GET /organization/simple-list — 응답 형식은 list와 동일, 권한 완화(캘린더 팀 필터 등).
   */
  async simpleList() {
    const response = await httpClient.get('/organization/simple-list', {
      params: { _: Date.now() },
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const arr = normalizeOrgListPayload(unwrapped);
    return Array.isArray(arr) ? arr : [];
  },

  /** GET /organization/org-chart — 회사명·조직 트리·직급별 구성원 */
  async getOrgChart(): Promise<OrgChartData> {
    const response = await httpClient.get('/organization/org-chart');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const base = normalizeOrgChartDataPayload(unwrapped);
    return {
      companyName: base.companyName,
      organizations: base.organizations.map(mapOrgChartTree),
    };
  },

  async update(organizationId: string, payload: UpdateOrganizationPayload) {
    const response = await httpClient.put(`/organization/${organizationId}`, payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },

  async remove(organizationId: string) {
    const response = await httpClient.delete(`/organization/${organizationId}`);
    return unwrapApiResponse<null>(response.data);
  },

  async reorder(organizationIds: string[]) {
    const response = await httpClient.put('/organization/reorder', organizationIds);
    return unwrapApiResponse<null>(response.data);
  },

  async createJobGrade(payload: CreateJobGradePayload) {
    const response = await httpClient.post('/organization/job-grade/create', payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },

  async listJobGrades() {
    const response = await httpClient.get('/organization/job-grade/list');
    return unwrapApiResponse<Array<Record<string, unknown>>>(response.data);
  },

  async updateJobGrade(jobGradeId: string, payload: UpdateJobGradePayload) {
    const response = await httpClient.put(`/organization/job-grade/${jobGradeId}`, payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },

  async reorderJobGrades(jobGradeIds: string[]) {
    const response = await httpClient.put('/organization/job-grade/reorder', jobGradeIds);
    return unwrapApiResponse<null>(response.data);
  },

  async removeJobGrade(jobGradeId: string) {
    const response = await httpClient.delete(`/organization/job-grade/${jobGradeId}`);
    return unwrapApiResponse<null>(response.data);
  },

  async createJobTitle(payload: CreateJobTitlePayload) {
    const response = await httpClient.post('/organization/job-title/create', payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },

  async listJobTitles() {
    const response = await httpClient.get('/organization/job-title/list');
    return unwrapApiResponse<Array<Record<string, unknown>>>(response.data);
  },

  async updateJobTitle(jobTitleId: string, payload: UpdateJobTitlePayload) {
    const response = await httpClient.put(`/organization/job-title/${jobTitleId}`, payload);
    return unwrapApiResponse<Record<string, unknown>>(response.data);
  },

  async reorderJobTitles(jobTitleIds: string[]) {
    const response = await httpClient.put('/organization/job-title/reorder', jobTitleIds);
    return unwrapApiResponse<null>(response.data);
  },

  async removeJobTitle(jobTitleId: string) {
    const response = await httpClient.delete(`/organization/job-title/${jobTitleId}`);
    return unwrapApiResponse<null>(response.data);
  },
};
