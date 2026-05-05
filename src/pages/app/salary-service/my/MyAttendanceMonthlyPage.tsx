/** /app/attendance/monthly - 내 월별 일자별 근태 + 결재 통합 정정 신청 진입점 */
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { normalizeSpringPage } from '@/features/salary-service/lib/normalizePage';
import type {
  CorrectionStateCode,
  DailyAttendance,
} from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';

export function MyAttendanceMonthlyPage() {
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [page, setPage] = useState(0);
  const pageSize = 31;
  const from = month.startOf('month').format('YYYY-MM-DD');
  const to = month.endOf('month').format('YYYY-MM-DD');

  const navigate = useNavigate();

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
      {
        title: '출근',
        dataIndex: 'firstClockIn',
        key: 'firstClockIn',
        render: (v?: string | null) => (v ? dayjs(v).format('HH:mm') : '—'),
      },
      {
        title: '퇴근',
        dataIndex: 'lastClockOut',
        key: 'lastClockOut',
        render: (v?: string | null) => (v ? dayjs(v).format('HH:mm') : '—'),
      },
      { title: '근무(분)', dataIndex: 'workedMinutes', key: 'workedMinutes' },
      { title: '연장(분)', dataIndex: 'overtimeMinutes', key: 'overtimeMinutes' },
      {
        title: '정정 신청',
        key: 'correction',
        width: 160,
        align: 'center',
        render: (_, row) => {
          const state: CorrectionStateCode = row.correctionState ?? 'NORMAL';

          // 검토중 - 라벨만
          if (state === 'PENDING') {
            return <Tag color="gold">결재 진행중</Tag>;
          }
          // 정정 완료 - 라벨만
          if (state === 'COMPLETED') {
            return <Tag color="green">정정 완료</Tag>;
          }
          // 월마감(LOCKED) - 작성 불가
          if (row.closureStatus === 'LOCKED') {
            return <Typography.Text type="secondary">—</Typography.Text>;
          }
          // 그 외 - 근태정정신청 버튼 (결재 상신 화면으로 이동, 해당 일자 prefill)
          return (
            <Button
              size="small"
              type="link"
              onClick={() => {
                const date = row.attendanceDate;
                const clockIn = row.firstClockIn ? dayjs(row.firstClockIn).format('HH:mm') : '';
                const clockOut = row.lastClockOut ? dayjs(row.lastClockOut).format('HH:mm') : '';
                void navigate({
                  to: '/app/approvals/correction-request',
                  search: { date, clockIn, clockOut },
                });
              }}
            >
              근태정정신청
            </Button>
          );
        },
      },
    ],
    [navigate],
  );

  return (
    <div className="tw-space-y-4">
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            내 근태(월별)
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            해당 월의 일자별 근태·근무 현황입니다.
          </Typography.Paragraph>
        </div>
        <div className="tw-flex tw-gap-2">
          <Link to="/app/attendance">
            <Button type="default">일별·출퇴근</Button>
          </Link>
        </div>
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
