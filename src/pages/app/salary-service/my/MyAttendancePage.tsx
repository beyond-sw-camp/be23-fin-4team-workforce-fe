/**
 * /app/attendance
 * 출퇴근·일별 요약·이벤트 로그. 그날 근태 행 없으면 로그 API 400 → 빈 테이블로 처리함.
 */
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Descriptions, Progress, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type {
  AttendanceLog,
  DailyAttendance,
} from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';
import type { ApiError } from '@/shared/api/types';

function isApiError(e: unknown): e is ApiError {
  return typeof e === 'object' && e !== null && 'status' in e && typeof (e as ApiError).status === 'number';
}

// 주간 근무시간 한도 임계치 75% WARNING 92% CRITICAL 100% EXCEEDED
type Severity = 'normal' | 'warning' | 'critical' | 'exceeded';

function severityOf(percent: number | null | undefined): Severity {
  const p = percent ?? 0;
  if (p >= 100) return 'exceeded';
  if (p >= 92) return 'critical';
  if (p >= 75) return 'warning';
  return 'normal';
}

function percentColor(sev: Severity): string {
  switch (sev) {
    case 'exceeded':
      return '#CF1322';
    case 'critical':
      return '#D4380D';
    case 'warning':
      return '#D48806';
    default:
      return '#2563EB';
  }
}

