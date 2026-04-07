import type { ListResponse } from '@/shared/types/common';
import type { Member, MembersSearch } from '@/features/members/model/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

type MembersListPayload = ListResponse<Member> | Member[];

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
  const statusRaw = r.status ?? r.memberStatus;
  const status: Member['status'] =
    statusRaw === 'ACTIVE' || statusRaw === 'DORMANT' || statusRaw === 'LEAVE' ? statusRaw : 'ACTIVE';
  return { id, name, email, department, status };
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

  async detail(memberId: string): Promise<Member | null> {
    const response = await httpClient.get(`/member/detail/${memberId}`);
    const payload = unwrapApiResponse<unknown>(response.data);
    if (payload == null) return null;
    return mapRowToMember(payload);
  },
};
