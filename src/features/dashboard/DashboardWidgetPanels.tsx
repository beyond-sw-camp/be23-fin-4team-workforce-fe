import {
  CalendarOutlined,
  CheckCircleOutlined,
  LoginOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, List, Progress, Spin, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { Me } from '@/features/auth/types';
import { useAuth } from '@/features/auth/useAuth';
import {
  approvalRequestApi,
  findMyInboxApprovalLine,
  type ApprovalRequestDetail,
} from '@/features/approvals/api/approvalRequestApi';
import { approvalRequestTypeLabelKo } from '@/features/approvals/lib/approvalRequestTypeKo';
import { calendarApi } from '@/features/calendar/api/calendarApi';
import { DASHBOARD_WIDGET_LABELS, type DashboardWidgetId } from '@/features/dashboard/dashboardWidgetsModel';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import type { EvaluationSeasonFlow } from '@/features/evaluation/model/workflowTypes';
import { goalApi } from '@/features/goals/api/goalApi';
import type { Goal, KpiCycle } from '@/features/goals/model/types';
import { memberApi } from '@/features/member/api/memberApi';
import { attendanceApi } from '@/features/salary-service/api/attendanceApi';
import { MyLeaveHistoryModal } from '@/features/salary-service/ui/MyLeaveHistoryModal';
import { notificationApi, type NotificationItem } from '@/features/notification/api/notificationApi';
import {
  buildApprovalNotificationNavigate,
  buildGoalBundleNotificationNavigate,
} from '@/features/notification/lib/approvalNotificationRoute';
import {
  buildContractNotificationNavigate,
  isContractNotificationRoutable,
  resolveContractNotificationTargetId,
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
  leaveManage: '\uD734\uAC00 \uC774\uB825',
  remain: '\uC794\uC5EC',
  used: '\uC0AC\uC6A9',
  yearly: '\uC5F0\uAC04',
  usedRate: '\uC0AC\uC6A9 \uBE44\uC728',
  viewAll: '\uC804\uCCB4 \uBCF4\uAE30',
  noNotifications: '\uCD5C\uADFC \uC54C\uB9BC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  noNotificationContent: '\uC54C\uB9BC \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
};

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

/** Approvals 허브 `rowIsUpcomingForApprover`와 동일 — 대시보드 전자결재함 배지용 */
function rowIsUpcomingForApproverDashboard(row: ApprovalRequestDetail, myMemberId?: string): boolean {
  const mid = myMemberId?.trim();
  if (!mid) return false;
  const pendingLine = row.approvalLines.find(
    (l) => String(l.approvalStatus).toUpperCase() === 'PENDING',
  );
  if (!pendingLine) return false;
  return String(pendingLine.approverMemberId ?? '').trim().toLowerCase() !== mid.toLowerCase();
}

function dashboardInboxRowKind(
  row: ApprovalRequestDetail,
  opts: { myMemberId?: string; myMemberPositionId?: string },
): 'pending' | 'waiting' {
  const myLine = findMyInboxApprovalLine(row, opts);
  const inboxSt = String(myLine?.approvalStatus ?? '').toUpperCase();
  if (inboxSt === 'WAITING' || rowIsUpcomingForApproverDashboard(row, opts.myMemberId)) {
    return 'waiting';
  }
  return 'pending';
}

function cardShell(title: string, extra: ReactNode | undefined, children: ReactNode) {
  return (
    <Card
      className="wf-dashboard-widget-card"
      title={<span className="wf-dashboard-widget-title">{title}</span>}
      extra={extra}
      styles={{ body: { paddingTop: 14 } }}
    >
      {children}
    </Card>
  );
}

function compactStat(label: string, value: ReactNode, tone: 'blue' | 'green' | 'amber' | 'slate' = 'slate') {
  const toneClass =
    tone === 'blue'
      ? 'tw-bg-blue-50 tw-text-blue-700 tw-ring-blue-100'
      : tone === 'green'
        ? 'tw-bg-emerald-50 tw-text-emerald-700 tw-ring-emerald-100'
        : tone === 'amber'
          ? 'tw-bg-amber-50 tw-text-amber-700 tw-ring-amber-100'
          : 'tw-bg-slate-50 tw-text-slate-700 tw-ring-slate-100';
  return (
    <div className={`tw-rounded-xl tw-px-3 tw-py-2.5 tw-ring-1 ${toneClass}`}>
      <div className="tw-text-[11px] tw-font-semibold tw-opacity-80">{label}</div>
      <div className="tw-mt-0.5 tw-text-xl tw-font-bold tw-leading-none tw-tabular-nums">{value}</div>
    </div>
  );
}

function useDashboardNow() {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(dayjs()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
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

function isApprovalNotification(type: string): boolean {
  return String(type ?? '').toUpperCase().startsWith('APPROVAL_');
}

function isGoalBundleNotification(type: string, targetType?: string): boolean {
  const t = String(type ?? '').toUpperCase();
  const tt = String(targetType ?? '').toUpperCase();
  return t.startsWith('GOAL_BUNDLE_') || tt.startsWith('GOAL_BUNDLE_');
}

function isMeetingNotification(type: string, targetType?: string): boolean {
  const t = String(type ?? '').toUpperCase();
  const tt = String(targetType ?? '').toUpperCase();
  return t.startsWith('MEETING_') || tt.startsWith('MEETING_');
}

function isRoutableNotification(item: NotificationItem): boolean {
  return (
    isApprovalNotification(item.notificationType) ||
    isGoalBundleNotification(item.notificationType, item.targetType) ||
    isMeetingNotification(item.notificationType, item.targetType) ||
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
    <div className="tw-flex tw-flex-col tw-items-center tw-text-center">
      <div className="tw-relative tw-mt-1">
        <Avatar size={68} className="tw-border-4 tw-border-white tw-bg-slate-200 tw-text-slate-700 tw-shadow-md tw-shadow-slate-900/10" icon={<UserOutlined />} src={avatarSrc} />
        <span className="tw-absolute tw-bottom-1 tw-right-1 tw-size-4 tw-rounded-full tw-border-2 tw-border-white tw-bg-emerald-500" />
      </div>
      <div className="tw-mt-4 tw-min-w-0">
        <div className="tw-flex tw-flex-wrap tw-items-baseline tw-justify-center tw-gap-x-2">
          <Typography.Text className="tw-text-lg tw-font-bold tw-text-slate-950">{name}</Typography.Text>
          {jobTitle ? <Typography.Text type="secondary" className="tw-text-sm">{jobTitle}</Typography.Text> : null}
        </div>
        <Typography.Text type="secondary" className="tw-mt-1 tw-block tw-text-xs">{deptLine}</Typography.Text>
      </div>
      <div className="tw-mt-5 tw-w-full tw-rounded-2xl tw-bg-slate-50 tw-px-4 tw-py-3.5 tw-ring-1 tw-ring-slate-100">
        <Typography.Text type="secondary" className="tw-text-xs tw-font-medium">{TXT.todaySchedule}</Typography.Text>
        <div className="tw-mt-1 tw-flex tw-min-h-[2.4rem] tw-items-center tw-justify-center tw-text-3xl tw-font-bold tw-tabular-nums tw-text-blue-600">
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
    <Link to="/app/performance" search={{ view: 'my' }} className="tw-text-xs tw-font-medium tw-text-blue-600">
      {TXT.goalView}
    </Link>,
    <Spin spinning={myGoalsQ.isLoading || objectivesQ.isLoading || seasonsQ.isLoading}>
      <div className="tw-space-y-4">
        <div className="tw-rounded-2xl tw-bg-slate-50 tw-p-4 tw-ring-1 tw-ring-slate-100">
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
          <div className="tw-mt-2 tw-text-xs tw-leading-5 tw-text-slate-600">{readiness.help}</div>
        </div>
        <div className="tw-grid tw-grid-cols-3 tw-gap-2">
          {compactStat('승인 완료', approvedGoals.length, approvedGoals.length > 0 ? 'green' : 'slate')}
          {compactStat('승인 대기', pendingGoals.length, pendingGoals.length > 0 ? 'amber' : 'slate')}
          {compactStat('조직 목표', cycleObjectives.length, 'blue')}
        </div>
        <div className="tw-rounded-2xl tw-bg-white tw-p-1">
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

export function DashboardApprovalInboxBlock() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const authMemberId = user?.id?.trim() || undefined;
  const memberPositionId = user?.memberPositionId?.trim() || undefined;
  const inboxLineOpts = useMemo(
    () => ({ myMemberId: authMemberId, myMemberPositionId: memberPositionId }),
    [authMemberId, memberPositionId],
  );

  const [activeKey, setActiveKey] = useState<'wait' | 'all'>('wait');

  const pendingQ = useQuery({
    queryKey: ['dashboard', 'approvals', 'pending'],
    queryFn: () => approvalRequestApi.listPendingApprovals(),
    enabled: Boolean(authMemberId) && activeKey === 'wait',
    staleTime: 30_000,
  });

  const inboxQ = useQuery({
    queryKey: ['dashboard', 'approvals', 'inbox'],
    queryFn: () => approvalRequestApi.listApprovalInbox(),
    enabled: Boolean(authMemberId) && activeKey === 'all',
    staleTime: 30_000,
  });

  const pendingRows = useMemo(
    () =>
      [...(pendingQ.data ?? [])]
        .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
        .slice(0, 8),
    [pendingQ.data],
  );

  const inboxRows = useMemo(
    () =>
      [...(inboxQ.data ?? [])]
        .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
        .slice(0, 8),
    [inboxQ.data],
  );

  const openApprovalDetail = (requestId: string) => {
    const id = requestId?.trim();
    if (!id) return;
    void navigate({
      to: '/app/approvals',
      search: {
        tab: 'compose',
        approvalModal: 'pending',
        approvalRequestId: id,
        approvalOpenAt: String(Date.now()),
      },
    });
  };

  const renderStatusTag = (row: ApprovalRequestDetail, mode: 'pendingOnly' | 'inbox') => {
    const tagClass = '!tw-m-0 tw-shrink-0';
    if (mode === 'pendingOnly') {
      return (
        <Tag color="gold" className={tagClass}>
          결재 대기
        </Tag>
      );
    }
    const kind = dashboardInboxRowKind(row, inboxLineOpts);
    if (kind === 'waiting') {
      return (
        <Tag color="processing" className={tagClass}>
          결재 예정
        </Tag>
      );
    }
    return (
      <Tag color="gold" className={tagClass}>
        결재 대기
      </Tag>
    );
  };

  const renderRows = (
    rows: ApprovalRequestDetail[],
    opts: { loading: boolean; error: boolean; emptyText: string; tagMode: 'pendingOnly' | 'inbox' },
  ) => {
    if (opts.error) {
      return (
        <Typography.Text type="danger" className="tw-text-xs">
          목록을 불러오지 못했습니다.
        </Typography.Text>
      );
    }
    if (!opts.loading && rows.length === 0) {
      return (
        <Typography.Text type="secondary" className="tw-text-xs">
          {opts.emptyText}
        </Typography.Text>
      );
    }
    return (
      <List
        size="small"
        dataSource={rows}
        renderItem={(row) => (
          <List.Item className="!tw-px-0">
            <button
              type="button"
              className="tw-flex tw-min-w-0 tw-w-full tw-appearance-none tw-items-start tw-gap-2 tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-outline-none hover:tw-opacity-90 focus-visible:tw-ring-2 focus-visible:tw-ring-blue-400 focus-visible:tw-ring-offset-1"
              onClick={() => openApprovalDetail(row.requestId)}
            >
              <div className="tw-min-w-0 tw-flex-1">
                <div className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-800">
                  {row.documentName?.trim() || '—'}
                </div>
                <div className="tw-mt-0.5 tw-truncate tw-text-xs tw-text-slate-500">
                  {row.requesterName?.trim() || '—'} · {row.createdAt ? dayjs(row.createdAt).format('YYYY-MM-DD') : '—'} ·{' '}
                  {approvalRequestTypeLabelKo(String(row.requestType))}
                </div>
              </div>
              {renderStatusTag(row, opts.tagMode)}
            </button>
          </List.Item>
        )}
      />
    );
  };

  return cardShell(
    DASHBOARD_WIDGET_LABELS.approvalInbox,
    <Link to="/app/approvals" className="tw-text-xs tw-font-medium tw-text-blue-600">{TXT.more}</Link>,
    <Tabs
      size="small"
      activeKey={activeKey}
      onChange={(k) => setActiveKey(k === 'all' ? 'all' : 'wait')}
      destroyInactiveTabPane
      items={[
        {
          key: 'wait',
          label: TXT.approvalWait,
          children: (
            <Spin spinning={pendingQ.isLoading}>
              {renderRows(pendingRows, {
                loading: pendingQ.isLoading,
                error: pendingQ.isError,
                emptyText: '결재 대기 문서가 없습니다.',
                tagMode: 'pendingOnly',
              })}
            </Spin>
          ),
        },
        {
          key: 'all',
          label: TXT.all,
          children: (
            <Spin spinning={inboxQ.isLoading}>
              {renderRows(inboxRows, {
                loading: inboxQ.isLoading,
                error: inboxQ.isError,
                emptyText: '표시할 문서가 없습니다.',
                tagMode: 'inbox',
              })}
            </Spin>
          ),
        },
      ]}
    />,
  );
}

export function DashboardCalendarBlock() {
  const today = dayjs();
  const [selectedDate, setSelectedDate] = useState(() => today.format('YYYY-MM-DD'));
  const todayIso = today.format('YYYY-MM-DD');
  const monthQuery = useQuery({
    queryKey: ['calendar', 'dashboard-month', today.year(), today.month() + 1],
    queryFn: () => calendarApi.listMonth(today.year(), today.month() + 1),
    staleTime: 60_000,
  });
  const companyHolidaysQ = useQuery({
    queryKey: ['company-holidays', 'dashboard'],
    queryFn: () => attendanceApi.companyHoliday.list(),
    staleTime: 5 * 60_000,
  });
  const events = monthQuery.data?.events ?? [];
  const monthPrefix = today.format('YYYY-MM');
  const holidays = (companyHolidaysQ.data ?? []).filter(
    (h) => typeof h.holidayDate === 'string' && h.holidayDate.startsWith(monthPrefix),
  );
  const upcomingEvents = events
    .filter((event) => !dayjs(event.startAt).isBefore(today, 'day'))
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
  const holidayByDate = new Map<string, string>();
  holidays.forEach((holiday) => {
    if (holiday.holidayDate && holiday.holidayName) {
      holidayByDate.set(holiday.holidayDate, holiday.holidayName);
    }
  });

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
                <Typography.Text type="secondary" className="tw-text-xs">
                  {monthQuery.isError ? '다가올 일정을 불러오지 못했습니다.' : TXT.noUpcomingSchedule}
                </Typography.Text>
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
  const queryClient = useQueryClient();
  const now = useDashboardNow();
  const todayIso = now.format('YYYY-MM-DD');
  const dailyQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'daily', todayIso],
    queryFn: async () => {
      try {
        return await attendanceApi.attendance.getMyDaily(todayIso);
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          'status' in e &&
          (e as { status?: unknown }).status === 404
        ) {
          return null;
        }
        throw e;
      }
    },
    staleTime: 30_000,
  });
  const summaryQ = useQuery({
    queryKey: ['salary', 'attendance', 'my', 'work-time-summary', todayIso],
    queryFn: async () => {
      try {
        return await attendanceApi.attendance.getMyWorkTimeSummary(todayIso);
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          'status' in e &&
          (e as { status?: unknown }).status === 404
        ) {
          return null;
        }
        throw e;
      }
    },
    staleTime: 30_000,
  });
  const invalidateAttendance = () => {
    void queryClient.invalidateQueries({ queryKey: ['salary', 'attendance', 'my'] });
  };
  const clockInM = useMutation({
    mutationFn: () => attendanceApi.attendance.clockIn({}),
    onSuccess: (daily) => {
      queryClient.setQueryData(['salary', 'attendance', 'my', 'daily', todayIso], daily);
      invalidateAttendance();
    },
  });
  const clockOutM = useMutation({
    mutationFn: () => attendanceApi.attendance.clockOut({}),
    onSuccess: (daily) => {
      queryClient.setQueryData(['salary', 'attendance', 'my', 'daily', todayIso], daily);
      invalidateAttendance();
    },
  });

  const fmtTime = (iso?: string | null) => (iso ? dayjs.utc(iso).tz('Asia/Seoul').format('HH:mm') : '--:--');
  const fmtMinutes = (m?: number | null) => {
    const safe = Math.max(0, Math.floor(m ?? 0));
    const h = Math.floor(safe / 60);
    const mm = safe % 60;
    return `${h}시간 ${mm}분`;
  };
  const percentColor = (percent?: number | null) => {
    const p = percent ?? 0;
    if (p >= 100) return '#CF1322';
    if (p >= 92) return '#D4380D';
    if (p >= 75) return '#D48806';
    return '#2563EB';
  };
  const percentOf = (value?: number | null, limit?: number | null, percent?: number | null) => {
    if (typeof percent === 'number') return Math.max(0, Math.min(100, Math.round(percent)));
    if (!limit || limit <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((value ?? 0) / limit) * 100)));
  };

  const summary = summaryQ.data ?? null;
  const totalMin = summary?.totalWorkedMinutes ?? 0;
  const limitMin = summary?.totalLimitMinutes ?? null;
  const totalPct = percentOf(totalMin, limitMin, summary?.totalUsagePercent);
  const overtimeLimitMin = summary?.overtimeLimitMinutes ?? null;
  const overtimeMin = summary?.overtimeApprovedMinutes ?? 0;
  const weekRange =
    summary?.weekStart && summary?.weekEnd
      ? `${dayjs(summary.weekStart).format('MM.DD')} ~ ${dayjs(summary.weekEnd).format('MM.DD')}`
      : '이번 주';

  const hasClockedIn = !!dailyQ.data?.firstClockIn;
  const hasClockedOut = !!dailyQ.data?.lastClockOut;
  const todayWorkedMinutes = (() => {
    const daily = dailyQ.data;
    if (!daily) return 0;
    if (daily.firstClockIn && !daily.lastClockOut) {
      return Math.max(0, now.diff(dayjs.utc(daily.firstClockIn).tz('Asia/Seoul'), 'minute'));
    }
    if (daily.workedMinutes != null) return daily.workedMinutes;
    if (daily.firstClockIn && daily.lastClockOut) {
      return Math.max(0, dayjs.utc(daily.lastClockOut).tz('Asia/Seoul').diff(dayjs.utc(daily.firstClockIn).tz('Asia/Seoul'), 'minute'));
    }
    return 0;
  })();
  const todayStatusLabel = hasClockedOut ? '퇴근 완료' : hasClockedIn ? '근무 중' : '근무 전';

  return cardShell(
    DASHBOARD_WIDGET_LABELS.attendance,
    undefined,
    <Spin spinning={dailyQ.isLoading || summaryQ.isLoading}>
      <div className="tw-space-y-3">
        <div>
          <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
            <div className="tw-min-w-0">
              <Typography.Text type="secondary" className="tw-text-xs tw-font-medium">{now.format('YYYY.MM.DD (ddd)')}</Typography.Text>
              <div className="tw-mt-1 tw-text-[11px] tw-font-medium tw-text-slate-500">오늘 근무시간</div>
              <div className="tw-mt-0.5 tw-text-2xl tw-font-bold tw-tracking-tight tw-tabular-nums tw-text-slate-950">
                {fmtMinutes(todayWorkedMinutes)}
              </div>
            </div>
            <span className="tw-whitespace-nowrap tw-rounded-full tw-bg-slate-100 tw-px-2.5 tw-py-1 tw-text-xs tw-font-semibold tw-text-slate-600">
              {todayStatusLabel}
            </span>
          </div>
          <div className="tw-mt-3 tw-grid tw-grid-cols-2 tw-gap-3 tw-border-y tw-border-slate-100 tw-py-2.5">
            <div>
              <Typography.Text type="secondary" className="tw-text-[11px]">{TXT.checkIn}</Typography.Text>
              <div className={`tw-text-sm tw-font-semibold ${hasClockedIn ? 'tw-text-slate-900' : 'tw-text-slate-400'}`}>
                {fmtTime(dailyQ.data?.firstClockIn)}
              </div>
            </div>
            <div>
              <Typography.Text type="secondary" className="tw-text-[11px]">{TXT.checkOut}</Typography.Text>
              <div className={`tw-text-sm tw-font-semibold ${hasClockedOut ? 'tw-text-slate-900' : 'tw-text-slate-400'}`}>
                {fmtTime(dailyQ.data?.lastClockOut)}
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="tw-mb-1 tw-flex tw-items-baseline tw-justify-between tw-gap-2">
            <Typography.Text className="tw-text-xs tw-font-semibold tw-text-slate-700">주간 누적</Typography.Text>
            <span className="tw-text-[11px] tw-font-medium tw-text-slate-400">{weekRange}</span>
          </div>
          <div className="tw-flex tw-items-baseline tw-justify-between tw-gap-2">
            <span className="tw-text-sm tw-font-semibold" style={{ color: percentColor(totalPct) }}>
              {fmtMinutes(totalMin)}
              {limitMin != null ? <span className="tw-ml-1 tw-text-xs tw-font-normal tw-text-slate-400">/ {fmtMinutes(limitMin)}</span> : null}
            </span>
            <span className="tw-whitespace-nowrap tw-text-[11px] tw-font-medium tw-text-slate-500">
              연장 {fmtMinutes(overtimeMin)}
              {overtimeLimitMin != null ? ` / ${fmtMinutes(overtimeLimitMin)}` : ''}
            </span>
          </div>
          <Progress
            percent={totalPct}
            showInfo={false}
            size="small"
            strokeColor={percentColor(totalPct)}
            trailColor="#e2e8f0"
            className="!tw-mt-1"
          />
          {summaryQ.isError ? (
            <Typography.Text type="danger" className="tw-mt-1 tw-block tw-text-[11px]">
              주간 모니터링 정보를 불러오지 못했습니다.
            </Typography.Text>
          ) : null}
        </div>
        <div className="tw-grid tw-grid-cols-2 tw-gap-2">
          <Button
            type="primary"
            icon={<LoginOutlined />}
            className="!tw-h-10 !tw-rounded-xl !tw-font-semibold"
            loading={clockInM.isPending}
            disabled={hasClockedIn || clockOutM.isPending}
            onClick={() => clockInM.mutate()}
          >
            {TXT.checkInAction}
          </Button>
          <Button
            icon={<LogoutOutlined />}
            className="!tw-h-10 !tw-rounded-xl !tw-font-semibold"
            loading={clockOutM.isPending}
            disabled={!hasClockedIn || hasClockedOut || clockInM.isPending}
            onClick={() => clockOutM.mutate()}
          >
            {TXT.checkOutAction}
          </Button>
        </div>
      </div>
    </Spin>,
  );
}