function formatHm(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.floor(minutes ?? 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}시간 ${rem}분`;
}

const EVENT_KO: Record<string, string> = {
  CLOCK_IN: '출근',
  CLOCK_OUT: '퇴근',
};

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : String(iso);
}

export function MyAttendancePage() {
  const { message, modal } = App.useApp();
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

  // 선택 일자 기준 주간 근무시간 요약 법정 52시간 / 12시간 모니터링
  const summaryQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'work-time-summary', dateIso],
    queryFn: () => attendanceApi.attendance.getMyWorkTimeSummary(dateIso),
  });

  const summary = summaryQ.data;
  const comprehensive = null;
  const totalSev = severityOf(summary?.totalUsagePercent);
  const otSev = severityOf(summary?.overtimeUsagePercent);

  const highest = useMemo<Severity>(() => {
    const order: Severity[] = ['normal', 'warning', 'critical', 'exceeded'];
    return order[Math.max(order.indexOf(totalSev), order.indexOf(otSev))];
  }, [totalSev, otSev]);

  const weekAlert = useMemo(() => {
    switch (highest) {
      case 'exceeded':
        return {
          type: 'error' as const,
          message: '법정 한도 초과',
          description:
            '주 52시간(총) 또는 주 12시간(연장) 한도를 초과했습니다. 관리자와 즉시 협의하세요.',
        };
      case 'critical':
        return {
          type: 'error' as const,
          message: '법정 한도 임박',
          description:
            '사용률이 92%를 초과했습니다. 추가 연장근무 신청 전 관리자와 조율이 필요합니다.',
        };
      case 'warning':
        return {
          type: 'warning' as const,
          message: '주의 단계',
          description: '사용률이 75%를 초과했습니다. 남은 근무시간을 점검하세요.',
        };
      default:
        return null;
    }
  }, [highest]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'my'] });
  };

  const clockInM = useMutation({
    mutationFn: () => attendanceApi.attendance.clockIn({}),
    onSuccess: () => {
      message.success('출근 처리되었습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '출근 처리에 실패했습니다.'),
  });

  const clockOutM = useMutation({
    mutationFn: () => attendanceApi.attendance.clockOut({}),
    onSuccess: () => {
      message.success('퇴근 처리되었습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '퇴근 처리에 실패했습니다.'),
  });

  const cancelClockOutM = useMutation({
    mutationFn: () => attendanceApi.attendance.cancelClockOut(),
    onSuccess: () => {
      message.success('퇴근이 취소되었습니다.');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message || '퇴근 취소에 실패했습니다.'),
  });

  const busy =
    clockInM.isPending ||
    clockOutM.isPending ||
    cancelClockOutM.isPending;

  const visibleLogs = useMemo(
    () =>
      (logsQ.data ?? []).filter(
        (log) => log.eventType !== 'BREAK_START' && log.eventType !== 'BREAK_END',
      ),
    [logsQ.data],
  );

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
            출퇴근은 백엔드 정책(하루 1회 등)을 따릅니다. 날짜를 바꿔 과거 로그를 볼 수 있습니다.
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

      {weekAlert && (
        <Alert
          type={weekAlert.type}
          showIcon
          message={weekAlert.message}
          description={weekAlert.description}
        />
      )}

      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        title="주간 근무시간 요약"
        loading={summaryQ.isLoading}
        size="small"
      >
        {summaryQ.isError && (
          <Typography.Text type="danger">주간 근무시간을 불러오지 못했습니다.</Typography.Text>
        )}
        {summary && (
          <Space direction="vertical" className="tw-w-full" size={12}>
            <Typography.Text type="secondary" className="tw-text-xs">
              대상 주간 {summary.weekStart ?? '—'} ~ {summary.weekEnd ?? '—'}
            </Typography.Text>

            {/* 포괄임금제 직원만 OT 한도 카드 노출 → 컬럼 수 동적 */}
            <div className={`tw-grid tw-grid-cols-2 ${
              comprehensive && comprehensive.fixedLimit != null
                ? 'md:tw-grid-cols-4'
                : 'md:tw-grid-cols-3'
            } tw-gap-3`}>
              <Card size="small" className="tw-border-slate-200/80">
                <Statistic
                  title="주 총 근무"
                  value={Math.round(((summary.totalWorkedMinutes ?? 0) / 60) * 10) / 10}
                  suffix="시간"
                  valueStyle={{ fontSize: 20, color: percentColor(totalSev) }}
                />
                <Progress
                  percent={summary.totalUsagePercent ?? 0}
                  size="small"
                  showInfo={false}
                  strokeColor={percentColor(totalSev)}
                  status={totalSev === 'exceeded' ? 'exception' : 'normal'}
                />
                <Typography.Text type="secondary" className="tw-text-xs">
                  {formatHm(summary.totalWorkedMinutes)} / {formatHm(summary.totalLimitMinutes)} (법정 기준 52시간)
                </Typography.Text>
              </Card>

              <Card size="small" className="tw-border-slate-200/80">
                <Statistic
                  title="주 연장근무"
                  value={Math.round(((summary.overtimeApprovedMinutes ?? 0) / 60) * 10) / 10}
                  suffix="시간"
                  valueStyle={{ fontSize: 20, color: percentColor(otSev) }}
                />
                <Progress
                  percent={summary.overtimeUsagePercent ?? 0}
                  size="small"
                  showInfo={false}
                  strokeColor={percentColor(otSev)}
                  status={otSev === 'exceeded' ? 'exception' : 'normal'}
                />
                <Typography.Text type="secondary" className="tw-text-xs">
                  {formatHm(summary.overtimeApprovedMinutes)} / {formatHm(summary.overtimeLimitMinutes)} (법정 기준 12시간)
                </Typography.Text>
              </Card>

              <Card size="small" className="tw-border-slate-200/80">
                <Statistic
                  title="주휴수당 자격"
                  value={summary.weeklyHolidayEligible ? '충족' : '미충족'}
                  valueStyle={{
                    fontSize: 20,
                    color: summary.weeklyHolidayEligible ? '#16a34a' : '#d97706',
                  }}
                />
                <div className="tw-mt-1">
                  <Tag color={summary.weeklyAbsentDays === 0 ? 'green' : 'red'}>
                    {summary.weeklyAbsentDays === 0
                      ? '개근'
                      : `결근 ${summary.weeklyAbsentDays ?? 0}일`}
                  </Tag>
                </div>
                <Typography.Text type="secondary" className="tw-text-xs">
                  근로기준법 55조
                </Typography.Text>
              </Card>

              {/* 포괄임금제 직원만 OT 한도 카드. 비포괄은 카드 자체 숨김 (그리드 3컬럼). */}
              {comprehensive && comprehensive.fixedLimit != null && (
                <Card size="small" className="tw-border-slate-200/80">
                  <Statistic
                    title="포괄임금 OT (월)"
                    value={(comprehensive.usagePercent ?? 0).toFixed(1)}
                    suffix="%"
                    valueStyle={{
                      fontSize: 20,
                      color:
                        (comprehensive.usagePercent ?? 0) >= 100
                          ? '#CF1322'
                          : (comprehensive.usagePercent ?? 0) >= 80
                          ? '#D48806'
                          : '#2563EB',
                    }}
                  />
                  <Progress
                    percent={Math.min(100, comprehensive.usagePercent ?? 0)}
                    size="small"
                    showInfo={false}
                    strokeColor={
                      (comprehensive.usagePercent ?? 0) >= 100
                        ? '#CF1322'
                        : (comprehensive.usagePercent ?? 0) >= 80
                        ? '#D48806'
                        : '#2563EB'
                    }
                    status={(comprehensive.usagePercent ?? 0) >= 100 ? 'exception' : 'normal'}
                  />
                  <Typography.Text type="secondary" className="tw-text-xs">
                    {formatHm(comprehensive.approvedMinutes)} / {formatHm(comprehensive.fixedLimit)}
                    {comprehensive.exceedMinutes ? (
                      <> · <Tag color="red" className="!tw-text-xs">초과 {formatHm(comprehensive.exceedMinutes)}</Tag></>
                    ) : null}
                  </Typography.Text>
                </Card>
              )}
            </div>

            <Typography.Text type="secondary" className="tw-text-xs">
              ※ 총 근무시간은 승인된 연장근무 + 실제 근무분 합산. 연장근무 승인분은 결재 완료 건만 반영.
            </Typography.Text>
          </Space>
        )}
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="오늘 처리">
        <Space wrap>
          <Button type="primary" loading={busy} onClick={() => clockInM.mutate()}>
            출근
          </Button>
          {/* 퇴근 버튼은 상태에 따라 분기 처리:
              - 아직 퇴근 전이면 일반 퇴근 처리
              - 이미 퇴근됐다면 confirm 후 취소 처리 (잘못 누른 경우 복구) */}
          {daily?.lastClockOut ? (
            <Button
              loading={busy}
              danger
              onClick={() => {
                modal.confirm({
                  title: '퇴근을 취소하시겠습니까?',
                  content:
                    '잘못 누른 경우에 사용하세요. 퇴근 기록과 근무·연장 분이 초기화되며, 다시 퇴근하려면 [퇴근] 버튼을 누르면 됩니다. (이미 마감된 근태는 취소할 수 없습니다.)',
                  okText: '퇴근 취소',
                  okButtonProps: { danger: true },
                  cancelText: '닫기',
                  onOk: () => cancelClockOutM.mutateAsync(),
                });
              }}
            >
              퇴근 취소
            </Button>
          ) : (
            <Button loading={busy} onClick={() => clockOutM.mutate()}>
              퇴근
            </Button>
          )}
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
            <Descriptions.Item label="연장(분)">{daily.overtimeMinutes ?? '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="이벤트 로그">
        <Table<AttendanceLog>
          rowKey={(r) => r.attendanceLogId ?? `${r.eventType}-${r.eventTime}`}
          loading={logsQ.isLoading}
          columns={logColumns}
          dataSource={visibleLogs}
          pagination={false}
          size="small"
        />
      </Card>
    </Space>
  );
}
