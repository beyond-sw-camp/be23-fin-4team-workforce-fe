/** /app/attendance/schedules/my - 개인 근무 스케줄 (사원) */
import React, { Fragment, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ClockCircleOutlined, CoffeeOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { approvalApi } from '@/features/approvals/api/approvalApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import type {
  DailyAttendance,
  FlexibleTimeSlot,
  MemberScheduleSelection,
  WorkSchedule,
} from '@/features/salary-service/types';

type FormValues = {
  targetYearMonth: dayjs.Dayjs;
  slotId: string;
  requestReason?: string;
};

const STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
  AUTO: '자동',
};

const SCHEDULE_SELECTION_PREFILL_STORAGE_KEY = 'wf-approval-prefill-schedule-selection';

/** 분 -> "0.75H", "40H" 같은 decimal 시간 표기 (개인 근무 스케줄 표 전용) */
function toDecimalH(minutes?: number | null): string {
  if (minutes == null || minutes === 0) return '0H';
  const hrs = minutes / 60;
  // 정수면 "40H", 소수점이면 "0.75H" 같이 0.25 단위 반올림
  if (Math.abs(hrs - Math.round(hrs)) < 0.001) return `${Math.round(hrs)}H`;
  return `${hrs.toFixed(2).replace(/\.?0+$/, '')}H`;
}

/** ISO/LocalDateTime 문자열에서 "HH:mm" 추출 */
function isoToHm(s?: string | null): string {
  if (!s) return '';
  return s.length >= 16 ? s.slice(11, 16) : s;
}

/** "HH:mm" 또는 "HH:mm:ss" -> 0시 기준 분 */
function parseHmToMin(s: string): number {
  const parts = s.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  return h * 60 + m;
}

