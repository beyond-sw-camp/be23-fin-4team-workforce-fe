import { AppDataTable } from '@/shared/ui/AppDataTable';
/** /app/payroll/annual — 연봉 조회 (직원 본인)
 *
 *  연도 선택 + KPI 4장 (총지급 / 총공제 / 실수령 / 정산 건수)
 *  + 월별 표 (1 ~ 12월 고정 12행)
 *  + 항목별 누적 표 (지급 / 공제 분리)
 *  + 월별 실수령 차트 / 세전·세후 도넛 / PayrollType별 누적 (시각화 3종)
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, DatePicker, Empty, Space, Statistic, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip as ChartTooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type {
  AnnualSalaryItemBreakdown,
  AnnualSalaryMonthlyRow,
  PayrollTypeCode,
} from '@/features/salary-service/types';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

// chart.js 모듈 등록 (한 번만 호출)
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  ChartTooltip,
  Legend,
);

// 급여 종류 한글 라벨
const PAYROLL_TYPE_KO: Record<string, string> = {
  REGULAR_MONTHLY: '정기급여',
  PERFORMANCE_BONUS: '성과급',
  SPECIAL_BONUS: '특별상여',
  RETROACTIVE: '소급분',
  RETIREMENT_SETTLEMENT: '퇴직정산',
};

const PAYROLL_TYPE_COLOR: Record<string, string> = {
  REGULAR_MONTHLY: '#2563EB',
  PERFORMANCE_BONUS: '#16a34a',
  SPECIAL_BONUS: '#d97706',
  RETROACTIVE: '#7c3aed',
  RETIREMENT_SETTLEMENT: '#dc2626',
};

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

function formatWon(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '0';
  return n.toLocaleString('ko-KR');
}

export function MyAnnualSalaryPage() {
  const [yearPicker, setYearPicker] = useState<Dayjs>(() => dayjs());
  const year = yearPicker.year();

  const summaryQ = useQuery({
    queryKey: ['salary', 'payroll', 'my-annual', year],
    queryFn: () => salaryApi.payroll.myAnnual(year),
    staleTime: 30_000,
  });

  const data = summaryQ.data;

  // 월별 실수령 차트 데이터 - 0원인 달도 포함 (1~12월 트렌드 시각화)
  const monthlyChartData = useMemo(() => {
    const rows = data?.monthly ?? [];
    return {
      labels: rows.map((r) => `${r.month}월`),
      datasets: [
        {
          label: '실수령',
          data: rows.map((r) => r.netPay ?? 0),
          backgroundColor: '#2563EB',
          borderRadius: 4,
        },
      ],
    };
  }, [data?.monthly]);

  // 세전(총지급) vs 세후(실수령) 도넛 - 본인 부담률 체감
  const taxRatioData = useMemo(() => {
    const total = data?.totalPayment ?? 0;
    const net = data?.netPay ?? 0;
    const deduction = Math.max(0, total - net);
    return {
      labels: ['실수령', '공제 (세금 + 4대보험)'],
      datasets: [
        {
          data: [net, deduction],
          backgroundColor: ['#2563EB', '#dc2626'],
          borderWidth: 0,
        },
      ],
    };
  }, [data?.totalPayment, data?.netPay]);

  // PayrollType별 누적 - 정기/성과/특별/소급/퇴직정산 분리
  const payrollTypeBreakdown = useMemo(() => {
    const map = new Map<PayrollTypeCode, number>();
    (data?.monthly ?? []).forEach((r) => {
      if (!r.payrollType || !r.totalPayment) return;
      map.set(
        r.payrollType as PayrollTypeCode,
        (map.get(r.payrollType as PayrollTypeCode) ?? 0) + r.totalPayment,
      );
    });
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    return entries;
  }, [data?.monthly]);

  const totalPayment = data?.totalPayment ?? 0;
  const netPay = data?.netPay ?? 0;
  const deductionRate = totalPayment > 0 ? Math.round((1 - netPay / totalPayment) * 1000) / 10 : 0;

  const monthlyColumns: ColumnsType<AnnualSalaryMonthlyRow> = [
    {
      title: '정산 대상 월',
      dataIndex: 'month',
      key: 'month',
      width: 110,
      render: (m: number) => <Tag color="geekblue">{`${m}월분`}</Tag>,
    },
    {
      title: '지급일',
      dataIndex: 'payrollYearMonthDay',
      key: 'payrollYearMonthDay',
      render: (v?: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '상태',
      dataIndex: 'payrollStatus',
      key: 'payrollStatus',
      render: (s?: string | null) =>
        s ? (
          <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_KO[s] ?? s}</Tag>
        ) : (
          <Typography.Text type="secondary">미정산</Typography.Text>
        ),
    },
    {
      title: '지급',
      dataIndex: 'totalPayment',
      key: 'totalPayment',
      align: 'right',
      render: (n: number) => `${formatWon(n)} 원`,
    },
    {
      title: '공제',
      dataIndex: 'totalDeduction',
      key: 'totalDeduction',
      align: 'right',
      render: (n: number) => <Typography.Text type="secondary">{formatWon(n)} 원</Typography.Text>,
    },
    {
      title: '실수령',
      dataIndex: 'netPay',
      key: 'netPay',
      align: 'right',
      render: (n: number) => <strong>{formatWon(n)} 원</strong>,
    },
  ];

  const breakdownColumns: ColumnsType<AnnualSalaryItemBreakdown> = [
    { title: '항목', dataIndex: 'itemName', key: 'itemName' },
    {
      title: '연 누적',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      align: 'right',
      render: (n: number) => `${formatWon(n)} 원`,
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        eyebrow="PAYROLL"
        title="연봉 조회"
        subtitle="연도별 지급, 공제, 실수령 합계와 월별 정산 내역을 확인합니다."
        extra={
          <DatePicker
            picker="year"
            value={yearPicker}
            onChange={(d) => d && setYearPicker(d)}
            allowClear={false}
          />
        }
      />

      {summaryQ.isError ? (
        <Alert
          type="error"
          showIcon
          message="연봉 조회에 실패했습니다"
          description="잠시 후 다시 시도해 주세요"
        />
      ) : null}

      <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3">
        <Card
          size="small"
          loading={summaryQ.isLoading}
          className="tw-border-slate-200/80 tw-shadow-sm"
        >
          <Statistic
            title="연 총지급"
            value={data?.totalPayment ?? 0}
            formatter={(v) => formatWon(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 20, color: '#0c4a6e' }}
          />
        </Card>
        <Card
          size="small"
          loading={summaryQ.isLoading}
          className="tw-border-slate-200/80 tw-shadow-sm"
        >
          <Statistic
            title="연 총공제"
            value={data?.totalDeduction ?? 0}
            formatter={(v) => formatWon(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 20, color: '#dc2626' }}
          />
        </Card>
        <Card
          size="small"
          loading={summaryQ.isLoading}
          className="tw-border-slate-200/80 tw-shadow-sm"
        >
          <Statistic
            title="연 실수령"
            value={data?.netPay ?? 0}
            formatter={(v) => formatWon(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 22, color: '#2563EB' }}
          />
        </Card>
        <Card
          size="small"
          loading={summaryQ.isLoading}
          className="tw-border-slate-200/80 tw-shadow-sm"
        >
          <Statistic
            title="월평균 실수령"
            value={data?.monthlyAverage ?? 0}
            formatter={(v) => formatWon(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 20 }}
          />
          <Typography.Text type="secondary" className="!tw-text-xs">
            정산 건수 기준 ({data?.payrollCount ?? 0}건)
          </Typography.Text>
        </Card>
      </div>

      {/* 시각화 3종 - 월별 실수령 차트 (좌, 2/3) + 세전/세후 도넛 (우, 1/3) */}
      <div className="tw-grid tw-grid-cols-1 lg:tw-grid-cols-3 tw-gap-3">
        <Card
          size="small"
          title={`${year}년 월별 실수령 추이`}
          className="tw-border-slate-200/80 tw-shadow-sm lg:tw-col-span-2"
          loading={summaryQ.isLoading}
        >
          <div style={{ height: 260 }}>
            <Bar
              data={monthlyChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => `${formatWon(Number(ctx.parsed.y))} 원`,
                    },
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: (v) => `${(Number(v) / 10000).toLocaleString()}만`,
                    },
                  },
                },
              }}
            />
          </div>
        </Card>

        <Card
          size="small"
          title="세전 / 세후 비율"
          className="tw-border-slate-200/80 tw-shadow-sm"
          loading={summaryQ.isLoading}
        >
          {totalPayment > 0 ? (
            <>
              <div style={{ height: 200, position: 'relative' }}>
                <Doughnut
                  data={taxRatioData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                      legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => `${ctx.label}: ${formatWon(Number(ctx.parsed))} 원`,
                        },
                      },
                    },
                  }}
                />
              </div>
              <div className="tw-text-center tw-mt-2">
                <Typography.Text type="secondary" className="!tw-text-xs">
                  공제율
                </Typography.Text>
                <Typography.Title level={4} className="!tw-m-0 !tw-text-rose-600">
                  {deductionRate}%
                </Typography.Title>
              </div>
            </>
          ) : (
            <Empty description="지급 내역이 없습니다" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </div>

      {/* PayrollType 별 누적 - 정기/성과/특별/소급/퇴직정산 */}
      <Card
        size="small"
        title="급여 종류별 누적"
        className="tw-border-slate-200/80 tw-shadow-sm"
        loading={summaryQ.isLoading}
      >
        {payrollTypeBreakdown.length > 0 ? (
          <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-5 tw-gap-3">
            {payrollTypeBreakdown.map(([type, amount]) => {
              const ratio = totalPayment > 0 ? Math.round((amount / totalPayment) * 1000) / 10 : 0;
              const color = PAYROLL_TYPE_COLOR[type] ?? '#64748b';
              return (
                <div
                  key={type}
                  className="tw-rounded-lg tw-border tw-px-3 tw-py-2.5"
                  style={{ borderColor: `${color}40`, backgroundColor: `${color}10` }}
                >
                  <div className="tw-flex tw-items-center tw-gap-1.5">
                    <span
                      className="tw-inline-block tw-w-2 tw-h-2 tw-rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <Typography.Text type="secondary" className="!tw-text-xs">
                      {PAYROLL_TYPE_KO[type] ?? type}
                    </Typography.Text>
                  </div>
                  <div className="tw-mt-1 tw-text-base tw-font-bold" style={{ color }}>
                    {formatWon(amount)} 원
                  </div>
                  <Typography.Text type="secondary" className="!tw-text-[11px]">
                    전체의 {ratio}%
                  </Typography.Text>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty description="급여 종류 정보가 없습니다" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Card>

      <Card
        title={`${year}년 월별 정산 내역`}
        size="small"
        className="tw-border-slate-200/80 tw-shadow-sm"
      >
        <AppDataTable<AnnualSalaryMonthlyRow>
          rowKey={(r) => `m-${r.month}`}
          loading={summaryQ.isLoading}
          dataSource={data?.monthly ?? []}
          columns={monthlyColumns}
          pagination={false}
          size="small"
          locale={{ emptyText: '조회 결과가 없습니다.' }}
        />
      </Card>

      <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-3">
        <Card title="지급 항목 누적" size="small" className="tw-border-slate-200/80 tw-shadow-sm">
          {(() => {
            // 0원 항목 숨김 - 회사 공통 템플릿이지만 본인 미부여 항목 0원 노출 방지
            const earningRows = (data?.earnings ?? []).filter((r) => (r.totalAmount ?? 0) > 0);
            if (earningRows.length === 0) {
              return <Empty description="지급 항목 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
            }
            return (
              <AppDataTable<AnnualSalaryItemBreakdown>
                rowKey="itemName"
                loading={summaryQ.isLoading}
                dataSource={earningRows}
                columns={breakdownColumns}
                pagination={false}
                size="small"
                summary={(rows) => {
                  const sum = rows.reduce((a, r) => a + r.totalAmount, 0);
                  return (
                    <AppDataTable.Summary.Row className="tw-bg-slate-50">
                      <AppDataTable.Summary.Cell index={0}>
                        <Typography.Text strong>합계</Typography.Text>
                      </AppDataTable.Summary.Cell>
                      <AppDataTable.Summary.Cell index={1} align="right">
                        <Typography.Text strong>{formatWon(sum)} 원</Typography.Text>
                      </AppDataTable.Summary.Cell>
                    </AppDataTable.Summary.Row>
                  );
                }}
              />
            );
          })()}
        </Card>

        <Card title="공제 항목 누적" size="small" className="tw-border-slate-200/80 tw-shadow-sm">
          {(() => {
            const deductionRows = (data?.deductions ?? []).filter((r) => (r.totalAmount ?? 0) > 0);
            if (deductionRows.length === 0) {
              return <Empty description="공제 항목 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
            }
            return (
              <AppDataTable<AnnualSalaryItemBreakdown>
                rowKey="itemName"
                loading={summaryQ.isLoading}
                dataSource={deductionRows}
                columns={breakdownColumns}
                pagination={false}
                size="small"
                summary={(rows) => {
                  const sum = rows.reduce((a, r) => a + r.totalAmount, 0);
                  return (
                    <AppDataTable.Summary.Row className="tw-bg-slate-50">
                      <AppDataTable.Summary.Cell index={0}>
                        <Typography.Text strong>합계</Typography.Text>
                      </AppDataTable.Summary.Cell>
                      <AppDataTable.Summary.Cell index={1} align="right">
                        <Typography.Text strong type="secondary">
                          {formatWon(sum)} 원
                        </Typography.Text>
                      </AppDataTable.Summary.Cell>
                    </AppDataTable.Summary.Row>
                  );
                }}
              />
            );
          })()}
        </Card>
      </div>
    </Space>
  );
}
