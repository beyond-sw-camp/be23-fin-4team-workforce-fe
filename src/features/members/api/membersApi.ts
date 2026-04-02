import type { ListResponse } from '@/shared/types/common';
import type { Member, MembersSearch } from '@/features/members/model/types';
import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

type MembersListPayload = ListResponse<Member> | Member[];

export const membersApi = {
  async list(params: MembersSearch): Promise<ListResponse<Member>> {
    const response = await httpClient.get('/member/list', { params });
    const payload = unwrapApiResponse<MembersListPayload>(response.data);

    if (Array.isArray(payload)) {
      // Backend can return raw list before pagination migration.
      return {
        items: payload,
        total: payload.length,
        page: params.page,
        pageSize: params.pageSize,
      };
    }

    return payload;
  },

  async detail(memberId: string): Promise<Member | null> {
    const response = await httpClient.get(`/member/detail/${memberId}`);
    const payload = unwrapApiResponse<Member | null>(response.data);
    return payload ?? null;
  },
};
