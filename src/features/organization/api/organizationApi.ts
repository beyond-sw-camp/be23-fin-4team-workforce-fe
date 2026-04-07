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
};

export type UpdateJobGradePayload = {
  name: string;
};

export type CreateJobTitlePayload = {
  name: string;
};

export type UpdateJobTitlePayload = {
  name: string;
};

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
