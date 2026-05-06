/**
 * /app/attendance
 * 내 근태 통합 - 오늘 처리 + 월간 현황(근무일/지각/결근/조퇴) + 월별 일자별 표. 정정 결재 진입점 포함.
 * 주간 근무시간 요약은 [초과근무 관리] 페이지로 이동.
 */
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoginOutlined, LogoutOutlined, RedoOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Modal,
  Progress,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { approvalApi } from '@/features/approvals/api/approvalApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import { normalizeSpringPage } from '@/features/salary-service/lib/normalizePage';
import type {
  CorrectionStateCode,
  DailyAttendance,
  FlexibleTimeSlot,
  LeaveRequest,
  MemberScheduleSelection,
  WorkSchedule,
} from '@/features/salary-service/types';
import { AttendanceStatusTag } from '@/features/salary-service/ui/AttendanceStatusTag';
import { MyLeaveHistoryModal } from '@/features/salary-service/ui/MyLeaveHistoryModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import type { ApiError } from '@/shared/api/types';

function isApiError(e: unknown): e is ApiError {
  return (
    typeof e === 'object' &&
    e !== null &&
    'status' in e &&
    typeof (e as ApiError).status === 'number'
  );
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
  // 휴가 이력 모달 (내 휴가 신청 결재 이력 - LeaveRequest 전체) - 컴포넌트 추출, 대시보드와 공유
  const [leaveHistoryOpen, setLeaveHistoryOpen] = useState(false);

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

  // 활성 SalaryPolicy - wageSystemType 으로 포괄임금제 (COMPREHENSIVE) 여부 판별
  const salaryPolicyQ = useQuery({
    queryKey: ['salary', 'salary-policies', 'my-active'],
    queryFn: () => salaryApi.salaryPolicy.list(),
    staleTime: 60_000,
    enabled: activeView === 'weekly',
  });

  // 히트맵 표시 월 (별도 이동 가능). weekAnchor 변경 시 자동 sync.
  const [heatmapMonth, setHeatmapMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  useEffect(() => {
    setHeatmapMonth(weekAnchor.startOf('month'));
  }, [weekAnchor]);

  // 주간/월간 시각화용 일별 근태 - weekAnchor 의 주 + heatmapMonth 그리드 모두 커버
  const visMonthFrom = useMemo(() => {
    const a = weekAnchor.startOf('week');
    const b = heatmapMonth.startOf('month').startOf('week');
    return (a.isBefore(b) ? a : b).format('YYYY-MM-DD');
  }, [weekAnchor, heatmapMonth]);
  const visMonthTo = useMemo(() => {
    const a = weekAnchor.endOf('week');
    const b = heatmapMonth.endOf('month').endOf('week');
    return (a.isAfter(b) ? a : b).format('YYYY-MM-DD');
  }, [weekAnchor, heatmapMonth]);
  const visDailyQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'vis-daily', visMonthFrom, visMonthTo],
    queryFn: () =>
      attendanceApi.attendance.getMyMonthly({
        from: visMonthFrom,
        to: visMonthTo,
        page: 0,
        size: 45,
      }),
    enabled: activeView === 'weekly',
    // 같은 월 재방문 시 5분간 캐시 HIT
    staleTime: 5 * 60_000,
  });
  const visDailyMap = useMemo(() => {
    const map = new Map<string, DailyAttendance>();
    const rows = normalizeSpringPage(visDailyQ.data).content;
    for (const row of rows) {
      if (row.attendanceDate) map.set(row.attendanceDate, row);
    }
    return map;
  }, [visDailyQ.data]);

  // 회사 공휴일 - 히트맵 셀 + 일자별 표 휴일 태그에 표시 (마스터 데이터, 길게 캐시)
  const holidaysQ = useQuery({
    queryKey: ['attendance', 'company-holidays', 'all'],
    queryFn: () => attendanceApi.companyHoliday.list(),
    staleTime: 10 * 60_000,
  });
  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidaysQ.data ?? []) {
      if (h.holidayDate && h.holidayName) m.set(h.holidayDate, h.holidayName);
    }
    return m;
  }, [holidaysQ.data]);
  const isComprehensive = (salaryPolicyQ.data ?? []).some(
    (p) =>
      p.wageSystemType === 'COMPREHENSIVE' &&
      (!p.effectiveTo || dayjs(p.effectiveTo).isAfter(dayjs(), 'day')),
  );

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

  // FLEXIBLE 회사면 본인 이번 달 슬롯 선택 + 슬롯 시간을 합성해서 화면에 표시
  // FIXED 회사면 회사 WorkSchedule 자체에 startTime/endTime/break가 박힌다
  const thisYearMonth = today.format('YYYY-MM');
  const isFlexible = activeSchedule?.workType === 'FLEXIBLE';
  const mySelectionQ = useQuery({
    queryKey: ['salary', 'schedule-selection', 'my', 'current', thisYearMonth],
    queryFn: () => attendanceApi.scheduleSelection.getMyCurrent(thisYearMonth),
    enabled: !!isFlexible,
    staleTime: 5 * 60_000,
  });
  const mySelection: MemberScheduleSelection | null = mySelectionQ.data ?? null;
  const mySlotQ = useQuery({
    queryKey: ['salary', 'flexible-slot', mySelection?.slotId ?? null],
    queryFn: () => attendanceApi.flexibleSlot.getById(mySelection!.slotId!),
    enabled: !!isFlexible && !!mySelection?.slotId,
    staleTime: 5 * 60_000,
  });
  const mySlot: FlexibleTimeSlot | undefined = mySlotQ.data ?? undefined;

  // HH:mm:ss 시간 차를 분으로
  const minutesBetweenHms = (s?: string | null, e?: string | null): number => {
    if (!s || !e) return 0;
    const ds = dayjs(`2000-01-01T${s}`);
    const de = dayjs(`2000-01-01T${e}`);
    let m = de.diff(ds, 'minute');
    if (m < 0) m += 24 * 60;
    return Math.max(0, m);
  };

  // 화면 표시·통계용 유효 스케줄 - FLEXIBLE이면 (slot + selection) 우선, FIXED면 회사 WorkSchedule
  const effectiveSchedule = useMemo(() => {
    if (!activeSchedule) return undefined;
    if (!isFlexible) {
      const breakMin = activeSchedule.breakMinutes
        ?? minutesBetweenHms(activeSchedule.breakStart, activeSchedule.breakEnd);
      return {
        startTime: activeSchedule.startTime ?? null,
        endTime: activeSchedule.endTime ?? null,
        workMinutes: activeSchedule.workMinutes ?? null,
        breakMinutes: breakMin,
      };
    }
    // FLEXIBLE - 본인 슬롯 + 본인 선택 점심 우선
    const startTime = mySlot?.startTime ?? null;
    const endTime = mySlot?.endTime ?? null;
    const workMinutes = mySlot?.workMinutes ?? null;
    const breakStart = mySelection?.breakStart ?? mySlot?.breakStart ?? null;
    const breakEnd = mySelection?.breakEnd ?? mySlot?.breakEnd ?? null;
    const breakMin = mySelection?.breakMinutes ?? minutesBetweenHms(breakStart, breakEnd);
    return { startTime, endTime, workMinutes, breakMinutes: breakMin };
  }, [activeSchedule, isFlexible, mySlot, mySelection]);

  // 월별 일자별 근태 목록 - 정정 결재 진입용
  // staleTime 60s: 같은 월 페이지 이동 / 다른 탭 갔다와도 60초 내는 캐시 HIT
  const monthlyQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'monthly', monthFrom, monthTo, page, pageSize],
    queryFn: () =>
      attendanceApi.attendance.getMyMonthly({
        from: monthFrom,
        to: monthTo,
        page,
        size: pageSize,
      }),
    staleTime: 60_000,
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
    const startTime = effectiveSchedule?.startTime ?? null; // HH:mm:ss
    const endTime = effectiveSchedule?.endTime ?? null;
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
  }, [monthlyNormalized, effectiveSchedule, todayIso]);

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

  const busy = clockInM.isPending || clockOutM.isPending || cancelClockOutM.isPending;

  // 월별 일자별 표 컬럼 - 결재양식 작성 진입점 포함
  const monthlyColumns: ColumnsType<DailyAttendance> = useMemo(
    () => [
      {
        title: '일자',
        dataIndex: 'attendanceDate',
        key: 'attendanceDate',
        render: (v?: string | null) => {
          if (!v) return '—';
          const dj = dayjs(v);
          const dow = dj.day();
          const isWeekend = dow === 0 || dow === 6;
          const holidayName = holidayMap.get(v);
          if (holidayName) {
            return (
              <Space size={6}>
                <span>{v}</span>
                <Tag color="red" className="!tw-m-0">
                  {holidayName}
                </Tag>
              </Space>
            );
          }
          if (isWeekend) {
            return (
              <Space size={6}>
                <span>{v}</span>
                <Tag color={dow === 0 ? 'red' : 'blue'} className="!tw-m-0">
                  {dow === 0 ? '일' : '토'}
                </Tag>
              </Space>
            );
          }
          return v;
        },
      },
      {
        title: '상태',
        key: 'status',
        render: (_, row) => (
          <AttendanceStatusTag status={row.status} workTripType={row.workTripType ?? null} />
        ),
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
          const breakMin = effectiveSchedule?.breakMinutes ?? 0;
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
                <Tag color="green" className="!tw-m-0">
                  정정 완료
                </Tag>
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
                <Tag color="green" className="!tw-m-0">
                  승인 완료
                </Tag>
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
    [navigate, correctionDocId, overtimeDocId, overtimeByDate, holidayMap, effectiveSchedule],
  );

  const daily = dailyQ.data;

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        eyebrow="ATTENDANCE"
        title="내 근태"
        subtitle={
          activeView === 'weekly'
            ? '주·월 단위로 근무시간 한도와 초과근무 흐름을 확인합니다.'
            : '오늘 출퇴근 처리와 월별 근태 현황을 한 화면에서 확인합니다.'
        }
        extra={
          user?.isSystemAdmin ? (
            <Link to="/app/attendance/company">
              <Button type="default">전사 근태(일별)</Button>
            </Link>
          ) : null
        }
      />

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
            <Space wrap size={8}>
              <span className="tw-text-sm tw-text-slate-600">조회 주</span>
              <Button
                size="small"
                onClick={() => setWeekAnchor((d) => d.subtract(1, 'year'))}
                aria-label="이전 해"
                title="1년 전"
              >
                «
              </Button>
              <Button
                size="small"
                onClick={() => setWeekAnchor((d) => d.subtract(1, 'month'))}
                aria-label="이전 달"
                title="한 달 전"
              >
                ‹‹
              </Button>
              <Button
                size="small"
                onClick={() => setWeekAnchor((d) => d.subtract(1, 'week'))}
                aria-label="이전 주"
                title="한 주 전"
              >
                ‹
              </Button>
              <span className="tw-text-sm tw-text-slate-700 tw-font-medium tw-min-w-[180px] tw-text-center">
                {weekAnchor.startOf('week').format('YYYY-MM-DD')}
                {' ~ '}
                {weekAnchor.startOf('week').add(6, 'day').format('YYYY-MM-DD')}
              </span>
              <Button
                size="small"
                onClick={() => setWeekAnchor((d) => d.add(1, 'week'))}
                aria-label="다음 주"
                title="한 주 후"
                disabled={weekAnchor.add(1, 'week').isAfter(dayjs(), 'week')}
              >
                ›
              </Button>
              <Button
                size="small"
                onClick={() => setWeekAnchor((d) => d.add(1, 'month'))}
                aria-label="다음 달"
                title="한 달 후"
                disabled={weekAnchor.add(1, 'month').isAfter(dayjs(), 'week')}
              >
                ››
              </Button>
              <Button
                size="small"
                onClick={() => setWeekAnchor((d) => d.add(1, 'year'))}
                aria-label="다음 해"
                title="1년 후"
                disabled={weekAnchor.add(1, 'year').isAfter(dayjs(), 'week')}
              >
                »
              </Button>
              <Button
                size="small"
                type={weekAnchor.isSame(dayjs(), 'week') ? 'primary' : 'default'}
                onClick={() => setWeekAnchor(dayjs())}
              >
                이번 주
              </Button>
            </Space>
          </Card>

          {/* 좌: 한도 모니터링 + 주간 막대 / 우: 월간 히트맵 - 2열 레이아웃으로 스크롤 최소화 */}
          <div className="tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-3">
            <Space direction="vertical" className="tw-w-full" size={12}>
              <Card
                className="tw-border-slate-200/80 tw-shadow-sm"
                title="근무시간 한도 모니터링"
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
                  <Space direction="vertical" className="tw-w-full" size={6}>
                    <Typography.Text type="secondary" className="!tw-text-xs">
                      {summary.weekStart ?? '—'} ~ {summary.weekEnd ?? '—'}
                    </Typography.Text>
                    {/* 한도 카드 - 1열로 컴팩트 */}
                    <div className="tw-space-y-2">
                      <CompactLimitRow
                        label="이번 주 근무시간"
                        limitLabel="52h"
                        value={summary.totalWorkedMinutes}
                        limit={summary.totalLimitMinutes}
                        percent={summary.totalUsagePercent}
                        severity={totalSev}
                      />
                      <CompactLimitRow
                        label="이번 주 연장근무"
                        limitLabel="12h"
                        value={summary.overtimeApprovedMinutes}
                        limit={summary.overtimeLimitMinutes}
                        percent={summary.overtimeUsagePercent}
                        severity={otSev}
                      />
                      {summary.monthlyOvertimeLimitMinutes != null &&
                        summary.monthlyOvertimeLimitMinutes > 0 && (
                          <CompactLimitRow
                            label="이번 달 연장근무 누적"
                            limitLabel={`${Math.round(summary.monthlyOvertimeLimitMinutes / 60)}h`}
                            value={summary.monthlyOvertimeMinutes}
                            limit={summary.monthlyOvertimeLimitMinutes}
                            percent={summary.monthlyOvertimeUsagePercent}
                            severity={severityOf(summary.monthlyOvertimeUsagePercent)}
                          />
                        )}
                    </div>
                  </Space>
                )}
              </Card>

              <WeeklyDailyBars weekAnchor={weekAnchor} dailyMap={visDailyMap} />
            </Space>

            <MonthlyHeatmap
              monthCursor={heatmapMonth}
              weekAnchor={weekAnchor}
              dailyMap={visDailyMap}
              holidayMap={holidayMap}
              onPrevMonth={() => {
                // 월 이동 시 조회 주도 새 월의 첫째날(이 속한 주)로 함께 이동
                const newMonth = heatmapMonth.subtract(1, 'month').startOf('month');
                setHeatmapMonth(newMonth);
                setWeekAnchor(newMonth);
              }}
              onNextMonth={() => {
                const newMonth = heatmapMonth.add(1, 'month').startOf('month');
                setHeatmapMonth(newMonth);
                setWeekAnchor(newMonth);
              }}
            />
          </div>

          {/* 포괄임금 안내 - 활성 정책의 wageSystemType=COMPREHENSIVE 일 때만 노출 */}
          {isComprehensive && (
            <Card size="small" className="tw-border-slate-200/80" title="포괄임금 연장근무">
              <Typography.Text type="secondary">
                포괄임금제가 적용된 경우 월별 포괄 한도와 사용량이 여기에 표시됩니다. (회사 정책에
                따라 표시)
              </Typography.Text>
            </Card>
          )}
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
              <Statistic
                title="이번 달 근무일"
                value={monthStats.workDays}
                suffix="일"
                valueStyle={{ fontSize: 22 }}
              />
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
                valueStyle={{
                  fontSize: 22,
                  color: monthStats.earlyLeave > 0 ? '#D48806' : undefined,
                }}
              />
            </Card>
          </div>

          {/* 상단 1번 row - 근태 현황 1 : 휴가 현황 2 비율로 분할 */}
          <div className="tw-grid tw-grid-cols-1 lg:tw-grid-cols-3 tw-gap-3">
            <Card
              className="tw-border-slate-200/80 tw-shadow-sm lg:tw-col-span-1"
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
              <div className="tw-flex tw-items-center tw-gap-3">
                {/* 좌측: 출근/퇴근 버튼을 좌우로 배치 (위아래 X - 오타 방지). 폭은 좁게 (max-w 제한) */}
                <div className="tw-flex tw-gap-2 tw-flex-1 tw-min-w-0">
                  <Button
                    size="large"
                    type="primary"
                    loading={busy}
                    icon={<LoginOutlined />}
                    onClick={() => clockInM.mutate()}
                    className="tw-flex-1 !tw-max-w-[180px]"
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
                      className="tw-flex-1 !tw-max-w-[180px]"
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
                      className="tw-flex-1 !tw-max-w-[180px]"
                    >
                      퇴근하기
                    </Button>
                  )}
                </div>

                {/* 우측: 하루 스케줄 도넛 - 출근~현재(또는 퇴근) 진행률 */}
                <DailyScheduleDonut
                  firstClockIn={daily?.firstClockIn ?? null}
                  lastClockOut={daily?.lastClockOut ?? null}
                  scheduleStartTime={effectiveSchedule?.startTime ?? null}
                  scheduleEndTime={effectiveSchedule?.endTime ?? null}
                  scheduledMinutes={effectiveSchedule?.workMinutes ?? null}
                  workedMinutes={daily?.workedMinutes ?? null}
                  breakMinutes={effectiveSchedule?.breakMinutes ?? 0}
                />
              </div>
            </Card>

            {/* 우측 - 휴가 현황 카드 */}

            {/* 휴가 현황 - 근태 현황과 같은 row (2/3 폭), 연차/사용/잔여/이력 4 메트릭 inline 표시 */}
            <Card
              className="tw-border-slate-200/80 tw-shadow-sm lg:tw-col-span-2"
              size="small"
              title="휴가 현황"
              loading={balanceQ.isLoading}
            >
              <div className="tw-grid tw-grid-cols-4 tw-gap-3">
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
                <div className="tw-flex tw-flex-col tw-items-center tw-gap-1">
                  <Typography.Text type="secondary" className="!tw-text-xs">
                    휴가 이력
                  </Typography.Text>
                  <Button
                    type="primary"
                    ghost
                    onClick={() => setLeaveHistoryOpen(true)}
                    className="!tw-mt-1"
                  >
                    전체 보기
                  </Button>
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

      {/* 휴가 이력 모달 - 내가 신청한 LeaveRequest 전체 (대기/승인/반려/취소). 대시보드 위젯과 동일 컴포넌트 사용 */}
      <MyLeaveHistoryModal open={leaveHistoryOpen} onClose={() => setLeaveHistoryOpen(false)} />
    </Space>
  );
}

