import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Typography } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  approvalSearchApi,
  type ApprovalSearchRequestType,
  type ApprovalSearchStatus,
} from '@/features/approvals/api/approvalSearchApi';
import { ApprovalRequestReadOnlyModal } from '@/features/approvals/ui/ApprovalRequestReadOnlyModal';
import { ApprovalSearchPanel } from '@/features/approvals/ui/ApprovalSearchPanel';
import { useAuth } from '@/features/auth/useAuth';
import { memberApi } from '@/features/member/api/memberApi';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { findMemberOrganizationId } from '@/features/organization/lib/findMemberOrganizationInOrgChart';

function parseSearch(search: Record<string, unknown>) {
  const page = Number(search.page ?? 0);
  const size = Number(search.size ?? 20);
  const status = typeof search.status === 'string' && search.status ? (search.status as ApprovalSearchStatus) : undefined;
  const requestType =
    typeof search.requestType === 'string' && search.requestType
      ? (search.requestType as ApprovalSearchRequestType)
      : undefined;
  const query = typeof search.query === 'string' && search.query.trim() ? search.query.trim() : undefined;
  const organizationId =
    typeof search.organizationId === 'string' && search.organizationId.trim() ? search.organizationId.trim() : undefined;
  const embed = typeof search.embed === 'string' && search.embed.trim() ? search.embed.trim() : undefined;
  return {
    query,
    status,
    requestType,
    organizationId,
    embed,
    page: Number.isFinite(page) && page >= 0 ? page : 0,
    size: Number.isFinite(size) && size > 0 ? size : 20,
  };
}

export function DepartmentApprovalSearchPage() {
  const navigate = useNavigate();
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const { user } = useAuth();
  const authMemberId = user?.id?.trim();
  const routeLocation = useRouterState({
    select: (s) => ({ search: s.location.search as Record<string, unknown> }),
  });
  const filters = useMemo(() => parseSearch(routeLocation.search), [routeLocation.search]);

  const profileQuery = useQuery({
    queryKey: ['member', 'dashboard-profile'],
    queryFn: () => memberApi.dashboardProfile(),
    staleTime: 60_000,
  });

  const meQuery = useQuery({
    queryKey: ['member', 'detail', authMemberId],
    queryFn: () => memberApi.detail(authMemberId!),
    enabled: Boolean(authMemberId),
    staleTime: 60_000,
  });
  const orgChartQuery = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    staleTime: 60_000,
  });

  const fallbackOrganizationId = useMemo(() => {
    const fromMe = meQuery.data?.organizationId?.trim();
    if (fromMe) return fromMe;
    if (authMemberId && orgChartQuery.data?.organizations?.length) {
      return findMemberOrganizationId(orgChartQuery.data.organizations, authMemberId) ?? undefined;
    }
    return undefined;
  }, [meQuery.data?.organizationId, authMemberId, orgChartQuery.data?.organizations]);

  const resolvedOrganizationId =
    filters.organizationId ?? profileQuery.data?.organizationId ?? fallbackOrganizationId ?? undefined;

  const queryResult = useQuery({
    queryKey: ['approval-search', 'department', resolvedOrganizationId, filters],
    queryFn: () => approvalSearchApi.searchDepartmentRequests(resolvedOrganizationId!, filters),
    enabled: Boolean(resolvedOrganizationId),
    keepPreviousData: true,
  });

  const updateFilters = useCallback(
    (next: Omit<typeof filters, 'organizationId'> & { organizationId?: string }) => {
      navigate({
        to: '/app/approvals/department',
        search: {
          ...(filters.embed ? { embed: filters.embed } : {}),
          ...(resolvedOrganizationId ? { organizationId: resolvedOrganizationId } : {}),
          ...(next.query ? { query: next.query } : {}),
          ...(next.status ? { status: next.status } : {}),
          ...(next.requestType ? { requestType: next.requestType } : {}),
          ...(next.page ? { page: next.page } : {}),
          ...(next.size !== 20 ? { size: next.size } : {}),
        },
        replace: true,
      });
    },
    [navigate, resolvedOrganizationId, filters.embed],
  );

  return (
    <div className="tw-mx-auto tw-max-w-6xl tw-space-y-4">
      <div>
        <Typography.Title level={4} className="!tw-mb-1">
          부서 문서함
        </Typography.Title>
        <Typography.Text type="secondary">
          같은 부서 문서 중 공개 문서와 내 비공개 문서를 검색합니다.
        </Typography.Text>
      </div>
      {!resolvedOrganizationId ? (
        <Alert type="warning" showIcon message="조직 정보를 불러오지 못해 부서 문서 검색을 진행할 수 없습니다." />
      ) : null}
      <Card className="tw-rounded-xl">
        <ApprovalSearchPanel
          filters={{
            query: filters.query,
            status: filters.status,
            requestType: filters.requestType,
            page: filters.page,
            size: filters.size,
          }}
          onFiltersChange={updateFilters}
          queryResult={queryResult}
          onRowClick={setDetailRequestId}
        />
      </Card>
      <ApprovalRequestReadOnlyModal
        requestId={detailRequestId}
        onClose={() => setDetailRequestId(null)}
        title="부서 문서함 — 결재 상세"
      />
    </div>
  );
}
