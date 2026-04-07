import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export type SearchEmployee = {
  memberId: string;
  name?: string;
  email?: string;
  organizationName?: string;
  jobTitleName?: string;
  profileUrl?: string;
  memberStatus?: string;
};

export type SearchPagedResult<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
};

export type SearchOrganizationNode = {
  organizationId: string;
  name?: string;
  parentId?: string | null;
  children?: SearchOrganizationNode[];
};

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function mapEmployee(raw: unknown): SearchEmployee {
  const r = raw as Record<string, unknown>;
  return {
    memberId: asString(r.memberId ?? r.member_id) ?? '',
    name: asString(r.name),
    email: asString(r.email),
    organizationName: asString(r.organizationName ?? r.organization_name),
    jobTitleName: asString(r.jobTitleName ?? r.job_title_name),
    profileUrl: asString(r.profileUrl ?? r.profile_url),
    memberStatus: asString(r.memberStatus ?? r.member_status),
  };
}

function mapOrgNode(raw: unknown): SearchOrganizationNode {
  const r = raw as Record<string, unknown>;
  return {
    organizationId: asString(r.organizationId ?? r.organization_id) ?? '',
    name: asString(r.name),
    parentId: asString(r.parentId ?? r.parent_id) ?? null,
    children: Array.isArray(r.children) ? r.children.map(mapOrgNode) : [],
  };
}

function mapPagedEmployees(raw: unknown): SearchPagedResult<SearchEmployee> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const content = Array.isArray(r.content) ? r.content.map(mapEmployee) : [];
  return {
    content,
    totalElements: Number(r.totalElements ?? r.total_elements ?? content.length ?? 0),
    totalPages: Number(r.totalPages ?? r.total_pages ?? 1),
    page: Number(r.page ?? 0),
    size: Number(r.size ?? content.length ?? 0),
  };
}

export const searchApi = {
  async searchEmployees(query: string, page = 0, size = 10): Promise<SearchPagedResult<SearchEmployee>> {
    const response = await httpClient.get('/search/employees', {
      params: { query, page, size },
    });
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return mapPagedEmployees(unwrapped);
  },

  async listOrganizationTree(): Promise<SearchOrganizationNode[]> {
    const response = await httpClient.get('/search/organization');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return Array.isArray(unwrapped) ? unwrapped.map(mapOrgNode) : [];
  },

  async searchEmployeesByOrganization(
    organizationId: string,
    page = 0,
    size = 10,
  ): Promise<SearchPagedResult<SearchEmployee>> {
    const response = await httpClient.get('/search/employees/organization', {
      params: { organizationId, page, size },
    });
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return mapPagedEmployees(unwrapped);
  },
};
