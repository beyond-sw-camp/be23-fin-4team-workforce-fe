/** /app/payroll — 로그인 user.id 기준 급여대장 목록 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { Payroll } from '@/features/salary-service/types';

const STATUS_KO: Record<string, string> = {
  DRAFT: '작성 중',
  CONFIRMED: '확정',
  PAID: '지급 완료',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  CONFIRMED: 'blue',
  PAID: 'green',
};

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

export function MyPayrollPage() {
  const { user } = useAuth();
  const memberId = user?.id;

  const listQ = useQuery({
    queryKey: ['salary', 'payroll', 'member', memberId],
    queryFn: () => salaryApi.payroll.listByMember(memberId!),
    enabled: Boolean(memberId),
  });

  const sorted = useMemo(() => {
    const rows = listQ.data ?? [];
    return [...rows].sort((a, b) => {
      const da = a.payrollYearMonthDay ?? '';
      const db = b.payrollYearMonthDay ?? '';
      return db.localeCompare(da);
    });
  }, [listQ.data]);

  const columns: ColumnsType<Payroll> = useMemo(
    () => [
      {
        title: '귀속일',
        dataIndex: 'payrollYearMonthDay',
        key: 'payrollYearMonthDay',
      },
      {
        title: '상태',
        dataIndex: 'payrollStatus',
        key: 'payrollStatus',
        render: (s: string) => (
          <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_KO[s] ?? s ?? '—'}</Tag>
        ),
      },
      {
        title: '총 지급',
        dataIndex: 'totalPayment',
        key: 'totalPayment',
        align: 'right',
        render: (v: number) => formatWon(v),
      },
      {
        title: '총 공제',
        dataIndex: 'totalDeduction',
        key: 'totalDeduction',
        align: 'right',
        render: (v: number) => formatWon(v),
      },
      {
        title: '실수령',
        dataIndex: 'netPay',
        key: 'netPay',
        align: 'right',
        render: (v: number) => <strong>{formatWon(v)}</strong>,
      },
      {
        title: '',
        key: 'action',
        width: 100,
        render: (_, row) =>
          row.payrollId ? (
            <Link to="/app/payroll/$payrollId" params={{ payrollId: row.payrollId }} className="tw-text-[#2563EB]">
              상세
            </Link>
          ) : null,
      },
    ],
    [],
  );

  if (!memberId) {
    return (
      <Typography.Text type="danger">로그인 정보에 구성원 ID가 없습니다. 다시 로그인해 주세요.</Typography.Text>
    );
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            급여
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            내 급여대장 목록은 <Typography.Text code>GET /salary/payroll/member/{"{memberId}"}</Typography.Text> 기준입니다.
          </Typography.Paragraph>
        </div>
        {user?.isSystemAdmin && (
          <Space size="middle" wrap className="tw-text-sm">
            <Link to="/app/payroll/admin" className="tw-font-medium tw-text-[#2563EB]">
              급여 관리
            </Link>
            <Link to="/app/salary/settings" className="tw-font-medium tw-text-[#2563EB]">
              급여 설정
            </Link>
          </Space>
        )}
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        {listQ.isError && (
          <Alert
            type="error"
            showIcon
            className="tw-mb-3"
            message="급여 목록 조회에 실패했습니다."
            description="잠시 후 다시 시도해 주세요."
          />
        )}
        <Table<Payroll>
          rowKey={(r) => r.payrollId ?? `${r.payrollYearMonthDay}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={sorted}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          size="small"
          locale={{ emptyText: '급여대장이 없습니다.' }}
        />
      </Card>
    </Space>
  );
}
