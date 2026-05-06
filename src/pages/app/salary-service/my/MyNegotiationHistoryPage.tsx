/** /app/payroll/negotiations 직원 본인 연봉 협상 이력
 *
 *  KPI 4장 (총 건수 / 적용 완료 / 진행중 / 평균 인상률)
 *  + 협상 이력 테이블 (현재→제안 비교 / 상태 / 적용일)
 *  + SUBMITTED 상태 협상에 대한 수락/거절 응답 모달
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
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
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const NEG_TYPE_KO: Record<string, string> = {
  REGULAR: '정기',
  PROMOTION: '승진',
  AD_HOC: '수시',
  RETENTION: '유지',
};

const NEG_STATUS_KO: Record<string, string> = {
  DRAFT: '초안',
  SUBMITTED: '응답 대기',
  APPROVED: '수락',
  REJECTED: '거절',
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
  // BE 가 이미 % 단위(예: 2.86)로 저장하므로 100 곱하지 않음
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD') : String(v);
}

export function MyNegotiationHistoryPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<SalaryNegotiation | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const listQ = useQuery({
    queryKey: ['salary', 'negotiations', 'my'],
    queryFn: () => salaryApi.negotiation.listMine(),
    staleTime: 30_000,
  });
  const list = listQ.data ?? [];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['salary', 'negotiations', 'my'] });
  };

  const acceptM = useMutation({
    mutationFn: (id: string) => salaryApi.negotiation.acceptMine(id, null),
    onSuccess: () => {
      message.success('협상 제안을 수락했습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '수락 처리 실패'),
  });

  const rejectM = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      salaryApi.negotiation.rejectMine(v.id, v.reason),
    onSuccess: () => {
      message.success('협상 제안을 거절했습니다.');
      setRejectTarget(null);
      setRejectReason('');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '거절 처리 실패'),
  });

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
    {
      title: '응답',
      key: 'response',
      width: 140,
      render: (_, r) => {
        if (r.status !== 'SUBMITTED') return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Space size={4}>
            <Popconfirm
              title="협상 제안을 수락할까요?"
              description="수락하면 관리자가 적용 처리 시 새 기본급으로 다음 정기급여부터 반영됩니다."
              okText="수락"
              cancelText="취소"
              onConfirm={() => r.negotiationId && acceptM.mutate(r.negotiationId)}
            >
              <Button type="primary" size="small" loading={acceptM.isPending}>
                수락
              </Button>
            </Popconfirm>
            <Button
              danger
              size="small"
              onClick={() => {
                setRejectTarget(r);
                setRejectReason('');
              }}
            >
              거절
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        eyebrow="PAYROLL"
        title="내 연봉 협상 이력"
        subtitle="관리자가 등록한 협상안을 검토하고 수락 또는 거절로 응답할 수 있습니다."
      />

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
            value={stats.avgRate != null ? stats.avgRate.toFixed(2) : '—'}
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

      <AppDoubleActionModal
        open={rejectTarget !== null}
        title="협상 제안 거절"
        confirmText="거절 확정"
        confirmDanger
        confirmDisabled={!rejectReason.trim()}
        cancelText="취소"
        confirmLoading={rejectM.isPending}
        onClose={() => {
          setRejectTarget(null);
          setRejectReason('');
        }}
        onConfirm={() => {
          if (!rejectTarget?.negotiationId || !rejectReason.trim()) return;
          rejectM.mutate({ id: rejectTarget.negotiationId, reason: rejectReason.trim() });
        }}
        destroyOnHidden
      >
        {rejectTarget && (
          <Space direction="vertical" className="tw-w-full tw-px-5 tw-py-4" size="middle">
            <div className="tw-rounded-md tw-bg-slate-50 tw-p-3 tw-text-sm">
              <div>
                <Typography.Text type="secondary">현재 기본급: </Typography.Text>
                <Typography.Text>{formatWon(rejectTarget.currentBaseSalary)}</Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary">제안 기본급: </Typography.Text>
                <Typography.Text strong>
                  {formatWon(rejectTarget.proposedBaseSalary)}
                </Typography.Text>
              </div>
            </div>
            <div>
              <Typography.Text strong>거절 사유 (필수)</Typography.Text>
              <Input.TextArea
                rows={4}
                maxLength={500}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="예: 기대 인상폭 대비 부족, 시장 평균 수준 미달 등"
                showCount
                className="!tw-mt-2"
              />
            </div>
            <Typography.Text type="secondary" className="!tw-text-xs">
              거절 후에는 동일 협상 제안을 다시 응답할 수 없습니다. 관리자가 새 협상안을 등록해야
              재협상이 가능합니다.
            </Typography.Text>
          </Space>
        )}
      </AppDoubleActionModal>
    </Space>
  );
}
