/**
 * /app/attendance
 * 출퇴근·일별 요약·이벤트 로그. 그날 근태 행 없으면 로그 API 400 → 빈 테이블로 처리함.
 */
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Descriptions, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type { AttendanceLog, DailyAttendance } from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';
import type { ApiError } from '@/shared/api/types';

function isApiError(e: unknown): e is ApiError {
  return typeof e === 'object' && e !== null && 'status' in e && typeof (e as ApiError).status === 'number';
}

const EVENT_KO: Record<string, string> = {
  CLOCK_IN: '출근',
  CLOCK_OUT: '퇴근',
  BREAK_START: '휴게 시작',
  BREAK_END: '휴게 종료',
};

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(iso);
}

export function MyAttendancePage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [picked, setPicked] = useState<Dayjs>(() => dayjs());
  const dateIso = picked.format('YYYY-MM-DD');

  const dailyQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'daily', dateIso],
    queryFn: async (): Promise<DailyAttendance | null> => {
      try {
        return await attendanceApi.attendance.getMyDaily(dateIso);
      } catch (e) {
        if (isApiError(e) && e.status === 404) return null;
        throw e;
      }
    },
  });

  const logsQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'logs', dateIso],
    queryFn: async (): Promise<AttendanceLog[]> => {
      try {
        return await attendanceApi.attendance.getMyLogs(dateIso);
      } catch (e) {
        /** 해당 일자 daily_attendance 가 없으면 백엔드가 400(출근 먼저) — UI에서는 빈 로그로 처리 */
        if (isApiError(e) && (e.status === 400 || e.status === 404)) return [];
        throw e;
      }
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'my'] });
  };

  /**
   * 브라우저 Geolocation 으로 현재 위치 취득
   * 실패 시 null 반환 (서버는 IP 검증만으로 폴백)
   */
  const getCurrentPosition = (): Promise<{ latitude: number; longitude: number } | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    });

  const clockInM = useMutation({
    mutationFn: async () => {
      const coords = await getCurrentPosition();
      return attendanceApi.attendance.clockIn({
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      });
    },
    onSuccess: () => {
      message.success('출근 처리되었습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '출근 처리에 실패했습니다.'),
  });

  const clockOutM = useMutation({
    mutationFn: async () => {
      const coords = await getCurrentPosition();
      return attendanceApi.attendance.clockOut({
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      });
    },
    onSuccess: () => {
      message.success('퇴근 처리되었습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '퇴근 처리에 실패했습니다.'),
  });

  const breakStartM = useMutation({
    mutationFn: () => attendanceApi.attendance.breakStart({}),
    onSuccess: () => {
      message.success('휴게를 시작했습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '요청에 실패했습니다.'),
  });

  const breakEndM = useMutation({
    mutationFn: () => attendanceApi.attendance.breakEnd({}),
    onSuccess: () => {
      message.success('휴게를 종료했습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '요청에 실패했습니다.'),
  });

  const busy =
    clockInM.isPending ||
    clockOutM.isPending ||
    breakStartM.isPending ||
    breakEndM.isPending;

  const logColumns: ColumnsType<AttendanceLog> = useMemo(
    () => [
      {
        title: '유형',
        dataIndex: 'eventType',
        key: 'eventType',
        render: (t: string) => EVENT_KO[t] ?? t ?? '—',
      },
      {
        title: '시각',
        dataIndex: 'eventTime',
        key: 'eventTime',
        render: (t: string) => formatDt(t),
      },
    ],
    [],
  );

  const daily = dailyQ.data;

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
        <div>
          <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
            내 근태
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
            출퇴근·휴게는 백엔드 정책(하루 1회 등)을 따릅니다. 날짜를 바꿔 과거 로그를 볼 수 있습니다.
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <DatePicker value={picked} onChange={(d) => d && setPicked(d)} allowClear={false} />
          <Link to="/app/attendance/monthly">
            <Button type="default">월별 보기</Button>
          </Link>
          {user?.isSystemAdmin && (
            <Link to="/app/attendance/company">
              <Button type="default">전사 근태(일별)</Button>
            </Link>
          )}
        </Space>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="오늘 처리">
        <Space wrap>
          <Button type="primary" loading={busy} onClick={() => clockInM.mutate()}>
            출근
          </Button>
          <Button loading={busy} onClick={() => clockOutM.mutate()}>
            퇴근
          </Button>
          <Button loading={busy} onClick={() => breakStartM.mutate()}>
            휴게 시작
          </Button>
          <Button loading={busy} onClick={() => breakEndM.mutate()}>
            휴게 종료
          </Button>
        </Space>
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title={`${dateIso} 요약`} loading={dailyQ.isLoading}>
        {!daily ? (
          <Typography.Text type="secondary">해당 일자 근태 요약이 없습니다. 출근 처리 후 다시 조회해 보세요.</Typography.Text>
        ) : (
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="상태">
              <AttendanceStatusTag status={daily.status} />
            </Descriptions.Item>
            <Descriptions.Item label="첫 출근">{formatDt(daily.firstClockIn)}</Descriptions.Item>
            <Descriptions.Item label="마지막 퇴근">{formatDt(daily.lastClockOut)}</Descriptions.Item>
            <Descriptions.Item label="근무(분)">{daily.workedMinutes ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="휴게(분)">{daily.totalBreakMinutes ?? daily.breakMinutes ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="연장(분)">{daily.overtimeMinutes ?? '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="이벤트 로그">
        <Table<AttendanceLog>
          rowKey={(r) => r.attendanceLogId ?? `${r.eventType}-${r.eventTime}`}
          loading={logsQ.isLoading}
          columns={logColumns}
          dataSource={logsQ.data ?? []}
          pagination={false}
          size="small"
        />
      </Card>
    </Space>
  );
}
