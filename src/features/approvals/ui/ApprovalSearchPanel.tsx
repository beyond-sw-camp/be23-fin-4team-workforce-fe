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

export type ApprovalSearchPanelFilters = {
  query?: string;
  status?: ApprovalSearchStatus;
  requestType?: ApprovalSearchRequestType;
  /** iframe 등에서 URL에만 유지할 때 사용 */
  embed?: string;
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

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** "YYYY-MM-DD" -> "M/D(요일)" (선행 0 제거 + 요일) */
function shortDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = dayjs(date);
  const wd = d.isValid() ? `(${WEEKDAY_KO[d.day()]})` : '';
  return `${Number(m[2])}/${Number(m[3])}${wd}`;
}

/** "YYYY-MM" -> "M월" (선행 0 제거) */
function shortMonth(date: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${Number(m[2])}월`;
}

/** "HH:mm" -> 24시간제 그대로 (HH:MM 형식 유지). 정합성을 위해 자릿수만 보정. */
function timeHHmm(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(mi)}`;
}

/** contentJson 에서 문서 종류별 핵심 날짜·범위 추출. 년도는 제거.
 *  - 휴가/휴직/출장: startDate~endDate (필드명 변형 포함)
 *  - 연장근무: workDate
 *  - 출퇴근시간 변경: targetYearMonth */
function extractDocumentSummary(contentJson: string | undefined, documentName: string, requestType: string): string {
  if (!contentJson) return '-';
  let parsed: Record<string, unknown> = {};
  try {
    const obj = JSON.parse(contentJson);
    if (obj && typeof obj === 'object') parsed = obj as Record<string, unknown>;
  } catch {
    return '-';
  }
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = parsed[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  const docName = (documentName ?? '').trim();
  const reqType = (requestType ?? '').toUpperCase();

  // 출장 (BUSINESS_TRIP)
  if (reqType === 'BUSINESS_TRIP') {
    const s = get('tripStartDate', 'startDate', 'start_date');
    const e = get('tripEndDate', 'endDate', 'end_date');
    if (s && e) return s === e ? shortDate(s) : `${shortDate(s)} ~ ${shortDate(e)}`;
    if (s) return shortDate(s);
    return '-';
  }

  // 출퇴근시간 변경 신청서
  if (docName.includes('출퇴근시간 변경')) {
    const v = get('targetYearMonth', 'target_year_month');
    return v ? shortMonth(v) : '-';
  }

  // 연장근무신청
  if (docName.includes('연장근무')) {
    const d = get('workDate', 'work_date');
    const s = get('startTime', 'start_time');
    const e = get('endTime', 'end_time');
    if (d && s && e) return `${shortDate(d)} ${timeHHmm(s)}~${timeHHmm(e)}`;
    return d ? shortDate(d) : '-';
  }

  // 휴직
  if (docName.includes('휴직')) {
    const s = get('startDate', 'start_date');
    const e = get('endDate', 'end_date');
    if (s && e) return s === e ? shortDate(s) : `${shortDate(s)} ~ ${shortDate(e)}`;
    return s ? shortDate(s) : '-';
  }

  // 휴가/연차 (VACATION 포함)
  if (reqType === 'VACATION' || docName.includes('휴가') || docName.includes('연차')) {
    const s = get('startDate', 'start_date');
    const e = get('endDate', 'end_date');
    if (s && e) return s === e ? shortDate(s) : `${shortDate(s)} ~ ${shortDate(e)}`;
    return s ? shortDate(s) : '-';
  }

  // 일반/공문 등 - 제목 fallback
  return get('title') || '-';
}

export function ApprovalSearchPanel({
  filters,
  onFiltersChange,
  queryResult,
  onRowClick,
}: {
  filters: ApprovalSearchPanelFilters;
  onFiltersChange: (next: ApprovalSearchPanelFilters) => void;
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
      { title: '문서명', dataIndex: 'documentName', key: 'documentName', ellipsis: true, width: 180 },
      { title: '기안자', dataIndex: 'requesterName', key: 'requesterName', width: 100 },
      { title: '부서명', dataIndex: 'requesterOrganizationName', key: 'requesterOrganizationName', width: 90, ellipsis: true },
      {
        title: '상태',
        dataIndex: 'requestStatus',
        key: 'requestStatus',
        width: 100,
        render: (v: string) => {
          const k = String(v).toUpperCase() as ApprovalSearchStatus;
          return <Tag color={APPROVAL_STATUS_COLOR[k] ?? 'default'}>{APPROVAL_STATUS_LABEL[k] ?? v}</Tag>;
        },
      },
      {
        title: '타입',
        dataIndex: 'requestType',
        key: 'requestType',
        width: 110,
        render: (v: string) => {
          const k = String(v).toUpperCase() as ApprovalSearchRequestType;
          return <Tag>{APPROVAL_TYPE_LABEL[k] ?? v}</Tag>;
        },
      },
      {
        title: '내용',
        key: 'summary',
        width: 180,
        ellipsis: true,
        render: (_: unknown, r: ApprovalSearchItem) => (
          <span className="tw-text-sm tw-text-slate-700">
            {extractDocumentSummary(r.contentJson, r.documentName, String(r.requestType))}
          </span>
        ),
      },
      {
        title: '작성일',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 140,
        render: (v: string) => {
          if (!v) return '-';
          const d = dayjs(v);
          if (!d.isValid()) return v;
          // M/D(요일) HH:MM
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${d.month() + 1}/${d.date()}(${WEEKDAY_KO[d.day()]}) ${pad(d.hour())}:${pad(d.minute())}`;
        },
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
          onChange={(next) => {
            const status: ApprovalSearchStatus | undefined =
              next === 'ALL' ? undefined : (next as ApprovalSearchStatus);
            onFiltersChange({ ...filters, status, page: 0 });
          }}
          options={[
            { label: '전체 상태', value: 'ALL' },
            ...APPROVAL_SEARCH_STATUSES.map((s) => ({ label: APPROVAL_STATUS_LABEL[s], value: s })),
          ]}
        />
        <Select
          value={filters.requestType ?? 'ALL'}
          className="tw-w-[150px]"
          onChange={(next) => {
            const requestType: ApprovalSearchRequestType | undefined =
              next === 'ALL' ? undefined : (next as ApprovalSearchRequestType);
            onFiltersChange({ ...filters, requestType, page: 0 });
          }}
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
