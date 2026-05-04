import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  TeamOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, List, Progress, Spin, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { Me } from '@/features/auth/types';
import { calendarApi } from '@/features/calendar/api/calendarApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { DASHBOARD_WIDGET_LABELS, type DashboardWidgetId } from '@/features/dashboard/dashboardWidgetsModel';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import type { EvaluationSeasonFlow } from '@/features/evaluation/model/workflowTypes';
import { goalApi } from '@/features/goals/api/goalApi';
import type { Goal, KpiCycle } from '@/features/goals/model/types';
import { meetingApi } from '@/features/meetings/api/meetingApi';
import { memberApi } from '@/features/member/api/memberApi';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import type { Salary } from '@/features/salary-service/types';
import { notificationApi, type NotificationItem } from '@/features/notification/api/notificationApi';
import {
  buildApprovalNotificationNavigate,
  buildGoalBundleNotificationNavigate,
} from '@/features/notification/lib/approvalNotificationRoute';
import {
  buildContractNotificationNavigate,
  isContractNotificationRoutable,
} from '@/features/notification/lib/contractNotificationRoute';

dayjs.locale('ko');

const TXT = {
  myInfo: '\uB0B4 \uC815\uBCF4',
  user: '\uC0AC\uC6A9\uC790',
  noOrg: '\uC18C\uC18D \uC815\uBCF4 \uC5C6\uC74C',
  todaySchedule: '\uC624\uB298\uC758 \uC77C\uC815',
  goalView: '\uBAA9\uD45C \uBCF4\uAE30',
  active: '\uC9C4\uD589',
  approvalPending: '\uC2B9\uC778 \uB300\uAE30',
  orgGoal: '\uC870\uC9C1 \uBAA9\uD45C',
  personalGoalWeight: '\uAC1C\uC778 \uBAA9\uD45C \uAC00\uC911\uCE58',
  noGoals: '\uC544\uC9C1 \uB4F1\uB85D\uB41C \uAC1C\uC778 \uBAA9\uD45C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.',
  noParentGoal: '\uC0C1\uC704 \uC870\uC9C1 \uBAA9\uD45C \uBBF8\uC5F0\uACB0',
  writing: '\uC791\uC131 \uC911',
  inProgress: '\uC9C4\uD589 \uC911',
  waitingEval: '\uD3C9\uAC00 \uB300\uAE30',
  closed: '\uC885\uB8CC',
  skipped: '\uC81C\uC678',
  evalView: '\uD3C9\uAC00 \uBCF4\uAE30',
  selfEval: '\uC790\uAE30\uD3C9\uAC00',
  evaluator: '\uD3C9\uAC00\uC790\uB85C \uCC38\uC5EC',
  publishedResult: '\uACF5\uAC1C \uACB0\uACFC',
  evalSeason: '\uD3C9\uAC00 \uC2DC\uC98C',
  selfEvalRequired: '\uC790\uAE30\uD3C9\uAC00 \uC791\uC131\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.',
  evaluatorRequired: 'Lead/평가자\uB85C \uAC80\uD1A0\uD560 \uD3C9\uAC00\uC785\uB2C8\uB2E4.',
  required: '\uC791\uC131 \uD544\uC694',
  review: '\uAC80\uD1A0',
  noEvalTasks: '\uC9C0\uAE08 \uBC14\uB85C \uCC98\uB9AC\uD560 \uD3C9\uAC00\uB294 \uC5C6\uC2B5\uB2C8\uB2E4.',
  waitingReview: '\uAC80\uD1A0 \uB300\uAE30',
  meetingView: '\uBA74\uB2F4 \uBCF4\uAE30',
  scheduled: '\uC608\uC815',
  done: '\uC644\uB8CC',
  total: '\uC804\uCCB4',
  noFeedbackMeetings: '\uC608\uC815\uB41C \uD53C\uB4DC\uBC31 \uBA74\uB2F4\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  feedbackMeeting: '\uD3C9\uAC00 \uD53C\uB4DC\uBC31 \uBA74\uB2F4',
  detail: '\uC0C1\uC138',
  more: '\uB354\uBCF4\uAE30',
  approvalWait: '\uACB0\uC7AC\uB300\uAE30',
  all: '\uC804\uCCB4',
  scheduleManage: '\uC77C\uC815 \uAD00\uB9AC',
  upcoming: '\uB2E4\uAC00\uC62C \uC77C\uC815',
  noUpcomingSchedule: '\uB2E4\uAC00\uC62C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  noSelectedSchedule: '\uB4F1\uB85D\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  calendar: '\uB2EC\uB825',
  monthlyEventsPrefix: '\uC774\uBC88 \uB2EC \uB4F1\uB85D\uB41C \uC77C\uC815',
  caseCount: '\uAC74',
  employed: '\uC7AC\uC9C1\uC911',
  checkIn: '\uCD9C\uADFC',
  checkOut: '\uD1F4\uADFC',
  weeklyTotal: '\uC8FC\uAC04 \uB204\uC801',
  weeklyRemain: '\uC8FC\uAC04 \uBAA9\uD45C\uAE4C\uC9C0 \uC57D 25\uC2DC\uAC04 \uB0A8\uC558\uC2B5\uB2C8\uB2E4.',
  checkInAction: '\uCD9C\uADFC\uD558\uAE30',
  checkOutAction: '\uD1F4\uADFC\uD558\uAE30',
  leaveManage: '\uD734\uAC00 \uAD00\uB9AC',
  remain: '\uC794\uC5EC',
  used: '\uC0AC\uC6A9',
  yearly: '\uC5F0\uAC04',
  usedRate: '\uC0AC\uC6A9 \uBE44\uC728',
  viewAll: '\uC804\uCCB4 \uBCF4\uAE30',
  noNotifications: '\uCD5C\uADFC \uC54C\uB9BC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  noNotificationContent: '\uC54C\uB9BC \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
};

const DUMMY_APPROVALS = [
  { id: '1', title: '[\uC804\uC0AC] 2026\uB144 \uC0C1\uBC18\uAE30 \uC778\uC0AC\uC6B4\uC601 \uBCF4\uACE0', type: '\uACB0\uC7AC\uC694\uCCAD', author: '\uC774\uC778\uC0AC', date: '2026-04-08', tab: 'wait' },
  { id: '2', title: '\uC5F0\uCC28 \uC2E0\uCCAD (4/10)', type: '\uD569\uC758', author: '\uAE40\uD55C\uBCC4', date: '2026-04-07', tab: 'wait' },
  { id: '3', title: '\uBC95\uC778 \uCE74\uB4DC \uC0AC\uC6A9 \uBCF4\uACE0', type: '\uAE30\uC548', author: '\uBC15\uC7AC\uBB38', date: '2026-04-05', tab: 'draft' },
  { id: '4', title: '\uCD9C\uC7A5 \uBE44\uC6A9 \uC815\uC0B0', type: '\uC218\uC2E0', author: '\uCD5C\uC7AC\uBB38', date: '2026-04-04', tab: 'inbox' },
];

