/** /app/attendance/company/monthly — 전사 월별 일자별 근태 (관리자) */
import { useQuery } from '@tanstack/react-query';
import { Card, DatePicker, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { normalizeSpringPage } from '@/features/salary-service/lib/normalizePage';
import type { DailyAttendance } from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';
import { AppSearchBar } from '@/shared/ui';

function shortId(id?: string | null) {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function AdminAttendanceMonthlyPage() {
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [page, setPage] = useState(0);
  const [memberSearch, setMemberSearch] = useState('');
  const pageSize = 50;
  const from = month.startOf('month').format('YYYY-MM-DD');
  const to = month.endOf('month').format('YYYY-MM-DD');

  const listQ = useQuery({
    queryKey: ['salary', 'attendance', 'company', 'monthly', from, to, page, pageSize],
    queryFn: () =>
      attendanceApi.attendance.getCompanyMonthly({
        from,
        to,
        page,
        size: pageSize,
      }),
  });

  const normalized = useMemo(() => normalizeSpringPage(listQ.data), [listQ.data]);

  // 현재 페이지 내 구성원 ID 부분문자열 필터, 서버 페이지네이션과 병행
  const filteredContent = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return normalized.content;
    return normalized.content.filter((r) =>
      (r.memberId ?? '').toLowerCase().includes(q),
    );
  }, [normalized.content, memberSearch]);

  const columns: ColumnsType<DailyAttendance> = useMemo(
    () => [
      {
        title: '구성원',
        dataIndex: 'memberId',
        key: 'memberId',
        render: (v: string) => shortId(v),
      },
      {
        title: '일자',
        dataIndex: 'attendanceDate',
        key: 'attendanceDate',
        sorter: (a, b) => (a.attendanceDate ?? '').localeCompare(b.attendanceDate ?? ''),
      },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        filters: [
          { text: '정상', value: 'NORMAL' },
          { text: '연차', value: 'LEAVE' },
          { text: '반차', value: 'HALF' },
          { text: '결근', value: 'ABSENT' },
        ],
        onFilter: (value, record) => record.status === value,
        render: (_, row) => (
          <AttendanceStatusTag status={row.status} workTripType={row.workTripType ?? null} />
        ),
      },
      {
        title: '근무(분)',
        dataIndex: 'workedMinutes',
        key: 'workedMinutes',
        sorter: (a, b) => (a.workedMinutes ?? 0) - (b.workedMinutes ?? 0),
      },
    ],
    [],
  );

  return (
    <div className="tw-space-y-4">
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          전사 근태(월별)
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          API: <Typography.Text code>GET /attendance/company/monthly</Typography.Text>
        </Typography.Paragraph>
      </div>
      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="조회 월">
        <Space wrap>
          <DatePicker
            picker="month"
            value={month}
            onChange={(d) => {
              if (d) {
                setMonth(d.startOf('month'));
                setPage(0);
              }
            }}
            allowClear={false}
          />
          <AppSearchBar
            placeholder="구성원 UUID 일부로 필터"
            value={memberSearch}
            onValueChange={setMemberSearch}
            onSearch={setMemberSearch}
            ariaLabel="월별 근태 검색"
            className="tw-w-full tw-flex-none sm:tw-w-[320px]"
          />
        </Space>
      </Card>
      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="일자별">
        <Table<DailyAttendance>
          rowKey={(r) => r.dailyAttendanceId ?? `${r.memberId}-${r.attendanceDate}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={filteredContent}
          size="small"
          pagination={
            memberSearch.trim()
              ? { pageSize: 20 }
              : {
                  current: normalized.page + 1,
                  pageSize: normalized.pageSize,
                  total: normalized.totalElements,
                  showSizeChanger: false,
                  onChange: (p) => setPage(p - 1),
                }
          }
          locale={{
            emptyText: memberSearch.trim()
              ? `'${memberSearch}' 로 검색된 근태가 없습니다.`
              : '해당 월 근태 데이터가 없습니다.',
          }}
        />
      </Card>
    </div>
  );
}
