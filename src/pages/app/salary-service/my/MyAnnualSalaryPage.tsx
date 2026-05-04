/** /app/payroll/annual — 연봉 조회 (직원 본인)
 *
 *  연도 선택 + KPI 4장 (총지급 / 총공제 / 실수령 / 정산 건수)
 *  + 월별 표 (1 ~ 12월 고정 12행)
 *  + 항목별 누적 표 (지급 / 공제 분리)
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Card,
  DatePicker,
  Empty,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type {
  AnnualSalaryItemBreakdown,
  AnnualSalaryMonthlyRow,
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
        s ? <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_KO[s] ?? s}</Tag>
          : <Typography.Text type="secondary">미정산</Typography.Text>,
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
      render: (n: number) => (
        <Typography.Text type="secondary">{formatWon(n)} 원</Typography.Text>
      ),
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
      <div className="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            연봉 조회
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            className="!tw-mb-0 !tw-mt-1 !tw-text-sm"
          >
            연도별 지급·공제·실수령 합계와 월별 정산 내역을 확인합니다 항목별 누적도 함께 제공됩니다
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <DatePicker
            picker="year"
            value={yearPicker}
            onChange={(d) => d && setYearPicker(d)}
            allowClear={false}
          />
        </Space>
      </div>

      {summaryQ.isError ? (
        <Alert
          type="error"
          showIcon
          message="연봉 조회에 실패했습니다"
          description="잠시 후 다시 시도해 주세요"
        />
      ) : null}

      <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3">
        <Card size="small" loading={summaryQ.isLoading} className="tw-border-slate-200/80 tw-shadow-sm">
          <Statistic
            title="연 총지급"
            value={data?.totalPayment ?? 0}
            formatter={(v) => formatWon(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 20, color: '#0c4a6e' }}
          />
        </Card>
        <Card size="small" loading={summaryQ.isLoading} className="tw-border-slate-200/80 tw-shadow-sm">
          <Statistic
            title="연 총공제"
            value={data?.totalDeduction ?? 0}
            formatter={(v) => formatWon(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 20, color: '#dc2626' }}
          />
        </Card>
        <Card size="small" loading={summaryQ.isLoading} className="tw-border-slate-200/80 tw-shadow-sm">
          <Statistic
            title="연 실수령"
            value={data?.netPay ?? 0}
            formatter={(v) => formatWon(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 22, color: '#2563EB' }}
          />
        </Card>
        <Card size="small" loading={summaryQ.isLoading} className="tw-border-slate-200/80 tw-shadow-sm">
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

      <Card
        title={`${year}년 월별 정산 내역`}
        size="small"
        className="tw-border-slate-200/80 tw-shadow-sm"
      >
        <Table<AnnualSalaryMonthlyRow>
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
        <Card
          title="지급 항목 누적"
          size="small"
          className="tw-border-slate-200/80 tw-shadow-sm"
        >
          {(() => {
            // 0원 항목 숨김 - 회사 공통 템플릿이지만 본인 미부여 항목 0원 노출 방지
            const earningRows = (data?.earnings ?? []).filter((r) => (r.totalAmount ?? 0) > 0);
            if (earningRows.length === 0) {
              return <Empty description="지급 항목 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
            }
            return (
              <Table<AnnualSalaryItemBreakdown>
                rowKey="itemName"
                loading={summaryQ.isLoading}
                dataSource={earningRows}
                columns={breakdownColumns}
                pagination={false}
                size="small"
                summary={(rows) => {
                  const sum = rows.reduce((a, r) => a + r.totalAmount, 0);
                  return (
                    <Table.Summary.Row className="tw-bg-slate-50">
                      <Table.Summary.Cell index={0}>
                        <Typography.Text strong>합계</Typography.Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <Typography.Text strong>{formatWon(sum)} 원</Typography.Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  );
                }}
              />
            );
          })()}
        </Card>

        <Card
          title="공제 항목 누적"
          size="small"
          className="tw-border-slate-200/80 tw-shadow-sm"
        >
          {(() => {
            const deductionRows = (data?.deductions ?? []).filter((r) => (r.totalAmount ?? 0) > 0);
            if (deductionRows.length === 0) {
              return <Empty description="공제 항목 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
            }
            return (
              <Table<AnnualSalaryItemBreakdown>
                rowKey="itemName"
                loading={summaryQ.isLoading}
                dataSource={deductionRows}
                columns={breakdownColumns}
                pagination={false}
                size="small"
                summary={(rows) => {
                  const sum = rows.reduce((a, r) => a + r.totalAmount, 0);
                  return (
                    <Table.Summary.Row className="tw-bg-slate-50">
                      <Table.Summary.Cell index={0}>
                        <Typography.Text strong>합계</Typography.Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <Typography.Text strong type="secondary">
                          {formatWon(sum)} 원
                        </Typography.Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
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
