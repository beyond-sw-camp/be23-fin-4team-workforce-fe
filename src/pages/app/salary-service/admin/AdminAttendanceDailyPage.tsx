/** /app/attendance/company — 전사 일별 근태 페이징 (관리자) */
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, DatePicker, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { normalizeSpringPage } from '@/features/salary-service/lib/normalizePage';
import type { DailyAttendance } from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('MM-DD HH:mm') : String(iso);
}

function shortId(id?: string | null) {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function AdminAttendanceDailyPage() {
  const [picked, setPicked] = useState<Dayjs>(() => dayjs());
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const dateIso = picked.format('YYYY-MM-DD');

  const listQ = useQuery({
    queryKey: ['salary', 'attendance', 'company', 'daily', dateIso, page, pageSize],
    queryFn: () =>
      attendanceApi.attendance.getCompanyDaily({
        date: dateIso,
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
      {
        title: '일자',
        dataIndex: 'attendanceDate',
        key: 'attendanceDate',
      },
      {
        title: '상태',
        dataIndex: 'status',
        key: 'status',
        render: (s: string) => <AttendanceStatusTag status={s} />,
      },
      {
        title: '첫 출근',
        dataIndex: 'firstClockIn',
        key: 'firstClockIn',
        render: (t: string) => formatDt(t),
      },
      {
        title: '마지막 퇴근',
        dataIndex: 'lastClockOut',
        key: 'lastClockOut',
        render: (t: string) => formatDt(t),
      },
      {
        title: '근무(분)',
        dataIndex: 'workedMinutes',
        key: 'workedMinutes',
      },
    ],
    [],
  );

  return (
    <div className="tw-space-y-4">
      <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            전사 근태(일별)
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            HR 관리자용 — 백엔드 GET /attendance/company/daily 와 연동됩니다.
          </Typography.Paragraph>
        </div>
        <DatePicker
          value={picked}
          onChange={(d) => {
            if (!d) return;
            setPicked(d);
            setPage(0);
          }}
          allowClear={false}
        />
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        {listQ.isError && (
          <Alert
            type="error"
            showIcon
            className="tw-mb-3"
            message="전사 근태 조회에 실패했습니다."
            description="네트워크 또는 권한 상태를 확인해 주세요."
          />
        )}
        <Table<DailyAttendance>
          rowKey={(r) => r.dailyAttendanceId ?? `${r.memberId}-${r.attendanceDate}`}
          loading={listQ.isLoading}
          columns={columns}
          dataSource={normalized.content}
          pagination={{
            current: page + 1,
            pageSize,
            total: normalized.totalElements,
            showSizeChanger: false,
            onChange: (p) => setPage(p - 1),
          }}
          size="small"
        />
      </Card>
    </div>
  );
}
