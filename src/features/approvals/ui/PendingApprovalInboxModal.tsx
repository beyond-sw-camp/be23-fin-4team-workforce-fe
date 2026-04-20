import { EyeOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import {
  approvalRequestApi,
  findMyInboxApprovalLine,
  isInlineSyntheticApprovalId,
  type ApprovalRequestDetail,
} from '@/features/approvals/api/approvalRequestApi';
import { getApprovalRequestSubjectLine } from '@/features/approvals/lib/approvalFormSchema';

/** 전체(inbox) · 결재 대기(pending) · 결재 예정(waiting) · 결재 완료(acted) */
export type PendingApprovalInboxTab = 'all' | 'pending' | 'waiting' | 'acted';

function formatDateTime(value?: string | null) {
  if (!value?.trim()) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '—';
}

function myTurnBadge(
  tab: PendingApprovalInboxTab,
  row: ApprovalRequestDetail,
  opts: { myMemberId?: string; myMemberPositionId?: string },
) {
  if (tab === 'acted') {
    const line = findMyInboxApprovalLine(row, opts);
    const st = String(line?.approvalStatus ?? '').toUpperCase();
    if (st === 'APPROVED') {
      return (
        <Tag color="success" className="!tw-m-0">
          승인
        </Tag>
      );
    }
    if (st === 'REJECTED') {
      return (
        <Tag color="error" className="!tw-m-0">
          반려
        </Tag>
      );
    }
    return (
      <Tag color="processing" className="!tw-m-0">
        처리함
      </Tag>
    );
  }
  if (tab === 'waiting') {
    return (
      <Tag color="processing" className="!tw-m-0">
        대기 중
      </Tag>
    );
  }
  if (tab === 'pending') {
    return (
      <Tag color="gold" className="!tw-m-0">
        결재 대기
      </Tag>
    );
  }
  const line = findMyInboxApprovalLine(row, opts);
  const st = String(line?.approvalStatus ?? '').toUpperCase();
  if (st === 'PENDING') {
    return (
      <Tag color="gold" className="!tw-m-0">
        결재 대기
      </Tag>
    );
  }
  if (st === 'WAITING') {
    return (
      <Tag color="processing" className="!tw-m-0">
        결재 예정
      </Tag>
    );
  }
  return <Tag className="!tw-m-0">—</Tag>;
}

function canApproveRow(
  tab: PendingApprovalInboxTab,
  row: ApprovalRequestDetail,
  opts: { myMemberId?: string; myMemberPositionId?: string },
): boolean {
  if (tab === 'waiting' || tab === 'acted') return false;
  const line = findMyInboxApprovalLine(row, opts);
  if (!line || String(line.approvalStatus).toUpperCase() !== 'PENDING') return false;
  if (isInlineSyntheticApprovalId(line.approvalId)) return false;
  return true;
}

export type PendingApprovalInboxModalContentProps = {
  myMemberId?: string;
  myMemberPositionId?: string;
  onOpenDetail: (requestId: string) => void;
  onStartApprove: (approvalId: string) => void;
  onStartReject: (approvalId: string) => void;
};

export function PendingApprovalInboxModalContent({
  myMemberId,
  myMemberPositionId,
  onOpenDetail,
  onStartApprove,
  onStartReject,
}: PendingApprovalInboxModalContentProps) {
  const [tab, setTab] = useState<PendingApprovalInboxTab>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const inboxQ = useQuery({
    queryKey: ['approval-user', 'approval-inbox'],
    queryFn: () => approvalRequestApi.listApprovalInbox(),
    enabled: tab === 'all',
    staleTime: 30_000,
  });
  const pendingQ = useQuery({
    queryKey: ['approval-user', 'pending-approvals'],
    queryFn: () => approvalRequestApi.listPendingApprovals(),
    enabled: tab === 'pending',
    staleTime: 30_000,
  });
  const waitingQ = useQuery({
    queryKey: ['approval-user', 'approval-waiting'],
    queryFn: () => approvalRequestApi.listWaitingApprovals(),
    enabled: tab === 'waiting',
    staleTime: 30_000,
  });
  const actedQ = useQuery({
    queryKey: ['approval-user', 'acted-approvals'],
    queryFn: () => approvalRequestApi.listActedApprovals(),
    enabled: tab === 'acted',
    staleTime: 30_000,
  });

  const activeQuery =
    tab === 'all' ? inboxQ : tab === 'pending' ? pendingQ : tab === 'waiting' ? waitingQ : actedQ;
  const loading = activeQuery.isFetching;
  const err = activeQuery.error as Error | undefined;

  const pagedRows = useMemo(() => {
    const list = activeQuery.data ?? [];
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [activeQuery.data, page, pageSize]);

  const totalRows = activeQuery.data?.length ?? 0;

  const lineOpts = useMemo(() => ({ myMemberId, myMemberPositionId }), [myMemberId, myMemberPositionId]);

  const columns: ColumnsType<ApprovalRequestDetail> = useMemo(
    () => [
      {
        title: '작성일',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 150,
        render: (_: unknown, row) => (
          <Typography.Text className="tw-text-xs tw-text-slate-600">{formatDateTime(row.createdAt)}</Typography.Text>
        ),
      },
      {
        title: '요청자',
        key: 'requester',
        width: 100,
        ellipsis: true,
        render: (_: unknown, row) => (
          <Typography.Text className="tw-text-xs">{row.requesterName?.trim() || '—'}</Typography.Text>
        ),
      },
      {
        title: '작성자 소속',
        key: 'org',
        width: 120,
        ellipsis: true,
        render: (_: unknown, row) => (
          <Typography.Text type="secondary" className="tw-text-xs">
            {row.requesterOrganizationName?.trim() || '—'}
          </Typography.Text>
        ),
      },
      {
        title: '제목',
        key: 'subject',
        ellipsis: true,
        render: (_: unknown, row) => (
          <Typography.Text strong className="tw-text-xs">
            {getApprovalRequestSubjectLine(row) || '—'}
          </Typography.Text>
        ),
      },
      {
        title: '양식명',
        key: 'documentName',
        ellipsis: true,
        render: (_: unknown, row) => (
          <Typography.Text className="tw-text-xs tw-text-slate-700">
            {row.documentName?.trim() || '—'}
          </Typography.Text>
        ),
      },
      {
        title: '내 결재 상태',
        key: 'mine',
        width: 110,
        align: 'center',
        render: (_: unknown, row) => (
          <div className="tw-flex tw-justify-center">{myTurnBadge(tab, row, lineOpts)}</div>
        ),
      },
      {
        title: '결재 처리',
        key: 'act',
        width: 132,
        align: 'center',
        render: (_: unknown, row) => {
          if (tab === 'acted') {
            return (
              <Typography.Text type="secondary" className="tw-text-xs">
                —
              </Typography.Text>
            );
          }
          const ok = canApproveRow(tab, row, lineOpts);
          const line = findMyInboxApprovalLine(row, lineOpts);
          return (
            <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-center tw-gap-2">
              <Button
                type="primary"
                size="small"
                disabled={!ok}
                onClick={() => {
                  if (!line || !ok) return;
                  onStartApprove(line.approvalId);
                }}
              >
                승인
              </Button>
              <Button danger size="small" disabled={!ok} onClick={() => {
                  if (!line || !ok) return;
                  onStartReject(line.approvalId);
                }}>
                반려
              </Button>
            </div>
          );
        },
      },
      {
        title: '상세',
        key: 'detail',
        width: 64,
        align: 'center',
        render: (_: unknown, row) => (
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            aria-label="상세 보기"
            onClick={() => onOpenDetail(row.requestId)}
          />
        ),
      },
    ],
    [lineOpts, onOpenDetail, onStartApprove, onStartReject, tab],
  );

  return (
    <div className="tw-box-border tw-flex tw-h-full tw-min-h-0 tw-w-full tw-flex-col tw-gap-4 tw-overflow-hidden tw-bg-slate-50 tw-px-4 tw-pb-4 tw-pt-2">
      <Card
        size="small"
        className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden tw-rounded-lg tw-border-slate-200/80 tw-bg-white tw-shadow-sm"
        styles={{
          body: {
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: 16,
          },
        }}
      >
        <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-4">
          <div
            role="tablist"
            aria-label="결재함 구분"
            className="tw-flex tw-shrink-0 tw-flex-wrap tw-gap-6 tw-gap-y-2 sm:tw-gap-8"
          >
            {(
              [
                { key: 'all' as const, label: '전체' },
                { key: 'pending' as const, label: '결재 대기' },
                { key: 'waiting' as const, label: '결재 예정' },
                { key: 'acted' as const, label: '결재 완료' },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={clsx(
                  '-tw-mb-px tw-border-0 tw-bg-transparent tw-px-0 tw-pb-2 tw-text-sm tw-font-medium tw-outline-none tw-transition-colors',
                  'focus-visible:tw-ring-2 focus-visible:tw-ring-blue-500 focus-visible:tw-ring-offset-2',
                  tab === key
                    ? 'tw-border-b-2 tw-border-solid tw-border-blue-600 tw-text-blue-600'
                    : 'tw-border-b-2 tw-border-transparent tw-text-slate-600 hover:tw-text-slate-900',
                )}
                onClick={() => {
                  setTab(key);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {err ? (
            <Alert type="error" showIcon className="tw-shrink-0" message={err.message || '목록을 불러오지 못했습니다.'} />
          ) : null}

          <div className="tw-min-h-0 tw-flex-1 tw-overflow-auto">
            <Spin spinning={loading} className="tw-min-h-0 tw-w-full [&_.ant-spin-container]:tw-min-h-0">
              <Table<ApprovalRequestDetail>
                size="small"
                rowKey="requestId"
                columns={columns}
                dataSource={pagedRows}
                pagination={{
                  current: page,
                  pageSize,
                  total: totalRows,
                  showSizeChanger: true,
                  pageSizeOptions: [10, 15, 20, 50],
                  showTotal: (t) => `총 ${t}건`,
                  onChange: (p, ps) => {
                    setPage(p);
                    if (ps !== pageSize) setPageSize(ps);
                  },
                }}
                locale={{ emptyText: loading ? ' ' : '문서가 없습니다.' }}
                scroll={{ x: 'max-content' }}
                className="[&_.ant-table-thead>tr>th]:tw-bg-slate-50/90"
              />
            </Spin>
          </div>
        </div>
      </Card>
    </div>
  );
}