const DUMMY_NOTIFICATIONS: { id: string; day: string; name: string; action: string; text: string; time: string }[] = [
  {
    id: 'n1',
    day: '2026-04-08',
    name: '\uC815\uC5F0\uAD6C',
    action: '\uB313\uAE00 \uB4F1\uB85D',
    text: '[\uACF5\uC9C0] \uC2DC\uC2A4\uD15C \uC810\uAC80 \uC77C\uC815\uC5D0 \uCC38\uC5EC\uD574 \uC8FC\uC138\uC694.',
    time: '09:42',
  },
  {
    id: 'n2',
    day: '2026-04-08',
    name: '\uD55C\uACB0\uC7AC',
    action: '\uACB0\uC7AC \uC2B9\uC778',
    text: '\uC5F0\uCC28 \uC2E0\uCCAD\uC774 \uC2B9\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4.',
    time: '08:10',
  },
  {
    id: 'n3',
    day: '2026-04-07',
    name: '\uC2DC\uC2A4\uD15C',
    action: '\uC54C\uB9BC',
    text: '\uC804\uC790\uACB0\uC7AC \uBB38\uC11C\uAC00 \uB3C4\uCC29\uD588\uC2B5\uB2C8\uB2E4.',
    time: '17:55',
  },
];

function buildMiniCalendarDays(base: dayjs.Dayjs) {
  const start = base.startOf('month').startOf('week');
  return Array.from({ length: 42 }, (_, index) => start.add(index, 'day'));
}

function cardShell(title: string, extra: ReactNode | undefined, children: ReactNode) {
  return (
    <Card
      className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5"
      title={<span className="tw-text-[15px] tw-font-semibold tw-text-slate-900">{title}</span>}
      extra={extra}
      styles={{ body: { paddingTop: 12 } }}
    >
      {children}
    </Card>
  );
}

function compactStat(label: string, value: ReactNode, tone: 'blue' | 'green' | 'amber' | 'slate' = 'slate') {
  const toneClass =
    tone === 'blue'
      ? 'tw-bg-blue-50 tw-text-blue-700'
      : tone === 'green'
        ? 'tw-bg-emerald-50 tw-text-emerald-700'
        : tone === 'amber'
          ? 'tw-bg-amber-50 tw-text-amber-700'
          : 'tw-bg-slate-50 tw-text-slate-700';
  return (
    <div className={`tw-rounded-xl tw-px-3 tw-py-2 ${toneClass}`}>
      <div className="tw-text-[11px] tw-font-medium tw-opacity-80">{label}</div>
      <div className="tw-mt-0.5 tw-text-lg tw-font-bold tw-tabular-nums">{value}</div>
    </div>
  );
}

function goalStatusLabel(status: Goal['status']): string {
  switch (status) {
    case 'DRAFT':
      return TXT.writing;
    case 'PENDING':
      return TXT.approvalPending;
    case 'ACTIVE':
      return TXT.inProgress;
    case 'COMPLETED':
      return TXT.waitingEval;
    case 'CANCELLED':
      return TXT.closed;
    case 'SKIPPED':
      return TXT.skipped;
    default:
      return status;
  }
}

function cycleTypeLabel(cycle: KpiCycle | string | undefined): string {
  if (cycle === 'YEARLY') return '연간';
  if (cycle === 'HALF_YEARLY') return '반기';
  if (cycle === 'QUARTERLY') return '분기';
  return '목표 기간';
}

function formatGoalCycle(goal?: Pick<Goal, 'cycle' | 'cycleStartDate' | 'cycleEndDate' | 'cycleKey'> | null): string {
  if (!goal) return '목표 기간 없음';
  const start = dayjs(goal.cycleStartDate);
  const end = dayjs(goal.cycleEndDate);
  const year = start.isValid() ? start.year() : '';
  let segment = '';
  if (goal.cycle === 'HALF_YEARLY') segment = start.month() < 6 ? '상반기' : '하반기';
  if (goal.cycle === 'QUARTERLY') segment = `${Math.floor(start.month() / 3) + 1}분기`;
  if (goal.cycle === 'YEARLY') segment = '연간';
  return [year, segment].filter(Boolean).join(' ') || goal.cycleKey || '목표 기간';
}

function cycleDistanceFromToday(startDate?: string, endDate?: string): number {
  const today = dayjs().startOf('day');
  const start = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');
  if (start.isValid() && end.isValid() && !today.isBefore(start) && !today.isAfter(end)) return 0;
  if (start.isValid() && today.isBefore(start)) return start.diff(today, 'day');
  if (end.isValid()) return Math.abs(today.diff(end, 'day')) + 10_000;
  return Number.MAX_SAFE_INTEGER;
}

function pickDashboardGoalCycle(goals: Goal[]): string | null {
  const cycleGroups = new Map<string, Goal[]>();
  goals.forEach((goal) => {
    const key = `${goal.cycleStartDate}|${goal.cycleEndDate}|${goal.cycleKey}`;
    const rows = cycleGroups.get(key) ?? [];
    rows.push(goal);
    cycleGroups.set(key, rows);
  });
  return [...cycleGroups.entries()]
    .map(([key, rows]) => ({
      key,
      distance: cycleDistanceFromToday(rows[0]?.cycleStartDate, rows[0]?.cycleEndDate),
      activeCount: rows.filter((goal) => goal.status === 'ACTIVE').length,
      start: rows[0]?.cycleStartDate ?? '',
    }))
    .sort((a, b) => a.distance - b.distance || b.activeCount - a.activeCount || dayjs(b.start).valueOf() - dayjs(a.start).valueOf())[0]?.key ?? null;
}

function seasonStatusLabel(status?: EvaluationSeasonFlow['status'] | null): string {
  if (status === 'DRAFT') return '준비 중';
  if (status === 'SELF_EVAL') return '자기평가';
  if (status === 'MANAGER_EVAL') return '상사평가';
  if (status === 'GRADE_CONFIRM') return '등급 확정';
  if (status === 'RESULT_PUBLISHED') return '결과 공개';
  if (status === 'INTERVIEW') return '면담 진행';
  if (status === 'CLOSED') return '종료';
  return '시즌 미연결';
}

function meetingState(meeting: { scheduledAt: string; completedAt?: string }) {
  if (meeting.completedAt) return { label: '완료', color: 'green' as const };
  if (dayjs(meeting.scheduledAt).isBefore(dayjs())) return { label: '지연', color: 'orange' as const };
  if (dayjs(meeting.scheduledAt).isBefore(dayjs().add(7, 'day'))) return { label: '7일 내', color: 'blue' as const };
  return { label: '예정', color: 'default' as const };
}

