import { FileSearchOutlined, SendOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { goalApi } from '@/features/goals/api/goalApi';
import type { GoalApprovalBundleSummary } from '@/features/goals/model/types';
import { GoalApprovalDetailView } from '@/features/goals/ui/GoalApprovalDetailView';
import { useAuth } from '@/features/auth/useAuth';
import clsx from 'clsx';

const { Text } = Typography;

function statusUi(s: string) {
  const u = (s ?? '').toLowerCase();
  if (u === 'approved' || u === 'completed') return { text: '완료', color: 'success' as const };
  if (u === 'rejected') return { text: '반려', color: 'error' as const };
  return { text: '대기', color: 'processing' as const };
}

const summaryColumns: ColumnsType<GoalApprovalBundleSummary> = [
  {
    title: '요청 ID',
    dataIndex: 'requestId',
    key: 'requestId',
    ellipsis: true,
    render: (id: string) => (
      <span className="tw-font-mono tw-text-xs tw-text-slate-700">{id.slice(0, 12)}…</span>
    ),
  },
  {
    title: '상태',
    dataIndex: 'status',
    key: 'status',
    width: 100,
    render: (s: string) => {
      const u = statusUi(s);
      return <Tag color={u.color}>{u.text}</Tag>;
    },
  },
  { title: '목표 수', dataIndex: 'goalCount', key: 'goalCount', width: 88 },
  {
    title: '요청 시각',
    dataIndex: 'requestedAt',
    key: 'requestedAt',
    width: 200,
    render: (v?: string) => (v && v.trim() !== '' ? v : '—'),
  },
  {
    title: '완료 보고 요약',
    dataIndex: 'completionSummary',
    key: 'completionSummary',
    ellipsis: true,
    render: (v?: string | null) => (v && v.trim() !== '' ? v : '—'),
  },
];

const tableWrapClass =
  'tw-rounded-xl tw-border tw-border-slate-100 tw-bg-white tw-shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]';
const tableClassName =
  '[&_.ant-table-thead>tr>th]:!tw-bg-slate-50/90 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600';

function TabCount({ loading, n }: { loading: boolean; n: number }) {
  if (loading) {
    return (
      <span className="tw-inline-flex tw-min-w-[1.5rem] tw-items-center tw-justify-center tw-rounded-md tw-bg-slate-100 tw-px-1.5 tw-py-0.5 tw-text-[11px] tw-text-slate-400">
        …
      </span>
    );
  }
  return (
    <span className="tw-inline-flex tw-min-w-[1.5rem] tw-items-center tw-justify-center tw-rounded-md tw-bg-slate-100 tw-px-1.5 tw-py-0.5 tw-text-xs tw-font-semibold tw-tabular-nums tw-text-slate-600">
      {n}
    </span>
  );
}

type GoalApprovalCenterPanelProps = {
  /** 상단 안내 문구 (전용 페이지 등) */
  showIntro?: boolean;
  /** 성과 화면 모달 안에서 열릴 때 레이아웃·여백 조정 */
  embeddedInModal?: boolean;
};

/**
 * 승인 센터 본문 — 전용 페이지 또는 성과 화면 모달 안에서 공통 사용.
 */
export function GoalApprovalCenterPanel({
  showIntro = true,
  embeddedInModal = false,
}: GoalApprovalCenterPanelProps) {
  const { user } = useAuth();
  const companyId = user?.companyId?.trim();

  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [detailSource, setDetailSource] = useState<'pending' | 'history'>('pending');

  const pendingQuery = useQuery({
    queryKey: ['goal-approvals', 'pending', companyId],
    queryFn: () => goalApi.listApprovalRequests(),
    enabled: Boolean(companyId),
  });
  const historyQuery = useQuery({
    queryKey: ['goal-approvals', 'history', companyId],
    queryFn: () => goalApi.listApprovalRequestsHistory(),
    enabled: Boolean(companyId),
  });

  const pendingRows = pendingQuery.data ?? [];
  const historyRows = historyQuery.data ?? [];

  const closeDetail = () => {
    setDetailRequestId(null);
    setDetailSource('pending');
  };

  const pendingTable = (
    <>
      <div className={tableWrapClass}>
        <Table<GoalApprovalBundleSummary>
          rowKey="requestId"
          loading={pendingQuery.isPending}
          dataSource={pendingRows}
          pagination={{ pageSize: 10, showSizeChanger: true, size: 'small' }}
          size="small"
          columns={summaryColumns}
          locale={{ emptyText: '대기 중인 승인 요청이 없습니다.' }}
          className={tableClassName}
          scroll={{ x: 'max-content' }}
          onRow={(r) => ({
            onClick: () => {
              setDetailSource('pending');
              setDetailRequestId(r.requestId);
            },
            className: 'tw-cursor-pointer hover:!tw-bg-[#f8fafc]',
          })}
        />
      </div>
      <Text type="secondary" className="tw-mt-3 tw-block tw-text-xs tw-text-slate-500">
        행을 누르면 상세에서 승인·반려할 수 있습니다.
      </Text>
    </>
  );

  const historyTable = (
    <>
      <div className={tableWrapClass}>
        <Table<GoalApprovalBundleSummary>
          rowKey="requestId"
          loading={historyQuery.isPending}
          dataSource={historyRows}
          pagination={{ pageSize: 10, showSizeChanger: true, size: 'small' }}
          size="small"
          columns={summaryColumns}
          locale={{ emptyText: '요청 이력이 없습니다.' }}
          className={tableClassName}
          scroll={{ x: 'max-content' }}
          onRow={(r) => ({
            onClick: () => {
              setDetailSource('history');
              setDetailRequestId(r.requestId);
            },
            className: 'tw-cursor-pointer hover:!tw-bg-[#f8fafc]',
          })}
        />
      </div>
      <Text type="secondary" className="tw-mt-3 tw-block tw-text-xs tw-text-slate-500">
        행을 누르면 상세 내용을 확인할 수 있습니다.
      </Text>
    </>
  );

  return (
    <div className={clsx(embeddedInModal ? 'tw-space-y-3' : 'tw-space-y-4')}>
      {showIntro ? (
        <p className="!tw-mb-0 tw-text-sm tw-leading-relaxed tw-text-slate-500">
          탭을 전환해 처리할 승인과 보낸 요청을 각각 확인할 수 있습니다.
        </p>
      ) : null}

      <Tabs
        defaultActiveKey="pending"
        className={clsx(
          '[&_.ant-tabs-nav]:!tw-mb-3',
          '[&_.ant-tabs-tab]:!tw-py-2',
          '[&_.ant-tabs-tab-active_.ant-tabs-tab-btn]:!tw-text-[#1e3a5f]',
          '[&_.ant-tabs-ink-bar]:!tw-bg-[#3b82f6]',
        )}
        items={[
          {
            key: 'pending',
            label: (
              <span className="tw-inline-flex tw-items-center tw-gap-2">
                <FileSearchOutlined className="tw-text-[15px] tw-text-slate-400" />
                <span className="tw-font-medium">내가 처리할 승인</span>
                <TabCount loading={pendingQuery.isPending} n={pendingRows.length} />
              </span>
            ),
            children: pendingTable,
          },
          {
            key: 'history',
            label: (
              <span className="tw-inline-flex tw-items-center tw-gap-2">
                <SendOutlined className="tw-text-[15px] tw-text-slate-400" />
                <span className="tw-font-medium">내가 보낸 요청</span>
                <TabCount loading={historyQuery.isPending} n={historyRows.length} />
              </span>
            ),
            children: historyTable,
          },
        ]}
      />

      <Modal
        title={<span className="tw-text-[15px] tw-font-semibold tw-text-[#0f172a]">완료 제출 승인</span>}
        open={detailRequestId != null}
        onCancel={closeDetail}
        footer={null}
        width="min(960px, calc(100vw - 24px))"
        destroyOnClose
        centered
        zIndex={1200}
        classNames={{ content: '!tw-rounded-2xl' }}
        styles={{
          header: {
            marginBottom: 0,
            paddingBottom: 12,
            borderBottom: '1px solid rgb(241 245 249)',
          },
          body: { maxHeight: 'min(80vh, 720px)', overflowY: 'auto', paddingTop: 12 },
        }}
      >
        {detailRequestId ? (
          <GoalApprovalDetailView
            requestId={detailRequestId}
            onClose={closeDetail}
            showDecisionActions={detailSource === 'pending'}
          />
        ) : null}
      </Modal>
    </div>
  );
}
