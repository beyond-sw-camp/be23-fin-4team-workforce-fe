/** /app/payroll/negotiations 직원 본인 연봉 협상 이력
 *
 *  KPI 4장 (총 건수 / 적용 완료 / 진행중 / 평균 인상률)
 *  + 협상 이력 테이블 (현재→제안 비교 / 상태 / 적용일)
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  Empty,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type {
  NegotiationStatusCode,
  NegotiationTypeCode,
  SalaryNegotiation,
} from '@/features/salary-service/types';

const NEG_TYPE_KO: Record<string, string> = {
  REGULAR: '정기',
  PROMOTION: '승진',
  AD_HOC: '수시',
  RETENTION: '유지',
};

const NEG_STATUS_KO: Record<string, string> = {
  DRAFT: '초안',
  SUBMITTED: '진행중',
  APPROVED: '승인',
  REJECTED: '반려',
  APPLIED: '적용 완료',
};

const NEG_STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  APPLIED: 'gold',
};

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${Number(n).toLocaleString('ko-KR')}원`;
}

function formatPercent(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD') : String(v);
}

export function MyNegotiationHistoryPage() {
  const listQ = useQuery({
    queryKey: ['salary', 'negotiations', 'my'],
    queryFn: () => salaryApi.negotiation.listMine(),
    staleTime: 30_000,
  });
  const list = listQ.data ?? [];

  const stats = useMemo(() => {
    const total = list.length;
    const applied = list.filter((n) => n.status === 'APPLIED').length;
    const inProgress = list.filter(
      (n) => n.status === 'DRAFT' || n.status === 'SUBMITTED' || n.status === 'APPROVED',
    ).length;
    const appliedRates = list
      .filter((n) => n.status === 'APPLIED' && n.changeRate != null)
      .map((n) => n.changeRate as number);
    const avgRate = appliedRates.length
      ? appliedRates.reduce((a, b) => a + b, 0) / appliedRates.length
      : null;
    return { total, applied, inProgress, avgRate };
  }, [list]);

  const columns: ColumnsType<SalaryNegotiation> = [
    {
      title: '협상 종류',
      dataIndex: 'negotiationType',
      key: 'negotiationType',
      width: 90,
      render: (v: NegotiationTypeCode) => <Tag>{NEG_TYPE_KO[v] ?? v}</Tag>,
    },
    {
      title: '시즌',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 140,
      render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '현재 기본급',
      dataIndex: 'currentBaseSalary',
      key: 'currentBaseSalary',
      align: 'right',
      render: formatWon,
    },
    {
      title: '제안 기본급',
      dataIndex: 'proposedBaseSalary',
      key: 'proposedBaseSalary',
      align: 'right',
      render: (v: number | null) => <strong>{formatWon(v)}</strong>,
    },
    {
      title: '인상률',
      dataIndex: 'changeRate',
      key: 'changeRate',
      align: 'right',
      width: 100,
      render: (v: number | null) => {
        if (v == null) return '—';
        const cls =
          v > 0
            ? 'tw-text-emerald-600 tw-font-semibold'
            : v < 0
              ? 'tw-text-red-600 tw-font-semibold'
              : '';
        return <span className={cls}>{formatPercent(v)}</span>;
      },
    },
    {
      title: '적용일',
      dataIndex: 'proposedEffectiveFrom',
      key: 'proposedEffectiveFrom',
      width: 110,
      render: (v) => v ?? '—',
    },
    {
      title: '등록일',
      key: 'proposedAt',
      width: 110,
      render: (_, r) => formatDate(r.proposedAt ?? r.createdAt),
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: NegotiationStatusCode) => (
        <Tag color={NEG_STATUS_COLOR[v] ?? 'default'}>{NEG_STATUS_KO[v] ?? v}</Tag>
      ),
    },
    {
      title: '메모',
      dataIndex: 'decisionNote',
      key: 'decisionNote',
      ellipsis: true,
      render: (v: string | null, r) => {
        if (r.status === 'REJECTED' && v) {
          return <Typography.Text type="danger">{v}</Typography.Text>;
        }
        return v ?? <Typography.Text type="secondary">—</Typography.Text>;
      },
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          내 연봉 협상 이력
        </Typography.Title>
        <Typography.Text type="secondary" className="tw-text-xs">
          관리자가 등록한 본인 협상안만 조회됩니다. 회신/응답 화면은 제공되지 않습니다.
        </Typography.Text>
      </div>

      <div className="tw-grid tw-grid-cols-2 lg:tw-grid-cols-4 tw-gap-3">
        <Card size="small">
          <Statistic title="총 협상 건수" value={stats.total} suffix="건" />
        </Card>
        <Card size="small">
          <Statistic
            title="적용 완료"
            value={stats.applied}
            suffix="건"
            valueStyle={{ color: '#d4af37' }}
          />
        </Card>
        <Card size="small">
          <Statistic
            title="진행중"
            value={stats.inProgress}
            suffix="건"
            valueStyle={{ color: '#1677ff' }}
          />
        </Card>
        <Card size="small">
          <Statistic
            title="평균 인상률 (적용 기준)"
            value={
              stats.avgRate != null ? (stats.avgRate * 100).toFixed(2) : '—'
            }
            suffix={stats.avgRate != null ? '%' : ''}
            valueStyle={{
              color: stats.avgRate != null && stats.avgRate >= 0 ? '#10b981' : '#ef4444',
            }}
          />
        </Card>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Table<SalaryNegotiation>
          rowKey={(r) => r.negotiationId ?? Math.random().toString()}
          loading={listQ.isLoading}
          dataSource={list}
          columns={columns}
          pagination={{ pageSize: 20 }}
          size="small"
          locale={{
            emptyText: <Empty description="협상 이력이 없습니다." />,
          }}
        />
      </Card>
    </Space>
  );
}