function isApprovalNotification(type: string): boolean {
  return String(type ?? '').toUpperCase().startsWith('APPROVAL_');
}

function isGoalBundleNotification(type: string, targetType?: string): boolean {
  const t = String(type ?? '').toUpperCase();
  const tt = String(targetType ?? '').toUpperCase();
  return t.startsWith('GOAL_BUNDLE_') || tt.startsWith('GOAL_BUNDLE_');
}

function isRoutableNotification(item: NotificationItem): boolean {
  return (
    isApprovalNotification(item.notificationType) ||
    isGoalBundleNotification(item.notificationType, item.targetType) ||
    isContractNotificationRoutable(item)
  );
}

export function DashboardProfileBlock({ user }: { user: Me | null }) {
  const memberId = user?.id?.trim() ?? '';
  const profileQuery = useQuery({
    queryKey: ['member', 'dashboard-profile', memberId],
    queryFn: () => memberApi.dashboardProfile(),
    enabled: Boolean(memberId),
    staleTime: 60_000,
  });
  const p = profileQuery.data;
  const name = (p?.name ?? user?.name)?.trim() || '—';
  const jobTitle = (p?.jobTitleName ?? user?.jobTitle)?.trim() || null;
  const org = (p?.organizationName ?? user?.departmentName)?.trim() || null;
  const jobGrade = p?.jobGradeName?.trim() || null;
  const deptLine = [org, jobGrade].filter(Boolean).join(' · ') || '—';
  const avatarSrc = (p?.profileUrl?.trim() || user?.profileImageUrl) ?? undefined;

  return cardShell(
    DASHBOARD_WIDGET_LABELS.profile,
    <Link to="/app/me" className="tw-text-xs tw-font-medium tw-text-blue-600 hover:tw-text-blue-700">
      {TXT.myInfo}
    </Link>,
    <div className="tw-space-y-4">
      <div className="tw-flex tw-items-start tw-gap-3">
        <Avatar size={56} className="tw-bg-slate-200 tw-text-slate-700" icon={<UserOutlined />} src={avatarSrc} />
        <div className="tw-min-w-0 tw-flex-1">
          <div className="tw-flex tw-flex-wrap tw-items-baseline tw-gap-x-2">
            <Typography.Text className="tw-text-base tw-font-bold tw-text-slate-900">{name}</Typography.Text>
            {jobTitle ? <Typography.Text type="secondary" className="tw-text-sm">{jobTitle}</Typography.Text> : null}
          </div>
          <Typography.Text type="secondary" className="tw-mt-0.5 tw-block tw-text-xs">{deptLine}</Typography.Text>
        </div>
      </div>
      <div className="tw-rounded-xl tw-bg-slate-50 tw-px-4 tw-py-3 tw-text-center">
        <Typography.Text type="secondary" className="tw-text-xs">{TXT.todaySchedule}</Typography.Text>
        <div className="tw-mt-1 tw-flex tw-min-h-[2.5rem] tw-items-center tw-justify-center tw-text-3xl tw-font-bold tw-tabular-nums tw-text-slate-900">
          {profileQuery.isLoading ? <Spin size="small" /> : (p?.todayEventCount ?? 0)}
        </div>
      </div>
    </div>,
  );
}

