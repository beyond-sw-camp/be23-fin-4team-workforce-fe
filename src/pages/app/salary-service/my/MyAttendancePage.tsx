/**
 * /app/attendance
 * 내 근태 통합 - 오늘 처리 + 월간 현황(근무일/지각/결근/조퇴) + 월별 일자별 표. 정정 결재 진입점 포함.
 * 주간 근무시간 요약은 [초과근무 관리] 페이지로 이동.
 */
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoginOutlined, LogoutOutlined, RedoOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, DatePicker, Progress, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { approvalApi } from '@/features/approvals/api/approvalApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { normalizeSpringPage } from '@/features/salary-service/lib/normalizePage';
import type {
  CorrectionStateCode,
  DailyAttendance,
  WorkSchedule,
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

// 분 -> "80분 (1시간 20분)" 형식. 0분이면 그냥 "0분".
function formatMinutesWithHm(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.floor(minutes ?? 0));
  if (m <= 0) return '0분';
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${m}분 (${h}시간)` : `${m}분 (${h}시간 ${rem}분)`;
}

// 점심시간(분) 차감 후 실 근무 분 - 배치 전이라도 화면 즉시 표시용 추정값
function estimateWorkedMinutes(
  firstClockIn: string | null | undefined,
  lastClockOut: string | null | undefined,
  breakMinutes: number,
): number {
  if (!firstClockIn || !lastClockOut) return 0;
  const stay = dayjs(lastClockOut).diff(dayjs(firstClockIn), 'minute');
  return Math.max(0, stay - breakMinutes);
}

export function MyAttendancePage() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useMemo(() => dayjs(), []);
  const todayIso = today.format('YYYY-MM-DD');

  // 탭 상태 - URL ?view=daily|weekly 동기화
  const routeSearch = useSearch({ strict: false }) as { view?: 'daily' | 'weekly' };
  const activeView: 'daily' | 'weekly' = routeSearch.view === 'weekly' ? 'weekly' : 'daily';

  // 주간/월간 탭 - 기간 기준일 (해당 일자가 속한 주의 요약을 조회)
  const [weekAnchor, setWeekAnchor] = useState<Dayjs>(() => dayjs());
  const weekAnchorIso = weekAnchor.format('YYYY-MM-DD');

  // 월별 표 조회 기준 월 (기본 이번 달)
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [page, setPage] = useState(0);
  const pageSize = 31;
  const monthFrom = month.startOf('month').format('YYYY-MM-DD');
  const monthTo = month.endOf('month').format('YYYY-MM-DD');

  const dailyQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'daily', todayIso],
    queryFn: async (): Promise<DailyAttendance | null> => {
      try {
        return await attendanceApi.attendance.getMyDaily(todayIso);
      } catch (e) {
        if (isApiError(e) && e.status === 404) return null;
        throw e;
      }
    },
  });

  // 주간 근무시간 요약 - [주간/월간] 탭에서만 사용. weekAnchor 기준 주간 데이터를 받음.
  const summaryQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'work-time-summary', weekAnchorIso],
    queryFn: () => attendanceApi.attendance.getMyWorkTimeSummary(weekAnchorIso),
    enabled: activeView === 'weekly',
  });
  const summary = summaryQ.data;
  const totalSev = severityOf(summary?.totalUsagePercent);
  const otSev = severityOf(summary?.overtimeUsagePercent);

  // 활성 근무 스케줄 (workType 으로 FIXED/FLEXIBLE 판별 + 정규 출퇴근 시각으로 지각·조퇴 계산)
  const schedulesQ = useQuery({
    queryKey: ['salary', 'work-schedules'],
    queryFn: () => attendanceApi.workSchedule.list(),
    staleTime: 5 * 60_000,
  });
  const activeSchedule = useMemo<WorkSchedule | undefined>(() => {
    const list = schedulesQ.data ?? [];
    return list.find((s) => s.workType === 'FLEXIBLE') ?? list[0];
  }, [schedulesQ.data]);
  const scheduleTypeLabel = useMemo(() => {
    if (!activeSchedule) return '—';
    return activeSchedule.workType === 'FLEXIBLE' ? '시차 출퇴근제' : '고정 출퇴근제';
  }, [activeSchedule]);

  // 월별 일자별 근태 목록 - 정정 결재 진입용
  const monthlyQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'monthly', monthFrom, monthTo, page, pageSize],
    queryFn: () =>
      attendanceApi.attendance.getMyMonthly({
        from: monthFrom,
        to: monthTo,
        page,
        size: pageSize,
      }),
  });

  // 휴가 잔여 - 발생/사용/잔여 카드용 (촉진 대상은 휴가 계획 관리 페이지에 둠)
  const balanceQ = useQuery({
    queryKey: ['salary', 'member-balance', 'mine'],
    queryFn: () => attendanceApi.memberBalance.listMine(),
  });
  const balances = balanceQ.data ?? [];
  const totalGranted = balances.reduce((sum, row) => sum + (row.totalGranted ?? 0), 0);
  const totalUsed = balances.reduce((sum, row) => sum + (row.totalUsed ?? 0), 0);
  const totalRemaining = balances.reduce((sum, row) => sum + (row.remaining ?? 0), 0);

  const monthlyNormalized = useMemo(() => normalizeSpringPage(monthlyQ.data), [monthlyQ.data]);

  // 내 초과근무 신청 목록 - 행별 [초과근무 신청] 버튼에서 같은 날 결재 중인지 표시
  const overtimeReqQ = useQuery({
    queryKey: ['salary', 'attendance', 'overtime', 'my'],
    queryFn: () => attendanceApi.overtimeRequest.listMy({ page: 0, size: 100 }),
  });
  // 일자별 가장 최신 활성 신청 (PENDING 우선, 없으면 APPROVED) 매핑
  const overtimeByDate = useMemo(() => {
    const rows = overtimeReqQ.data?.content ?? [];
    const map: Record<string, 'PENDING' | 'APPROVED'> = {};
    for (const r of rows) {
      if (!r.targetDate) continue;
      const status = r.approvalStatus;
      if (status === 'PENDING') {
        map[r.targetDate] = 'PENDING';
      } else if (status === 'APPROVED' && map[r.targetDate] !== 'PENDING') {
        map[r.targetDate] = 'APPROVED';
      }
    }
    return map;
  }, [overtimeReqQ.data]);

  // 결재 양식 documentId 사전 조회 - 행별 버튼에서 navigate 시 사용 (근태정정신청, 연장근무신청)
  const correctionDocQ = useQuery({
    queryKey: ['approval', 'documents', 'active', 'attendance-docs'],
    queryFn: () => approvalApi.listActiveDocuments(),
    staleTime: 5 * 60_000,
  });
  const correctionDocId = useMemo(
    () => (correctionDocQ.data ?? []).find((d) => d.documentName === '근태정정신청')?.documentId,
    [correctionDocQ.data],
  );
  const overtimeDocId = useMemo(
    () => (correctionDocQ.data ?? []).find((d) => d.documentName === '연장근무신청')?.documentId,
    [correctionDocQ.data],
  );
  // 조퇴계 행별 진입은 화면 단순성 위해 제외 (자주 발생하지 않음). 조퇴는 전자결재 메뉴에서 양식 직접 작성

  // 이번 달 통계 - 근무일 / 지각 / 결근 / 조퇴
  const monthStats = useMemo(() => {
    const rows = monthlyNormalized.content;
    const startTime = activeSchedule?.startTime ?? null; // HH:mm:ss
    const endTime = activeSchedule?.endTime ?? null;
    const todayStr = todayIso;
    let workDays = 0;
    let tardy = 0;
    let absent = 0;
    let earlyLeave = 0;
    for (const r of rows) {
      if (!r.attendanceDate) continue;
      // 이번 달 + 오늘 포함 이전만 (미래 일자는 제외)
      if (r.attendanceDate > todayStr) continue;
      if (r.status === 'ABSENT') {
        absent += 1;
        continue;
      }
      if (r.firstClockIn || r.lastClockOut) {
        workDays += 1;
        if (startTime && r.firstClockIn) {
          const inHm = dayjs(r.firstClockIn).format('HH:mm:ss');
          if (inHm > startTime) tardy += 1;
        }
        if (endTime && r.lastClockOut) {
          const outHm = dayjs(r.lastClockOut).format('HH:mm:ss');
          if (outHm < endTime) earlyLeave += 1;
        }
      }
    }
    return { workDays, tardy, absent, earlyLeave };
  }, [monthlyNormalized, activeSchedule, todayIso]);

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

  // 월별 일자별 표 컬럼 - 결재양식 작성 진입점 포함
  const monthlyColumns: ColumnsType<DailyAttendance> = useMemo(
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
      {
        title: '근무 시간',
        key: 'workedMinutes',
        render: (_, row) => {
          // 배치 전이라도 즉시 표기 - 저장값이 있으면 그대로, 없으면 (체류시간 - 점심) 추정값
          const breakMin = activeSchedule?.breakMinutes ?? 0;
          const m = row.workedMinutes ?? estimateWorkedMinutes(row.firstClockIn, row.lastClockOut, breakMin);
          return formatMinutesWithHm(m);
        },
      },
      {
        title: '연장 시간',
        dataIndex: 'overtimeMinutes',
        key: 'overtimeMinutes',
        render: (v?: number | null) => formatMinutesWithHm(v),
      },
      {
        title: '근태 정정',
        key: 'correction',
        width: 180,
        align: 'center',
        render: (_, row) => {
          const state: CorrectionStateCode = row.correctionState ?? 'NORMAL';
          if (row.closureStatus === 'LOCKED')
            return <Typography.Text type="secondary">—</Typography.Text>;
          // 같은 날 다른 결재(조퇴계 등)로 격리 중이면 정정도 차단
          if (row.closureStatus === 'UNDER_REVIEW' && state !== 'PENDING') {
            return <Tag color="default">다른 결재 검토중</Tag>;
          }
          // 결재 진행 중이면 재신청 차단 (중복 결재 방지)
          if (state === 'PENDING') return <Tag color="gold">결재 진행중</Tag>;
          const goCompose = () => {
            if (!correctionDocId) return;
            const date = row.attendanceDate;
            const clockIn = row.firstClockIn ? dayjs(row.firstClockIn).format('HH:mm') : '';
            const clockOut = row.lastClockOut ? dayjs(row.lastClockOut).format('HH:mm') : '';
            void navigate({
              to: '/app/approvals',
              search: {
                tab: 'compose',
                docId: correctionDocId,
                corrDate: date,
                corrClockIn: clockIn,
                corrClockOut: clockOut,
              },
            });
          };
          // 정정 완료 후에도 재신청 허용 - 완료 Tag + 재신청 ghost 버튼
          if (state === 'COMPLETED') {
            return (
              <div className="tw-flex tw-flex-col tw-items-center tw-gap-1">
                <Tag color="green" className="!tw-m-0">정정 완료</Tag>
                <Button
                  type="default"
                  size="small"
                  icon={<RedoOutlined />}
                  className="!tw-h-6 !tw-rounded-full !tw-border-slate-200 !tw-px-2 !tw-text-[11px] !tw-text-slate-500 hover:!tw-border-blue-300 hover:!tw-text-blue-500"
                  disabled={!correctionDocId}
                  onClick={goCompose}
                >
                  재신청
                </Button>
              </div>
            );
          }
          return (
            <Button size="small" type="link" disabled={!correctionDocId} onClick={goCompose}>
              근태정정신청
            </Button>
          );
        },
      },
      {
        title: '초과근무',
        key: 'overtimeRequest',
        width: 170,
        align: 'center',
        render: (_, row) => {
          if (row.closureStatus === 'LOCKED')
            return <Typography.Text type="secondary">—</Typography.Text>;
          const otState = row.attendanceDate ? overtimeByDate[row.attendanceDate] : undefined;
          // 같은 날 다른 결재(조퇴계/정정 등)로 격리 중이면 초과근무 신청도 차단
          if (row.closureStatus === 'UNDER_REVIEW' && otState !== 'PENDING') {
            return <Tag color="default">다른 결재 검토중</Tag>;
          }
          // 결재 진행 중이면 재신청 차단 (중복 결재 방지)
          if (otState === 'PENDING') return <Tag color="gold">결재 진행중</Tag>;
          const goCompose = () => {
            if (!overtimeDocId) return;
            void navigate({
              to: '/app/approvals',
              search: {
                tab: 'compose',
                docId: overtimeDocId,
                otDate: row.attendanceDate,
              },
            });
          };
          // 승인 완료 후에도 재신청 허용 - 완료 Tag + 재신청 ghost 버튼
          if (otState === 'APPROVED') {
            return (
              <div className="tw-flex tw-flex-col tw-items-center tw-gap-1">
                <Tag color="green" className="!tw-m-0">승인 완료</Tag>
                <Button
                  type="default"
                  size="small"
                  icon={<RedoOutlined />}
                  className="!tw-h-6 !tw-rounded-full !tw-border-slate-200 !tw-px-2 !tw-text-[11px] !tw-text-slate-500 hover:!tw-border-blue-300 hover:!tw-text-blue-500"
                  disabled={!overtimeDocId}
                  onClick={goCompose}
                >
                  재신청
                </Button>
              </div>
            );
          }
          return (
            <Button size="small" type="link" disabled={!overtimeDocId} onClick={goCompose}>
              초과근무 신청
            </Button>
          );
        },
      },
    ],
    [navigate, correctionDocId, overtimeDocId, overtimeByDate],
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
            {activeView === 'weekly'
              ? '주·월 단위로 근무시간 한도(주 52시간/12시간)를 모니터링합니다.'
              : '오늘 출/퇴근 처리와 월별 근태를 한 화면에서 확인합니다.'}
          </Typography.Paragraph>
        </div>
        <Space wrap>
          {user?.isSystemAdmin && (
            <Link to="/app/attendance/company">
              <Button type="default">전사 근태(일별)</Button>
            </Link>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={activeView}
        onChange={(key) => {
          void navigate({
            to: '/app/attendance',
            search: { view: key === 'weekly' ? 'weekly' : 'daily' },
          });
        }}
        items={[
          { key: 'daily', label: '일자별' },
          { key: 'weekly', label: '주간 / 월간' },
        ]}
        className="!tw-mb-0"
      />

      {activeView === 'weekly' ? (
        <Space direction="vertical" className="tw-w-full" size={16}>
          {/* 기간 선택 - 빠른 버튼 + 기준일 (해당 일자가 속한 주의 요약 조회) */}
          <Card size="small" className="tw-border-slate-200/80">
            <Space wrap>
              <span className="tw-text-sm tw-text-slate-600">기준일</span>
              <DatePicker
                value={weekAnchor}
                onChange={(d) => d && setWeekAnchor(d)}
                allowClear={false}
                format="YYYY-MM-DD"
              />
              <Button size="small" onClick={() => setWeekAnchor(dayjs())}>이번 주</Button>
              <Button size="small" onClick={() => setWeekAnchor(dayjs().subtract(1, 'week'))}>지난 주</Button>
              <Button size="small" onClick={() => setWeekAnchor(dayjs().startOf('month'))}>이번 달 시작주</Button>
            </Space>
          </Card>

          <Card
            className="tw-border-slate-200/80 tw-shadow-sm"
            title="주간 근무시간 요약"
            loading={summaryQ.isLoading}
            size="small"
          >
            {summaryQ.isError && (
              <Alert
                type="warning"
                showIcon
                className="tw-mb-3"
                message="주간 근무시간을 불러오지 못했습니다."
                description="네트워크 또는 권한 문제일 수 있어요. 잠시 후 다시 시도해 주세요."
              />
            )}
            {summary && (
              <Space direction="vertical" className="tw-w-full" size={8}>
                <Typography.Text type="secondary" className="tw-text-xs">
                  대상 주간 {summary.weekStart ?? '—'} ~ {summary.weekEnd ?? '—'}
                </Typography.Text>
                <div className="tw-grid tw-grid-cols-1 sm:tw-grid-cols-2 tw-gap-3">
                  <Card size="small" className="tw-border-slate-200/80">
                    <Statistic
                      title="주 총 근무"
                      value={Math.round(((summary.totalWorkedMinutes ?? 0) / 60) * 10) / 10}
                      suffix="시간"
                      valueStyle={{ fontSize: 18, color: percentColor(totalSev) }}
                    />
                    <Progress
                      percent={summary.totalUsagePercent ?? 0}
                      size="small"
                      showInfo={false}
                      strokeColor={percentColor(totalSev)}
                      status={totalSev === 'exceeded' ? 'exception' : 'normal'}
                    />
                    <Typography.Text type="secondary" className="tw-text-xs">
                      {formatHm(summary.totalWorkedMinutes)} / {formatHm(summary.totalLimitMinutes)}
                    </Typography.Text>
                  </Card>
                  <Card size="small" className="tw-border-slate-200/80">
                    <Statistic
                      title="주 연장근무 (승인 완료)"
                      value={Math.round(((summary.overtimeApprovedMinutes ?? 0) / 60) * 10) / 10}
                      suffix="시간"
                      valueStyle={{ fontSize: 18, color: percentColor(otSev) }}
                    />
                    <Progress
                      percent={summary.overtimeUsagePercent ?? 0}
                      size="small"
                      showInfo={false}
                      strokeColor={percentColor(otSev)}
                      status={otSev === 'exceeded' ? 'exception' : 'normal'}
                    />
                    <Typography.Text type="secondary" className="tw-text-xs">
                      {formatHm(summary.overtimeApprovedMinutes)} / {formatHm(summary.overtimeLimitMinutes)}
                    </Typography.Text>
                  </Card>
                </div>
                {summary.weeklyHolidayEligible != null && (
                  <Alert
                    type={summary.weeklyHolidayEligible ? 'success' : 'info'}
                    showIcon
                    message={
                      summary.weeklyHolidayEligible
                        ? '이번 주 주휴수당 자격 충족 (주 15시간 이상 + 개근)'
                        : '이번 주 주휴수당 자격 미충족'
                    }
                    description={summary.weeklyHolidayReason ?? undefined}
                  />
                )}
              </Space>
            )}
          </Card>

          {/* 포괄임금 안내 - 별도 정책 API 미적용. 추후 OvertimePolicy 연동 시 사용량 표시 */}
          <Card size="small" className="tw-border-slate-200/80" title="포괄임금 연장근무">
            <Typography.Text type="secondary">
              포괄임금제가 적용된 경우 월별 포괄 한도와 사용량이 여기에 표시됩니다. (회사 정책에 따라 표시)
            </Typography.Text>
          </Card>
        </Space>
      ) : (
      <>
      {/* 이번 달 현황 - 근무 형태 / 근무일 / 지각 / 결근 / 조퇴 */}
      <div className="tw-grid tw-grid-cols-2 sm:tw-grid-cols-3 lg:tw-grid-cols-5 tw-gap-3">
        <Card size="small" className="tw-border-slate-200/80">
          <Statistic
            title="근무 형태"
            value={scheduleTypeLabel}
            valueStyle={{ fontSize: 18, color: '#0f172a', fontWeight: 600 }}
          />
        </Card>
        <Card size="small" className="tw-border-slate-200/80">
          <Statistic title="이번 달 근무일" value={monthStats.workDays} suffix="일" valueStyle={{ fontSize: 22 }} />
        </Card>
        <Card size="small" className="tw-border-slate-200/80">
          <Statistic
            title="이번 달 지각"
            value={monthStats.tardy}
            suffix="회"
            valueStyle={{ fontSize: 22, color: monthStats.tardy > 0 ? '#D48806' : undefined }}
          />
        </Card>
        <Card size="small" className="tw-border-slate-200/80">
          <Statistic
            title="이번 달 결근"
            value={monthStats.absent}
            suffix="회"
            valueStyle={{ fontSize: 22, color: monthStats.absent > 0 ? '#CF1322' : undefined }}
          />
        </Card>
        <Card size="small" className="tw-border-slate-200/80">
          <Statistic
            title="이번 달 조퇴"
            value={monthStats.earlyLeave}
            suffix="회"
            valueStyle={{ fontSize: 22, color: monthStats.earlyLeave > 0 ? '#D48806' : undefined }}
          />
        </Card>
      </div>

      {/* 상단 1번 row - 좌: 근태 현황(출근/퇴근 + 휴가 현황) - 도넛/주간 요약은 [초과근무 관리]로 이동 */}
      <div className="tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-3">
      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        size="small"
        title={
          <div className="tw-flex tw-items-center tw-justify-between">
            <span>근태 현황</span>
            <Typography.Text type="secondary" className="!tw-text-xs">
              {today.format('YYYY년 MM월 DD일 (dd)')}
            </Typography.Text>
          </div>
        }
      >
        <Space direction="vertical" size={16} className="tw-w-full">
          <div className="tw-flex tw-gap-2">
            <Button
              size="large"
              type="primary"
              loading={busy}
              icon={<LoginOutlined />}
              onClick={() => clockInM.mutate()}
              className="tw-flex-1"
            >
              출근하기
            </Button>
            {/* 퇴근 버튼은 상태에 따라 분기 처리:
                - 아직 퇴근 전이면 일반 퇴근 처리
                - 이미 퇴근됐다면 confirm 후 취소 처리 (잘못 누른 경우 복구) */}
            {daily?.lastClockOut ? (
              <Button
                size="large"
                loading={busy}
                danger
                icon={<LogoutOutlined />}
                className="tw-flex-1"
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
              <Button
                size="large"
                loading={busy}
                icon={<LogoutOutlined />}
                onClick={() => {
                  modal.confirm({
                    title: '퇴근하시겠습니까?',
                    content:
                      '퇴근 시각이 현재 시간으로 기록되며, 근무·연장 분이 계산됩니다. 잘못 누른 경우 [퇴근 취소] 버튼으로 되돌릴 수 있습니다.',
                    okText: '퇴근',
                    cancelText: '닫기',
                    onOk: () => clockOutM.mutateAsync(),
                  });
                }}
                className="tw-flex-1"
              >
                퇴근하기
              </Button>
            )}
          </div>

        </Space>
      </Card>

      {/* 우측 - 휴가 현황 카드 */}

      {/* 휴가 현황 - 근태 현황과 같은 row, 연차/사용/잔여 3 메트릭 inline 표시 */}
      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        size="small"
        title="휴가 현황"
        loading={balanceQ.isLoading}
      >
        <div className="tw-grid tw-grid-cols-3 tw-gap-3">
          <div className="tw-flex tw-flex-col tw-items-center tw-gap-1">
            <Typography.Text type="secondary" className="!tw-text-xs">
              연차휴가
            </Typography.Text>
            <Typography.Title level={3} className="!tw-m-0">
              {totalGranted.toLocaleString('ko-KR')}일
            </Typography.Title>
          </div>
          <div className="tw-flex tw-flex-col tw-items-center tw-gap-1">
            <Typography.Text type="secondary" className="!tw-text-xs">
              사용한 휴가
            </Typography.Text>
            <Typography.Title level={3} className="!tw-m-0">
              {totalUsed.toLocaleString('ko-KR')}일
            </Typography.Title>
          </div>
          <div className="tw-flex tw-flex-col tw-items-center tw-gap-1">
            <Typography.Text type="secondary" className="!tw-text-xs">
              잔여 휴가
            </Typography.Text>
            <Typography.Title level={3} className="!tw-m-0 !tw-text-[#2563EB]">
              {totalRemaining.toLocaleString('ko-KR')}일
            </Typography.Title>
          </div>
        </div>
      </Card>

      </div>

      {/* 월별 일자별 근태 - 정정 결재 진입점 */}
      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        title={
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
            <span>일자별 근태</span>
            <Space>
              {/* 결재 승인/반려 직후 즉시 반영 확인용 - Kafka consumer 처리 후 캐시 갱신 */}
              <Button
                size="small"
                onClick={() => {
                  void monthlyQ.refetch();
                  void qc.invalidateQueries({ queryKey: ['salary', 'attendance', 'overtime', 'my'] });
                }}
                loading={monthlyQ.isFetching}
              >
                새로고침
              </Button>
              <DatePicker
                picker="month"
                value={month}
                allowClear={false}
                onChange={(d) => {
                  if (d) {
                    setMonth(d.startOf('month'));
                    setPage(0);
                  }
                }}
              />
            </Space>
          </div>
        }
      >
        {monthlyQ.isError && (
          <Alert
            type="error"
            showIcon
            className="tw-mb-3"
            message="월별 근태 조회에 실패했습니다."
            description="잠시 후 다시 시도해 주세요."
          />
        )}
        <Table<DailyAttendance>
          rowKey={(r) => r.dailyAttendanceId ?? `${r.attendanceDate}-${r.status}`}
          loading={monthlyQ.isLoading}
          columns={monthlyColumns}
          dataSource={monthlyNormalized.content}
          size="small"
          pagination={{
            current: monthlyNormalized.page + 1,
            pageSize: monthlyNormalized.pageSize,
            total: monthlyNormalized.totalElements,
            showSizeChanger: false,
            onChange: (p) => setPage(p - 1),
          }}
        />
      </Card>
      </>
      )}
    </Space>
  );
}
