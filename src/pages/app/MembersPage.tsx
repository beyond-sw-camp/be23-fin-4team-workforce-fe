import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { App, Button, Card, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { MemberSearchForm } from '@/features/members/ui/MemberSearchForm';
import { MemberCreateModal } from '@/features/members/ui/MemberCreateModal';
import { MembersTable } from '@/features/members/ui/MembersTable';
import { membersCtaButtonClass } from '@/features/members/ui/membersCtaButtonClass';
import { membersListQueryOptions } from '@/features/members/queries';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { useTableParams } from '@/shared/hooks/useTableParams';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import type { MembersSearch } from '@/features/members/model/types';

export function MembersPage() {
  const { message } = App.useApp();
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

  /** 활성 급여정책 1건 이상이 있어야 직원 생성을 허용한다.
   *  생성 직후 자동 0원/1호봉 Salary 가 활성 정책에 묶여서 만들어지기 때문에, 정책이 없으면
   *  뒷단에서 급여 자동 생성이 skip 되어 정합성이 깨진다. */
  const hasMemberCreatePerm = hasPermission(PERM.MEMBER_CREATE);
  const policiesQ = useQuery({
    queryKey: ['salary', 'salary-policies'],
    queryFn: () => salaryApi.salaryPolicy.list(),
    enabled: hasMemberCreatePerm,
    staleTime: 60_000,
  });
  const hasActivePolicy = useMemo(() => {
    const today = dayjs().startOf('day');
    return (policiesQ.data ?? []).some((p) => {
      const fromOk = !p.effectiveFrom || !dayjs(p.effectiveFrom).startOf('day').isAfter(today);
      const toOk = !p.effectiveTo || !dayjs(p.effectiveTo).startOf('day').isBefore(today);
      return fromOk && toOk;
    });
  }, [policiesQ.data]);

  const handleClickCreate = () => {
    if (!hasActivePolicy) {
      message.warning(
        '활성 급여정책이 없습니다. [급여 관리 → 급여 정책] 에서 정책을 먼저 등록해 주세요.',
      );
      return;
    }
    setCreateOpen(true);
  };

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-10">
      <AppWorkspacePageTitle
        eyebrow="Human resources"
        title="구성원"
        subtitle="조직 구성원을 검색·조회하고, 권한이 있으면 직원을 등록할 수 있습니다."
      />

      <MemberCreateModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <section>
        <Card
          className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5"
          styles={{ body: { padding: 16 } }}
        >
          <div className="tw-space-y-4">
            <MemberSearchForm
              initialKeyword={params.keyword}
              onSearch={setTableParams}
              trailing={
                hasMemberCreatePerm ? (
                  <Tooltip
                    title={
                      policiesQ.isLoading
                        ? '활성 급여정책 확인 중…'
                        : !hasActivePolicy
                          ? '활성 급여정책이 없어 직원을 생성할 수 없습니다. [급여 관리 → 급여 정책] 에서 정책을 먼저 등록해 주세요.'
                          : ''
                    }
                  >
                    <Button
                      type="primary"
                      className={membersCtaButtonClass}
                      onClick={handleClickCreate}
                      disabled={policiesQ.isLoading || !hasActivePolicy}
                    >
                      직원 계정 생성
                    </Button>
                  </Tooltip>
                ) : undefined
              }
            />
            <MembersTable
              rows={data.items}
              loading={isFetching}
              total={data.total}
              page={params.page}
              pageSize={params.pageSize}
              onPageChange={(page, pageSize) => setTableParams({ page, pageSize })}
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
