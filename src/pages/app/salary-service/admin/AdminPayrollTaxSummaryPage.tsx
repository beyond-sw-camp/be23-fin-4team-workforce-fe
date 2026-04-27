// /app/payroll/tax-summary 4대보험 + 원천세 월별 집계 화면
// 직원 부담 정확값 회사 부담 산재 추정값 표시 안내문 명시
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Space,
  Statistic,
  Table,
  Typography,
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { TaxSummary } from '@/features/salary-service/types';

function formatKrw(n: number | null | undefined) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  return n.toLocaleString('ko-KR');
}

type InsuranceRow = {
  key: string;
  label: string;
  employee: number;
  employer: number;
};

type WithholdingRow = {
  key: string;
  label: string;
  amount: number;
};

export function AdminPayrollTaxSummaryPage() {
  const { message } = App.useApp();
  const [month, setMonth] = useState<Dayjs>(() => dayjs());
  const [exporting, setExporting] = useState(false);
  const yearMonth = month.format('YYYY-MM');

  const summaryQ = useQuery({
    queryKey: ['salary', 'payroll', 'tax-summary', yearMonth],
    queryFn: () => salaryApi.payroll.taxSummary(yearMonth),
    staleTime: 30_000,
  });

  // 신고용 엑셀 다운로드
  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await salaryApi.payroll.exportTaxSummaryXlsx(yearMonth);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-summary_${yearMonth}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success(`${yearMonth} 세금·4대보험 집계 엑셀이 다운로드되었습니다.`);
    } catch (e: unknown) {
      const err = e as { message?: string };
      message.error(err?.message ?? '엑셀 다운로드 실패');
    } finally {
      setExporting(false);
    }
  };

  const data: TaxSummary | undefined = summaryQ.data;

  const insuranceRows: InsuranceRow[] = data
    ? [
        { key: 'np',  label: '국민연금',     employee: data.nationalPension,     employer: data.nationalPensionEmployer },
        { key: 'hi',  label: '건강보험',     employee: data.healthInsurance,     employer: data.healthInsuranceEmployer },
        { key: 'ltc', label: '장기요양보험', employee: data.longTermCare,        employer: data.longTermCareEmployer },
        { key: 'ei',  label: '고용보험',     employee: data.employmentInsurance, employer: data.employmentInsuranceEmployer },
        { key: 'ia',  label: '산재보험',     employee: 0,                         employer: data.industrialAccidentEmployer },
      ]
    : [];

  const withholdingRows: WithholdingRow[] = data
    ? [
        { key: 'it',  label: '소득세',     amount: data.incomeTax },
        { key: 'lit', label: '지방소득세', amount: data.localIncomeTax },
      ]
    : [];

  const insuranceColumns: ColumnsType<InsuranceRow> = [
    { title: '항목', dataIndex: 'label', key: 'label', width: 140 },
    {
      title: '직원 부담',
      dataIndex: 'employee',
      key: 'employee',
      align: 'right',
      render: (n: number) => `${formatKrw(n)} 원`,
    },
    {
      title: '회사 부담 (추정)',
      dataIndex: 'employer',
      key: 'employer',
      align: 'right',
      render: (n: number) => (
        <Typography.Text type="secondary">{formatKrw(n)} 원</Typography.Text>
      ),
    },
    {
      title: '소계',
      key: 'subTotal',
      align: 'right',
      render: (_, r) => `${formatKrw(r.employee + r.employer)} 원`,
    },
  ];

  const withholdingColumns: ColumnsType<WithholdingRow> = [
    { title: '항목', dataIndex: 'label', key: 'label', width: 140 },
    {
      title: '징수 금액',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (n: number) => `${formatKrw(n)} 원`,
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            세금 / 4대보험 집계
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            className="!tw-mb-0 !tw-mt-1 !tw-text-sm"
          >
            월별 4대보험과 원천세 집계입니다 직원 부담은 실제 공제값 회사 부담은 요율 기반 추정값입니다
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <DatePicker
            picker="month"
            value={month}
            onChange={(d) => d && setMonth(d)}
            allowClear={false}
          />
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exporting}
          >
            엑셀 다운로드
          </Button>
        </Space>
      </div>

      <Alert
        type="warning"
        showIcon
        message="참고용 데이터"
        description="회사 부담분과 산재보험은 보수월액 상한 업종별 차등을 단순 비율로 추정한 값입니다 정확한 신고 금액은 4대사회보험 정보연계센터 또는 회계 시스템 기준을 사용해주세요"
      />

      {summaryQ.isError ? (
        <Alert
          type="error"
          showIcon
          message="집계 데이터를 불러오지 못했습니다"
        />
      ) : null}

      {/* 합계 카드 */}
      <div className="tw-grid tw-grid-cols-2 md:tw-grid-cols-4 tw-gap-3">
        <Card size="small" loading={summaryQ.isLoading} className="tw-border-slate-200/80 tw-shadow-sm">
          <Statistic
            title="대상 직원"
            value={data?.memberCount ?? 0}
            suffix="명"
            valueStyle={{ fontSize: 22 }}
          />
        </Card>
        <Card size="small" loading={summaryQ.isLoading} className="tw-border-slate-200/80 tw-shadow-sm">
          <Statistic
            title="4대보험 직원 부담 합계"
            value={data?.fourInsuranceTotal ?? 0}
            formatter={(v) => formatKrw(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 20, color: '#dc2626' }}
          />
        </Card>
        <Card size="small" loading={summaryQ.isLoading} className="tw-border-slate-200/80 tw-shadow-sm">
          <Statistic
            title="4대보험 회사 부담 합계 (추정)"
            value={data?.fourInsuranceEmployerTotal ?? 0}
            formatter={(v) => formatKrw(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 20, color: '#6b7280' }}
          />
        </Card>
        <Card size="small" loading={summaryQ.isLoading} className="tw-border-slate-200/80 tw-shadow-sm">
          <Statistic
            title="원천세 합계"
            value={data?.withholdingTotal ?? 0}
            formatter={(v) => formatKrw(Number(v))}
            suffix="원"
            valueStyle={{ fontSize: 20, color: '#0c4a6e' }}
          />
        </Card>
      </div>

      <Card
        title="4대보험 산출 내역"
        size="small"
        className="tw-border-slate-200/80 tw-shadow-sm"
      >
        <Table<InsuranceRow>
          rowKey="key"
          loading={summaryQ.isLoading}
          dataSource={insuranceRows}
          columns={insuranceColumns}
          pagination={false}
          size="small"
          summary={(rows) => {
            const empSum = rows.reduce((a, r) => a + r.employee, 0);
            const erSum = rows.reduce((a, r) => a + r.employer, 0);
            return (
              <Table.Summary.Row className="tw-bg-slate-50">
                <Table.Summary.Cell index={0}>
                  <Typography.Text strong>합계</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Typography.Text strong>{formatKrw(empSum)} 원</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Typography.Text strong type="secondary">
                    {formatKrw(erSum)} 원
                  </Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <Typography.Text strong>{formatKrw(empSum + erSum)} 원</Typography.Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            );
          }}
        />
      </Card>

      <Card
        title="원천세 징수 내역"
        size="small"
        className="tw-border-slate-200/80 tw-shadow-sm"
      >
        <Table<WithholdingRow>
          rowKey="key"
          loading={summaryQ.isLoading}
          dataSource={withholdingRows}
          columns={withholdingColumns}
          pagination={false}
          size="small"
          summary={(rows) => {
            const sum = rows.reduce((a, r) => a + r.amount, 0);
            return (
              <Table.Summary.Row className="tw-bg-slate-50">
                <Table.Summary.Cell index={0}>
                  <Typography.Text strong>합계</Typography.Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Typography.Text strong>{formatKrw(sum)} 원</Typography.Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            );
          }}
        />
        <Typography.Paragraph type="secondary" className="!tw-mt-2 !tw-mb-0 !tw-text-xs">
          국세청 신고 시 사용하는 원천징수 항목입니다 직원 급여에서 공제되어 회사가 대신 납부합니다
        </Typography.Paragraph>
      </Card>
    </Space>
  );
}
