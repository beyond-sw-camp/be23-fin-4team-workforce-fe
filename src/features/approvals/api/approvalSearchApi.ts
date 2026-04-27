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

type DepartmentRawItem = {
  requestId: string;
  memberId: string;
  requesterName?: string;
  requesterOrganizationName?: string;
  documentName?: string;
  contentJson?: string;
  requestStatus?: string;
  requestType?: string;
  createdAt?: string;
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

function pickArray(raw: unknown, depth = 0): unknown[] {
  if (depth > 6) return [];
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const k of ['data', 'items', 'list', 'content', 'result', 'rows', 'payload', 'body', 'records', 'values']) {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const nested = pickArray(v, depth + 1);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function toDepartmentRows(payload: unknown): DepartmentRawItem[] {
  const rows = pickArray(unwrapApiResponse<unknown>(payload));
  return rows
    .map((raw): DepartmentRawItem | null => {
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
        contentJson: asText(o.contentJson ?? o.content_json),
        requestStatus: asText(o.requestStatus ?? o.request_status),
        requestType: asText(o.requestType ?? o.request_type),
        createdAt: asText(o.createdAt ?? o.created_at),
      };
    })
    .filter((v): v is DepartmentRawItem => v != null);
}

function textIncludes(haystack: string, keyword: string): boolean {
  return haystack.toLowerCase().includes(keyword.toLowerCase());
}

function toDepartmentSearchItem(row: DepartmentRawItem): ApprovalSearchItem {
  return {
    requestId: row.requestId,
    memberId: row.memberId,
    requesterName: row.requesterName ?? '',
    requesterOrganizationName: row.requesterOrganizationName ?? '',
    documentName: row.documentName ?? '',
    requestStatus: row.requestStatus ?? '',
    requestType: row.requestType ?? '',
    createdAt: row.createdAt ?? '',
  };
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
    const response = await httpClient.get('/approval/requests/department', {
      params: {
        organizationId: orgId,
        ...(params.requestType ? { requestType: params.requestType } : {}),
      },
    });
    const rows = toDepartmentRows(response.data);
    const q = params.query?.trim();
    const filtered = rows.filter((row) => {
      if (params.status && String(row.requestStatus ?? '').toUpperCase() !== String(params.status).toUpperCase()) {
        return false;
      }
      if (params.requestType && String(row.requestType ?? '').toUpperCase() !== String(params.requestType).toUpperCase()) {
        return false;
      }
      if (q) {
        const target = `${row.documentName ?? ''} ${row.requesterName ?? ''} ${row.requesterOrganizationName ?? ''} ${row.contentJson ?? ''}`.trim();
        if (!textIncludes(target, q)) return false;
      }
      return true;
    });
    const size = params.size && params.size > 0 ? params.size : 20;
    const page = params.page && params.page > 0 ? params.page : 0;
    const totalElements = filtered.length;
    const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
    const offset = page * size;
    const content = filtered.slice(offset, offset + size).map(toDepartmentSearchItem);
    return {
      content,
      totalElements,
      totalPages,
      number: page,
      size,
      first: page <= 0,
      last: totalPages === 0 || page >= totalPages - 1,
      empty: content.length === 0,
    };
  },
};
