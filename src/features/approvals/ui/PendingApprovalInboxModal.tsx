import {
  useQuery } from '@tanstack/react-query';
import { Alert,
  Button,
  Card,
  Spin,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import {
  approvalRequestApi,
  findMyInboxApprovalLine,
  isInlineSyntheticApprovalId,
  type ApprovalRequestDetail,
} from '@/features/approvals/api/approvalRequestApi';
import { getApprovalRequestSubjectLine } from '@/features/approvals/lib/approvalFormSchema';
import { ApprovalLineMiniStrip } from '@/features/approvals/ui/ApprovalLineMiniStrip';

import { AppDataTable } from '@/shared/ui/AppDataTable';

/** 전체(inbox) · 결재 대기(pending) · 결재 예정(waiting) · 결재 완료(acted) */
export type PendingApprovalInboxTab = 'all' | 'pending' | 'waiting' | 'acted';
type PendingApprovalInboxKind = Exclude<PendingApprovalInboxTab, 'all'>;
type PendingApprovalInboxRow = ApprovalRequestDetail & {
  inboxKind: PendingApprovalInboxKind;
};
type PendingApprovalStatusFilter = 'pending' | 'waiting' | 'approved' | 'rejected' | 'acted';

function formatDateTime(value?: string | null) {
  if (!value?.trim()) return '—';
  const d = dayjs.utc(value).tz('Asia/Seoul');
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '—';
}

function myTurnBadge(
  kind: PendingApprovalInboxKind,
  row: PendingApprovalInboxRow,
  opts: { myMemberId?: string; myMemberPositionId?: string },
) {
  if (kind === 'acted') {
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
  if (kind === 'waiting') {
    return (
      <Tag color="processing" className="!tw-m-0">
        대기 중
      </Tag>
    );
  }
  if (kind === 'pending') {
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

function getRowStatusFilter(
  row: PendingApprovalInboxRow,
  opts: { myMemberId?: string; myMemberPositionId?: string },
): PendingApprovalStatusFilter {
  if (row.inboxKind === 'pending') return 'pending';
  if (row.inboxKind === 'waiting') return 'waiting';
  const line = findMyInboxApprovalLine(row, opts);
  const st = String(line?.approvalStatus ?? '').toUpperCase();
  if (st === 'APPROVED') return 'approved';
  if (st === 'REJECTED') return 'rejected';
  return 'acted';
}

function canApproveRow(
  kind: PendingApprovalInboxKind,
  row: PendingApprovalInboxRow,
  opts: { myMemberId?: string; myMemberPositionId?: string },
): boolean {
  if (kind === 'waiting' || kind === 'acted') return false;
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const pendingQ = useQuery({
    queryKey: ['approval-user', 'pending-approvals'],
    queryFn: () => approvalRequestApi.listPendingApprovals(),
    staleTime: 30_000,
  });
  const waitingQ = useQuery({
    queryKey: ['approval-user', 'approval-waiting'],
    queryFn: () => approvalRequestApi.listWaitingApprovals(),
    staleTime: 30_000,
  });
  const actedQ = useQuery({
    queryKey: ['approval-user', 'acted-approvals'],
    queryFn: () => approvalRequestApi.listActedApprovals(),
    staleTime: 30_000,
  });

  const loading = pendingQ.isFetching || waitingQ.isFetching || actedQ.isFetching;
  const err = (pendingQ.error ?? waitingQ.error ?? actedQ.error) as Error | undefined;

  const allRows = useMemo<PendingApprovalInboxRow[]>(() => {
    const seen = new Set<string>();
    const merge = (kind: PendingApprovalInboxKind, rows: ApprovalRequestDetail[] | undefined) =>
      (rows ?? [])
        .filter((row) => {
          if (seen.has(row.requestId)) return false;
          seen.add(row.requestId);
          return true;
        })
        .map((row) => ({ ...row, inboxKind: kind }));

    return [
      ...merge('pending', pendingQ.data),
      ...merge('waiting', waitingQ.data),
      ...merge('acted', actedQ.data),
    ].sort((a, b) => {
      const aTime = dayjs(a.createdAt).valueOf() || 0;
      const bTime = dayjs(b.createdAt).valueOf() || 0;
      return bTime - aTime;
    });
  }, [actedQ.data, pendingQ.data, waitingQ.data]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return allRows.slice(start, start + pageSize);
  }, [allRows, page, pageSize]);

  const totalRows = allRows.length;

  const lineOpts = useMemo(() => ({ myMemberId, myMemberPositionId }), [myMemberId, myMemberPositionId]);

  const columns: ColumnsType<PendingApprovalInboxRow> = useMemo(
    () => [
      {
        title: '구분',
        key: 'inboxKind',
        width: 96,
        align: 'center',
        filters: [
          { text: '결재 대기', value: 'pending' },
          { text: '결재 예정', value: 'waiting' },
          { text: '결재 완료', value: 'acted' },
        ],
        onFilter: (value, row) => row.inboxKind === value,
        render: (_: unknown, row) =>
          row.inboxKind === 'pending' ? (
            <Tag color="gold" className="!tw-m-0">
              결재 대기
            </Tag>
          ) : row.inboxKind === 'waiting' ? (
            <Tag color="processing" className="!tw-m-0">
              결재 예정
            </Tag>
          ) : (
            <Tag color="success" className="!tw-m-0">
              결재 완료
            </Tag>
          ),
      },
      {
        title: '상태',
        key: 'status',
        width: 96,
        align: 'center',
        filters: [
          { text: '결재 대기', value: 'pending' },
          { text: '대기 중', value: 'waiting' },
          { text: '승인', value: 'approved' },
          { text: '반려', value: 'rejected' },
          { text: '처리함', value: 'acted' },
        ],
        onFilter: (value, row) => getRowStatusFilter(row, lineOpts) === value,
        render: (_: unknown, row) => (
          <div className="tw-flex tw-justify-center">{myTurnBadge(row.inboxKind, row, lineOpts)}</div>
        ),
      },
      {
        title: '제목',
        key: 'subject',
        ellipsis: true,
        render: (_: unknown, row) => (
          <Typography.Text strong className="!tw-block tw-min-w-0 tw-truncate tw-text-xs">
            {getApprovalRequestSubjectLine(row) || row.documentName?.trim() || '—'}
          </Typography.Text>
        ),
      },
      {
        title: '요청자',
        key: 'requester',
        width: 92,
        ellipsis: true,
        render: (_: unknown, row) => (
          <Typography.Text type="secondary" className="!tw-block tw-truncate tw-text-xs">
            {row.requesterName?.trim() || '요청자 미상'}
          </Typography.Text>
        ),
      },
      {
        title: '결재선',
        key: 'approvalLine',
        width: 240,
        render: (_: unknown, row) => <ApprovalLineMiniStrip lines={row.approvalLines} visibleSlots={0} />,
      },
      {
        title: '기안일',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 132,
        render: (_: unknown, row) => (
          <Typography.Text className="tw-whitespace-nowrap tw-text-xs tw-text-slate-600">
            {formatDateTime(row.createdAt)}
          </Typography.Text>
        ),
      },
      {
        title: '결재 처리',
        key: 'manage',
        width: 116,
        align: 'center',
        render: (_: unknown, row) => {
          const line = findMyInboxApprovalLine(row, lineOpts);
          const ok = canApproveRow(row.inboxKind, row, lineOpts);
          if (row.inboxKind === 'acted') {
            return <Typography.Text type="secondary">—</Typography.Text>;
          }
          return (
            <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-center tw-gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                type="primary"
                size="small"
                disabled={!ok}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!line || !ok) return;
                  onStartApprove(line.approvalId);
                }}
              >
                승인
              </Button>
              <Button danger size="small" disabled={!ok} onClick={(e) => {
                  e.stopPropagation();
                  if (!line || !ok) return;
                  onStartReject(line.approvalId);
                }}>
                반려
              </Button>
            </div>
          );
        },
      },
    ],
    [lineOpts, onStartApprove, onStartReject],
  );

  return (
    <div className="wf-approval-embed-root">
      <Card
        size="small"
        className="wf-approval-embed-card"
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
          {err ? (
            <Alert type="error" showIcon className="tw-shrink-0" message={err.message || '목록을 불러오지 못했습니다.'} />
          ) : null}

          <div className="wf-approval-modal-table-fill">
            <Spin spinning={loading} className="tw-min-h-0 tw-w-full [&_.ant-spin-container]:tw-min-h-0">
              <AppDataTable<PendingApprovalInboxRow>
                size="small"
                rowKey="requestId"
                columns={columns}
                dataSource={pagedRows}
                onRow={(record) => ({
                  onClick: () => onOpenDetail(record.requestId),
                  style: { cursor: 'pointer' },
                })}
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
              tableLayout="auto"
                className="wf-approval-modal-table"
              />
            </Spin>
          </div>
        </div>
      </Card>
    </div>
  );
}
