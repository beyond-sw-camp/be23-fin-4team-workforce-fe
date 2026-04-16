/**
 * /app/payroll/$payrollId
 * 본인 급여만 조회. 남 대장이면 관리자 아닐 때 /app/payroll 로 돌려보냄.
 */
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { PayrollItem } from '@/features/salary-service/types';

const STATUS_KO: Record<string, string> = {
  DRAFT: '작성 중',
  CONFIRMED: '확정',
  PAID: '지급 완료',
};

const ITEM_TYPE_KO: Record<string, string> = {
  EARNING: '지급',
  DEDUCTION: '공제',
};

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

export function PayrollDetailPage() {
  const { payrollId } = useParams({ strict: false }) as { payrollId: string };
  const { user } = useAuth();
  const navigate = useNavigate();

  const payrollQ = useQuery({
    queryKey: ['salary', 'payroll', payrollId],
    queryFn: () => salaryApi.payroll.getById(payrollId),
    enabled: Boolean(payrollId),
  });

  const payroll = payrollQ.data;
  const canViewPayroll = Boolean(
    payroll && user?.id && (payroll.memberId === user.id || user.isSystemAdmin === true),
  );

  const itemsQ = useQuery({
    queryKey: ['salary', 'payroll', payrollId, 'items'],
    queryFn: () => salaryApi.payroll.listItems(payrollId),
    enabled: Boolean(payrollId) && canViewPayroll,
  });

  useEffect(() => {
    if (!payroll || !user?.id) return;
    const mine = payroll.memberId === user.id;
    const admin = user.isSystemAdmin === true;
    if (!mine && !admin) {
      void navigate({ to: '/app/payroll' });
    }
  }, [payroll, user?.id, user?.isSystemAdmin, navigate]);

  const itemColumns: ColumnsType<PayrollItem> = useMemo(
    () => [
      { title: '항목', dataIndex: 'itemName', key: 'itemName' },
      {
        title: '유형',
        dataIndex: 'itemType',
        key: 'itemType',
        render: (t: string) => ITEM_TYPE_KO[t] ?? t ?? '—',
      },
      {
        title: '금액',
        dataIndex: 'amount',
        key: 'amount',
        align: 'right',
        render: (v: number) => formatWon(v),
      },
    ],
    [],
  );

  const sortedItems = useMemo(() => {
    const list = itemsQ.data ?? [];
    return [...list].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }, [itemsQ.data]);

  if (!payrollId) {
    return <Typography.Text type="danger">급여대장 ID가 없습니다.</Typography.Text>;
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
        <Link to="/app/payroll" className="tw-text-sm tw-text-[#2563EB]">
          ← 급여 목록
        </Link>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="급여대장 요약" loading={payrollQ.isLoading}>
        {payrollQ.isError && (
          <Typography.Text type="danger">조회에 실패했습니다. 권한이나 ID를 확인해 주세요.</Typography.Text>
        )}
        {payroll && (
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="귀속일">{payroll.payrollYearMonthDay ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="상태">
              <Tag>{STATUS_KO[payroll.payrollStatus ?? ''] ?? payroll.payrollStatus ?? '—'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="지급일">{payroll.paidAt ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="총 지급">{formatWon(payroll.totalPayment)}</Descriptions.Item>
            <Descriptions.Item label="총 공제">{formatWon(payroll.totalDeduction)}</Descriptions.Item>
            <Descriptions.Item label="실수령">
              <strong>{formatWon(payroll.netPay)}</strong>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="항목 내역">
        <Table<PayrollItem>
          rowKey={(r) => r.payrollItemId ?? `${r.itemName}-${r.amount}`}
          loading={itemsQ.isLoading}
          columns={itemColumns}
          dataSource={sortedItems}
          pagination={false}
          size="small"
          locale={{ emptyText: '항목이 없습니다.' }}
        />
      </Card>
    </Space>
  );
}