export function DashboardPerformanceGoalsBlock() {
  const myGoalsQ = useQuery({
    queryKey: ['dashboard', 'performance', 'my-goals'],
    queryFn: () => goalApi.listMyGoals(),
    staleTime: 60_000,
  });
  const objectivesQ = useQuery({
    queryKey: ['dashboard', 'performance', 'my-objectives'],
    queryFn: () => goalApi.listMyObjectives(),
    staleTime: 60_000,
  });
  const seasonsQ = useQuery({
    queryKey: ['dashboard', 'performance', 'seasons'],
    queryFn: () => evaluationRedesignApi.listSeasons(),
    staleTime: 60_000,
  });

  const goals = myGoalsQ.data ?? [];
  const objectives = objectivesQ.data ?? [];
  const selectedCycleKey = pickDashboardGoalCycle(goals);
  const cycleGoals = selectedCycleKey
    ? goals.filter((goal) => `${goal.cycleStartDate}|${goal.cycleEndDate}|${goal.cycleKey}` === selectedCycleKey)
    : goals;
  const cycleAnchor = cycleGoals[0] ?? null;
  const activeGoals = cycleGoals.filter((goal) => goal.status === 'ACTIVE');
  const pendingGoals = cycleGoals.filter((goal) => goal.status === 'PENDING');
  const draftGoals = cycleGoals.filter((goal) => goal.status === 'DRAFT');
  const approvedGoals = cycleGoals.filter((goal) => goal.goalApprovalStatus === 'APPROVED' || goal.status === 'ACTIVE' || goal.status === 'COMPLETED');
  const weightTotal = cycleGoals
    .filter((goal) => goal.status !== 'CANCELLED' && goal.status !== 'SKIPPED')
    .reduce((sum, goal) => sum + Number(goal.weightPct ?? 0), 0);
  const cycleObjectives = objectives.filter((objective) => !cycleAnchor || objective.cycleStartDate === cycleAnchor.cycleStartDate);
  const linkedSeason = (seasonsQ.data ?? [])
    .filter((season) => cycleAnchor && season.targetCycleStart === cycleAnchor.cycleStartDate)
    .sort((a, b) => cycleDistanceFromToday(a.startDate, a.endDate) - cycleDistanceFromToday(b.startDate, b.endDate))[0];
  const readiness =
    cycleGoals.length === 0
      ? { label: '목표 없음', color: 'default' as const, help: '해당 기간에 개인 목표가 없습니다.' }
      : weightTotal !== 100
        ? { label: '가중치 확인', color: 'orange' as const, help: `가중치 합이 ${weightTotal}%입니다.` }
        : pendingGoals.length > 0
          ? { label: '승인 대기', color: 'gold' as const, help: '승인 완료 후 평가 대상이 됩니다.' }
          : draftGoals.length > 0
            ? { label: '승인 요청 필요', color: 'orange' as const, help: '초안 목표를 승인 요청해야 합니다.' }
            : approvedGoals.length === cycleGoals.length
              ? { label: '평가 준비 완료', color: 'green' as const, help: '승인 완료 목표가 평가 대상입니다.' }
              : { label: '진행 중', color: 'blue' as const, help: '목표 상태를 확인하세요.' };
  const topGoals = [...draftGoals, ...pendingGoals, ...activeGoals, ...approvedGoals]
    .filter((goal, index, rows) => rows.findIndex((item) => item.goalId === goal.goalId) === index)
    .slice(0, 3);

  return cardShell(
    DASHBOARD_WIDGET_LABELS.performanceGoals,
    <Link to="/app/performance" search={{ view: 'my-objective' }} className="tw-text-xs tw-font-medium tw-text-blue-600">
      {TXT.goalView}
    </Link>,
    <Spin spinning={myGoalsQ.isLoading || objectivesQ.isLoading || seasonsQ.isLoading}>
      <div className="tw-space-y-4">
        <div className="tw-rounded-2xl tw-border tw-border-slate-100 tw-bg-slate-50/80 tw-p-3">
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
            <div>
              <div className="tw-text-sm tw-font-semibold tw-text-slate-900">{formatGoalCycle(cycleAnchor)}</div>
              <div className="tw-mt-0.5 tw-text-[11px] tw-text-slate-500">
                {cycleAnchor
                  ? `${cycleTypeLabel(cycleAnchor.cycle)} · ${dayjs(cycleAnchor.cycleStartDate).format('YYYY.MM.DD')} ~ ${dayjs(cycleAnchor.cycleEndDate).format('YYYY.MM.DD')}`
                  : '가장 가까운 목표 기간을 자동으로 보여줍니다.'}
              </div>
            </div>
            <Tag color={readiness.color} className="!tw-m-0 !tw-rounded-full">{readiness.label}</Tag>
          </div>
          <div className="tw-mt-2 tw-text-xs tw-text-slate-600">{readiness.help}</div>
        </div>
        <div className="tw-grid tw-grid-cols-3 tw-gap-2">
          {compactStat('승인 완료', approvedGoals.length, approvedGoals.length > 0 ? 'green' : 'slate')}
          {compactStat('승인 대기', pendingGoals.length, pendingGoals.length > 0 ? 'amber' : 'slate')}
          {compactStat('조직 목표', cycleObjectives.length, 'blue')}
        </div>
        <div>
          <div className="tw-mb-1 tw-flex tw-justify-between tw-text-xs tw-text-slate-600">
            <span>개인 목표 가중치 합</span>
            <span className="tw-font-medium tw-text-slate-900">{weightTotal}% / 100%</span>
          </div>
          <Progress percent={Math.min(100, weightTotal)} showInfo={false} strokeColor={weightTotal === 100 ? '#059669' : '#2563EB'} trailColor="#e2e8f0" size="small" />
        </div>
        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-text-xs">
          <Tag className="!tw-m-0">{linkedSeason ? seasonStatusLabel(linkedSeason.status) : '평가 시즌 없음'}</Tag>
          <span className="tw-text-slate-500">
            {linkedSeason ? linkedSeason.name : '이 목표 기간에 연결된 평가 시즌이 아직 없습니다.'}
          </span>
        </div>
        {topGoals.length === 0 ? (
          <div className="tw-rounded-xl tw-bg-slate-50 tw-p-4 tw-text-center tw-text-xs tw-text-slate-500">
            선택된 목표 기간에 표시할 개인 목표가 없습니다.
          </div>
        ) : (
          <List
            size="small"
            dataSource={topGoals}
            renderItem={(goal) => (
              <List.Item className="!tw-px-0 !tw-py-2">
                <div className="tw-min-w-0 tw-flex-1">
                  <div className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">{goal.title}</div>
                  <div className="tw-mt-0.5 tw-flex tw-items-center tw-gap-1.5 tw-text-xs tw-text-slate-500">
                    <span>{goal.weightPct}%</span>
                    <span>·</span>
                    <span className="tw-truncate">{goal.objectiveTitle ?? TXT.noParentGoal}</span>
                  </div>
                </div>
                <Tag className="!tw-m-0">{goalStatusLabel(goal.status)}</Tag>
              </List.Item>
            )}
          />
        )}
      </div>
    </Spin>,
  );
}

export function DashboardEvaluationTasksBlock() {
  const selfQ = useQuery({
    queryKey: ['dashboard', 'evaluation', 'self'],
    queryFn: () => evaluationRedesignApi.listMySelf(),
    staleTime: 60_000,
  });
  const evaluatorQ = useQuery({
    queryKey: ['dashboard', 'evaluation', 'evaluator'],
    queryFn: () => evaluationRedesignApi.listMyEvaluatorAssignments(),
    staleTime: 60_000,
  });
  const receivedQ = useQuery({
    queryKey: ['dashboard', 'evaluation', 'received'],
    queryFn: () => evaluationRedesignApi.listMyReceived(),
    staleTime: 60_000,
  });

  const selfPending = (selfQ.data ?? []).filter((item) => item.stage === 'SELF_PENDING');
  const waiting = (selfQ.data ?? []).filter((item) => item.stage !== 'SELF_PENDING' && item.stage !== 'CONFIRMED' && item.stage !== 'SKIPPED_LEAVER');
  const evaluatorTasks = evaluatorQ.data ?? [];
  const received = receivedQ.data ?? [];
  const primaryTasks = [...selfPending, ...evaluatorTasks].slice(0, 3);

  return cardShell(
    DASHBOARD_WIDGET_LABELS.evaluationTasks,
    <Link to="/app/evaluations" className="tw-text-xs tw-font-medium tw-text-blue-600">
      {TXT.evalView}
    </Link>,
    <Spin spinning={selfQ.isLoading || evaluatorQ.isLoading || receivedQ.isLoading}>
      <div className="tw-space-y-4">
        <div className="tw-grid tw-grid-cols-3 tw-gap-2">
          {compactStat(TXT.selfEval, selfPending.length, selfPending.length > 0 ? 'amber' : 'slate')}
          {compactStat(TXT.evaluator, evaluatorTasks.length, evaluatorTasks.length > 0 ? 'blue' : 'slate')}
          {compactStat(TXT.publishedResult, received.length, 'green')}
        </div>
        {primaryTasks.length > 0 ? (
          <List
            size="small"
            dataSource={primaryTasks}
            renderItem={(item) => (
              <List.Item className="!tw-px-0 !tw-py-2">
                <div className="tw-min-w-0 tw-flex-1">
                  <div className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">{item.seasonName ?? TXT.evalSeason}</div>
                  <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
                    {item.stage === 'SELF_PENDING' ? TXT.selfEvalRequired : TXT.evaluatorRequired}
                  </div>
                </div>
                <Tag color={item.stage === 'SELF_PENDING' ? 'gold' : 'processing'} className="!tw-m-0">
                  {item.stage === 'SELF_PENDING' ? TXT.required : TXT.review}
                </Tag>
              </List.Item>
            )}
          />
        ) : (
          <div className="tw-rounded-xl tw-bg-slate-50 tw-p-4 tw-text-center tw-text-xs tw-text-slate-500">
            {TXT.noEvalTasks}
            {waiting.length > 0 ? ` ${TXT.waitingReview} ${waiting.length}${TXT.caseCount}\uC774 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4.` : ''}
          </div>
        )}
      </div>
    </Spin>,
  );
}