/** 하루 스케줄 도넛 - 출근~퇴근(또는 현재) 진행률 */
function DailyScheduleDonut({
  firstClockIn,
  lastClockOut,
  scheduleStartTime,
  scheduleEndTime,
  scheduledMinutes,
  workedMinutes,
  breakMinutes,
}: {
  firstClockIn: string | null;
  lastClockOut: string | null;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  scheduledMinutes: number | null;
  workedMinutes: number | null;
  breakMinutes: number;
}) {
  // 정규 근무시간 (스케줄), 기본 8시간
  const targetMinutes = scheduledMinutes && scheduledMinutes > 0 ? scheduledMinutes : 480;

  // 진행 분 계산 - 퇴근 했으면 workedMinutes(서버), 안 했으면 (현재 - 출근 - 점심)
  const elapsedMinutes = (() => {
    if (workedMinutes != null && workedMinutes > 0) return workedMinutes;
    if (!firstClockIn) return 0;
    const start = dayjs(firstClockIn);
    if (!start.isValid()) return 0;
    const end = lastClockOut ? dayjs(lastClockOut) : dayjs();
    const stay = end.diff(start, 'minute');
    return Math.max(0, stay - (breakMinutes ?? 0));
  })();

  const percent = Math.min(100, Math.round((elapsedMinutes / targetMinutes) * 100));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / 100);
  const ringColor = percent >= 100 ? '#16a34a' : percent >= 75 ? '#2563EB' : '#3b82f6';

  const statusText = (() => {
    if (!firstClockIn) return '미출근';
    if (lastClockOut) return '퇴근 완료';
    return '근무 중';
  })();

  const tooltipContent = (
    <div className="tw-text-xs tw-leading-5">
      <div>
        스케줄: {scheduleStartTime?.slice(0, 5) ?? '-'} ~ {scheduleEndTime?.slice(0, 5) ?? '-'}
      </div>
      <div>
        정규 근무: {Math.floor(targetMinutes / 60)}시간 {targetMinutes % 60}분
      </div>
      <div>
        진행: {Math.floor(elapsedMinutes / 60)}시간 {elapsedMinutes % 60}분 ({percent}%)
      </div>
      {firstClockIn && <div>출근: {dayjs(firstClockIn).format('HH:mm')}</div>}
      {lastClockOut && <div>퇴근: {dayjs(lastClockOut).format('HH:mm')}</div>}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="left">
      <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-shrink-0">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
          <text
            x="50"
            y="46"
            textAnchor="middle"
            dy="0.35em"
            fontSize="18"
            fontWeight="700"
            fill="#0f172a"
          >
            {percent}%
          </text>
          <text x="50" y="64" textAnchor="middle" dy="0.35em" fontSize="10" fill="#64748b">
            {statusText}
          </text>
        </svg>
      </div>
    </Tooltip>
  );
}

