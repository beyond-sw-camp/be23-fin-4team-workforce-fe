import { useQuery } from '@tanstack/react-query';
import { Card, Typography } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  approvalSearchApi,
  type ApprovalSearchRequestType,
  type ApprovalSearchStatus,
} from '@/features/approvals/api/approvalSearchApi';
import { ApprovalRequestReadOnlyModal } from '@/features/approvals/ui/ApprovalRequestReadOnlyModal';
import { ApprovalSearchPanel } from '@/features/approvals/ui/ApprovalSearchPanel';

function parseSearch(search: Record<string, unknown>) {
  const page = Number(search.page ?? 0);
  const size = Number(search.size ?? 20);
  const status = typeof search.status === 'string' && search.status ? (search.status as ApprovalSearchStatus) : undefined;
  const requestType =
    typeof search.requestType === 'string' && search.requestType
      ? (search.requestType as ApprovalSearchRequestType)
      : undefined;
  const query = typeof search.query === 'string' && search.query.trim() ? search.query.trim() : undefined;
  const embed = typeof search.embed === 'string' && search.embed.trim() ? search.embed.trim() : undefined;
  return {
    query,
    status,
    requestType,
    embed,
    page: Number.isFinite(page) && page >= 0 ? page : 0,
    size: Number.isFinite(size) && size > 0 ? size : 20,
  };
}

export function MyApprovalRequestsPage() {
  const navigate = useNavigate();
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const routeLocation = useRouterState({
    select: (s) => ({ search: s.location.search as Record<string, unknown> }),
  });
  const filters = useMemo(() => parseSearch(routeLocation.search), [routeLocation.search]);
  const queryResult = useQuery({
    queryKey: ['approval-search', 'my-requests', filters],
    queryFn: () => approvalSearchApi.searchMyRequests(filters),
    keepPreviousData: true,
  });

  const updateFilters = useCallback(
    (next: typeof filters) => {
      navigate({
        to: '/app/approvals/my-requests',
        search: {
          ...(next.embed ? { embed: next.embed } : {}),
          ...(next.query ? { query: next.query } : {}),
          ...(next.status ? { status: next.status } : {}),
          ...(next.requestType ? { requestType: next.requestType } : {}),
          ...(next.page ? { page: next.page } : {}),
          ...(next.size !== 20 ? { size: next.size } : {}),
        },
        replace: true,
      });
    },
    [navigate],
  );

  return (
    <div className="tw-mx-auto tw-max-w-6xl tw-space-y-4">
      <div>
        <Typography.Title level={4} className="!tw-mb-1">
          내 기안 문서함
        </Typography.Title>
        <Typography.Text type="secondary">내가 기안한 전자결재 문서를 조건별로 검색합니다.</Typography.Text>
      </div>
      <Card className="tw-rounded-xl">
        <ApprovalSearchPanel
          filters={filters}
          onFiltersChange={updateFilters}
          queryResult={queryResult}
          onRowClick={setDetailRequestId}
        />
      </Card>
      <ApprovalRequestReadOnlyModal
        requestId={detailRequestId}
        onClose={() => setDetailRequestId(null)}
        title="내 기안 문서함 — 결재 상세"
      />
    </div>
  );
}
