import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export const APPROVAL_SEARCH_STATUSES = ['DRAFT', 'WAIT', 'PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalSearchStatus = (typeof APPROVAL_SEARCH_STATUSES)[number];

export const APPROVAL_SEARCH_TYPES = [
  'VACATION',
  'ATTENDANCE',
  'HR_MOVEMENT',
  'SALARY',
  'GENERAL',
  'CONTRACT',
  'CERTIFICATE',
  'OFFICIAL',
] as const;
export type ApprovalSearchRequestType = (typeof APPROVAL_SEARCH_TYPES)[number];

export type ApprovalSearchParams = {
  query?: string;
  status?: ApprovalSearchStatus;
  requestType?: ApprovalSearchRequestType;
  page?: number;
  size?: number;
  sort?: string;
};

export type ApprovalSearchItem = {
  requestId: string;
  memberId: string;
  requesterName: string;
  requesterOrganizationName: string;
  documentName: string;
  requestStatus: ApprovalSearchStatus | string;
  requestType: ApprovalSearchRequestType | string;
  createdAt: string;
};

export type ApprovalSearchPage = {
  content: ApprovalSearchItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
};

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function asNum(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeSearchItem(raw: unknown): ApprovalSearchItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const requestId = asText(o.requestId ?? o.request_id);
  if (!requestId) return null;
  return {
    requestId,
    memberId: asText(o.memberId ?? o.member_id),
    requesterName: asText(o.requesterName ?? o.requester_name),
    requesterOrganizationName: asText(o.requesterOrganizationName ?? o.requester_organization_name),
    documentName: asText(o.documentName ?? o.document_name),
    requestStatus: asText(o.requestStatus ?? o.request_status),
    requestType: asText(o.requestType ?? o.request_type),
    createdAt: asText(o.createdAt ?? o.created_at),
  };
}

function normalizeSearchPage(raw: unknown): ApprovalSearchPage {
  const base: ApprovalSearchPage = {
    content: [],
    totalElements: 0,
    totalPages: 0,
    number: 0,
    size: 20,
    first: true,
    last: true,
    empty: true,
  };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const rows = Array.isArray(o.content) ? o.content : [];
  const content = rows.map((v) => normalizeSearchItem(v)).filter((v): v is ApprovalSearchItem => v != null);
  const number = asNum(o.number, 0);
  const size = asNum(o.size, 20);
  const totalElements = asNum(o.totalElements, content.length);
  const totalPages = asNum(o.totalPages, content.length > 0 ? 1 : 0);
  const emptyRaw = o.empty;
  const empty = typeof emptyRaw === 'boolean' ? emptyRaw : content.length === 0;
  return {
    content,
    totalElements,
    totalPages,
    number,
    size,
    first: typeof o.first === 'boolean' ? o.first : number <= 0,
    last: typeof o.last === 'boolean' ? o.last : totalPages === 0 || number >= totalPages - 1,
    empty,
  };
}

function compactParams(params: ApprovalSearchParams) {
  const out: Record<string, unknown> = {};
  if (params.query?.trim()) out.query = params.query.trim();
  if (params.status) out.status = params.status;
  if (params.requestType) out.requestType = params.requestType;
  if (params.page != null) out.page = params.page;
  if (params.size != null) out.size = params.size;
  if (params.sort?.trim()) out.sort = params.sort.trim();
  return out;
}

export const approvalSearchApi = {
  async searchMyRequests(params: ApprovalSearchParams): Promise<ApprovalSearchPage> {
    const response = await httpClient.get('/search/approvals/my-requests', { params: compactParams(params) });
    return normalizeSearchPage(unwrapApiResponse<unknown>(response.data));
  },

  async searchDepartmentRequests(organizationId: string, params: ApprovalSearchParams): Promise<ApprovalSearchPage> {
    const orgId = organizationId?.trim();
    if (!orgId) {
      throw new Error('조직 ID가 없습니다.');
    }
    const response = await httpClient.get('/search/approvals/department', {
      params: { ...compactParams(params), organizationId: orgId },
    });
    return normalizeSearchPage(unwrapApiResponse<unknown>(response.data));
  },
};