/** 한도 모니터링 1행 - 라벨 + 값/한도 + Progress */
function CompactLimitRow({
  label,
  limitLabel,
  value,
  limit,
  percent,
  severity,
}: {
  label: string;
  limitLabel: string;
  value?: number | null;
  limit?: number | null;
  percent?: number | null;
  severity: Severity;
}) {
  const hours = Math.round(((value ?? 0) / 60) * 10) / 10;
  return (
    <div>
      <div className="tw-flex tw-items-baseline tw-justify-between tw-mb-1">
        <span className="tw-text-xs tw-text-slate-600">
          {label} <span className="tw-text-slate-400">({limitLabel} 한도)</span>
        </span>
        <span className="tw-text-sm tw-font-semibold" style={{ color: percentColor(severity) }}>
          {hours}h
          <span className="tw-text-xs tw-text-slate-400 tw-ml-1">
            / {Math.round((limit ?? 0) / 60)}h
          </span>
        </span>
      </div>
      <Progress
        percent={percent ?? 0}
        size="small"
        showInfo={false}
        strokeColor={percentColor(severity)}
        status={severity === 'exceeded' ? 'exception' : 'normal'}
      />
    </div>
  );
}

/**
 * 이번 주 일별 근무시간 막대 차트 - 월~일 7개 막대
 *  - 막대 높이 = workedMinutes / 13h (max)
 *  - 색상: 8h 이하 회색 / 8~10h 파랑 / 10~12h 주황 / 12h+ 빨강
 *  - 휴가/결근/출장은 텍스트 라벨로 표시
 */
