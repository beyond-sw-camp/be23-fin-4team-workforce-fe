import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { UseQueryResult } from '@tanstack/react-query';
import { Alert, Button, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import {
  APPROVAL_SEARCH_STATUSES,
  APPROVAL_SEARCH_TYPES,
  type ApprovalSearchItem,
  type ApprovalSearchPage,
  type ApprovalSearchRequestType,
  type ApprovalSearchStatus,
} from '@/features/approvals/api/approvalSearchApi';
import {
  APPROVAL_STATUS_COLOR,
  APPROVAL_STATUS_LABEL,
  APPROVAL_TYPE_LABEL,
} from '@/features/approvals/lib/approvalSearchMeta';

type FilterState = {
  query?: string;
  status?: ApprovalSearchStatus;
  requestType?: ApprovalSearchRequestType;
  page: number;
  size: number;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function parseHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { response?: { status?: number } }).response?.status;
  return typeof status === 'number' ? status : null;
}

function errorMessage(error: unknown): string {
  const status = parseHttpStatus(error);
  if (status === 403) return '권한이 없습니다.';
  if (status === 404) return '데이터를 찾을 수 없습니다.';
  if (status === 500) return '일시적인 오류가 발생했습니다.';
  if (error instanceof Error && error.message.trim()) return error.message;
  return '검색 중 오류가 발생했습니다.';
}

function formatDate(value: string): string {
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

export function ApprovalSearchPanel({
  filters,
  onFiltersChange,
  queryResult,
  onRowClick,
}: {
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  queryResult: UseQueryResult<ApprovalSearchPage, Error>;
  onRowClick?: (requestId: string) => void;
}) {
  const [queryInput, setQueryInput] = useState(filters.query ?? '');
  useEffect(() => {
    setQueryInput(filters.query ?? '');
  }, [filters.query]);
  const debouncedQuery = useDebouncedValue(queryInput, 300);

  useEffect(() => {
    if ((filters.query ?? '') === debouncedQuery) return;
    onFiltersChange({ ...filters, query: debouncedQuery || undefined, page: 0 });
  }, [debouncedQuery, filters, onFiltersChange]);

  const columns = useMemo<ColumnsType<ApprovalSearchItem>>(
    () => [
      { title: '문서명', dataIndex: 'documentName', key: 'documentName', ellipsis: true },
      { title: '기안자', dataIndex: 'requesterName', key: 'requesterName', width: 120 },
      { title: '부서명', dataIndex: 'requesterOrganizationName', key: 'requesterOrganizationName', width: 180 },
      {
        title: '상태',
        dataIndex: 'requestStatus',
        key: 'requestStatus',
        width: 120,
        render: (v: string) => {
          const k = String(v).toUpperCase() as ApprovalSearchStatus;
          return <Tag color={APPROVAL_STATUS_COLOR[k] ?? 'default'}>{APPROVAL_STATUS_LABEL[k] ?? v}</Tag>;
        },
      },
      {
        title: '타입',
        dataIndex: 'requestType',
        key: 'requestType',
        width: 120,
        render: (v: string) => {
          const k = String(v).toUpperCase() as ApprovalSearchRequestType;
          return <Tag>{APPROVAL_TYPE_LABEL[k] ?? v}</Tag>;
        },
      },
      {
        title: '작성일',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 170,
        render: (v: string) => formatDate(v),
      },
    ],
    [],
  );

  const page = queryResult.data;
  const rows = page?.content ?? [];

  return (
    <Space direction="vertical" size={12} className="tw-w-full">
      <Space wrap>
        <Input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="문서명, 기안자, 부서, 내용 검색"
          prefix={<SearchOutlined />}
          allowClear
          className="tw-w-[280px]"
        />
        <Select
          value={filters.status ?? 'ALL'}
          className="tw-w-[150px]"
          onChange={(next) => onFiltersChange({ ...filters, status: next === 'ALL' ? undefined : next, page: 0 })}
          options={[
            { label: '전체 상태', value: 'ALL' },
            ...APPROVAL_SEARCH_STATUSES.map((s) => ({ label: APPROVAL_STATUS_LABEL[s], value: s })),
          ]}
        />
        <Select
          value={filters.requestType ?? 'ALL'}
          className="tw-w-[150px]"
          onChange={(next) =>
            onFiltersChange({ ...filters, requestType: next === 'ALL' ? undefined : next, page: 0 })
          }
          options={[
            { label: '전체 타입', value: 'ALL' },
            ...APPROVAL_SEARCH_TYPES.map((t) => ({ label: APPROVAL_TYPE_LABEL[t], value: t })),
          ]}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() =>
            onFiltersChange({
              ...filters,
              query: undefined,
              status: undefined,
              requestType: undefined,
              page: 0,
              size: 20,
            })
          }
        >
          초기화
        </Button>
      </Space>

      {queryResult.error ? (
        <Alert type="error" showIcon message={errorMessage(queryResult.error)} />
      ) : null}

      <Table
        rowKey="requestId"
        loading={queryResult.isFetching}
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: <Empty description="검색 결과가 없습니다" /> }}
        onRow={(record) => ({
          onClick: () => onRowClick?.(record.requestId),
          className: onRowClick ? 'tw-cursor-pointer' : '',
        })}
        pagination={{
          current: (page?.number ?? filters.page) + 1,
          pageSize: page?.size ?? filters.size,
          total: page?.totalElements ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
          showTotal: (total, range) => `총 ${total}건 (${range[0]}-${range[1]})`,
          onChange: (nextPage, nextSize) => {
            const sizeChanged = (page?.size ?? filters.size) !== nextSize;
            onFiltersChange({
              ...filters,
              page: sizeChanged ? 0 : nextPage - 1,
              size: nextSize,
            });
          },
        }}
      />

      <Typography.Text type="secondary" className="tw-text-xs">
        결재 생성/수정 직후 최대 5초까지 검색 반영이 지연될 수 있습니다.
      </Typography.Text>
    </Space>
  );
}
