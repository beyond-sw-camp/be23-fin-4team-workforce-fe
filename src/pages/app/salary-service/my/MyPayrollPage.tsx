/** /app/payroll — 로그인 user.id 기준 급여대장 목록 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, DatePicker, Space, Table, Tag, Typography, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuth } from '@/features/auth/useAuth';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { Payroll } from '@/features/salary-service/types';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const STATUS_KO: Record<string, string> = {
  DRAFT: '검토 전',
  CONFIRMED: '지급 대기',
  PAID: '지급 완료',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  CONFIRMED: 'blue',
  PAID: 'green',
};

const PAYROLL_TYPE_KO: Record<string, string> = {
  REGULAR_MONTHLY: '정기급여',
  PERFORMANCE_BONUS: '성과급',
  SPECIAL_BONUS: '특별상여',
  RETROACTIVE: '소급분',
  RETIREMENT_SETTLEMENT: '퇴직정산',
};

const { RangePicker } = DatePicker;

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ko-KR')}원`;
}

export function MyPayrollPage() {
  const { user } = useAuth();
  const memberId = user?.id;
  const [rangeDraft, setRangeDraft] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(12, 'month').startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [appliedRange, setAppliedRange] = useState<[Dayjs, Dayjs]>(rangeDraft);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

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

  const filteredRows = useMemo(() => {
    const [from, to] = appliedRange;
    return sorted.filter((row) => {
      // 직원 화면에서 작성중 급여는 숨김
      if (row.payrollStatus === 'DRAFT') return false;

      const d = row.payrollYearMonthDay ? dayjs(row.payrollYearMonthDay) : null;
      if (!d || !d.isValid()) return false;
      if (d.isBefore(from, 'day') || d.isAfter(to, 'day')) return false;

      if (typeFilter !== 'ALL' && row.payrollType !== typeFilter) return false;
      return true;
    });
  }, [sorted, appliedRange, typeFilter]);

  const columns: ColumnsType<Payroll> = useMemo(
    () => [
      {
        title: '귀속년월',
        dataIndex: 'payrollYearMonthDay',
        key: 'payrollYearMonthDay',
      },
      {
        title: '지급일자',
        key: 'paidAt',
        render: (_, row) => {
          if (row.paidAt) return row.paidAt;
          // 확정 상태 등 paidAt 미세팅 시 -> payrollYearMonthDay 기준으로 (예정/미지급) 표기
          if (!row.payrollYearMonthDay) return '—';
          const d = dayjs(row.payrollYearMonthDay);
          if (!d.isValid()) return row.payrollYearMonthDay;
          const today = dayjs().startOf('day');
          const isFuture = d.isAfter(today);
          return (
            <span>
              {d.format('YYYY-MM-DD')}{' '}
              <Typography.Text type={isFuture ? 'secondary' : 'warning'} className="tw-text-xs">
                ({isFuture ? '예정' : '미지급'})
              </Typography.Text>
            </span>
          );
        },
      },
      {
        title: '급여구분',
        dataIndex: 'payrollType',
        key: 'payrollType',
        render: (t: string | null | undefined) => PAYROLL_TYPE_KO[t ?? ''] ?? t ?? '정기급여',
      },
      {
        title: '급여총액',
        dataIndex: 'totalPayment',
        key: 'totalPayment',
        align: 'right',
        render: (v: number) => formatWon(v),
      },
      // 비과세/과세 분리는 명세서 상세 화면에서 항목별로 확인 가능
      // 목록 응답(PayrollResDto)에 분리 필드 미포함 -> placeholder 컬럼 제거
      {
        title: '총공제',
        dataIndex: 'totalDeduction',
        key: 'totalDeduction',
        align: 'right',
        render: (v: number) => formatWon(v),
      },
      {
        title: '실 수령액',
        dataIndex: 'netPay',
        key: 'netPay',
        align: 'right',
        render: (v: number) => <strong>{formatWon(v)}</strong>,
      },
      {
        title: '상태',
        key: 'payrollStatus',
        width: 100,
        render: (_, row) => (
          <Tag color={STATUS_COLOR[row.payrollStatus ?? ''] ?? 'default'}>
            {STATUS_KO[row.payrollStatus ?? ''] ?? row.payrollStatus ?? '—'}
          </Tag>
        ),
      },
      {
        title: '상세',
        key: 'action',
        width: 100,
        render: (_, row) =>
          row.payrollId ? (
            <Link
              to="/app/payroll/$payrollId"
              params={{ payrollId: row.payrollId }}
              className="tw-inline-flex tw-items-center tw-gap-1 tw-text-[#2563EB]"
            >
              상세
              <span aria-hidden>›</span>
            </Link>
          ) : null,
      },
    ],
    [],
  );

  if (!memberId) {
    return (
      <Typography.Text type="danger">
        로그인 정보에 구성원 ID가 없습니다. 다시 로그인해 주세요.
      </Typography.Text>
    );
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        eyebrow="PAYROLL"
        title="급여 조회"
        subtitle="월별 급여명세서와 지급 상태를 확인합니다."
        extra={
          user?.isSystemAdmin ? (
            <Space size="middle" wrap className="tw-text-sm">
              <Link to="/app/payroll/admin" className="tw-font-medium tw-text-[#2563EB]">
                급여 관리
              </Link>
              <Link to="/app/salary/settings" className="tw-font-medium tw-text-[#2563EB]">
                급여 정책
              </Link>
            </Space>
          ) : null
        }
      />

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
        <Space wrap className="tw-mb-3">
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 160 }}
            options={[
              { value: 'ALL', label: '급여구분 전체' },
              { value: 'REGULAR_MONTHLY', label: '정기급여' },
              { value: 'PERFORMANCE_BONUS', label: '성과급' },
              { value: 'SPECIAL_BONUS', label: '특별상여' },
              { value: 'RETROACTIVE', label: '소급분' },
            ]}
          />
          <RangePicker
            value={rangeDraft}
            onChange={(v) => {
              if (!v || !v[0] || !v[1]) return;
              setRangeDraft([v[0], v[1]]);
            }}
            allowClear={false}
            format="YYYY.MM.DD"
          />
          <Button type="primary" onClick={() => setAppliedRange(rangeDraft)}>
            조회
          </Button>
        </Space>
        <Table<Payroll>
          rowKey={(r) => r.payrollId ?? `${r.payrollYearMonthDay}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={filteredRows}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          size="small"
          locale={{ emptyText: '조회 조건에 맞는 급여대장이 없습니다.' }}
        />
      </Card>
    </Space>
  );
}