function WeeklyDailyBars({
  weekAnchor,
  dailyMap,
}: {
  weekAnchor: Dayjs;
  dailyMap: Map<string, DailyAttendance>;
}) {
  const days = useMemo(() => {
    // 일요일 시작 (dayjs 기본 startOf('week') = 일요일)
    const sunday = weekAnchor.startOf('week');
    const result: { date: Dayjs; iso: string; daily?: DailyAttendance }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = sunday.add(i, 'day');
      const iso = d.format('YYYY-MM-DD');
      result.push({ date: d, iso, daily: dailyMap.get(iso) });
    }
    return result;
  }, [weekAnchor, dailyMap]);

  const MAX_HOURS = 13;
  const colorFor = (hours: number) => {
    if (hours >= 12) return 'tw-bg-red-500';
    if (hours >= 10) return 'tw-bg-orange-500';
    if (hours >= 8) return 'tw-bg-blue-500';
    if (hours > 0) return 'tw-bg-slate-400';
    return 'tw-bg-slate-200';
  };
  const dowKor = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <Card size="small" className="tw-border-slate-200/80" title="이번 주 일별 근무시간">
      <div className="tw-flex tw-items-end tw-justify-around tw-gap-1 tw-h-[140px] tw-px-1">
        {days.map((c, i) => {
          const status = c.daily?.status;
          const minutes = c.daily?.workedMinutes ?? 0;
          const hours = minutes / 60;
          const heightPct = Math.min(100, (hours / MAX_HOURS) * 100);
          const isWeekend = i === 0 || i === 6;
          const label =
            status === 'LEAVE'
              ? '연차'
              : status === 'HALF'
                ? '반차'
                : status === 'ABSENT'
                  ? '결근'
                  : c.daily?.workTripType === 'BUSINESS_TRIP'
                    ? '출장'
                    : c.daily?.workTripType === 'OUTSIDE_WORK'
                      ? '외근'
                      : null;
          return (
            <div key={c.iso} className="tw-flex tw-flex-col tw-items-center tw-flex-1 tw-min-w-0">
              <div className="tw-text-[10px] tw-text-slate-700 tw-font-medium tw-h-3.5 tw-leading-none">
                {hours > 0 ? `${hours.toFixed(1)}h` : ''}
              </div>
              <div className="tw-w-full tw-h-[88px] tw-flex tw-items-end tw-justify-center tw-mt-0.5">
                {minutes > 0 ? (
                  <div
                    className={`tw-w-full tw-rounded-t ${colorFor(hours)}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${c.iso} - ${hours.toFixed(1)}시간 근무`}
                  />
                ) : (
                  <div className="tw-w-full tw-h-full tw-flex tw-items-center tw-justify-center">
                    {label && (
                      <span className="tw-text-[10px] tw-text-slate-500 tw-bg-slate-100 tw-px-1 tw-py-0.5 tw-rounded">
                        {label}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div
                className={`tw-text-[10px] tw-mt-1 tw-leading-none ${isWeekend ? 'tw-text-rose-500' : 'tw-text-slate-600'}`}
              >
                {dowKor[i]}
              </div>
            </div>
          );
        })}
      </div>
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-2 tw-mt-1 tw-text-[10px] tw-text-slate-500">
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-slate-400 tw-rounded-sm" />
          ~8h
        </span>
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-blue-500 tw-rounded-sm" />
          8~10h
        </span>
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-orange-500 tw-rounded-sm" />
          10~12h
        </span>
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-red-500 tw-rounded-sm" />
          12h+
        </span>
      </div>
    </Card>
  );
}

/**
 * 이번 달 일별 캘린더 히트맵
 *  - 4~6주 그리드, 각 셀 배경 색 강도 = 근무시간
 *  - 휴가 노랑 / 출장 파랑 / 결근 빨강 / 주말 회색
 *  - 현재 조회 중인 주는 파란 보더로 강조 (왼쪽 한도 카드와 연동)
 */
function MonthlyHeatmap({
  monthCursor,
  weekAnchor,
  dailyMap,
  holidayMap,
  onPrevMonth,
  onNextMonth,
}: {
  monthCursor: Dayjs;
  weekAnchor: Dayjs;
  dailyMap: Map<string, DailyAttendance>;
  holidayMap: Map<string, string>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const month = monthCursor.startOf('month');
  const monthLabel = month.format('YYYY년 M월');
  // 현재 조회 중인 주의 시작/끝 (weekAnchor 기준, 일~토)
  const sundayOfAnchor = weekAnchor.startOf('week');
  const highlightWeekStart = sundayOfAnchor.format('YYYY-MM-DD');
  const highlightWeekEnd = sundayOfAnchor.add(6, 'day').format('YYYY-MM-DD');
  const weeks = useMemo(() => {
    const start = month.startOf('week');
    const end = month.endOf('month').endOf('week');
    const cells: { date: Dayjs; iso: string; inMonth: boolean; daily?: DailyAttendance }[][] = [];
    let cursor = start;
    while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
      const week: (typeof cells)[number] = [];
      for (let d = 0; d < 7; d++) {
        const date = cursor.add(d, 'day');
        const iso = date.format('YYYY-MM-DD');
        week.push({
          date,
          iso,
          inMonth: date.month() === month.month(),
          daily: dailyMap.get(iso),
        });
      }
      cells.push(week);
      cursor = cursor.add(7, 'day');
    }
    return cells;
  }, [month, dailyMap]);

  const cellBg = (cell: {
    inMonth: boolean;
    daily?: DailyAttendance;
    date: Dayjs;
    iso: string;
  }) => {
    const isHoliday = holidayMap.has(cell.iso);
    const status = cell.daily?.status;
    // 공휴일 우선 - 근무 데이터가 있어도 휴일 표시가 우선 (단 LEAVE/HALF/ABSENT 같은 명시적 상태는 별개로 표시)
    if (isHoliday && !status) {
      return cell.inMonth
        ? 'tw-bg-rose-100 tw-text-rose-700'
        : 'tw-bg-rose-50 tw-text-rose-500 tw-opacity-70';
    }
    if (status === 'LEAVE')
      return cell.inMonth
        ? 'tw-bg-yellow-200 tw-text-yellow-900'
        : 'tw-bg-yellow-100 tw-text-yellow-800 tw-opacity-70';
    if (status === 'HALF')
      return cell.inMonth
        ? 'tw-bg-yellow-100 tw-text-yellow-800'
        : 'tw-bg-yellow-50 tw-text-yellow-700 tw-opacity-70';
    if (status === 'ABSENT')
      return cell.inMonth
        ? 'tw-bg-red-200 tw-text-red-900'
        : 'tw-bg-red-100 tw-text-red-700 tw-opacity-70';
    if (cell.daily?.workTripType === 'BUSINESS_TRIP')
      return cell.inMonth
        ? 'tw-bg-sky-200 tw-text-sky-900'
        : 'tw-bg-sky-100 tw-text-sky-700 tw-opacity-70';
    if (cell.daily?.workTripType === 'OUTSIDE_WORK')
      return cell.inMonth
        ? 'tw-bg-sky-100 tw-text-sky-800'
        : 'tw-bg-sky-50 tw-text-sky-700 tw-opacity-70';
    const hours = (cell.daily?.workedMinutes ?? 0) / 60;
    const dim = !cell.inMonth ? ' tw-opacity-60' : '';
    if (hours >= 12) return 'tw-bg-red-500 tw-text-white' + dim;
    if (hours >= 10) return 'tw-bg-orange-400 tw-text-white' + dim;
    if (hours >= 8) return 'tw-bg-blue-400 tw-text-white' + dim;
    if (hours > 0) return 'tw-bg-blue-200 tw-text-blue-900' + dim;
    const dow = cell.date.day();
    if (dow === 0 || dow === 6)
      return cell.inMonth
        ? 'tw-bg-slate-100 tw-text-slate-400'
        : 'tw-bg-slate-50 tw-text-slate-300';
    if (!cell.inMonth) return 'tw-bg-slate-50 tw-text-slate-300';
    return 'tw-bg-white tw-text-slate-600 tw-border tw-border-slate-200';
  };

  const dowKor = ['일', '월', '화', '수', '목', '금', '토'];
  return (
    <Card
      size="small"
      className="tw-border-slate-200/80"
      title={
        <div className="tw-flex tw-items-center tw-justify-center tw-gap-2">
          <Button size="small" type="text" onClick={onPrevMonth}>
            ‹
          </Button>
          <span className="tw-text-base tw-font-semibold">{monthLabel} 일별 근무 히트맵</span>
          <Button size="small" type="text" onClick={onNextMonth}>
            ›
          </Button>
        </div>
      }
    >
      <div className="tw-grid tw-grid-cols-7 tw-gap-0.5 tw-mb-1">
        {dowKor.map((d, i) => (
          <div
            key={`h-${d}`}
            className={`tw-text-[11px] tw-text-center tw-py-0.5 tw-font-medium ${
              i === 0 || i === 6 ? 'tw-text-rose-500' : 'tw-text-slate-600'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="tw-flex tw-flex-col tw-gap-0.5">
        {weeks.map((week, weekIdx) => {
          const isHighlightWeek = week.some(
            (c) => c.iso >= highlightWeekStart && c.iso <= highlightWeekEnd,
          );
          return (
            <div
              key={`w-${weekIdx}`}
              className={`tw-grid tw-grid-cols-7 tw-gap-0.5 tw-rounded-md tw-p-0.5 tw-transition-colors ${
                isHighlightWeek ? 'tw-bg-blue-100/70 tw-ring-2 tw-ring-blue-500 tw-shadow-sm' : ''
              }`}
            >
              {week.map((cell) => (
                <div
                  key={cell.iso}
                  className={`tw-aspect-square tw-rounded tw-flex tw-flex-col tw-items-center tw-justify-center ${cellBg(cell)}`}
                  title={(() => {
                    const holidayName = holidayMap.get(cell.iso);
                    const status = cell.daily?.status;
                    const trip = cell.daily?.workTripType;
                    const labels = [];
                    if (holidayName) labels.push(holidayName);
                    if (status === 'LEAVE') labels.push('연차휴가');
                    else if (status === 'HALF') labels.push('반차');
                    else if (status === 'ABSENT') labels.push('결근');
                    if (trip === 'BUSINESS_TRIP') labels.push('출장');
                    if (trip === 'OUTSIDE_WORK') labels.push('외근');
                    const hours = cell.daily?.workedMinutes
                      ? ` - ${(cell.daily.workedMinutes / 60).toFixed(1)}h`
                      : '';
                    return `${cell.iso}${labels.length ? ` (${labels.join(', ')})` : ''}${hours}`;
                  })()}
                >
                  <div className="tw-text-[11px] tw-font-semibold tw-leading-none">
                    {cell.date.date()}
                  </div>
                  {(() => {
                    const holidayName = holidayMap.get(cell.iso);
                    const status = cell.daily?.status;
                    const trip = cell.daily?.workTripType;
                    // 공휴일 + 근무 데이터: 공휴일 이름 우선 + 근무 시간 작게 같이
                    if (holidayName && !status) {
                      const hours = (cell.daily?.workedMinutes ?? 0) / 60;
                      return (
                        <>
                          <div className="tw-text-[9px] tw-leading-none tw-mt-0.5 tw-truncate tw-max-w-full tw-px-0.5">
                            {holidayName}
                          </div>
                          {hours > 0 && (
                            <div className="tw-text-[8px] tw-leading-none tw-mt-0.5 tw-text-rose-500/70">
                              ({hours.toFixed(1)}h)
                            </div>
                          )}
                        </>
                      );
                    }
                    if (status === 'LEAVE')
                      return <div className="tw-text-[9px] tw-mt-0.5">연차</div>;
                    if (status === 'HALF')
                      return <div className="tw-text-[9px] tw-mt-0.5">반차</div>;
                    if (status === 'ABSENT')
                      return <div className="tw-text-[9px] tw-mt-0.5">결근</div>;
                    if (trip === 'BUSINESS_TRIP')
                      return <div className="tw-text-[9px] tw-mt-0.5">출장</div>;
                    if (trip === 'OUTSIDE_WORK')
                      return <div className="tw-text-[9px] tw-mt-0.5">외근</div>;
                    if (cell.daily?.workedMinutes && cell.daily.workedMinutes > 0) {
                      return (
                        <div className="tw-text-[9px] tw-leading-none tw-mt-0.5">
                          {(cell.daily.workedMinutes / 60).toFixed(1)}h
                        </div>
                      );
                    }
                    if (!cell.inMonth) return null;
                    return null;
                  })()}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2 tw-mt-2 tw-text-[10px] tw-text-slate-500">
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-blue-200 tw-rounded-sm" />
          ~8h
        </span>
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-blue-400 tw-rounded-sm" />
          8~10h
        </span>
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-orange-400 tw-rounded-sm" />
          10~12h
        </span>
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-red-500 tw-rounded-sm" />
          12h+
        </span>
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-yellow-200 tw-rounded-sm" />
          휴가
        </span>
        <span className="tw-flex tw-items-center tw-gap-1">
          <span className="tw-w-2.5 tw-h-2.5 tw-bg-sky-200 tw-rounded-sm" />
          출장
        </span>
      </div>
    </Card>
  );
}
