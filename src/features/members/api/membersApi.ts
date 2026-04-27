import type { ListResponse } from '@/shared/types/common';
import type { Member, MembersSearch } from '@/features/members/model/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

type MembersListPayload = ListResponse<unknown> | unknown[];

function strField(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** 목록/상세 응답이 `id` 또는 `memberId`(및 스네이크 케이스)로 올 수 있음 → Select 값으로 쓰일 `id` 통일 */
function mapRawToMember(raw: unknown): Member | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = strField(r, 'id', 'memberId', 'member_id');
  if (!id) return null;
  const name = strField(r, 'name') || '—';
  const email = strField(r, 'email');
  const department =
    strField(r, 'department', 'organizationName', 'organization_name', 'dept') || '';
  const sabun =
    strField(
      r,
      'sabun',
      'employeeNumber',
      'employee_number',
      'empNo',
      'emp_no',
      'staffNumber',
      'staff_number',
    ) || undefined;
  const statusRaw = strField(r, 'status', 'memberStatus', 'member_status') || 'ACTIVE';
  const u = statusRaw.toUpperCase();
  const status: Member['status'] =
    u === 'DORMANT' ? 'DORMANT' : u === 'LEAVE' ? 'LEAVE' : 'ACTIVE';
  return { id, name, email, department, ...(sabun ? { sabun } : {}), status };
}

function normalizeListPayload(
  payload: MembersListPayload,
  params: MembersSearch,
): ListResponse<Member> {
  if (Array.isArray(payload)) {
    const items = payload.map(mapRawToMember).filter((m): m is Member => m !== null);
    return {
      items,
      total: items.length,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems.map(mapRawToMember).filter((m): m is Member => m !== null);
  return {
    items,
    total: typeof payload.total === 'number' ? payload.total : items.length,
    page: typeof payload.page === 'number' ? payload.page : params.page,
    pageSize: typeof payload.pageSize === 'number' ? payload.pageSize : params.pageSize,
  };
}

function mapRowToMember(row: unknown): Member {
  const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
  const rawId = r.memberId ?? r.id ?? r.member_id;
  const id = typeof rawId === 'number' ? String(rawId) : typeof rawId === 'string' ? rawId : '';
  const name = typeof r.name === 'string' ? r.name : '';
  const email =
    typeof r.email === 'string'
      ? r.email
      : typeof r.personalEmail === 'string'
        ? r.personalEmail
        : '';
  const department =
    typeof r.department === 'string'
      ? r.department
      : typeof r.organizationName === 'string'
        ? r.organizationName
        : typeof r.departmentName === 'string'
          ? r.departmentName
          : '';
  const sabunRaw =
    r.sabun ??
    r.employeeNumber ??
    r.employee_number ??
    r.empNo ??
    r.emp_no ??
    r.staffNumber ??
    r.staff_number;
  const sabun =
    typeof sabunRaw === 'string' && sabunRaw.trim()
      ? sabunRaw.trim()
      : typeof sabunRaw === 'number' && Number.isFinite(sabunRaw)
        ? String(sabunRaw)
        : undefined;
  const statusRaw = r.status ?? r.memberStatus;
  const status: Member['status'] =
    statusRaw === 'ACTIVE' || statusRaw === 'DORMANT' || statusRaw === 'LEAVE' ? statusRaw : 'ACTIVE';
  return { id, name, email, department, ...(sabun ? { sabun } : {}), status };
}

export const membersApi = {
  async list(params: MembersSearch): Promise<ListResponse<Member>> {
    const response = await httpClient.get('/member/list', { params });
    const payload = unwrapApiResponse<MembersListPayload>(response.data);

    if (Array.isArray(payload)) {
      const items = payload.map(mapRowToMember);
      return {
        items,
        total: items.length,
        page: params.page,
        pageSize: params.pageSize,
      };
    }

    return {
      ...payload,
      items: payload.items.map(mapRowToMember),
    };
  },

  /** /member/search (QueryDSL + pageable) 기반 구성원 검색 */
  async search(params: MembersSearch): Promise<ListResponse<Member>> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, params.pageSize ?? 20);
    const response = await httpClient.get('/member/search', {
      params: {
        keyword: params.keyword?.trim() || undefined,
        page: page - 1,
        size: pageSize,
      },
    });
    const payload = unwrapApiResponse<unknown>(response.data);
    if (!payload || typeof payload !== 'object') {
      return { items: [], total: 0, page, pageSize };
    }
    const p = payload as Record<string, unknown>;
    const content = Array.isArray(p.content) ? p.content : [];
    const items = content.map(mapRowToMember).filter((m) => Boolean(m.id));
    const total =
      typeof p.totalElements === 'number'
        ? p.totalElements
        : typeof p.total === 'number'
          ? p.total
          : items.length;
    return { items, total, page, pageSize };
  },

  async detail(memberId: string): Promise<Member | null> {
    const response = await httpClient.get(`/member/detail/${memberId}`);
    const payload = unwrapApiResponse<unknown>(response.data);
    if (payload == null) return null;
    return mapRowToMember(payload);
  },
};
