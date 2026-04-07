import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Segmented, Space, Table, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { EsgCampaign, EsgCampaignStatus } from '@/features/esg/api/esgApi';
import { esgApi } from '@/features/esg/api/esgApi';
import {
  formatCampaignCreatedAt,
  formatCampaignDateRange,
  formatCampaignStatusKo,
  pickCampaignId,
  resolveCampaignCategoryDisplay,
} from '@/features/esg/esgCampaignDisplay';

type CampaignFilter = 'ALL' | 'ACTIVE' | 'CLOSED';

export function EsgCampaignsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<CampaignFilter>('ACTIVE');

  const statusParam = useMemo((): EsgCampaignStatus | undefined => {
    if (filter === 'ALL') return undefined;
    return filter;
  }, [filter]);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['esg', 'campaigns', statusParam ?? 'ALL'],
    queryFn: () => esgApi.listCampaigns(statusParam),
  });

  const joinM = useMutation({
    mutationFn: (id: string) => esgApi.joinCampaign(id),
    onSuccess: () => {
      message.success('캠페인에 참여했습니다.');
      void qc.invalidateQueries({ queryKey: ['esg', 'campaigns'] });
    },
    onError: (e: Error) => message.error(e.message || '참여에 실패했습니다.'),
  });

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
        ESG 캠페인
      </Typography.Title>
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Space direction="vertical" className="tw-w-full" size={12}>
          <Segmented<CampaignFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { label: '전체', value: 'ALL' },
              { label: '진행', value: 'ACTIVE' },
              { label: '종료', value: 'CLOSED' },
            ]}
          />
          <Table<EsgCampaign>
            rowKey={(r) => pickCampaignId(r) || JSON.stringify(r)}
            loading={isLoading}
            dataSource={list}
            scroll={{ x: 1200 }}
            columns={[
              { title: '제목', dataIndex: 'title', width: 160, ellipsis: true },
              {
                title: '설명',
                dataIndex: 'description',
                ellipsis: true,
                render: (v: unknown) =>
                  typeof v === 'string' && v.trim() ? v.trim() : <Typography.Text type="secondary">—</Typography.Text>,
              },
              {
                title: 'ESG 분류',
                key: 'category',
                width: 200,
                ellipsis: true,
                render: (_, row) => resolveCampaignCategoryDisplay(row),
              },
              {
                title: '상태',
                key: 'status',
                width: 88,
                render: (_, row) => formatCampaignStatusKo(row.status),
              },
              {
                title: '기간',
                key: 'range',
                width: 200,
                render: (_, row) => formatCampaignDateRange(row),
              },
              {
                title: '보상',
                dataIndex: 'rewardPoints',
                width: 80,
                render: (v: unknown) => {
                  if (v == null || v === '') return '—';
                  const n = Number(v);
                  return Number.isFinite(n) ? `${n}P` : '—';
                },
              },
              {
                title: '최대 인원',
                dataIndex: 'maxParticipants',
                width: 96,
                render: (v: unknown) => {
                  if (v == null || v === '') return '—';
                  const n = Number(v);
                  return Number.isFinite(n) ? n : '—';
                },
              },
              {
                title: '등록일',
                key: 'createdAt',
                width: 140,
                render: (_, row) => formatCampaignCreatedAt(row),
              },
              {
                title: '',
                key: 'act',
                width: 100,
                render: (_, row) => {
                  const id = pickCampaignId(row);
                  if (!id) return null;
                  const st = String(row.status ?? '').toUpperCase();
                  if (st !== 'ACTIVE') {
                    return <Typography.Text type="secondary">—</Typography.Text>;
                  }
                  return (
                    <Button size="small" type="primary" loading={joinM.isPending} onClick={() => joinM.mutate(id)}>
                      참여
                    </Button>
                  );
                },
              },
            ]}
          />
        </Space>
      </Card>
    </Space>
  );
}
