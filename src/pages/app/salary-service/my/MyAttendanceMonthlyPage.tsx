/** /app/attendance/monthly — 내 월별 일자별 근태 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, DatePicker, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { normalizeSpringPage } from '@/features/salary-service/lib/normalizePage';
import type { DailyAttendance } from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';

export function MyAttendanceMonthlyPage() {
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [page, setPage] = useState(0);
  const pageSize = 31;
  const from = month.startOf('month').format('YYYY-MM-DD');
  const to = month.endOf('month').format('YYYY-MM-DD');

  const listQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'monthly', from, to, page, pageSize],
    queryFn: () =>
      attendanceApi.attendance.getMyMonthly({
        from,
        to,
        page,
        size: pageSize,
      }),
  });

  const normalized = useMemo(() => normalizeSpringPage(listQ.data), [listQ.data]);

  const columns: ColumnsType<DailyAttendance> = useMemo(
    () => [
      { title: '일자', dataIndex: 'attendanceDate', key: 'attendanceDate' },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        render: (s: string) => <AttendanceStatusTag status={s} />,
      },
      { title: '근무(분)', dataIndex: 'workedMinutes', key: 'workedMinutes' },
      { title: '휴게(분)', dataIndex: 'totalBreakMinutes', key: 'totalBreakMinutes' },
      { title: '연장(분)', dataIndex: 'overtimeMinutes', key: 'overtimeMinutes' },
    ],
    [],
  );

  return (
    <div className="tw-space-y-4">
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            내 근태(월별)
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            해당 월의 일자별 요약입니다. API: <Typography.Text code>GET /attendance/monthly</Typography.Text>
          </Typography.Paragraph>
        </div>
        <Link to="/app/attendance">
          <Button type="default">일별·출퇴근</Button>
        </Link>
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
        {listQ.isError && (
          <Alert
            type="error"
            showIcon
            className="tw-mb-3"
            message="근태 월별 조회에 실패했습니다."
            description="잠시 후 다시 시도해 주세요."
          />
        )}
        <Table<DailyAttendance>
          rowKey={(r) => r.dailyAttendanceId ?? `${r.attendanceDate}-${r.status}`}
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