export function DashboardFeedbackMeetingsBlock() {
  const memberQ = useQuery({
    queryKey: ['dashboard', 'meetings', 'member'],
    queryFn: () => meetingApi.listMyMeetingsAsMember(),
    staleTime: 60_000,
  });
  const managerQ = useQuery({
    queryKey: ['dashboard', 'meetings', 'manager'],
    queryFn: () => meetingApi.listMyMeetingsAsManager(),
    staleTime: 60_000,
  });
  const seasonsQ = useQuery({
    queryKey: ['dashboard', 'meetings', 'seasons'],
    queryFn: () => evaluationRedesignApi.listSeasons(),
    staleTime: 60_000,
  });

  const meetings = [...(memberQ.data ?? []), ...(managerQ.data ?? [])];
  const uniqueMeetings = Array.from(new Map(meetings.map((meeting) => [meeting.meetingRecordId, meeting])).values());
  const partnerIds = uniqueMeetings.flatMap((meeting) => [meeting.memberId, meeting.managerId]);
  const { labelFor } = useMemberDisplayNames(partnerIds);
  const seasonById = new Map((seasonsQ.data ?? []).map((season) => [season.seasonId, season]));
  const feedbackMeetings = uniqueMeetings
    .filter((meeting) => !!meeting.relatedSeasonId)
    .sort((a, b) => dayjs(a.scheduledAt).valueOf() - dayjs(b.scheduledAt).valueOf());
  const pendingMeetings = feedbackMeetings.filter((meeting) => !meeting.completedAt);
  const overdueMeetings = pendingMeetings.filter((meeting) => dayjs(meeting.scheduledAt).isBefore(dayjs()));
  const upcomingMeetings = pendingMeetings.filter((meeting) => !dayjs(meeting.scheduledAt).isBefore(dayjs()));
  const nextMeetings = [...overdueMeetings, ...upcomingMeetings].slice(0, 3);
  const primarySeason = nextMeetings[0]?.relatedSeasonId ? seasonById.get(nextMeetings[0].relatedSeasonId) : null;

  return cardShell(
    DASHBOARD_WIDGET_LABELS.feedbackMeetings,
    <Link to="/app/meetings" className="tw-text-xs tw-font-medium tw-text-blue-600">{TXT.meetingView}</Link>,
    <Spin spinning={memberQ.isLoading || managerQ.isLoading || seasonsQ.isLoading}>
      <div className="tw-space-y-4">
        <div className="tw-rounded-2xl tw-border tw-border-slate-100 tw-bg-slate-50/80 tw-p-3">
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
            <div>
              <div className="tw-text-sm tw-font-semibold tw-text-slate-900">
                {primarySeason?.name ?? '피드백 면담'}
              </div>
              <div className="tw-mt-0.5 tw-text-[11px] tw-text-slate-500">
                {primarySeason
                  ? `${seasonStatusLabel(primarySeason.status)} · ${dayjs(primarySeason.startDate).format('YYYY.MM.DD')} ~ ${dayjs(primarySeason.endDate).format('YYYY.MM.DD')}`
                  : '평가 결과 공개 후 자동 생성된 면담을 기준으로 보여줍니다.'}
              </div>
            </div>
            <Tag color={overdueMeetings.length > 0 ? 'orange' : pendingMeetings.length > 0 ? 'blue' : 'green'} className="!tw-m-0 !tw-rounded-full">
              {overdueMeetings.length > 0 ? `지연 ${overdueMeetings.length}` : pendingMeetings.length > 0 ? '예정 있음' : '대기 없음'}
            </Tag>
          </div>
        </div>
        <div className="tw-grid tw-grid-cols-2 tw-gap-2">
          {compactStat('지연', overdueMeetings.length, overdueMeetings.length > 0 ? 'amber' : 'slate')}
          {compactStat(TXT.scheduled, upcomingMeetings.length, upcomingMeetings.length > 0 ? 'blue' : 'slate')}
        </div>
        {nextMeetings.length === 0 ? (
          <div className="tw-rounded-xl tw-bg-slate-50 tw-p-4 tw-text-center tw-text-xs tw-text-slate-500">{TXT.noFeedbackMeetings}</div>
        ) : (
          <List
            size="small"
            dataSource={nextMeetings}
            renderItem={(meeting) => {
              const state = meetingState(meeting);
              const season = meeting.relatedSeasonId ? seasonById.get(meeting.relatedSeasonId) : null;
              const isManagerSide = managerQ.data?.some((item) => item.meetingRecordId === meeting.meetingRecordId);
              const partnerId = isManagerSide ? meeting.memberId : meeting.managerId;
              return (
                <List.Item className="!tw-px-0 !tw-py-2">
                  <div className="tw-flex tw-min-w-0 tw-flex-1 tw-items-start tw-gap-2">
                    <VideoCameraOutlined className="tw-mt-0.5 tw-text-blue-600" />
                    <div className="tw-min-w-0">
                      <div className="tw-flex tw-min-w-0 tw-flex-wrap tw-items-center tw-gap-1.5">
                        <span className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">
                          {season?.name ?? TXT.feedbackMeeting}
                        </span>
                        <Tag color={state.color} className="!tw-m-0 !tw-rounded-full !tw-text-[10px]">{state.label}</Tag>
                      </div>
                      <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
                        {dayjs(meeting.scheduledAt).format('YYYY.MM.DD (ddd) HH:mm')} · {isManagerSide ? '대상자' : '상사'} {labelFor(partnerId)}
                      </div>
                      <div className="tw-mt-0.5 tw-text-[11px] tw-text-slate-400">
                        {season ? seasonStatusLabel(season.status) : '시즌 정보 없음'}
                      </div>
                    </div>
                  </div>
                  <Link to="/app/meetings/$meetingId" params={{ meetingId: meeting.meetingRecordId }} className="tw-shrink-0 tw-text-xs tw-font-medium tw-text-blue-600">
                    {TXT.detail}
                  </Link>
                </List.Item>
              );
            }}
          />
        )}
      </div>
    </Spin>,
  );
}

export function DashboardApprovalInboxBlock() {
  return cardShell(
    DASHBOARD_WIDGET_LABELS.approvalInbox,
    <Link to="/app/approvals" className="tw-text-xs tw-font-medium tw-text-blue-600">{TXT.more}</Link>,
    <Tabs
      size="small"
      defaultActiveKey="month"
      items={[
        {
          key: 'wait',
          label: TXT.approvalWait,
          children: (
            <List
              size="small"
              dataSource={DUMMY_APPROVALS.filter((x) => x.tab === 'wait')}
              renderItem={(item) => (
                <List.Item className="!tw-px-0">
                  <div className="tw-min-w-0 tw-flex-1">
                    <div className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">{item.title}</div>
                    <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">{item.author} · {item.date}</div>
                  </div>
                  <Tag className="tw-shrink-0 !tw-m-0">{item.type}</Tag>
                </List.Item>
              )}
            />
          ),
        },
        {
          key: 'all',
          label: TXT.all,
          children: (
            <List
              size="small"
              dataSource={DUMMY_APPROVALS}
              renderItem={(item) => (
                <List.Item className="!tw-px-0">
                  <div className="tw-min-w-0 tw-flex-1">
                    <div className="tw-truncate tw-text-sm tw-text-slate-800">{item.title}</div>
                    <div className="tw-text-xs tw-text-slate-500">{item.author} · {item.date}</div>
                  </div>
                </List.Item>
              )}
            />
          ),
        },
      ]}
    />,
  );
}

