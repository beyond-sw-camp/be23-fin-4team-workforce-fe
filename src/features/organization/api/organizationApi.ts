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

/** GET /organization/org-chart 응답 `data` */
export type OrgChartMember = {
  memberId: string;
  name: string;
  jobTitleName: string;
  /** 있으면 재직만 보기 필터에 사용 */
  memberStatus?: string;
};

export type OrgChartJobGrade = {
  jobGradeName: string;
  /** 직급 표시 순서 (오름차순) */
  displayOrder?: number;
  members: OrgChartMember[];
};

export type OrgChartOrgNode = {
  organizationId: string;
  name: string;
  jobGrades: OrgChartJobGrade[];
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

function normalizeOrgChartMember(raw: unknown): OrgChartMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const memberId = pickStr(o, ['memberId', 'member_id']);
  const name = pickStr(o, ['name']);
  const jobTitleName = pickStr(o, ['jobTitleName', 'job_title_name']) || '—';
  const memberStatus = pickStr(o, ['memberStatus', 'member_status']);
  if (!memberId || !name) return null;
  return {
    memberId,
    name,
    jobTitleName,
    ...(memberStatus ? { memberStatus } : {}),
  };
}

function normalizeOrgChartJobGrade(raw: unknown): OrgChartJobGrade | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const jobGradeName = pickStr(o, ['jobGradeName', 'job_grade_name']);
  if (!jobGradeName) return null;
  const displayOrderRaw = o.displayOrder ?? o.display_order;
  const displayOrder =
    typeof displayOrderRaw === 'number'
      ? displayOrderRaw
      : typeof displayOrderRaw === 'string' && displayOrderRaw.trim() !== ''
        ? Number(displayOrderRaw)
        : undefined;
  const membersRaw = o.members;
  const members = Array.isArray(membersRaw)
    ? membersRaw.map(normalizeOrgChartMember).filter((m): m is OrgChartMember => m != null)
    : [];
  return {
    jobGradeName,
    ...(displayOrder !== undefined && !Number.isNaN(displayOrder) ? { displayOrder } : {}),
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
  const jobGrades = Array.isArray(jobGradesRaw)
    ? jobGradesRaw.map(normalizeOrgChartJobGrade).filter((g): g is OrgChartJobGrade => g != null)
    : [];
  const childrenRaw = o.children;
  const children = Array.isArray(childrenRaw)
    ? childrenRaw.map(normalizeOrgChartNode).filter((c): c is OrgChartOrgNode => c != null)
    : [];
  return { organizationId, name, jobGrades, children };
}

function sortOrgChartJobGrades(grades: OrgChartJobGrade[]): OrgChartJobGrade[] {
  return [...grades].sort((a, b) => {
    const ao = a.displayOrder ?? 999_999;
    const bo = b.displayOrder ?? 999_999;
    if (ao !== bo) return ao - bo;
    return a.jobGradeName.localeCompare(b.jobGradeName, 'ko');
  });
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
    jobGrades: sortOrgChartJobGrades(node.jobGrades).map((g) => ({
      ...g,
      members: [...g.members],
    })),
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

  async removeJobTitle(jobTitleId: string) {
    const response = await httpClient.delete(`/organization/job-title/${jobTitleId}`);
    return unwrapApiResponse<null>(response.data);
  },
};
