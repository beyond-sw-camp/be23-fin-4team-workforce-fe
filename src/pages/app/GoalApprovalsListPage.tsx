import { ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button, Card, Space, Table, Tag, Typography } from 'antd';
import { goalApi } from '@/features/goals/api/goalApi';
import type { GoalApprovalBundleSummary } from '@/features/goals/model/types';

const { Title, Text } = Typography;

function statusUi(s: string) {
  const u = (s ?? '').toLowerCase();
  if (u === 'approved' || u === 'completed') return { text: '완료', color: 'success' as const };
  if (u === 'rejected') return { text: '반려', color: 'error' as const };
  return { text: '대기', color: 'processing' as const };
}

export function GoalApprovalsListPage() {
  const navigate = useNavigate();
  const { data, isPending } = useQuery({
    queryKey: ['goal-approvals', 'list-page'],
    queryFn: () => goalApi.listApprovalRequests(),
  });

  const rows = data ?? [];

  return (
    <div className="tw-space-y-4 tw-p-4 md:tw-p-6">
      <Space className="tw-w-full tw-justify-between" wrap>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => void navigate({ to: '/app/performance' })}>
          성과·목표로
        </Button>
      </Space>
      <Card className="tw-rounded-2xl tw-border-slate-200/80">
        <Title level={4} className="!tw-mt-0">
          완료 제출 승인 대기함
        </Title>
        <Text type="secondary" className="!tw-mb-4 !tw-block !tw-text-sm">
          완료 제출로 올라온 승인 대기 목록입니다. 요청 ID를 눌러 상세에서 승인·반려할 수 있습니다.
        </Text>
        <Table<GoalApprovalBundleSummary>
          rowKey="requestId"
          loading={isPending}
          dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          columns={[
            {
              title: '요청 ID',
              dataIndex: 'requestId',
              key: 'requestId',
              ellipsis: true,
              render: (id: string) => (
                <Link
                  to="/app/performance/approvals/$requestId"
                  params={{ requestId: id }}
                  className="tw-break-all tw-font-medium tw-text-[#1e3a5f] tw-underline tw-underline-offset-2"
                >
                  {id}
                </Link>
              ),
            },
            {
              title: '상태',
              dataIndex: 'status',
              key: 'status',
              width: 120,
              render: (s: string) => {
                const u = statusUi(s);
                return <Tag color={u.color}>{u.text}</Tag>;
              },
            },
            {
              title: '목표 수',
              dataIndex: 'goalCount',
              key: 'goalCount',
              width: 100,
            },
            {
              title: '요청 시각',
              dataIndex: 'requestedAt',
              key: 'requestedAt',
              width: 220,
              render: (v?: string) => v ?? '—',
            },
            {
              title: '완료 보고 요약',
              dataIndex: 'completionSummary',
              key: 'completionSummary',
              ellipsis: true,
              render: (v?: string | null) => (v && v.trim() !== '' ? v : '—'),
            },
          ]}
        />
      </Card>
    </div>
  );
}
