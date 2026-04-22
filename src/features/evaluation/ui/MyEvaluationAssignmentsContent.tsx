import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Avatar, Button, Card, Empty, Segmented, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { EVALUATION_PAGE_KO as L } from '@/app/locale/app-ko';
import { evaluationApi } from '@/features/evaluation/api/evaluationApi';
import { evalTypeLabel, responseStatusTag } from '@/features/evaluation/lib/evaluationLabels';
import type { EvaluationResponse, EvaluationStatus } from '@/features/evaluation/model/types';

const { Text } = Typography;

type FilterKey = 'all' | 'todo' | 'done';

function statusSortOrder(s: EvaluationStatus): number {
  if (s === 'IN_PROGRESS') return 0;
  if (s === 'NOT_STARTED') return 1;
  return 2;
}

export type MyEvaluationAssignmentsContentProps = {
  /** 작성 화면으로 이동하기 직전(모달 닫기 등) */
  onBeforeNavigateWrite?: () => void;
};

export function MyEvaluationAssignmentsContent({ onBeforeNavigateWrite }: MyEvaluationAssignmentsContentProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>('all');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['eval-my-responses'],
    queryFn: () => evaluationApi.listMyResponses(),
  });

  const filtered = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const d = statusSortOrder(a.status) - statusSortOrder(b.status);
      if (d !== 0) return d;
      const sa = a.seasonName ?? '';
      const sb = b.seasonName ?? '';
      if (sa !== sb) return sa.localeCompare(sb, 'ko');
      const na = a.targetMemberName ?? '';
      const nb = b.targetMemberName ?? '';
      return na.localeCompare(nb, 'ko');
    });
    if (filter === 'todo') return list.filter((r) => r.status !== 'SUBMITTED');
    if (filter === 'done') return list.filter((r) => r.status === 'SUBMITTED');
    return list;
  }, [rows, filter]);

  const emptyText =
    filter === 'todo' && rows.length > 0 ? L.myAssignmentsEmptyTodo : L.myAssignmentsEmpty;

  const goWrite = (responseId: string) => {
    onBeforeNavigateWrite?.();
    void navigate({
      to: '/app/evaluations/$responseId/write',
      params: { responseId },
    });
  };

  const columns: ColumnsType<EvaluationResponse> = [
    {
      title: L.evaluationTarget,
      key: 'target',
      width: 280,
      render: (_: unknown, r: EvaluationResponse) => {
        const name = r.targetMemberName ?? `대상자 #${r.targetMemberId.slice(0, 8)}`;
        return (
          <Space size={12} className="tw-w-full tw-min-w-0">
            <Avatar size={40} src={r.targetMemberProfileUrl} icon={<UserOutlined />} />
            <div className="tw-min-w-0">
              <div className="tw-truncate tw-font-semibold tw-text-slate-900">{name}</div>
              {r.targetMemberDepartment && (
                <Text type="secondary" className="tw-block tw-truncate tw-text-xs">
                  {r.targetMemberDepartment}
                </Text>
              )}
            </div>
          </Space>
        );
      },
    },
    {
      title: L.evaluationType,
      dataIndex: 'evaluationType',
      key: 'evaluationType',
      width: 100,
      render: (t: EvaluationResponse['evaluationType']) => (
        <span className="tw-text-sm tw-text-slate-700">{evalTypeLabel(t)}</span>
      ),
    },
    {
      title: L.myAssignmentsColSeason,
      key: 'season',
      width: 200,
      render: (_: unknown, r: EvaluationResponse) => (
        <span className="tw-text-sm tw-text-slate-700">{r.seasonName ?? '—'}</span>
      ),
    },
    {
      title: L.evaluationStatus,
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: EvaluationStatus) => responseStatusTag(s),
    },
    {
      title: L.myAssignmentsColSubmittedAt,
      key: 'submittedAt',
      width: 120,
      render: (_: unknown, r: EvaluationResponse) =>
        r.status === 'SUBMITTED' && r.submittedAt ? (
          <span className="tw-text-sm tw-text-slate-600">{dayjs(r.submittedAt).format('YYYY-MM-DD')}</span>
        ) : (
          <span className="tw-text-sm tw-text-slate-400">—</span>
        ),
    },
    {
      title: L.evaluationAction,
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_: unknown, r: EvaluationResponse) => {
        const label =
          r.status === 'SUBMITTED'
            ? L.myAssignmentsActionView
            : r.status === 'IN_PROGRESS'
              ? L.myAssignmentsActionContinue
              : L.myAssignmentsActionStart;
        return (
          <Button type={r.status === 'SUBMITTED' ? 'default' : 'primary'} onClick={() => goWrite(r.responseId)}>
            {label}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="tw-space-y-4">
      <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
        <Text type="secondary" className="!tw-m-0 tw-text-sm">
          {L.myAssignmentsSubtitle}
        </Text>
        <Segmented<FilterKey>
          value={filter}
          onChange={setFilter}
          options={[
            { label: L.myAssignmentsFilterAll, value: 'all' },
            { label: L.myAssignmentsFilterTodo, value: 'todo' },
            { label: L.myAssignmentsFilterDone, value: 'done' },
          ]}
        />
      </div>

      <Card className="!tw-border-slate-200/90 tw-shadow-none" styles={{ body: { padding: 12 } }}>
        {filtered.length === 0 && !isLoading ? (
          <Empty className="tw-py-12" description={emptyText} />
        ) : (
          <Table<EvaluationResponse>
            rowKey="responseId"
            columns={columns}
            dataSource={filtered}
            loading={isLoading}
            pagination={{ pageSize: 12, showSizeChanger: true, pageSizeOptions: [12, 24, 48] }}
            scroll={{ x: 900 }}
            size="small"
          />
        )}
      </Card>
    </div>
  );
}
