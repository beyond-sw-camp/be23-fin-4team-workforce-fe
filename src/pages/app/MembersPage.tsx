import { useSuspenseQuery } from '@tanstack/react-query';
import { Card, Space, Typography } from 'antd';
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
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          구성원
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          조직 구성원을 검색·조회할 수 있습니다.
        </Typography.Paragraph>
      </div>
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <MemberSearchForm initialKeyword={params.keyword} onSearch={setTableParams} />
      </Card>
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <MembersTable
          rows={data.items}
          loading={isFetching}
          total={data.total}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(page, pageSize) => setTableParams({ page, pageSize })}
        />
      </Card>
    </Space>
  );
}
