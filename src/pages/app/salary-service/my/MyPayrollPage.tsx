/** /app/payroll — 급여조회 (직원 본인)
 *
 *  레퍼런스 화면 구성
 *  - 필터: 조회기준(지급일자/귀속월) + 기간(date range) + 급여구분(전체/정기/성과/특별/소급) + 조회 버튼
 *  - 표: 급여년월(rowSpan) | 지급일자 | 급여구분 | 상태 | 총지급 | 총공제 | 실수령 | 상세
 *  - 하단: 기간합계 펼침 (총지급/총공제/실수령)
 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Collapse,
  DatePicker,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type {
  Payroll,
  PayrollTypeCode,
} from '@/features/salary-service/types';

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

const TYPE_KO: Record<string, string> = {
  REGULAR_MONTHLY: '정기급여',
  PERFORMANCE_BONUS: '성과급',
  SPECIAL_BONUS: '특별상여',
  RETROACTIVE: '소급분',
};

type DateBasis = 'PAID' | 'YM';

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '0';
  return n.toLocaleString('ko-KR');
}

function ymOf(p: Payroll) {
  const d = p.payrollYearMonthDay ?? '';
  return d ? d.slice(0, 7) : '';
}

function basisDate(p: Payroll, basis: DateBasis) {
  if (basis === 'PAID') return p.paidAt ?? p.payrollYearMonthDay ?? '';
  return p.payrollYearMonthDay ?? '';
}

export function MyPayrollPage() {
  const { user } = useAuth();
  const memberId = user?.id;

  // 필터 기본값 — 올해 1/1 ~ 오늘
  const [basis, setBasis] = useState<DateBasis>('PAID');
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().startOf('year'),
    dayjs(),
  ]);
  const [typeFilter, setTypeFilter] = useState<PayrollTypeCode | 'ALL'>('ALL');

  // 적용 버튼으로 확정된 조건 — 입력값과 분리
  const [applied, setApplied] = useState<{
    basis: DateBasis;
    from: string;
    to: string;
    typeFilter: PayrollTypeCode | 'ALL';
  }>(() => ({
    basis: 'PAID',
    from: dayjs().startOf('year').format('YYYY-MM-DD'),
    to: dayjs().format('YYYY-MM-DD'),
    typeFilter: 'ALL',
  }));

  const listQ = useQuery({
    queryKey: ['salary', 'payroll', 'member', memberId],
    queryFn: () => salaryApi.payroll.listByMember(memberId!),
    enabled: Boolean(memberId),
  });

  // 조건 적용된 행 — 정렬: 급여년월 desc, 지급일자 desc
  const filtered = useMemo(() => {
    const rows = listQ.data ?? [];
    const from = applied.from;
    const to = applied.to;
    const inRange = (d: string) => d >= from && d <= to;

    const out = rows.filter((p) => {
      if (applied.typeFilter !== 'ALL' && (p.payrollType ?? 'REGULAR_MONTHLY') !== applied.typeFilter) {
        return false;
      }
      const d = basisDate(p, applied.basis);
      if (!d) return false;
      return inRange(d);
    });

    return [...out].sort((a, b) => {
      const ya = ymOf(a);
      const yb = ymOf(b);
      if (ya !== yb) return yb.localeCompare(ya);
      const da = basisDate(a, applied.basis);
      const db = basisDate(b, applied.basis);
      return db.localeCompare(da);
    });
  }, [listQ.data, applied]);

  // 같은 급여년월 첫 행 rowSpan, 이후 행 0
  const ymRowSpan = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((p) => {
      const k = ymOf(p);
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    const seen = new Set<string>();
    return filtered.map((p) => {
      const k = ymOf(p);
      if (seen.has(k)) return 0;
      seen.add(k);
      return map.get(k) ?? 1;
    });
  }, [filtered]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (a, p) => ({
        totalPayment: a.totalPayment + (p.totalPayment ?? 0),
        totalDeduction: a.totalDeduction + (p.totalDeduction ?? 0),
        netPay: a.netPay + (p.netPay ?? 0),
        count: a.count + 1,
      }),
      { totalPayment: 0, totalDeduction: 0, netPay: 0, count: 0 },
    );
  }, [filtered]);

  const columns: ColumnsType<Payroll> = [
    {
      title: '급여년월',
      key: 'ym',
      width: 110,
      align: 'center',
      render: (_, row, index) => {
        const span = ymRowSpan[index] ?? 1;
        if (span === 0) return { children: null, props: { rowSpan: 0 } };
        return {
          children: <span className="tw-font-medium">{ymOf(row)}</span>,
          props: { rowSpan: span },
        };
      },
    },
    {
      title: '지급일자',
      key: 'paidAt',
      width: 120,
      align: 'center',
      render: (_, row) =>
        row.paidAt ?? (
          <Typography.Text type="secondary">
            {row.payrollYearMonthDay ?? '—'}
          </Typography.Text>
        ),
    },
    {
      title: '급여구분',
      key: 'payrollType',
      width: 130,
      render: (_, row) => {
        const t = row.payrollType ?? 'REGULAR_MONTHLY';
        return <strong>{TYPE_KO[t] ?? t}</strong>;
      },
    },
    {
      title: '상태',
      key: 'payrollStatus',
      width: 100,
      align: 'center',
      render: (_, row) => {
        const s = row.payrollStatus ?? 'DRAFT';
        return <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_KO[s] ?? s}</Tag>;
      },
    },
    {
      title: '총지급',
      dataIndex: 'totalPayment',
      key: 'totalPayment',
      align: 'right',
      render: (v: number) => `${formatWon(v)} 원`,
    },
    {
      title: '총공제',
      dataIndex: 'totalDeduction',
      key: 'totalDeduction',
      align: 'right',
      render: (v: number) => (
        <Typography.Text type="secondary">{formatWon(v)} 원</Typography.Text>
      ),
    },
    {
      title: '실수령',
      dataIndex: 'netPay',
      key: 'netPay',
      align: 'right',
      render: (v: number) => <strong>{formatWon(v)} 원</strong>,
    },
    {
      title: '',
      key: 'action',
      width: 80,
      align: 'center',
      render: (_, row) =>
        row.payrollId ? (
          <Link
            to="/app/payroll/$payrollId"
            params={{ payrollId: row.payrollId }}
            className="tw-text-[#2563EB]"
          >
            상세
          </Link>
        ) : null,
    },
  ];

  const onApply = () => {
    setApplied({
      basis,
      from: range[0].format('YYYY-MM-DD'),
      to: range[1].format('YYYY-MM-DD'),
      typeFilter,
    });
  };

  if (!memberId) {
    return (
      <Typography.Text type="danger">
        로그인 정보에 구성원 ID가 없습니다. 다시 로그인해 주세요.
      </Typography.Text>
    );
  }

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            급여조회
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            기간 내 정기급여·성과급·특별상여 등 급여대장 내역을 한 화면에서 확인합니다
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

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="급여내역">
        <Space wrap size="middle" className="tw-mb-3">
          <div className="tw-flex tw-items-center tw-gap-2">
            <Typography.Text type="secondary">조회기준</Typography.Text>
            <Select
              className="tw-min-w-[110px]"
              value={basis}
              onChange={(v) => setBasis(v)}
              options={[
                { value: 'PAID', label: '지급일자' },
                { value: 'YM', label: '귀속월' },
              ]}
            />
          </div>
          <div className="tw-flex tw-items-center tw-gap-2">
            <Typography.Text type="secondary">기간</Typography.Text>
            <DatePicker.RangePicker
              value={range}
              onChange={(v) => {
                if (v && v[0] && v[1]) setRange([v[0], v[1]]);
              }}
              allowClear={false}
            />
          </div>
          <div className="tw-flex tw-items-center tw-gap-2">
            <Typography.Text type="secondary">급여구분</Typography.Text>
            <Select
              className="tw-min-w-[130px]"
              value={typeFilter}
              onChange={(v) => setTypeFilter(v)}
              options={[
                { value: 'ALL', label: '전체' },
                { value: 'REGULAR_MONTHLY', label: '정기급여' },
                { value: 'PERFORMANCE_BONUS', label: '성과급' },
                { value: 'SPECIAL_BONUS', label: '특별상여' },
                { value: 'RETROACTIVE', label: '소급분' },
              ]}
            />
          </div>
          <Button type="primary" onClick={onApply}>조회</Button>
        </Space>

        {listQ.isError && (
          <Alert
            type="error"
            showIcon
            className="tw-mb-3"
            message="급여 목록 조회에 실패했습니다"
            description="잠시 후 다시 시도해 주세요"
          />
        )}

        <Table<Payroll>
          rowKey={(r) => r.payrollId ?? `${r.payrollYearMonthDay}-${r.payrollType}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 12, showSizeChanger: true }}
          size="small"
          locale={{ emptyText: '조회 결과가 없습니다.' }}
        />

        <Collapse
          className="!tw-mt-3"
          items={[
            {
              key: 'totals',
              label: (
                <span className="tw-font-medium tw-text-slate-700">
                  ↳ 기간합계 ({totals.count}건)
                </span>
              ),
              children: (
                <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-3 tw-gap-3">
                  <Statistic
                    title="총지급"
                    value={totals.totalPayment}
                    formatter={(v) => formatWon(Number(v))}
                    suffix="원"
                    valueStyle={{ fontSize: 20, color: '#0c4a6e' }}
                  />
                  <Statistic
                    title="총공제"
                    value={totals.totalDeduction}
                    formatter={(v) => formatWon(Number(v))}
                    suffix="원"
                    valueStyle={{ fontSize: 20, color: '#dc2626' }}
                  />
                  <Statistic
                    title="실수령 합계"
                    value={totals.netPay}
                    formatter={(v) => formatWon(Number(v))}
                    suffix="원"
                    valueStyle={{ fontSize: 22, color: '#2563EB' }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}
