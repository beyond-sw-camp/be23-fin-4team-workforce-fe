/** /app/personnel-order/admin - 회사 인사발령 이력 (관리자) */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, DatePicker, Empty, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  personnelOrderApi,
  type PersonnelOrder,
  type PersonnelOrderType,
} from '@/features/personnel/api/personnelOrderApi';
import { AppSearchBar } from '@/shared/ui';

const TYPE_KO: Record<PersonnelOrderType, string> = {
  TRANSFER: '부서 이동',
  PROMOTION: '승진',
  DEMOTION: '강등',
  REASSIGN: '보직 변경',
  ROLE_CHANGE: '복합 변경',
};

const TYPE_COLOR: Record<PersonnelOrderType, string> = {
  TRANSFER: 'blue',
  PROMOTION: 'green',
  DEMOTION: 'red',
  REASSIGN: 'gold',
  ROLE_CHANGE: 'purple',
};

export function AdminPersonnelOrderHistoryPage() {
  const listQ = useQuery({
    queryKey: ['personnel-order', 'company'],
    queryFn: () => personnelOrderApi.listByCompany(),
    staleTime: 60_000,
  });
  const list = listQ.data ?? [];

  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<PersonnelOrderType | 'ALL'>('ALL');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const filtered = useMemo(() => {
    return list.filter((r) => {
      if (typeFilter !== 'ALL' && r.orderType !== typeFilter) return false;
      if (range && range[0] && range[1]) {
        const d = dayjs(r.effectiveDate);
        if (!d.isValid()) return false;
        if (d.isBefore(range[0], 'day') || d.isAfter(range[1], 'day')) return false;
      }
      if (keyword.trim()) {
        const k = keyword.trim().toLowerCase();
        const hits =
          (r.beforeOrganizationName?.toLowerCase().includes(k) ?? false) ||
          (r.afterOrganizationName?.toLowerCase().includes(k) ?? false) ||
          (r.beforeJobGradeName?.toLowerCase().includes(k) ?? false) ||
          (r.afterJobGradeName?.toLowerCase().includes(k) ?? false) ||
          (r.reason?.toLowerCase().includes(k) ?? false);
        if (!hits) return false;
      }
      return true;
    });
  }, [list, typeFilter, range, keyword]);

  const cols: ColumnsType<PersonnelOrder> = [
    {
      title: '효력일',
      dataIndex: 'effectiveDate',
      width: 120,
      sorter: (a, b) => (a.effectiveDate ?? '').localeCompare(b.effectiveDate ?? ''),
    },
    {
      title: '발령 유형',
      dataIndex: 'orderType',
      width: 110,
      render: (v: PersonnelOrderType) => (
        <Tag color={TYPE_COLOR[v]}>{TYPE_KO[v] ?? v}</Tag>
      ),
    },
    {
      title: '직원 ID',
      dataIndex: 'memberId',
      width: 130,
      render: (v: string) => (
        <Typography.Text code className="!tw-text-xs">
          {v.slice(0, 8)}
        </Typography.Text>
      ),
    },
    {
      title: '부서',
      key: 'org',
      render: (_, r) => {
        if (!r.beforeOrganizationName && !r.afterOrganizationName) return '—';
        return (
          <span className="tw-text-sm">
            <Tag>{r.beforeOrganizationName ?? '—'}</Tag>→{' '}
            <Tag color="processing">{r.afterOrganizationName ?? '—'}</Tag>
          </span>
        );
      },
    },
    {
      title: '직급',
      key: 'jobGrade',
      render: (_, r) => {
        if (!r.beforeJobGradeName && !r.afterJobGradeName) return '—';
        return (
          <span className="tw-text-sm">
            <Tag>{r.beforeJobGradeName ?? '—'}</Tag>→{' '}
            <Tag color="gold">{r.afterJobGradeName ?? '—'}</Tag>
          </span>
        );
      },
    },
    {
      title: '사유',
      dataIndex: 'reason',
      ellipsis: true,
      render: (v: string | null) => v ?? '—',
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0">
          회사 인사발령 이력
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          결재 통과로 적용된 부서 이동 / 직급 / 직책 변경 이력 (최신순)
        </Typography.Paragraph>
      </div>
      <Card size="small">
        <Space wrap className="tw-mb-3">
          <AppSearchBar
            placeholder="부서·직급·사유 검색"
            value={keyword}
            onValueChange={setKeyword}
            onSearch={setKeyword}
            ariaLabel="인사발령 이력 검색"
            className="tw-w-full tw-flex-none sm:tw-w-[300px]"
          />
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 140 }}
            options={[
              { value: 'ALL', label: '유형 전체' },
              { value: 'TRANSFER', label: '부서 이동' },
              { value: 'PROMOTION', label: '승진' },
              { value: 'DEMOTION', label: '강등' },
              { value: 'REASSIGN', label: '보직 변경' },
              { value: 'ROLE_CHANGE', label: '복합 변경' },
            ]}
          />
          <DatePicker.RangePicker
            value={range}
            onChange={(v) => setRange(v as [Dayjs, Dayjs] | null)}
            format="YYYY-MM-DD"
          />
          <Typography.Text type="secondary" className="!tw-text-xs">
            총 {filtered.length}건
          </Typography.Text>
        </Space>
        <Table<PersonnelOrder>
          rowKey={(r) => r.personnelOrderId}
          loading={listQ.isLoading}
          dataSource={filtered}
          columns={cols}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          size="small"
          locale={{ emptyText: <Empty description="발령 이력이 없습니다." /> }}
        />
      </Card>
    </Space>
  );
}
