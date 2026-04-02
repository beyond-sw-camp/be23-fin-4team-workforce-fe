import { useSuspenseQuery } from '@tanstack/react-query';
import { MemberSearchForm } from '@/features/members/ui/MemberSearchForm';
import { MembersTable } from '@/features/members/ui/MembersTable';
import { membersListQueryOptions } from '@/features/members/queries';
import { useTableParams } from '@/shared/hooks/useTableParams';
import type { MembersSearch } from '@/features/members/model/types';

export function MembersPage() {
  const { search, setTableParams } = useTableParams();
  const params: MembersSearch = {
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 20,
    keyword: search.keyword,
    sortBy: search.sortBy,
    sortOrder: search.sortOrder,
  };

  const { data, isFetching } = useSuspenseQuery(membersListQueryOptions(params));

  return (
    <div className="tw-space-y-4">
      <MemberSearchForm initialKeyword={params.keyword} onSearch={setTableParams} />
      <MembersTable
        rows={data.items}
        loading={isFetching}
        total={data.total}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page, pageSize) => setTableParams({ page, pageSize })}
      />
    </div>
  );
}