export function DashboardCalendarBlock() {
  const today = dayjs();
  const [selectedDate, setSelectedDate] = useState(() => today.format('YYYY-MM-DD'));
  const monthQuery = useQuery({
    queryKey: ['calendar', 'dashboard-month', today.year(), today.month() + 1],
    queryFn: () => calendarApi.listMonth(today.year(), today.month() + 1),
    staleTime: 60_000,
  });
  // 회사 임시 공휴일 추가 fetch - 법정 공휴일과 합쳐서 캘린더에 표시
  const companyHolidayQuery = useQuery({
    queryKey: ['attendance', 'company-holidays', 'all'],
    queryFn: () => attendanceApi.companyHoliday.list(),
    staleTime: 60_000,
  });
  const events = monthQuery.data?.events ?? [];
  const legalHolidays = monthQuery.data?.holidays ?? [];
  const companyHolidaysMapped = (companyHolidayQuery.data ?? [])
    .filter((h) => h.holidayDate && h.holidayName)
    .map((h) => ({ holidayDate: h.holidayDate!, holidayName: h.holidayName! }));
  const holidayDedup = new Set<string>();
  const holidays = [...legalHolidays, ...companyHolidaysMapped].filter((h) => {
    const k = `${h.holidayDate}|${h.holidayName}`;
    if (holidayDedup.has(k)) return false;
    holidayDedup.add(k);
    return true;
  });
  const upcomingEvents = events
    .filter((event) => !dayjs(event.endAt).isBefore(today.startOf('day')))
    .sort((a, b) => dayjs(a.startAt).valueOf() - dayjs(b.startAt).valueOf())
    .slice(0, 4);
  const selectedDay = dayjs(selectedDate);
  const selectedEvents = events
    .filter((event) => dayjs(event.startAt).isSame(selectedDay, 'day'))
    .sort((a, b) => dayjs(a.startAt).valueOf() - dayjs(b.startAt).valueOf())
    .slice(0, 4);
  const calendarDays = buildMiniCalendarDays(today);
  const countByDate = new Map<string, number>();
  events.forEach((event) => {
    const key = dayjs(event.startAt).format('YYYY-MM-DD');
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
  });
  const holidayByDate = new Map(holidays.map((holiday) => [holiday.holidayDate, holiday.holidayName]));

  const renderEventList = (items: typeof events) => (
    <List
      size="small"
      dataSource={items}
      renderItem={(event) => (
        <List.Item className="!tw-px-0 !tw-py-1.5">
          <div className="tw-min-w-0 tw-flex-1">
            <div className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">{event.title}</div>
            <div className="tw-text-xs tw-text-slate-500">
              {dayjs(event.startAt).format('M\uC6D4 D\uC77C (ddd) HH:mm')} - {dayjs(event.endAt).format('HH:mm')}
            </div>
          </div>
          {event.eventTypeDescription ? (
            <Tag className="!tw-m-0 tw-shrink-0">{event.eventTypeDescription}</Tag>
          ) : null}
        </List.Item>
      )}
    />
  );

  return cardShell(
    DASHBOARD_WIDGET_LABELS.calendar,
    <Link to="/app/calendar" className="tw-text-xs tw-font-medium tw-text-blue-600">{TXT.scheduleManage}</Link>,
    <Tabs
      size="small"
      defaultActiveKey="month"
      items={[
        {
          key: 'month',
          label: TXT.calendar,
          children: (
            <div className="tw-space-y-3">
              <div className="tw-flex tw-items-center tw-justify-between">
                <Typography.Text className="tw-text-sm tw-font-semibold tw-text-slate-900">
                  {today.format('YYYY\uB144 M\uC6D4')}
                </Typography.Text>
                <Typography.Text type="secondary" className="tw-text-xs">
                  {TXT.monthlyEventsPrefix} {events.length}{TXT.caseCount}
                </Typography.Text>
              </div>
              <Spin spinning={monthQuery.isLoading}>
                <div className="tw-grid tw-grid-cols-7 tw-gap-1">
                  {['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'].map((dayName) => (
                    <div key={dayName} className="tw-py-1 tw-text-center tw-text-[11px] tw-font-medium tw-text-slate-400">
                      {dayName}
                    </div>
                  ))}
                  {calendarDays.map((day) => {
                    const dateKey = day.format('YYYY-MM-DD');
                    const inMonth = day.isSame(today, 'month');
                    const isToday = day.isSame(today, 'day');
                    const isSelected = dateKey === selectedDate;
                    const eventCount = countByDate.get(dateKey) ?? 0;
                    const holidayName = holidayByDate.get(dateKey);
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() => setSelectedDate(dateKey)}
                        className={`tw-relative tw-flex tw-h-10 tw-flex-col tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-appearance-none tw-p-0 tw-font-inherit tw-outline-none tw-transition-colors hover:tw-bg-blue-50 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-200 ${
                          isSelected
                            ? 'tw-bg-blue-600 tw-font-bold tw-text-white'
                            : isToday
                              ? 'tw-bg-blue-50 tw-font-bold tw-text-blue-700'
                              : inMonth
                                ? 'tw-bg-white tw-text-slate-700'
                                : 'tw-bg-transparent tw-text-slate-300'
                        }`}
                        title={holidayName ?? (eventCount > 0 ? `${eventCount}${TXT.caseCount}` : undefined)}
                      >
                        <span>{day.date()}</span>
                        <span className="tw-mt-0.5 tw-flex tw-h-1.5 tw-items-center tw-gap-0.5">
                          {holidayName ? <span className={`tw-block tw-size-1.5 tw-rounded-full ${isSelected ? 'tw-bg-white' : 'tw-bg-rose-400'}`} /> : null}
                          {eventCount > 0 ? <span className={`tw-block tw-size-1.5 tw-rounded-full ${isSelected ? 'tw-bg-white' : 'tw-bg-blue-500'}`} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Spin>
              <div className="tw-rounded-xl tw-border tw-border-slate-100 tw-bg-slate-50/80 tw-p-3">
                <div className="tw-mb-2 tw-flex tw-items-center tw-justify-between tw-gap-2">
                  <Typography.Text className="tw-text-xs tw-font-semibold tw-text-slate-700">
                    {selectedDay.format('M\uC6D4 D\uC77C (ddd)')}
                  </Typography.Text>
                  <Link
                    to="/app/calendar"
                    search={{ action: 'create', date: selectedDay.format('YYYY-MM-DD') }}
                    className="tw-text-xs tw-font-medium tw-text-blue-600 hover:tw-underline"
                  >
                    일정 추가
                  </Link>
                </div>
                {selectedEvents.length === 0 ? (
                  <Typography.Text type="secondary" className="tw-text-xs">
                    {TXT.noSelectedSchedule}
                  </Typography.Text>
                ) : (
                  renderEventList(selectedEvents)
                )}
              </div>
            </div>
          ),
        },
        {
          key: 'upcoming',
          label: TXT.upcoming,
          children: (
            <Spin spinning={monthQuery.isLoading}>
              {upcomingEvents.length === 0 ? (
                <Typography.Text type="secondary" className="tw-text-xs">{TXT.noUpcomingSchedule}</Typography.Text>
              ) : (
                renderEventList(upcomingEvents)
              )}
            </Spin>
          ),
        },
      ]}
    />,
  );
}

export function DashboardAttendanceBlock() {
  const pct = Math.round(((14 + 43 / 60) / 40) * 100);
  return cardShell(
    DASHBOARD_WIDGET_LABELS.attendance,
    <Tag color="processing" className="!tw-m-0">{TXT.employed}</Tag>,
    <div className="tw-space-y-4">
      <div className="tw-flex tw-items-baseline tw-justify-between tw-gap-2">
        <div>
          <Typography.Text type="secondary" className="tw-text-xs">{dayjs().format('YYYY.MM.DD (ddd)')}</Typography.Text>
          <div className="tw-mt-1 tw-font-mono tw-text-2xl tw-font-semibold tw-tabular-nums tw-text-slate-900">{dayjs().format('HH:mm:ss')}</div>
        </div>
        <ClockCircleOutlined className="tw-text-2xl tw-text-blue-600" />
      </div>
      <div className="tw-grid tw-grid-cols-2 tw-gap-3 tw-rounded-xl tw-bg-slate-50 tw-p-3">
        <div><Typography.Text type="secondary" className="tw-text-xs">{TXT.checkIn}</Typography.Text><div className="tw-text-sm tw-font-semibold tw-text-slate-900">09:02</div></div>
        <div><Typography.Text type="secondary" className="tw-text-xs">{TXT.checkOut}</Typography.Text><div className="tw-text-sm tw-font-semibold tw-text-slate-400">--:--</div></div>
      </div>
      <div>
        <div className="tw-mb-1 tw-flex tw-justify-between tw-text-xs tw-text-slate-600">
          <span>{TXT.weeklyTotal}</span>
          <span className="tw-font-medium tw-text-slate-900">14h 43m / 40h</span>
        </div>
        <Progress percent={pct} showInfo={false} strokeColor="#2563EB" trailColor="#e2e8f0" />
        <Typography.Text type="secondary" className="tw-mt-1 tw-block tw-text-[11px]">{TXT.weeklyRemain}</Typography.Text>
      </div>
      <div className="tw-flex tw-flex-wrap tw-gap-2">
        <Button type="primary">{TXT.checkInAction}</Button>
        <Button>{TXT.checkOutAction}</Button>
      </div>
    </div>,
  );
}

export function DashboardLeaveBlock() {
  const usedPct = 42.1;
  return cardShell(
    DASHBOARD_WIDGET_LABELS.leave,
    <Link to="/app/leave" className="tw-text-xs tw-font-medium tw-text-blue-600">{TXT.leaveManage}</Link>,
    <div className="tw-space-y-4">
      <div className="tw-grid tw-grid-cols-3 tw-gap-2 tw-text-center">
        {[
          { label: TXT.remain, value: '5.5\uC77C', icon: <CheckCircleOutlined className="tw-text-blue-600" /> },
          { label: TXT.used, value: '4\uC77C', icon: <CalendarOutlined className="tw-text-blue-500" /> },
          { label: TXT.yearly, value: '9.5\uC77C', icon: <UserOutlined className="tw-text-slate-500" /> },
        ].map((x) => (
          <div key={x.label} className="tw-rounded-xl tw-border tw-border-slate-100 tw-bg-slate-50/80 tw-py-3">
            <div className="tw-mb-1 tw-flex tw-justify-center">{x.icon}</div>
            <div className="tw-text-lg tw-font-bold tw-tabular-nums tw-text-slate-900">{x.value}</div>
            <div className="tw-text-[11px] tw-text-slate-500">{x.label}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="tw-mb-1 tw-flex tw-justify-between tw-text-xs">
          <span className="tw-text-slate-600">{TXT.usedRate}</span>
          <span className="tw-font-medium tw-text-slate-900">{usedPct}%</span>
        </div>
        <Progress percent={usedPct} strokeColor="#2563EB" trailColor="#e2e8f0" size="small" />
      </div>
    </div>,
  );
}

export function DashboardNotificationsBlock() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationsQ = useQuery({
    queryKey: ['dashboard', 'notifications'],
    queryFn: () => notificationApi.list(),
    staleTime: 30_000,
  });
  const markNotificationAsRead = useMutation({
    mutationFn: (notificationId: string) => notificationApi.markAsRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const notifications = (notificationsQ.data ?? []).slice(0, 5);

  const routeNotification = async (item: NotificationItem) => {
    if (!isRoutableNotification(item)) return;
    if (item.isRead !== 'YES') {
      await markNotificationAsRead.mutateAsync(item.notificationId);
    }
    if (isContractNotificationRoutable(item)) {
      await navigate(buildContractNotificationNavigate(item.targetId));
      return;
    }
    if (isGoalBundleNotification(item.notificationType, item.targetType)) {
      await navigate(
        buildGoalBundleNotificationNavigate({
          notificationType: item.notificationType,
          targetType: item.targetType,
          title: item.title,
          content: item.content,
          targetId: item.targetId,
        }),
      );
      return;
    }
    await navigate(
      buildApprovalNotificationNavigate({
        notificationType: item.notificationType,
        targetType: item.targetType,
        title: item.title,
        content: item.content,
        targetId: item.targetId,
      }),
    );
  };

  return cardShell(
    DASHBOARD_WIDGET_LABELS.notifications,
    <Link to="/app/notifications" className="tw-text-xs tw-font-medium tw-text-blue-600">{TXT.viewAll}</Link>,
    <Spin spinning={notificationsQ.isLoading}>
      {notifications.length === 0 ? (
        <div className="tw-rounded-xl tw-bg-slate-50 tw-p-4 tw-text-center tw-text-xs tw-text-slate-500">{TXT.noNotifications}</div>
      ) : (
        <List
          size="small"
          dataSource={notifications}
          renderItem={(item) => {
            const routable = isRoutableNotification(item);
            const unread = item.isRead !== 'YES';
            return (
              <List.Item className="!tw-px-0 !tw-py-2">
                <div
                  role={routable ? 'button' : undefined}
                  tabIndex={routable ? 0 : undefined}
                  className={`tw-flex tw-min-w-0 tw-flex-1 tw-gap-2 tw-rounded-xl tw-p-2 tw-transition-opacity ${
                    unread ? 'tw-opacity-100' : 'tw-opacity-55'
                  } ${routable ? 'tw-cursor-pointer hover:tw-bg-slate-50 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-blue-500' : ''}`}
                  onClick={() => {
                    if (!routable) return;
                    void routeNotification(item);
                  }}
                  onKeyDown={(event) => {
                    if (!routable) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    void routeNotification(item);
                  }}
                >
                  <Avatar size="small" className="tw-shrink-0 tw-bg-slate-200" icon={<UserOutlined />} />
                  <div className="tw-min-w-0">
                    <div className="tw-flex tw-items-center tw-gap-1.5">
                      <Tag className="!tw-m-0 !tw-text-[10px]">{item.title}</Tag>
                      {unread ? <span className="tw-size-1.5 tw-rounded-full tw-bg-red-500" /> : null}
                    </div>
                    <div className="tw-mt-1 tw-line-clamp-2 tw-text-xs tw-leading-snug tw-text-slate-700">{item.content || TXT.noNotificationContent}</div>
                    <div className="tw-mt-0.5 tw-text-[11px] tw-text-slate-400">{item.createdAt ? dayjs(item.createdAt).format('YYYY.MM.DD HH:mm') : '-'}</div>
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </Spin>,
  );
}

/**
 * 시스템 관리자만 의미 있는 위젯 — 회사 Salary 목록에서 활성·기본급 0원인 행 = 급여 미등록 신규 입사자.
 * 클릭 시 [직원 급여 관리] 의 신규 입사자 필터가 켜진 화면으로 이동.
 */
function DashboardPayrollNewHiresBlock({ user }: { user: Me | null }) {
  const isAdmin = Boolean(user?.isSystemAdmin);
  // 권한 없는 사용자는 query 자체를 발사하지 않는다 (백엔드 403 이슈 + 무의미한 0명 표시 방지).
  const salariesQ = useQuery({
    queryKey: ['salary', 'salaries'],
    queryFn: () => salaryApi.salary.listByCompany(),
    enabled: isAdmin,
    staleTime: 60_000,
  });
  // 임시 Salary 시그니처 — SalaryTab 의 isProvisionalSalary 와 동일 기준.
  // - 연봉제 자동 행: baseSalary === 0 && step == null
  // - 호봉제 자동 행: step === 1 (호봉표 1호봉 가격이 baseSalary 에 자동 적용되므로 baseSalary 만으로는 식별 불가)
  const newHires = useMemo(() => {
    const today = dayjs().startOf('day');
    const list = salariesQ.data ?? [];
    return list.filter((s) => {
      if (!s.effectiveFrom) return false;
      const startedOk = !dayjs(s.effectiveFrom).startOf('day').isAfter(today);
      const notEnded = !s.effectiveTo || !dayjs(s.effectiveTo).startOf('day').isBefore(today);
      const isActive = startedOk && notEnded;
      if (!isActive) return false;
      const isAutoYearly = (s.baseSalary ?? 0) === 0 && s.step == null;
      const isAutoStep = s.step === 1;
      return isAutoYearly || isAutoStep;
    });
  }, [salariesQ.data]);

  if (!isAdmin) {
    // 비관리자에게는 위젯 자체를 비워둔다 (껍데기만 남기면 혼란).
    return null;
  }

  return cardShell(
    DASHBOARD_WIDGET_LABELS.payrollNewHires,
    <Link
      to="/app/payroll/admin"
      search={{ tab: 'register' }}
      className="tw-text-[13px] tw-font-medium tw-text-[#2563EB]"
    >
      바로 등록 →
    </Link>,
    salariesQ.isLoading ? (
      <div className="tw-flex tw-justify-center tw-py-6">
        <Spin />
      </div>
    ) : newHires.length === 0 ? (
      <div className="tw-py-2 tw-text-sm tw-text-slate-500">
        급여 미등록 신규 입사자가 없습니다.
      </div>
    ) : (
      <div>
        <div className="tw-flex tw-items-baseline tw-gap-2">
          <DollarOutlined className="tw-text-amber-500" />
          <span className="tw-text-2xl tw-font-bold tw-text-slate-900">{newHires.length}</span>
          <span className="tw-text-sm tw-text-slate-500">명 — 기본급 등록 필요</span>
        </div>
        <List<Salary>
          size="small"
          className="tw-mt-2"
          dataSource={newHires.slice(0, 5)}
          renderItem={(s) => (
            <List.Item
              actions={[
                s.memberId ? (
                  <Link
                    key="register"
                    to="/app/payroll/admin"
                    search={{ tab: 'register', createForMemberId: s.memberId }}
                    className="tw-text-xs tw-font-medium tw-text-[#2563EB]"
                  >
                    등록
                  </Link>
                ) : null,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <span className="tw-text-sm tw-font-medium tw-text-slate-800">
                    {s.name ?? '—'}
                  </span>
                }
                description={
                  <span className="tw-text-xs tw-text-slate-500">
                    {[s.organizationName, s.sabun].filter(Boolean).join(' · ') || '—'}
                  </span>
                }
              />
            </List.Item>
          )}
        />
        {newHires.length > 5 ? (
          <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-xs">
            외 {newHires.length - 5}명 — [바로 등록] 에서 전체 보기
          </Typography.Paragraph>
        ) : null}
      </div>
    ),
  );
}

export function renderDashboardWidget(id: DashboardWidgetId, user: Me | null): ReactNode {
  switch (id) {
    case 'profile':
      return <DashboardProfileBlock key={id} user={user} />;
    case 'performanceGoals':
      return <DashboardPerformanceGoalsBlock key={id} />;
    case 'evaluationTasks':
      return <DashboardEvaluationTasksBlock key={id} />;
    case 'feedbackMeetings':
      return <DashboardFeedbackMeetingsBlock key={id} />;
    case 'approvalInbox':
      return <DashboardApprovalInboxBlock key={id} />;
    case 'calendar':
      return <DashboardCalendarBlock key={id} />;
    case 'attendance':
      return <DashboardAttendanceBlock key={id} />;
    case 'leave':
      return <DashboardLeaveBlock key={id} />;
    case 'notifications':
      return <DashboardNotificationsBlock key={id} />;
    case 'payrollNewHires':
      return <DashboardPayrollNewHiresBlock key={id} user={user} />;
    default:
      return null;
  }
}