/** "HH:mm" + delta분 -> "HH:mm" (음수 가능, 24h 보정 안함 - 같은 날 가정) */
function addMinToHm(hm: string, deltaMin: number): string {
  const total = parseHmToMin(hm) + deltaMin;
  const safe = Math.max(0, total);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function trimSeconds(time?: string | null) {
  if (!time) return '-';
  return time.length >= 5 ? time.slice(0, 5) : time;
}

/**
 * 주간 행 테이블 — 첫 화면 이미지의 레이아웃과 동일.
 * 행 그룹: 5~6주, 각 주마다 4개 sub-row (일자/점심시간/근태/초과근무).
 * 컬럼: 주 | 구분 | 일~토 (7) | 합계 | 1주 근로시간
 * 주·1주 근로시간 컬럼은 rowSpan=4 로 그룹 헤더 역할.
 */
function ScheduleWeeklyTable({
  calendarMonth,
  dailyMap,
  workTimeRange,
  breakRange,
  holidaySet,
  holidayNameMap,
}: {
  calendarMonth: dayjs.Dayjs;
  dailyMap: Map<string, DailyAttendance>;
  /** 회사 단위 활성 근무 시간대 (HH:mm:ss).
   *  - FIXED: 회사 WorkSchedule.startTime/endTime
   *  - FLEXIBLE: 본인 이번 달 선택 슬롯의 startTime/endTime (없으면 회사 기본 슬롯) */
  workTimeRange: { start: string; end: string } | null;
  /** 회사 단위 점심 시작/종료 (HH:mm:ss).
   *  - FIXED: 회사 WorkSchedule.breakStart/End
   *  - FLEXIBLE: 본인 selection.break(없으면 슬롯.break) */
  breakRange: { start: string; end: string } | null;
  holidaySet: Set<string>;
  holidayNameMap: Map<string, string>;
}) {
  type DayCell = {
    date: dayjs.Dayjs;
    iso: string;
    inMonth: boolean;
    isWeekend: boolean; // 일/토
    holidayName?: string;
    daily?: DailyAttendance;
  };

  // 5~6주 × 7일 행렬 구성
  const weeks = useMemo(() => {
    const start = calendarMonth.startOf('month').startOf('week'); // Sunday
    const end = calendarMonth.endOf('month').endOf('week');
    const result: DayCell[][] = [];
    let cursor = start;
    while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
      const week: DayCell[] = [];
      for (let d = 0; d < 7; d += 1) {
        const date = cursor.add(d, 'day');
        const iso = date.format('YYYY-MM-DD');
        const daily = dailyMap.get(iso);
        const isHoliday = date.day() === 0 || date.day() === 6 || holidaySet.has(iso);
        week.push({
          date,
          iso,
          inMonth: date.month() === calendarMonth.month(),
          isWeekend: isHoliday,
          holidayName: holidayNameMap.get(iso),
          daily,
        });
      }
      result.push(week);
      cursor = cursor.add(7, 'day');
    }
    return result;
  }, [calendarMonth, dailyMap, holidaySet, holidayNameMap]);

  // 표준 일 근무 분 - 회사 단위 단일값
  const standardWorkMin = useMemo<number>(() => {
    if (!workTimeRange) return 480;
    const start = parseHmToMin(workTimeRange.start);
    const end = parseHmToMin(workTimeRange.end);
    let breakMin = 60;
    if (breakRange) {
      breakMin = parseHmToMin(breakRange.end) - parseHmToMin(breakRange.start);
    }
    return Math.max(0, end - start - breakMin);
  }, [workTimeRange, breakRange]);

  /** 표준 일 근무 분 - 휴일/주말은 0, 평일은 standardWorkMin */
  const standardWorkMinForCell = (cell: DayCell): number => {
    if (cell.isWeekend || cell.holidayName) return 0;
    return standardWorkMin;
  };

  /** 근무 행 셀 텍스트 - 휴일/공휴일 또는 "평일 / HH:mm ~ HH:mm" */
  const workCellText = (cell: DayCell): string => {
    if (cell.holidayName) return '공휴일';
    const dow = cell.date.day();
    if (dow === 0 || dow === 6) return '휴일';
    if (workTimeRange) {
      return `평일 / ${trimSeconds(workTimeRange.start)} ~ ${trimSeconds(workTimeRange.end)}`;
    }
    return '평일 / -';
  };

  /** 근태 행 셀 텍스트 - 휴가/결근/반차/출장/외근, 없으면 빈칸 */
  const attendanceCellText = (cell: DayCell): string => {
    const status = cell.daily?.status;
    if (status === 'LEAVE') return '연차휴가';
    if (status === 'HALF') return '반차(오후)';
    if (status === 'ABSENT') return '결근';
    const trip = cell.daily?.workTripType;
    if (trip === 'BUSINESS_TRIP') return '출장';
    if (trip === 'OUTSIDE_WORK') return '외근';
    return '';
  };

  /** 근태로 인한 차감 시간(분) - 음수 합계 */
  const attendanceDeductionMin = (cell: DayCell): number => {
    const status = cell.daily?.status;
    if (status === 'LEAVE' || status === 'ABSENT') return standardWorkMinForCell(cell);
    if (status === 'HALF') return Math.floor(standardWorkMinForCell(cell) / 2);
    return 0;
  };

  /** 초과근무 행 - "16:00 ~ 18:30\n(연장근무 2.5H)" */
  const overtimeCell = (cell: DayCell): React.ReactNode => {
    const ot = cell.daily?.overtimeMinutes ?? 0;
    if (ot <= 0) return null;
    let otStartHm: string | null = null;
    if (workTimeRange?.end) {
      otStartHm = trimSeconds(workTimeRange.end);
    } else if (cell.daily?.lastClockOut) {
      // 회사 단위 끝 시각 없으면 lastClockOut에서 ot만큼 앞으로 빼기
      otStartHm = addMinToHm(isoToHm(cell.daily.lastClockOut), -ot);
    }
    const otEndHm = isoToHm(cell.daily?.lastClockOut);
    const range = otStartHm && otEndHm ? `${otStartHm} ~ ${otEndHm}` : '';
    return (
      <div className="tw-leading-tight">
        {range && <div>{range}</div>}
        <div className="tw-text-slate-500">(연장근무 {toDecimalH(ot)})</div>
      </div>
    );
  };

  /** 한 주의 합계 - 표준 근무 / 초과 / 근태 차감 */
  const weekSummary = (week: DayCell[]) => {
    let standardMin = 0;
    let overtimeMin = 0;
    let deductionMin = 0;
    for (const cell of week) {
      if (cell.holidayName) continue;
      const dow = cell.date.day();
      if (dow === 0 || dow === 6) continue; // 주말 제외
      standardMin += standardWorkMinForCell(cell);
      if (cell.daily?.overtimeMinutes) overtimeMin += cell.daily.overtimeMinutes;
      deductionMin += attendanceDeductionMin(cell);
    }
    return { standardMin, overtimeMin, deductionMin };
  };

  /** 한 주의 1주 근로시간 = 표준 - 차감 + 초과 (decimal H) */
  const weekTotalText = (week: DayCell[]) => {
    const s = weekSummary(week);
    const total = s.standardMin - s.deductionMin + s.overtimeMin;
    return toDecimalH(total);
  };

  /** 점심시간 텍스트 (HH:mm~HH:mm).
   *  - FIXED: 회사 WorkSchedule.break
   *  - FLEXIBLE: 본인 selection.break(없으면 슬롯.break)
   *  - 휴일/주말 또는 미지정이면 빈 칸. */
  const breakText = (cell: DayCell): string => {
    if (cell.isWeekend || cell.holidayName) return '';
    if (!breakRange) return '';
    return `${trimSeconds(breakRange.start)}~${trimSeconds(breakRange.end)}`;
  };

  const cellBase =
    '!tw-border !tw-border-solid !tw-border-slate-300 tw-px-2 tw-py-1.5 tw-text-xs tw-text-center tw-align-middle';
  const headerBase = 'tw-bg-slate-50 tw-font-semibold tw-text-slate-700';
  // 요일/주/구분 컬럼 헤더 - 흰색 배경
  const topHeaderBase = 'tw-bg-white tw-font-semibold tw-text-slate-700';
  // 일자(일) 행 - 연한 회색
  const dateRowBase = 'tw-bg-slate-100';
  // 합계 / 1주 근로시간 컬럼 - 아주 연한 파랑 배경 + 진한 파랑 글씨
  const summaryColBase = 'tw-bg-blue-50 tw-text-blue-700 tw-font-semibold';

  return (
    <div className="tw-overflow-x-auto">
      <table className="tw-w-full tw-border-collapse tw-text-xs tw-table-fixed">
        <colgroup>
          <col style={{ width: 40 }} />
          <col style={{ width: 80 }} />
          <col />
          <col />
          <col />
          <col />
          <col />
          <col />
          <col />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
        </colgroup>
        <thead>
          <tr>
            <th className={`${cellBase} ${topHeaderBase}`}>주</th>
            <th className={`${cellBase} ${topHeaderBase}`}>구분</th>
            <th className={`${cellBase} ${topHeaderBase} !tw-text-rose-600`}>일</th>
            <th className={`${cellBase} ${topHeaderBase}`}>월</th>
            <th className={`${cellBase} ${topHeaderBase}`}>화</th>
            <th className={`${cellBase} ${topHeaderBase}`}>수</th>
            <th className={`${cellBase} ${topHeaderBase}`}>목</th>
            <th className={`${cellBase} ${topHeaderBase}`}>금</th>
            <th className={`${cellBase} ${topHeaderBase} !tw-text-rose-600`}>토</th>
            <th className={`${cellBase} ${topHeaderBase}`}>합계</th>
            <th className={`${cellBase} ${topHeaderBase}`}>1주 근로시간</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wIdx) => {
            const summary = weekSummary(week);
            return (
              <Fragment key={`week-${wIdx}`}>
                {/* 일자 행 - 연한 회색 배경 */}
                <tr className={dateRowBase}>
                  <td rowSpan={5} className={`${cellBase} ${headerBase}`}>
                    {wIdx + 1}주
                  </td>
                  <td className={`${cellBase} ${headerBase}`}>일</td>
                  {week.map((cell) => (
                    <td
                      key={`${wIdx}-d-${cell.iso}`}
                      className={`${cellBase} ${
                        !cell.inMonth
                          ? 'tw-text-slate-400'
                          : cell.isWeekend
                            ? 'tw-text-rose-600 tw-font-semibold'
                            : 'tw-text-slate-700'
                      }`}
                    >
                      <div>{String(cell.date.date()).padStart(2, '0')}</div>
                      {cell.holidayName ? (
                        <div className="tw-mt-0.5 tw-text-[10px] tw-font-medium tw-text-rose-500 tw-leading-tight">
                          {cell.holidayName}
                        </div>
                      ) : null}
                    </td>
                  ))}
                  <td className={`${cellBase} ${summaryColBase}`}></td>
                  <td
                    rowSpan={5}
                    className={`${cellBase} ${summaryColBase} tw-text-base tw-whitespace-nowrap`}
                  >
                    {weekTotalText(week)}
                  </td>
                </tr>

                {/* 근무 행 - 평일/휴일/공휴일 + 시간 범위, 합계 = 표준 근무 시간 */}
                <tr>
                  <td className={`${cellBase} ${headerBase}`}>근무</td>
                  {week.map((cell) => {
                    const text = workCellText(cell);
                    const dow = cell.date.day();
                    const isHol = cell.holidayName || dow === 0 || dow === 6;
                    return (
                      <td
                        key={`${wIdx}-w-${cell.iso}`}
                        className={`${cellBase} tw-whitespace-nowrap ${
                          isHol ? 'tw-text-emerald-600' : 'tw-text-emerald-700'
                        }`}
                      >
                        {text}
                      </td>
                    );
                  })}
                  <td className={`${cellBase} ${summaryColBase} tw-whitespace-nowrap`}>
                    {toDecimalH(summary.standardMin)}
                  </td>
                </tr>

                {/* 점심시간 행 */}
                <tr>
                  <td className={`${cellBase} ${headerBase}`}>점심시간</td>
                  {week.map((cell) => (
                    <td
                      key={`${wIdx}-b-${cell.iso}`}
                      className={`${cellBase} tw-text-slate-500 tw-whitespace-nowrap`}
                    >
                      {breakText(cell)}
                    </td>
                  ))}
                  <td className={`${cellBase} ${summaryColBase}`}></td>
                </tr>

                {/* 근태 행 - 휴가/결근/반차, 합계 = 차감 시간 (음수) */}
                <tr>
                  <td className={`${cellBase} ${headerBase}`}>근태</td>
                  {week.map((cell) => (
                    <td key={`${wIdx}-a-${cell.iso}`} className={`${cellBase} tw-text-slate-700`}>
                      {attendanceCellText(cell)}
                    </td>
                  ))}
                  <td className={`${cellBase} ${summaryColBase} tw-whitespace-nowrap`}>
                    {summary.deductionMin > 0 ? `-${toDecimalH(summary.deductionMin)}` : '0H'}
                  </td>
                </tr>

                {/* 초과근무 행 - 시간 범위 + (연장근무 X.XXH) */}
                <tr>
                  <td className={`${cellBase} ${headerBase}`}>초과근무</td>
                  {week.map((cell) => (
                    <td key={`${wIdx}-o-${cell.iso}`} className={cellBase}>
                      {overtimeCell(cell)}
                    </td>
                  ))}
                  <td className={`${cellBase} ${summaryColBase} tw-whitespace-nowrap`}>
                    {summary.overtimeMin > 0 ? toDecimalH(summary.overtimeMin) : '0H'}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MyScheduleSelectionsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [openApplyModal, setOpenApplyModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs().startOf('month'));
  const [scheduleTab, setScheduleTab] = useState<'schedule' | 'history'>('schedule');
  const yearMonth = calendarMonth.format('YYYY-MM');
  // 달력 그리드 전체 범위 (이전달 말일 ~ 다음달 초일까지 포함) - 월 경계 빈 칸에도 근태 표시
  const monthFrom = calendarMonth.startOf('month').startOf('week').format('YYYY-MM-DD');
  const monthTo = calendarMonth.endOf('month').endOf('week').format('YYYY-MM-DD');

  const schedulesQ = useQuery({
    queryKey: ['salary', 'work-schedules'],
    queryFn: () => attendanceApi.workSchedule.list(),
  });
  const activeFlexibleScheduleId = useMemo(
    () =>
      (schedulesQ.data ?? []).find((s: WorkSchedule) => s.workType === 'FLEXIBLE')?.workScheduleId,
    [schedulesQ.data],
  );
  const docsQ = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });
  const monthlyQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'monthly-calendar', monthFrom, monthTo],
    queryFn: () =>
      attendanceApi.attendance.getMyMonthly({ from: monthFrom, to: monthTo, page: 0, size: 45 }),
  });
  const holidaysQ = useQuery({
    queryKey: ['salary', 'company-holidays'],
    queryFn: () => attendanceApi.companyHoliday.list(),
  });
  const slotsQ = useQuery({
    queryKey: ['salary', 'flexible-slots', 'active-form', activeFlexibleScheduleId],
    queryFn: () => attendanceApi.flexibleSlot.listByWorkSchedule(activeFlexibleScheduleId!),
    enabled: Boolean(activeFlexibleScheduleId),
  });
  const currentQ = useQuery({
    queryKey: ['salary', 'schedule-selection', 'my', 'current', yearMonth],
    queryFn: () => attendanceApi.scheduleSelection.getMyCurrent(yearMonth),
  });
  const historyQ = useQuery({
    queryKey: ['salary', 'schedule-selection', 'my', 'history', yearMonth],
    queryFn: () => attendanceApi.scheduleSelection.getMyHistory(yearMonth),
  });

  const slotOptions = useMemo(
    () =>
      (slotsQ.data ?? [])
        .filter((s: FlexibleTimeSlot) => s.delYn !== 'Y')
        .map((s) => ({
          value: s.slotId!,
          label: `${s.slotLabel ?? s.slotCode ?? s.slotId} ${s.isDefault ? '(기본)' : ''}`,
        })),
    [slotsQ.data],
  );
  const slotMap = useMemo(
    () =>
      new Map(
        (slotsQ.data ?? []).map((s) => [
          s.slotId ?? '',
          s.slotLabel ?? s.slotCode ?? s.slotId ?? '-',
        ]),
      ),
    [slotsQ.data],
  );

  const createM = useMutation({
    mutationFn: (v: FormValues) => {
      // 슬롯에 박힌 점심시간을 그대로 신청에 사용 (직원은 슬롯만 고르면 됨).
      const slot = (slotsQ.data ?? []).find((s) => s.slotId === v.slotId);
      return attendanceApi.scheduleSelection.createMy({
        targetYearMonth: v.targetYearMonth.format('YYYY-MM'),
        slotId: v.slotId,
        breakStart: slot?.breakStart ?? null,
        breakEnd: slot?.breakEnd ?? null,
        requestReason: v.requestReason?.trim() || null,
      });
    },
    onSuccess: () => {
      message.success('스케줄 변경 신청이 등록되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'schedule-selection', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '신청에 실패했습니다.'),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => attendanceApi.scheduleSelection.cancelMy(id),
    onSuccess: () => {
      message.success('신청이 철회되었습니다.');
      void qc.invalidateQueries({ queryKey: ['salary', 'schedule-selection', 'my'] });
    },
    onError: (e: Error) => message.error(e.message || '철회에 실패했습니다.'),
  });

  const approvedOrAuto = useMemo(
    () =>
      (historyQ.data ?? [])
        .filter((r) => r.approvalStatus === 'APPROVED' || r.approvalStatus === 'AUTO')
        .sort((a, b) => (b.targetYearMonth ?? '').localeCompare(a.targetYearMonth ?? '')),
    [historyQ.data],
  );
  const latestAppliedSelection = approvedOrAuto[0] ?? currentQ.data ?? null;

  /* ─────────────────────────────────────────────────────────────
   * 마감일 안내 배너 — 4가지 상태 자동 분기
   *  ① 마감 전 + 다음달 미선택 → "다음달 신청 마감 D-N" 경고
   *  ② 마감 전 + 다음달 신청 완료 → "다음달 슬롯 신청 완료" 성공
   *  ③ 마감 후 + 이번달 자동 할당 → "이번달 자동 적용 / 다음달 마감 D-N" 정보
   *  ④ 마감 후 + 이번달 본인 신청 적용 중 → "이번달 적용 중 / 다음달 마감 D-N" 성공
   * ──────────────────────────────────────────────────────────── */
  const activeFlexibleSchedule = useMemo(
    () => (schedulesQ.data ?? []).find((s: WorkSchedule) => s.workType === 'FLEXIBLE'),
    [schedulesQ.data],
  );

  /** 회사 기본(FIXED) 스케줄 - 헤더 시간대 + workCellText fallback 용 */
  const defaultFixedSchedule = useMemo(
    () =>
      (schedulesQ.data ?? []).find((s: WorkSchedule) => s.workType === 'FIXED') ??
      (schedulesQ.data ?? [])[0],
    [schedulesQ.data],
  );
  const defaultScheduleTimeLabel = useMemo(() => {
    const s = defaultFixedSchedule;
    if (s?.startTime && s?.endTime) {
      return `${trimSeconds(s.startTime)} ~ ${trimSeconds(s.endTime)}`;
    }
    return '';
  }, [defaultFixedSchedule]);

  // 회사 활성 FLEXIBLE 스케줄의 모든 슬롯 (배너에서 시간 표시용)
  const activeFlexibleSlotsQ = useQuery({
    queryKey: ['salary', 'flexible-slots', 'active', activeFlexibleSchedule?.workScheduleId],
    queryFn: () =>
      attendanceApi.flexibleSlot.listByWorkSchedule(activeFlexibleSchedule!.workScheduleId!),
    enabled: Boolean(activeFlexibleSchedule?.workScheduleId),
  });
  const allSlotsMap = useMemo(
    () => new Map((activeFlexibleSlotsQ.data ?? []).map((s) => [s.slotId ?? '', s])),
    [activeFlexibleSlotsQ.data],
  );
  const defaultFlexibleSlot = useMemo(
    () => (activeFlexibleSlotsQ.data ?? []).find((s) => Boolean(s.isDefault) && s.delYn !== 'Y'),
    [activeFlexibleSlotsQ.data],
  );
  const defaultSlotTime = useMemo(() => {
    if (!defaultFlexibleSlot) return '-';
    if (defaultFlexibleSlot.startTime && defaultFlexibleSlot.endTime) {
      return `${trimSeconds(defaultFlexibleSlot.startTime)}~${trimSeconds(defaultFlexibleSlot.endTime)}`;
    }
    return '-';
  }, [defaultFlexibleSlot]);
  const latestSlotLabel = useMemo(() => {
    const slot = allSlotsMap.get(latestAppliedSelection?.slotId ?? '');
    if (slot?.startTime && slot?.endTime) {
      return `${trimSeconds(slot.startTime)}~${trimSeconds(slot.endTime)}`;
    }
    return '-';
  }, [allSlotsMap, latestAppliedSelection?.slotId]);

  const banner = useMemo(() => {
    if (!activeFlexibleSchedule) return null;
    const today = dayjs();
    const deadlineDay =
      (activeFlexibleSchedule as WorkSchedule & { selectionDeadlineDay?: number })
        .selectionDeadlineDay ?? 25;
    const thisMonthDeadline = today.date(deadlineDay);
    const isBeforeDeadline = !today.isAfter(thisMonthDeadline, 'day');

    const currentYm = today.format('YYYY-MM');
    const nextYm = today.add(1, 'month').format('YYYY-MM');
    const history = historyQ.data ?? [];

    const findSelection = (ym: string) =>
      history.find(
        (s) =>
          s.targetYearMonth === ym &&
          (s.approvalStatus === 'APPROVED' ||
            s.approvalStatus === 'AUTO' ||
            s.approvalStatus === 'PENDING'),
      );

    const formatSlotInfo = (selection: MemberScheduleSelection | undefined) => {
      if (!selection) return defaultSlotTime;
      const slot = allSlotsMap.get(selection.slotId ?? '');
      if (slot?.startTime && slot?.endTime) {
        return `${trimSeconds(slot.startTime)}~${trimSeconds(slot.endTime)}`;
      }
      return '-';
    };

    if (isBeforeDeadline) {
      const dDay = thisMonthDeadline.diff(today, 'day');
      const nextMonthLabel = today.add(1, 'month').format('M월');
      const nextSel = findSelection(nextYm);

      if (!nextSel) {
        return {
          type: 'warning' as const,
          message: `${nextMonthLabel} 근무 시간대 선택 마감 D-${dDay} (${thisMonthDeadline.format('M월 D일')}까지)`,
          description: '마감일까지 신청하지 않으면 기본 근무 시간대가 자동 적용됩니다.',
        };
      }
      return {
        type: 'success' as const,
        message: `${nextMonthLabel} 근무 시간대 — ${formatSlotInfo(nextSel)} 신청 완료`,
        description: `마감일까지 변경 가능합니다 (D-${dDay}, ${thisMonthDeadline.format('M월 D일')})`,
      };
    }

    // 마감 후
    const nextDeadline = thisMonthDeadline.add(1, 'month');
    const dDay = nextDeadline.diff(today, 'day');
    const currentMonthLabel = today.format('M월');
    const nextMonthLabel = today.add(1, 'month').format('M월');
    const currentSel = findSelection(currentYm);

    if (currentSel?.approvalStatus === 'AUTO') {
      return {
        type: 'info' as const,
        message: `${currentMonthLabel} 근무 시간대 — ${formatSlotInfo(currentSel)} 자동 적용 중`,
        description: `${thisMonthDeadline.format('M월 D일')} 마감을 지나 자동 배정되었습니다. 다음 달(${nextMonthLabel}) 마감: ${nextDeadline.format('M월 D일')} (D-${dDay})`,
      };
    }
    return {
      type: 'success' as const,
      message: `${currentMonthLabel} 근무 시간대 — ${formatSlotInfo(currentSel)} 적용 중`,
      description: `다음 달(${nextMonthLabel}) 근무 시간대는 ${nextDeadline.format('M월 D일')}까지 신청 가능합니다 (D-${dDay})`,
    };
  }, [activeFlexibleSchedule, historyQ.data, allSlotsMap, defaultSlotTime]);
  const dailyMap = useMemo(() => {
    const map = new Map<string, DailyAttendance>();
    for (const row of monthlyQ.data?.content ?? []) {
      if (row.attendanceDate) map.set(row.attendanceDate, row);
    }
    return map;
  }, [monthlyQ.data]);
  const holidaySet = useMemo(() => {
    const set = new Set<string>();
    for (const h of holidaysQ.data ?? []) {
      if (h.holidayDate) set.add(h.holidayDate);
    }
    return set;
  }, [holidaysQ.data]);
  const holidayNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidaysQ.data ?? []) {
      if (h.holidayDate && h.holidayName) {
        map.set(h.holidayDate, h.holidayName);
      }
    }
    return map;
  }, [holidaysQ.data]);
  // weeklySummaries / totalWorkedMinutes / totalOvertimeMinutes —
  // 주간 행 테이블이 자체적으로 계산하므로 제거됨.

  const scheduleChangeDocId = useMemo(() => {
    const docs = docsQ.data ?? [];
    const exact = docs.find((d) => d.documentName.trim() === '출퇴근시간 변경 신청서');
    if (exact) return exact.documentId;
    const fuzzy = docs.find((d) => d.documentName.includes('출퇴근시간 변경'));
    return fuzzy?.documentId;
  }, [docsQ.data]);

  // 직접 모달 폐기 - [스케줄 변경 신청] 버튼은 바로 결재 모달로 이동, 대상월은 다음달로 강제 prefill
  const openApply = () => {
    if (!scheduleChangeDocId) {
      message.error(
        '출퇴근시간 변경 신청서 양식을 찾을 수 없습니다. 전자결재 양식 설정을 확인해 주세요.',
      );
      return;
    }
    const nextMonth = dayjs().add(1, 'month').format('YYYY-MM');
    void navigate({
      to: '/app/approvals',
      search: {
        tab: 'compose',
        docId: scheduleChangeDocId,
        autoCompose: '1',
        schYearMonth: nextMonth,
      },
    });
  };

  const submitToApprovals = (v: FormValues) => {
    if (!scheduleChangeDocId) {
      message.error(
        '출퇴근시간 변경 신청서 양식을 찾을 수 없습니다. 전자결재 양식 설정을 확인해 주세요.',
      );
      return;
    }
    // iframe 자동 모달에선 부모 sessionStorage 접근 불가 - URL params 로 prefill 데이터 전달
    const slot = (slotsQ.data ?? []).find((s) => s.slotId === v.slotId);
    setOpenApplyModal(false);
    void navigate({
      to: '/app/approvals',
      search: {
        tab: 'compose',
        docId: scheduleChangeDocId,
        autoCompose: '1',
        schYearMonth: v.targetYearMonth.format('YYYY-MM'),
        schSlotId: v.slotId,
        ...(slot?.breakStart ? { schBreakStart: slot.breakStart.slice(0, 5) } : {}),
        ...(slot?.breakEnd ? { schBreakEnd: slot.breakEnd.slice(0, 5) } : {}),
        ...(v.requestReason?.trim() ? { schReason: v.requestReason.trim() } : {}),
      },
    });
  };

  const columns = useMemo<ColumnsType<MemberScheduleSelection>>(
    () => [
      { title: '대상월', dataIndex: 'targetYearMonth', key: 'targetYearMonth', width: 110 },
      {
        title: '신청 스케줄',
        key: 'slot',
        render: (_, r) => slotMap.get(r.slotId ?? '') ?? r.slotId ?? '-',
      },
      { title: '사유', dataIndex: 'requestReason', key: 'requestReason', ellipsis: true },
      {
        title: '상태',
        dataIndex: 'approvalStatus',
        key: 'approvalStatus',
        width: 100,
        render: (v) => <Tag>{STATUS_KO[v ?? ''] ?? v ?? '-'}</Tag>,
      },
      {
        title: '액션',
        key: 'action',
        width: 90,
        render: (_, r) =>
          r.selectionId && r.approvalStatus === 'PENDING' ? (
            <Popconfirm title="신청을 철회할까요?" onConfirm={() => cancelM.mutate(r.selectionId!)}>
              <Button danger size="small">
                철회
              </Button>
            </Popconfirm>
          ) : (
            '-'
          ),
      },
    ],
    [cancelM, slotMap],
  );

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <AppWorkspacePageTitle
        eyebrow="ATTENDANCE"
        title="개인 근무 스케줄"
        subtitle={`월별 달력으로 스케줄과 근무 현황을 확인합니다${
          defaultScheduleTimeLabel ? ` · 기본근로시간제 ${defaultScheduleTimeLabel}` : ''
        }.`}
        extra={
          activeFlexibleSchedule ? (
            <Button type="primary" onClick={openApply}>
              스케줄 변경 신청
            </Button>
          ) : null
        }
      />

      {banner && (
        <Alert
          type={banner.type}
          showIcon
          message={banner.message}
          description={banner.description}
        />
      )}

      <Card className="tw-border-slate-200/80 tw-shadow-sm" loading={monthlyQ.isLoading}>
        <Tabs
          activeKey={scheduleTab}
          onChange={(k) => setScheduleTab(k as 'schedule' | 'history')}
          items={[
            {
              key: 'schedule',
              label: '개인 근무 스케줄',
              children: (
                <>
                  {/* 월 이동 */}
                  <div className="tw-mb-3 tw-flex tw-items-center tw-justify-center tw-gap-3">
                    <Button
                      size="small"
                      onClick={() =>
                        setCalendarMonth(calendarMonth.subtract(1, 'month').startOf('month'))
                      }
                    >
                      이전
                    </Button>
                    <Typography.Text className="tw-text-lg tw-font-semibold tw-text-slate-800">
                      {calendarMonth.format('YYYY년 M월')}
                    </Typography.Text>
                    <Button
                      size="small"
                      onClick={() =>
                        setCalendarMonth(calendarMonth.add(1, 'month').startOf('month'))
                      }
                    >
                      다음
                    </Button>
                  </div>

                  {/* 주간 행 테이블 - 회사 workType 단일 분기로 시간/점심 결정.
                      FIXED -> WorkSchedule, FLEXIBLE -> 본인 selection (없으면 슬롯) */}
                  <ScheduleWeeklyTable
                    calendarMonth={calendarMonth}
                    dailyMap={dailyMap}
                    workTimeRange={(() => {
                      if (activeFlexibleSchedule) {
                        const slot = allSlotsMap.get(latestAppliedSelection?.slotId ?? '')
                          ?? defaultFlexibleSlot;
                        if (slot?.startTime && slot?.endTime) {
                          return { start: slot.startTime, end: slot.endTime };
                        }
                        return null;
                      }
                      if (defaultFixedSchedule?.startTime && defaultFixedSchedule?.endTime) {
                        return { start: defaultFixedSchedule.startTime, end: defaultFixedSchedule.endTime };
                      }
                      return null;
                    })()}
                    breakRange={(() => {
                      if (activeFlexibleSchedule) {
                        if (latestAppliedSelection?.breakStart && latestAppliedSelection?.breakEnd) {
                          return { start: latestAppliedSelection.breakStart, end: latestAppliedSelection.breakEnd };
                        }
                        const slot = allSlotsMap.get(latestAppliedSelection?.slotId ?? '')
                          ?? defaultFlexibleSlot;
                        if (slot?.breakStart && slot?.breakEnd) {
                          return { start: slot.breakStart, end: slot.breakEnd };
                        }
                        return null;
                      }
                      if (defaultFixedSchedule?.breakStart && defaultFixedSchedule?.breakEnd) {
                        return { start: defaultFixedSchedule.breakStart, end: defaultFixedSchedule.breakEnd };
                      }
                      return null;
                    })()}
                    holidaySet={holidaySet}
                    holidayNameMap={holidayNameMap}
                  />
                </>
              ),
            },
            {
              key: 'history',
              label: '변경 신청 이력',
              children: (
                <>
                  <div className="tw-mb-3 tw-flex tw-justify-end">
                    <Button size="small" onClick={() => setScheduleTab('schedule')}>
                      ‹ 근무 스케줄로 돌아가기
                    </Button>
                  </div>
                  <Table<MemberScheduleSelection>
                    rowKey={(r) => r.selectionId ?? `${r.targetYearMonth}-${r.createdAt}`}
                    dataSource={historyQ.data ?? []}
                    columns={columns}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 860 }}
                    locale={{ emptyText: '신청/이력 데이터가 없습니다.' }}
                    loading={historyQ.isLoading}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      <AppDoubleActionModal
        open={openApplyModal}
        onClose={() => setOpenApplyModal(false)}
        onConfirm={() => form.submit()}
        confirmText="전자결재로 이동"
        cancelText="취소"
        title="스케줄 변경 신청"
        destroyOnHidden
        confirmLoading={createM.isPending}
      >
        <div className="tw-px-5 tw-py-4">
          <Form<FormValues>
            form={form}
            layout="vertical"
            initialValues={{
              targetYearMonth: calendarMonth,
            }}
            onFinish={submitToApprovals}
          >
            <Form.Item name="targetYearMonth" label="대상월" rules={[{ required: true }]}>
              <DatePicker picker="month" format="YYYY-MM" className="tw-w-full" />
            </Form.Item>
            <Form.Item name="slotId" label="변경 신청 스케줄" rules={[{ required: true }]}>
              <Select options={slotOptions} loading={slotsQ.isLoading} />
            </Form.Item>
            <Form.Item shouldUpdate={(prev, next) => prev.slotId !== next.slotId} noStyle>
              {() => {
                const slotId = form.getFieldValue('slotId') as string | undefined;
                if (!slotId) {
                  return (
                    <div className="tw-mt-1 tw-mb-4 tw-rounded-md tw-border tw-border-dashed tw-border-slate-300 tw-bg-slate-50/50 tw-px-3 tw-py-2 tw-text-xs tw-text-slate-500">
                      슬롯을 선택하면 회사가 미리 정한 <b>출퇴근/점심시간</b> 이 자동으로
                      적용됩니다.
                    </div>
                  );
                }
                const slot = (slotsQ.data ?? []).find((s) => s.slotId === slotId);
                if (!slot) return null;
                const hasWork = slot.startTime && slot.endTime;
                const hasLunch = slot.breakStart && slot.breakEnd;
                return (
                  <div className="tw-mt-1 tw-mb-4 tw-rounded-lg tw-border tw-border-blue-200 tw-bg-blue-50/40 tw-p-3">
                    <div className="tw-grid tw-grid-cols-2 tw-gap-3">
                      {/* 출퇴근 */}
                      <div className="tw-flex tw-items-center tw-gap-2 tw-rounded-md tw-bg-white tw-px-3 tw-py-2 tw-shadow-sm">
                        <ClockCircleOutlined className="!tw-text-blue-500 tw-text-base" />
                        <div className="tw-flex tw-flex-col tw-leading-tight">
                          <span className="tw-text-[11px] tw-text-slate-500">출퇴근</span>
                          <span className="tw-text-sm tw-font-semibold tw-text-slate-800">
                            {hasWork
                              ? `${slot.startTime!.slice(0, 5)} ~ ${slot.endTime!.slice(0, 5)}`
                              : '미설정'}
                          </span>
                        </div>
                      </div>
                      {/* 점심 */}
                      <div className="tw-flex tw-items-center tw-gap-2 tw-rounded-md tw-bg-white tw-px-3 tw-py-2 tw-shadow-sm">
                        <CoffeeOutlined className="!tw-text-amber-500 tw-text-base" />
                        <div className="tw-flex tw-flex-col tw-leading-tight">
                          <span className="tw-text-[11px] tw-text-slate-500">점심</span>
                          <span className="tw-text-sm tw-font-semibold tw-text-slate-800">
                            {hasLunch
                              ? `${slot.breakStart!.slice(0, 5)} ~ ${slot.breakEnd!.slice(0, 5)}`
                              : '미설정'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {(!hasWork || !hasLunch) && (
                      <div className="tw-mt-2 tw-flex tw-items-center tw-gap-1 tw-text-xs tw-text-amber-600">
                        <WarningOutlined />
                        <span>일부 시간이 미설정 - 관리자에게 슬롯 보완을 요청하세요.</span>
                      </div>
                    )}
                  </div>
                );
              }}
            </Form.Item>
            <Form.Item
              name="requestReason"
              label="신청 사유"
              rules={[{ required: true, message: '사유를 입력하세요.' }]}
            >
              <Input.TextArea rows={3} maxLength={300} showCount />
            </Form.Item>
            <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-text-xs">
              확인을 누르면 전자결재 작성 화면으로 이동하고, 입력한 값이 출퇴근시간 변경 신청서에
              자동 입력됩니다.
            </Typography.Paragraph>
          </Form>
        </div>
      </AppDoubleActionModal>
    </Space>
  );
}
