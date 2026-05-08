/** /app/personnel-order/my - 직원 본인 발령 이력 조회
 *  부서 이동 / 직급 변경 / 직책 변경 시간순 (최신부터)
 */
import {
  useQuery } from '@tanstack/react-query';
import { Card,
  Empty,
  Space,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AppDataTable } from '@/shared/ui/AppDataTable';

import {
  personnelOrderApi,
  type PersonnelOrder,
  type PersonnelOrderType,
} from '@/features/personnel/api/personnelOrderApi';

const TYPE_KO: Record<PersonnelOrderType, string> = {
  TRANSFER: '부서 이동',
  PROMOTION: '승진',
  DEMOTION: '강등',
  REASSIGN: '보직 변경',
  ROLE_CHANGE: '복합 변경',
};

const TYPE_COLOR: Record<PersonnelOrderType, string> = {
  TRANSFER: 'blue',
  PROMOTION: 'green',
  DEMOTION: 'red',
  REASSIGN: 'gold',
  ROLE_CHANGE: 'purple',
};

export function MyPersonnelOrderHistoryPage() {
  const listQ = useQuery({
    queryKey: ['personnel-order', 'my'],
    queryFn: () => personnelOrderApi.listMine(),
    staleTime: 60_000,
  });
  const list = listQ.data ?? [];

  const cols: ColumnsType<PersonnelOrder> = [
    {
      title: '효력일',
      dataIndex: 'effectiveDate',
      width: 120,
      render: (v: string) => v ?? '—',
    },
    {
      title: '발령 유형',
      dataIndex: 'orderType',
      width: 110,
      render: (v: PersonnelOrderType) => (
        <Tag color={TYPE_COLOR[v]}>{TYPE_KO[v] ?? v}</Tag>
      ),
    },
    {
      title: '부서',
      key: 'org',
      render: (_, r) => {
        if (!r.beforeOrganizationName && !r.afterOrganizationName) return '—';
        return (
          <span className="tw-text-sm">
            <Tag>{r.beforeOrganizationName ?? '—'}</Tag>
            <span className="tw-mx-1 tw-text-slate-400">→</span>
            <Tag color="processing">{r.afterOrganizationName ?? '—'}</Tag>
          </span>
        );
      },
    },
    {
      title: '직급',
      key: 'jobGrade',
      render: (_, r) => {
        if (!r.beforeJobGradeName && !r.afterJobGradeName) return '—';
        return (
          <span className="tw-text-sm">
            <Tag>{r.beforeJobGradeName ?? '—'}</Tag>
            <span className="tw-mx-1 tw-text-slate-400">→</span>
            <Tag color="gold">{r.afterJobGradeName ?? '—'}</Tag>
          </span>
        );
      },
    },
    {
      title: '직책',
      key: 'jobTitle',
      render: (_, r) => {
        if (!r.beforeJobTitleName && !r.afterJobTitleName) return '—';
        return (
          <span className="tw-text-sm">
            <Tag>{r.beforeJobTitleName ?? '—'}</Tag>
            <span className="tw-mx-1 tw-text-slate-400">→</span>
            <Tag color="cyan">{r.afterJobTitleName ?? '—'}</Tag>
          </span>
        );
      },
    },
    {
      title: '사유',
      dataIndex: 'reason',
      ellipsis: true,
      render: (v: string | null) => v ?? '—',
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0">
          내 인사발령 이력
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          본인 부서 이동 / 직급·직책 변경 이력입니다 (최신순). 결재 통과로 자동 적용된 발령만
          표시됩니다.
        </Typography.Paragraph>
      </div>
      <Card size="small">
        <AppDataTable<PersonnelOrder>
          rowKey={(r) => r.personnelOrderId}
          loading={listQ.isLoading}
          dataSource={list}
          columns={cols}
          pagination={{ pageSize: 20 }}
          size="small"
          locale={{ emptyText: <Empty description="발령 이력이 없습니다." /> }}
        />
      </Card>
    </Space>
  );
}
