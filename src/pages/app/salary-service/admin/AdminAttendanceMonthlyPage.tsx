/** /app/attendance/company/monthly — 전사 월별 일자별 근태 (관리자) */
import { useQuery } from '@tanstack/react-query';
import { Card, DatePicker, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { normalizeSpringPage } from '@/features/salary-service/lib/normalizePage';
import type { DailyAttendance } from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';

function shortId(id?: string | null) {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function AdminAttendanceMonthlyPage() {
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [page, setPage] = useState(0);
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

  const columns: ColumnsType<DailyAttendance> = useMemo(
    () => [
      {
        title: '구성원',
        dataIndex: 'memberId',
        key: 'memberId',
        render: (v: string) => shortId(v),
      },
      { title: '일자', dataIndex: 'attendanceDate', key: 'attendanceDate' },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        render: (s: string) => <AttendanceStatusTag status={s} />,
      },
      { title: '근무(분)', dataIndex: 'workedMinutes', key: 'workedMinutes' },
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
      </Card>
      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="일자별">
        <Table<DailyAttendance>
          rowKey={(r) => r.dailyAttendanceId ?? `${r.memberId}-${r.attendanceDate}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={normalized.content}
          size="small"
          pagination={{
            current: normalized.page + 1,
            pageSize: normalized.pageSize,
            total: normalized.totalElements,
            showSizeChanger: false,
            onChange: (p) => setPage(p - 1),
          }}
        />
      </Card>
    </div>
  );
}
