import { queryOptions } from '@tanstack/react-query';
import { membersApi } from '@/features/members/api/membersApi';
import type { MembersSearch } from '@/features/members/model/types';

export const membersKeys = {
  all: ['members'] as const,
  list: (params: MembersSearch) => [...membersKeys.all, 'list', params] as const,
  detail: (memberId: string) => [...membersKeys.all, 'detail', memberId] as const,
};

export const membersListQueryOptions = (params: MembersSearch) =>
  queryOptions({
    queryKey: membersKeys.list(params),
    queryFn: () => (params.keyword?.trim() ? membersApi.search(params) : membersApi.list(params)),
  });
