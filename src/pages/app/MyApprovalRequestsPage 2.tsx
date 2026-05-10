import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { App, Card, Input, Typography } from 'antd';
import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { approvalRequestApi } from '@/features/approvals/api/approvalRequestApi';
import {
  mapApprovalDetailToSearchItem,
  type ApprovalSearchPage,
  type ApprovalSearchRequestType,
  type ApprovalSearchStatus,
} from '@/features/approvals/api/approvalSearchApi';
import { getApprovalSubjectFromContentJson } from '@/features/approvals/lib/approvalFormSchema';
import { ApprovalRequestReadOnlyModal } from '@/features/approvals/ui/ApprovalRequestReadOnlyModal';
import {
  ApprovalSearchPanel,
  type ApprovalSearchMyDraftManageActions,
  type ApprovalSearchPanelFilters,
} from '@/features/approvals/ui/ApprovalSearchPanel';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

const COMPOSE_WORKBENCH_SIDE_NAV = 'workbench';
const APPROVAL_EMBED_COMPOSE_MODAL = 'compose-modal';

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
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ requestId: string; status: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const routeLocation = useRouterState({
    select: (s) => ({ search: s.location.search as Record<string, unknown> }),
  });
  const filters = useMemo(() => parseSearch(routeLocation.search), [routeLocation.search]);

  /** 검색 API는 결재선을 안 주므로, 상세가 포함된 `/approval/requests/my`로 받은 뒤 검색어·페이지만 클라이언트 처리 */
  const listQuery = useQuery({
    queryKey: ['my-approval-requests-page-source', filters.status ?? 'ALL', filters.requestType ?? 'ALL'],
    queryFn: async () => {
      const list = await approvalRequestApi.listMyRequests(filters.status, filters.requestType);
      return list.map(mapApprovalDetailToSearchItem);
    },
    staleTime: 15_000,
  });

  const derivedSearchPage = useMemo((): ApprovalSearchPage => {
    const all = listQuery.data ?? [];
    let rows = all;
    const q = filters.query?.trim().toLowerCase();
    if (q) {
      rows = all.filter((r) => {
        const subj = getApprovalSubjectFromContentJson(r.contentJson).toLowerCase();
        const hay = `${r.documentName} ${subj} ${r.requesterName} ${r.requesterOrganizationName} ${String(r.contentJson ?? '').toLowerCase()}`;
        return hay.includes(q);
      });
    }
    const total = rows.length;
    const size = filters.size;
    const page = filters.page;
    const start = page * size;
    const content = rows.slice(start, start + size);
    const totalPages = total === 0 ? 0 : Math.ceil(total / size);
    return {
      content,
      totalElements: total,
      totalPages,
      number: page,
      size,
      first: page <= 0,
      last: totalPages === 0 || page >= totalPages - 1,
      empty: content.length === 0,
    };
  }, [listQuery.data, filters.query, filters.page, filters.size]);

  const queryResult = useMemo(
    () =>
      ({
        data: derivedSearchPage,
        isFetching: listQuery.isFetching || listQuery.isPending,
        isPending: listQuery.isPending,
        isError: listQuery.isError,
        error: listQuery.error,
        refetch: listQuery.refetch,
        status: listQuery.status,
      }) as unknown as UseQueryResult<ApprovalSearchPage, Error>,
    [derivedSearchPage, listQuery],
  );

  const updateFilters = useCallback(
    (next: ApprovalSearchPanelFilters) => {
      navigate({
        to: '/app/approvals/my-requests',
        search: {
          ...((next.embed ?? filters.embed) ? { embed: next.embed ?? filters.embed } : {}),
          ...(next.query ? { query: next.query } : {}),
          ...(next.status ? { status: next.status } : {}),
          ...(next.requestType ? { requestType: next.requestType } : {}),
          ...(next.page ? { page: next.page } : {}),
          ...(next.size !== 20 ? { size: next.size } : {}),
        },
        replace: true,
      });
    },
    [navigate, filters.embed],
  );

  const cancelM = useMutation({
    mutationFn: async (vars: { requestId: string; reason: string; isDraft: boolean }) =>
      approvalRequestApi.cancelRequest(vars.requestId, vars.reason),
    onSuccess: async (_data, vars) => {
      message.success(vars.isDraft ? '임시저장 문서를 삭제했습니다.' : '결재 요청을 취소했습니다.');
      setCancelTarget(null);
      setCancelReason('');
      await queryClient.invalidateQueries({ queryKey: ['my-approval-requests-page-source'] });
      await queryClient.invalidateQueries({ queryKey: ['approval-search', 'my-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['approval-user'] });
    },
    onError: (e: Error) => message.error(e.message || '처리에 실패했습니다.'),
  });

  const myDraftManageActions: ApprovalSearchMyDraftManageActions = useMemo(
    () => ({
      onContinueDraft: (requestId: string) => {
        navigate({
          to: '/app/approvals',
          search: {
            tab: 'compose',
            sideNav: COMPOSE_WORKBENCH_SIDE_NAV,
            composeDraftId: requestId,
            ...(filters.embed === APPROVAL_EMBED_COMPOSE_MODAL ? { embed: APPROVAL_EMBED_COMPOSE_MODAL } : {}),
          },
        });
      },
      onOpenCancelOrDelete: (requestId: string, requestStatusUpper: string) => {
        setCancelTarget({ requestId, status: requestStatusUpper });
        setCancelReason('');
      },
    }),
    [navigate, filters.embed],
  );

  const isDraftCancel = cancelTarget != null && cancelTarget.status === 'DRAFT';

  const hidePageChrome = filters.embed === APPROVAL_EMBED_COMPOSE_MODAL;
  const embeddedModalGetContainer = useCallback(() => {
    try {
      return window.parent?.document?.body ?? document.body;
    } catch {
      return document.body;
    }
  }, []);
  const nestedModalGetContainer = hidePageChrome ? embeddedModalGetContainer : undefined;

  return (
    <div className={clsx(hidePageChrome ? 'wf-approval-embed-root' : 'tw-mx-auto tw-max-w-[1400px] tw-w-full tw-space-y-4')}>
      {hidePageChrome ? null : (
        <div>
          <Typography.Title level={4} className="!tw-mb-1">
            내 기안 문서함
          </Typography.Title>
          <Typography.Text type="secondary">내가 기안한 전자결재 문서를 조건별로 검색합니다.</Typography.Text>
        </div>
      )}
      <Card
        className={clsx(hidePageChrome ? 'wf-approval-embed-card' : 'tw-rounded-xl')}
        styles={
          hidePageChrome
            ? { body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 16 } }
            : undefined
        }
      >
        <ApprovalSearchPanel
          filters={filters}
          onFiltersChange={updateFilters}
          queryResult={queryResult}
          onRowClick={setDetailRequestId}
          myDraftManageActions={myDraftManageActions}
        />
      </Card>
      <ApprovalRequestReadOnlyModal
        requestId={detailRequestId}
        onClose={() => setDetailRequestId(null)}
        title="내 기안 문서함 — 결재 상세"
        getContainer={nestedModalGetContainer}
        zIndex={2700}
      />

      <AppDoubleActionModal
        title={isDraftCancel ? '임시저장 삭제' : '결재 취소'}
        open={cancelTarget != null}
        onClose={() => {
          setCancelTarget(null);
          setCancelReason('');
        }}
        onConfirm={() => {
          if (!cancelTarget) return;
          if (!cancelReason.trim()) {
            message.warning(isDraftCancel ? '삭제 사유를 입력해 주세요.' : '취소 사유를 입력해 주세요.');
            return;
          }
          void cancelM.mutateAsync({
            requestId: cancelTarget.requestId,
            reason: cancelReason.trim(),
            isDraft: isDraftCancel,
          });
        }}
        confirmText={isDraftCancel ? '삭제' : '취소 확정'}
        cancelText="닫기"
        confirmLoading={cancelM.isPending}
        confirmDanger
        getContainer={nestedModalGetContainer}
        zIndex={2800}
      >
        <div className="tw-px-5 tw-py-4">
          <Input.TextArea
            rows={4}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder={isDraftCancel ? '삭제 사유를 입력하세요.' : '취소 사유를 입력하세요.'}
          />
        </div>
      </AppDoubleActionModal>
    </div>
  );
}
