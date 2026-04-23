import { useSuspenseQuery } from '@tanstack/react-query';
import { Button, Card } from 'antd';
import { useState } from 'react';
import { MemberSearchForm } from '@/features/members/ui/MemberSearchForm';
import { MemberCreateModal } from '@/features/members/ui/MemberCreateModal';
import { MembersTable } from '@/features/members/ui/MembersTable';
import { membersCtaButtonClass } from '@/features/members/ui/membersCtaButtonClass';
import { membersListQueryOptions } from '@/features/members/queries';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { useTableParams } from '@/shared/hooks/useTableParams';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import type { MembersSearch } from '@/features/members/model/types';

export function MembersPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { hasPermission } = usePermissions();
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
    <div className="tw-mx-auto tw-w-full tw-space-y-10">
      <AppWorkspacePageTitle
        eyebrow="Human resources"
        title="구성원"
        subtitle="조직 구성원을 검색·조회하고, 권한이 있으면 직원을 등록할 수 있습니다."
      />

      <MemberCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <section className="tw-space-y-4">
        <MemberSearchForm
          initialKeyword={params.keyword}
          onSearch={setTableParams}
          trailing={
            hasPermission(PERM.MEMBER_CREATE) ? (
              <Button type="primary" className={membersCtaButtonClass} onClick={() => setCreateOpen(true)}>
                직원 계정 생성
              </Button>
            ) : undefined
          }
        />

        <Card
          className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5"
          styles={{ body: { padding: 4 } }}
        >
          <MembersTable
            rows={data.items}
            loading={isFetching}
            total={data.total}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(page, pageSize) => setTableParams({ page, pageSize })}
          />
        </Card>
      </section>
    </div>
  );
}