export function DashboardLeaveBlock() {
  // \uD68C\uC0AC \uD734\uAC00 \uC794\uC5EC (\uBCF8\uC778 \uBAA8\uB4E0 balance, ANNUAL \uB9CC \uD45C\uC2DC)
  const balancesQ = useQuery({
    queryKey: ['dashboard', 'leave', 'my-balance'],
    queryFn: () => attendanceApi.memberBalance.listMine(),
    staleTime: 60_000,
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const annual = (balancesQ.data ?? []).filter((b) => b.balanceType === 'ANNUAL');
  const totalGranted = annual.reduce((s, b) => s + (b.totalGranted ?? 0), 0);
  const totalUsed = annual.reduce((s, b) => s + (b.totalUsed ?? 0), 0);
  const remaining = annual.reduce((s, b) => s + (b.remaining ?? 0), 0);
  const usedPct = totalGranted > 0 ? Math.round((totalUsed / totalGranted) * 1000) / 10 : 0;
  const fmtDays = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}\uC77C`;

  return cardShell(
    DASHBOARD_WIDGET_LABELS.leave,
    <button
      type="button"
      onClick={() => setHistoryOpen(true)}
      className="tw-cursor-pointer tw-border-0 tw-bg-transparent tw-p-0 tw-text-xs tw-font-medium tw-text-blue-600 hover:tw-underline"
    >
      {TXT.leaveManage}
    </button>,
    <div className="tw-space-y-4">
      <div className="tw-grid tw-grid-cols-3 tw-gap-2 tw-text-center">
        {[
          { label: TXT.remain, value: fmtDays(remaining), icon: <CheckCircleOutlined className="tw-text-blue-600" /> },
          { label: TXT.used, value: fmtDays(totalUsed), icon: <CalendarOutlined className="tw-text-blue-500" /> },
          { label: TXT.yearly, value: fmtDays(totalGranted), icon: <UserOutlined className="tw-text-slate-500" /> },
        ].map((x) => (
          <div key={x.label} className="tw-rounded-2xl tw-bg-slate-50 tw-px-2 tw-py-3 tw-ring-1 tw-ring-slate-100">
            <div className="tw-mb-2 tw-flex tw-justify-center">
              <span className="tw-flex tw-size-9 tw-items-center tw-justify-center tw-rounded-full tw-bg-white tw-shadow-sm tw-shadow-slate-900/5">
                {x.icon}
              </span>
            </div>
            <div className="tw-text-xl tw-font-bold tw-tabular-nums tw-text-slate-950">{x.value}</div>
            <div className="tw-text-[11px] tw-font-medium tw-text-slate-500">{x.label}</div>
          </div>
        ))}
      </div>
      <div>
        <div className="tw-mb-1 tw-flex tw-justify-between tw-text-xs">
          <span className="tw-text-slate-600">{TXT.usedRate}</span>
          <span className="tw-font-medium tw-text-slate-900">{usedPct}%</span>
        </div>
        <Progress percent={usedPct} showInfo={false} strokeColor="#2563EB" trailColor="#e2e8f0" size="small" />
      </div>
      <MyLeaveHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} />
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
      await navigate(buildContractNotificationNavigate(resolveContractNotificationTargetId(item)));
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
    if (isMeetingNotification(item.notificationType, item.targetType)) {
      if (item.targetId) {
        await navigate({ to: '/app/meetings/$meetingId', params: { meetingId: item.targetId } });
      } else {
        await navigate({ to: '/app/meetings' });
      }
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

export function renderDashboardWidget(id: DashboardWidgetId, user: Me | null): ReactNode {
  switch (id) {
    case 'profile':
      return <DashboardProfileBlock key={id} user={user} />;
    case 'performanceGoals':
      return <DashboardPerformanceGoalsBlock key={id} />;
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
    default:
      return null;
  }
}
