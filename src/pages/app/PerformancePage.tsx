import {
  AppstoreOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  FilterOutlined,
  PlusOutlined,
  TableOutlined,
  TeamOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Popover,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CreateGoalPayload,
  CreateKpiTemplatePayload,
  Goal,
  KpiCycle,
  MeasureType,
  OwnerType,
  PerformanceInputType,
  PerformanceRecord,
  UnitType,
  Visibility,
} from '@/features/goals/model/types';
import { PERFORMANCE_PAGE_KO } from '@/app/locale/app-ko';
import { AppButton } from '@/shared/ui/AppButton';
import { AppModal } from '@/shared/ui/AppModal';
import { AppSearchField } from '@/shared/ui/AppSearchField';
import { goalApi } from '@/features/goals/api/goalApi';
import { defaultGoalListFilters, filterGoals, type GoalListFilters } from '@/features/goals/lib/filterGoals';
import { sortGoals, type GoalListSortKey } from '@/features/goals/lib/sortGoals';
import { computeGoalProgressPercent } from '@/features/goals/ui/goalProgressDisplay';
import { GoalsKanbanBoard } from '@/features/goals/ui/GoalsKanbanBoard';
import { GoalsListCards } from '@/features/goals/ui/GoalsListCards';
import { KpiTemplateCards } from '@/features/goals/ui/KpiTemplateCards';
import { PERM } from '@/features/permissions/backend-permissions';
import { PermissionGuard } from '@/features/permissions/permission-guard';
import { useAuth } from '@/features/auth/useAuth';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
const { RangePicker } = DatePicker;
const { Text, Paragraph } = Typography;

const MEASURE_OPTIONS: { value: MeasureType; label: string; description: string }[] = [
  { value: 'HIGHER_BETTER', label: '높을수록 유리', description: '달성률·매출 등' },
  { value: 'LOWER_BETTER', label: '낮을수록 유리', description: '불량률·비용 등' },
  { value: 'TARGET_MATCH', label: '목표치 일치', description: '목표값에 가깝게 맞출 때' },
];

const UNIT_OPTIONS: { value: UnitType; label: string }[] = [
  { value: 'NUMBER', label: '일반 수치' },
  { value: 'AMOUNT', label: '금액' },
  { value: 'PERCENTAGE', label: '백분율(%)' },
  { value: 'RATIO', label: '비율' },
  { value: 'CUSTOM', label: '사용자 정의' },
];

const CYCLE_OPTIONS: { value: KpiCycle; label: string }[] = [
  { value: 'MONTHLY', label: '월간' },
  { value: 'QUARTERLY', label: '분기' },
  { value: 'HALF_YEARLY', label: '반기' },
  { value: 'YEARLY', label: '연간' },
];

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'PUBLIC', label: '전사 공개' },
  { value: 'TEAM_ONLY', label: '팀 내' },
  { value: 'PRIVATE', label: '비공개(본인)' },
];

/** goal-service `InputType` — 실적 입력 형식 */
const PERFORMANCE_INPUT_OPTIONS: { value: PerformanceInputType; label: string }[] = [
  { value: 'NUMBER', label: '숫자' },
  { value: 'TEXT', label: '텍스트' },
  { value: 'FILE', label: '파일 첨부' },
];

const OWNER_OPTIONS: { value: OwnerType; label: string }[] = [
  { value: 'MEMBER', label: '구성원 (개인 목표)' },
  { value: 'ORGANIZATION', label: '조직' },
];

const GOAL_STATUS_FILTER_OPTIONS = [
  { value: 'DRAFT', label: '진행 전(초안)' },
  { value: 'ACTIVE', label: '진행 중' },
  { value: 'COMPLETED', label: '완료' },
  { value: 'CANCELLED', label: '취소' },
];

const GOAL_SORT_OPTIONS: { value: GoalListSortKey; label: string }[] = [
  { value: 'endDate-asc', label: PERFORMANCE_PAGE_KO.goalSortEndDateAsc },
  { value: 'endDate-desc', label: PERFORMANCE_PAGE_KO.goalSortEndDateDesc },
  { value: 'progress-asc', label: PERFORMANCE_PAGE_KO.goalSortProgressAsc },
  { value: 'progress-desc', label: PERFORMANCE_PAGE_KO.goalSortProgressDesc },
];

function visibilityTag(v: Visibility) {
  const map: Record<Visibility, { color: string; label: string }> = {
    PUBLIC: { color: 'blue', label: '전사' },
    TEAM_ONLY: { color: 'geekblue', label: '팀' },
    PRIVATE: { color: 'default', label: '비공개' },
  };
  const m = map[v] ?? { color: 'default', label: v };
  return <Tag color={m.color}>{m.label}</Tag>;
}

function statusTag(status?: string) {
  const s = (status ?? 'DRAFT').toUpperCase();
  if (s === 'DRAFT') return <Tag color="gold">진행 전</Tag>;
  if (s === 'ACTIVE') return <Tag color="green">진행 중</Tag>;
  if (s === 'COMPLETED') return <Tag color="blue">완료</Tag>;
  if (s === 'CANCELLED') return <Tag color="default">취소</Tag>;
  if (s === 'ARCHIVED') return <Tag color="default">보관(레거시)</Tag>;
  return <Tag>{status ?? '—'}</Tag>;
}

function goalDetailProgressUi(goal: Goal) {
  const raw = computeGoalProgressPercent(goal);
  const rounded = raw != null ? Math.round(raw) : null;
  const barPct = rounded != null ? Math.min(100, rounded) : 0;
  const label = rounded != null ? `${rounded}%` : '—';
  let stroke = '#e2e8f0';
  if (rounded != null) {
    if (rounded > 100) stroke = '#22c55e';
    else if (rounded > 0) stroke = '#3b82f6';
  }
  return { label, barPct, stroke };
}

function narrativeDefaultGoalFilters(): GoalListFilters {
  return { ...defaultGoalListFilters(), owner: 'mine' };
}

function goalStatusNorm(s?: string) {
  return (s ?? '').toUpperCase();
}

export function PerformancePage() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const companyId = user?.companyId?.trim();
  const memberId = user?.id ?? '';

  const canCreate = hasPermission(PERM.GOAL_CREATE);
  const canUpdate = hasPermission(PERM.GOAL_UPDATE);

  const [tab, setTab] = useState<'goals' | 'templates'>('goals');
  const [templateSearch, setTemplateSearch] = useState('');
  const [goalsView, setGoalsView] = useState<'table' | 'board'>('table');
  const [goalListSort, setGoalListSort] = useState<GoalListSortKey>('endDate-asc');
  const [goalFilters, setGoalFilters] = useState<GoalListFilters>(() => narrativeDefaultGoalFilters());
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [performanceModal, setPerformanceModal] = useState<{ goal: Goal } | null>(null);
  const [reviewModal, setReviewModal] = useState<{ goal: Goal; record: PerformanceRecord } | null>(null);
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);

  const [tplForm] = Form.useForm<CreateKpiTemplatePayload>();
  const [goalForm] = Form.useForm<
    Omit<CreateGoalPayload, 'startDate' | 'endDate'> & { range: [dayjs.Dayjs, dayjs.Dayjs] }
  >();
  const [perfForm] = Form.useForm<{
    inputType: PerformanceInputType;
    actualValue: number;
    description?: string;
    selfScore: number;
  }>();
  const [reviewForm] = Form.useForm<{ confirmed: boolean; convertedScore: number; rejectReason?: string }>();

  const goalsQuery = useQuery({
    queryKey: ['goals', 'list', companyId],
    queryFn: () => goalApi.listGoals(),
    enabled: Boolean(companyId),
  });

  const templatesQuery = useQuery({
    queryKey: ['goals', 'kpi-templates', companyId],
    queryFn: () => goalApi.listKpiTemplates(),
    enabled: Boolean(companyId),
  });

  const detailRecordsQuery = useQuery({
    queryKey: ['goals', detailGoal?.id ?? '__closed__', 'performance-records'],
    queryFn: () => goalApi.listPerformanceRecords(detailGoal!.id),
    enabled: Boolean(detailGoal?.id),
  });

  /** 목표 목록 refetch 후 상세 모달이 열려 있으면 집계 필드만 최신 행과 동기화 */
  useEffect(() => {
    const list = goalsQuery.data;
    if (!list) return;
    setDetailGoal((prev) => {
      if (!prev) return prev;
      const next = list.find((g) => g.id === prev.id);
      return next ? { ...prev, ...next } : prev;
    });
  }, [goalsQuery.data]);

  const invalidateGoals = () => {
    void queryClient.invalidateQueries({ queryKey: ['goals', 'list'] });
  };
  const invalidateTemplates = () => {
    void queryClient.invalidateQueries({ queryKey: ['goals', 'kpi-templates'] });
  };

  const createTplMutation = useMutation({
    mutationFn: (v: CreateKpiTemplatePayload) => goalApi.createKpiTemplate(v),
    onSuccess: () => {
      message.success('KPI 템플릿이 등록되었습니다.');
      setTemplateModalOpen(false);
      tplForm.resetFields();
      invalidateTemplates();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const createGoalMutation = useMutation({
    mutationFn: (v: CreateGoalPayload) => goalApi.createGoal(v),
    onSuccess: () => {
      message.success('목표가 생성되었습니다.');
      setGoalModalOpen(false);
      goalForm.resetFields();
      invalidateGoals();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const activateMutation = useMutation({
    mutationFn: (goalId: string) => goalApi.activateGoal(goalId),
    onSuccess: () => {
      message.success('진행이 시작되었습니다. 이제 실적을 제출할 수 있어요.');
      invalidateGoals();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const perfMutation = useMutation({
    mutationFn: ({ goalId, body }: { goalId: string; body: Parameters<typeof goalApi.submitPerformance>[1] }) =>
      goalApi.submitPerformance(goalId, body),
    onSuccess: (_data, variables) => {
      message.success('실적이 입력되었습니다.');
      setPerformanceModal(null);
      perfForm.resetFields();
      invalidateGoals();
      void queryClient.invalidateQueries({ queryKey: ['goals', variables.goalId, 'performance-records'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      goalId,
      recordId,
      body,
    }: {
      goalId: string;
      recordId: string;
      body: Parameters<typeof goalApi.reviewPerformance>[2];
    }) => goalApi.reviewPerformance(goalId, recordId, body),
    onSuccess: (_data, variables) => {
      message.success('검토 결과가 반영되었습니다.');
      setReviewModal(null);
      reviewForm.resetFields();
      invalidateGoals();
      void queryClient.invalidateQueries({ queryKey: ['goals', variables.goalId, 'performance-records'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const templates = templatesQuery.data ?? [];
  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => (t.name ?? '').toLowerCase().includes(q));
  }, [templates, templateSearch]);
  const goalsList = goalsQuery.data ?? [];

  const stats = useMemo(() => {
    const scoped =
      goalFilters.owner === 'mine'
        ? goalsList.filter((g) => g.ownerType === 'MEMBER' && g.ownerId === memberId)
        : goalsList;
    const st = (s?: string) => (s ?? '').toUpperCase();
    const active = scoped.filter((g) => st(g.status) === 'ACTIVE').length;
    const draft = scoped.filter((g) => st(g.status) === 'DRAFT').length;
    const completed = scoped.filter((g) => st(g.status) === 'COMPLETED').length;
    const today = dayjs().startOf('day');
    const delayed = scoped.filter((g) => {
      if (st(g.status) !== 'ACTIVE') return false;
      return today.isAfter(dayjs(g.endDate), 'day');
    }).length;
    return { total: scoped.length, active, draft, completed, delayed };
  }, [goalsList, goalFilters.owner, memberId]);

  const progressAvg = useMemo(() => {
    const scoped =
      goalFilters.owner === 'mine'
        ? goalsList.filter((g) => g.ownerType === 'MEMBER' && g.ownerId === memberId)
        : goalsList;
    const active = scoped.filter((g) => goalStatusNorm(g.status) === 'ACTIVE');
    const pcts = active
      .map((g) => g.achievementPct)
      .filter((v) => v != null && !Number.isNaN(Number(v)))
      .map((v) => Number(v));
    if (pcts.length === 0) return null;
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  }, [goalsList, goalFilters.owner, memberId]);

  const filteredGoals = useMemo(
    () => filterGoals(goalsQuery.data ?? [], goalFilters, memberId),
    [goalsQuery.data, goalFilters, memberId],
  );
  const sortedFilteredGoals = useMemo(
    () => sortGoals(filteredGoals, goalListSort),
    [filteredGoals, goalListSort],
  );

  const openPerfForGoal = useCallback(
    (row: Goal) => {
      perfForm.setFieldsValue({
        inputType: 'NUMBER',
        actualValue: row.actualValue ?? 0,
        selfScore: 80,
        description: '',
      });
      setPerformanceModal({ goal: row });
    },
    [perfForm],
  );

  const openCreateGoal = useCallback(() => {
    if (!companyId) {
      message.warning('회사 ID를 확인할 수 없어 목표를 생성할 수 없습니다.');
      return;
    }
    void templatesQuery.refetch();
    goalForm.setFieldsValue({
      kpiTemplateId: undefined,
      ownerType: 'MEMBER',
      ownerId: memberId,
      measureType: 'HIGHER_BETTER',
      unitType: 'NUMBER',
      visibility: 'PUBLIC',
      weightPct: 10,
      capPct: 120,
      baseline: 0,
      range: [dayjs().startOf('month'), dayjs().endOf('month')],
    });
    setGoalModalOpen(true);
  }, [companyId, goalForm, memberId, templatesQuery]);

  const loadingGoals = goalsQuery.isPending || goalsQuery.isFetching;
  const loadingTpl = templatesQuery.isPending || templatesQuery.isFetching;
  const activatingGoalId =
    activateMutation.isPending && typeof activateMutation.variables === 'string'
      ? activateMutation.variables
      : null;

  const summaryRemainPct =
    progressAvg != null
      ? Math.max(0, Math.min(100, 100 - Math.round(progressAvg)))
      : null;

  const heroPrimary = !companyId
    ? ({ kind: 'none' } as const)
    : summaryRemainPct != null && stats.active > 0
      ? ({ kind: 'remain', pct: summaryRemainPct } as const)
      : stats.active > 0
        ? ({ kind: 'activeNoScore' } as const)
        : stats.draft > 0 && stats.active === 0
          ? ({ kind: 'draft' } as const)
          : stats.total === 0
            ? ({ kind: 'empty' } as const)
            : ({ kind: 'idle' } as const);

  const heroPrimaryClass =
    '!tw-mb-0 !tw-max-w-2xl !tw-text-[15px] !tw-font-normal !tw-leading-relaxed !tw-text-slate-600';

  /** 목표 탭 — 리스트/보드 (레퍼런스: 연한 트랙 + 선택만 흰 카드) */
  const goalsViewSegmentedClass =
    'tw-w-full tw-shrink-0 sm:tw-w-auto [&_.ant-segmented-group]:!tw-rounded-[10px] [&_.ant-segmented]:!tw-min-h-10 [&_.ant-segmented]:!tw-rounded-[10px] [&_.ant-segmented]:!tw-border-0 [&_.ant-segmented]:!bg-slate-100/95 [&_.ant-segmented]:!p-1 [&_.ant-segmented-item]:!tw-rounded-lg [&_.ant-segmented-item]:!tw-min-h-8 [&_.ant-segmented-item]:!tw-items-center [&_.ant-segmented-item-label]:tw-text-[13px] [&_.ant-segmented-item-selected]:!tw-font-semibold [&_.ant-segmented-item-selected]:!tw-text-[#1e3a5f] [&_.ant-segmented-item-selected_.ant-segmented-item-label]:!tw-text-[#1e3a5f] [&_.ant-segmented-thumb]:!tw-rounded-lg [&_.ant-segmented-thumb]:!tw-bg-white [&_.ant-segmented-thumb]:!tw-shadow-sm';

  return (
    <div className="tw-mx-auto tw-w-full tw-max-w-[1200px] tw-space-y-5">
      {!companyId ? (
        <Alert
          type="warning"
          showIcon
          message="회사 ID(companyId)를 토큰에서 읽을 수 없습니다."
          description="로그인 JWT에 companyId(또는 tenantId 등) 클레임이 있어야 Goal API가 동작합니다. 백엔드·게이트웨이 설정을 확인해 주세요."
        />
      ) : null}

      {companyId ? (
        <section
          className="tw-rounded-2xl tw-border tw-border-slate-200/80"
          aria-label={PERFORMANCE_PAGE_KO.heroTitle}
        >
          <Typography.Title
            level={3}
            className="!tw-m-0 !tw-mb-3 !tw-text-[24px] !tw-font-bold !tw-leading-tight !tw-tracking-tight !tw-text-[#1e3a5f] sm:!tw-text-[26px]"
          >
            {PERFORMANCE_PAGE_KO.heroTitle}
          </Typography.Title>

          {heroPrimary.kind === 'remain' ? (
            <Paragraph className={heroPrimaryClass}>
              {PERFORMANCE_PAGE_KO.heroRemainBefore}
              <span className="tw-font-semibold tw-tabular-nums tw-text-[#2563eb]">{heroPrimary.pct}%</span>
              {PERFORMANCE_PAGE_KO.heroRemainAfter}
            </Paragraph>
          ) : heroPrimary.kind === 'activeNoScore' ? (
            <Paragraph className={heroPrimaryClass}>{PERFORMANCE_PAGE_KO.heroActiveNoScore}</Paragraph>
          ) : heroPrimary.kind === 'draft' ? (
            <Paragraph className={heroPrimaryClass}>{PERFORMANCE_PAGE_KO.heroDraftOnly}</Paragraph>
          ) : heroPrimary.kind === 'empty' ? (
            <Paragraph className={heroPrimaryClass}>{PERFORMANCE_PAGE_KO.heroEmpty}</Paragraph>
          ) : heroPrimary.kind === 'idle' ? (
            <Paragraph className={heroPrimaryClass}>{PERFORMANCE_PAGE_KO.heroIdle}</Paragraph>
          ) : null}

          <Paragraph className="!tw-mb-0 !tw-mt-2 !tw-max-w-2xl !tw-text-xs !tw-leading-normal !tw-text-slate-500">
            {canCreate ? PERFORMANCE_PAGE_KO.pageLeadWithCreate : PERFORMANCE_PAGE_KO.pageLeadMember}
          </Paragraph>

          <div className="tw-mt-6 tw-border-t tw-border-slate-100 tw-pt-6">
            <div className="tw-grid tw-grid-cols-2 tw-gap-3 sm:tw-grid-cols-4 sm:tw-gap-4">
              {(
                [
                  {
                    k: 't',
                    label: PERFORMANCE_PAGE_KO.statAll,
                    value: stats.total,
                    icon: <BarChartOutlined className="tw-text-[15px] tw-text-slate-400" />,
                  },
                  {
                    k: 'a',
                    label: PERFORMANCE_PAGE_KO.statActive,
                    value: stats.active,
                    icon: <TeamOutlined className="tw-text-[15px] tw-text-slate-400" />,
                  },
                  {
                    k: 'c',
                    label: PERFORMANCE_PAGE_KO.statCompleted,
                    value: stats.completed,
                    icon: <CheckCircleOutlined className="tw-text-[15px] tw-text-slate-400" />,
                  },
                  {
                    k: 'y',
                    label: PERFORMANCE_PAGE_KO.statDelayed,
                    value: stats.delayed,
                    icon: <WarningOutlined className="tw-text-[15px] tw-text-amber-600/80" />,
                  },
                ] as const
              ).map((m) => (
                <div
                  key={m.k}
                  className="tw-min-w-0 tw-rounded-2xl tw-border tw-border-white/80 tw-bg-white tw-px-4 tw-py-4 tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                >
                  <div className="tw-mb-1 tw-flex tw-items-center tw-gap-1.5 tw-text-xs tw-font-medium tw-text-slate-500">
                    {m.icon}
                    <span>{m.label}</span>
                  </div>
                  <div className="tw-text-xl tw-font-semibold tw-tabular-nums tw-text-[#1e3a5f]">{m.value}</div>
                </div>
              ))}
            </div>

            {progressAvg != null ? (
              <div className="tw-mt-5 tw-flex tw-items-center tw-gap-3">
                <Text className="tw-shrink-0 tw-text-xs tw-text-slate-500">{PERFORMANCE_PAGE_KO.avgAchievement}</Text>
                <div className="tw-h-2 tw-min-w-0 tw-flex-1 tw-rounded-full tw-bg-slate-200/80">
                  <div
                    className="tw-h-full tw-rounded-full tw-transition-[width] tw-bg-[#3b82f6]"
                    style={{ width: `${Math.min(100, progressAvg)}%` }}
                  />
                </div>
                <Text className="tw-tabular-nums tw-text-sm tw-font-semibold tw-text-[#1e3a5f]">{progressAvg}%</Text>
              </div>
            ) : null}

            <div className="tw-mt-4 tw-rounded-lg tw-bg-slate-50/90 tw-px-3 tw-py-2">
              <Text className="tw-text-[11px] tw-leading-normal tw-text-slate-500">
                {PERFORMANCE_PAGE_KO.statScopeNote}
              </Text>
            </div>
          </div>
        </section>
      ) : null}

      <Card className="tw-overflow-hidden tw-rounded-2xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)] [&_.ant-card-body]:tw-px-5 [&_.ant-card-body]:tw-pb-6 [&_.ant-card-body]:tw-pt-5 sm:[&_.ant-card-body]:tw-px-7 [&_.ant-tabs-nav]:tw-mb-2 [&_.ant-tabs-nav]:tw-px-0 [&_.ant-tabs-tab]:!tw-pb-3 [&_.ant-tabs-tab]:!tw-pt-1 [&_.ant-tabs-tab]:!tw-text-slate-600 [&_.ant-tabs-tab.ant-tabs-tab-active_.ant-tabs-tab-btn]:!tw-text-[#1e3a5f] [&_.ant-tabs-tab.ant-tabs-tab-active_.ant-tabs-tab-btn]:!tw-font-semibold [&_.ant-tabs-ink-bar]:!tw-bg-[#3b82f6]">
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as 'goals' | 'templates')}
          items={[
            {
              key: 'goals',
              label: PERFORMANCE_PAGE_KO.tabGoals,
              children: (
                <Space direction="vertical" className="tw-w-full" size={16}>
                  <div className="tw-flex tw-flex-col tw-gap-3 lg:tw-flex-row lg:tw-items-stretch lg:tw-gap-3">
                    <AppSearchField
                      className="lg:tw-flex-1"
                      placeholder={PERFORMANCE_PAGE_KO.searchPlaceholder}
                      value={goalFilters.search}
                      onChange={(e) => setGoalFilters((f) => ({ ...f, search: e.target.value }))}
                    />
                    <div className="tw-flex tw-min-h-10 tw-shrink-0 tw-flex-col tw-gap-2 sm:tw-flex-row sm:tw-flex-wrap sm:tw-items-center sm:tw-justify-end">
                      <Segmented
                        className={goalsViewSegmentedClass}
                        value={goalsView}
                        onChange={(v) => setGoalsView(v as 'table' | 'board')}
                        options={[
                          {
                            value: 'table',
                            label: (
                              <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-slate-600">
                                <TableOutlined className="tw-text-[15px]" />
                                {PERFORMANCE_PAGE_KO.viewList}
                              </span>
                            ),
                          },
                          {
                            value: 'board',
                            label: (
                              <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-slate-600">
                                <AppstoreOutlined className="tw-text-[15px]" />
                                {PERFORMANCE_PAGE_KO.viewBoard}
                              </span>
                            ),
                          },
                        ]}
                      />
                      <Select
                        value={goalListSort}
                        onChange={(v) => setGoalListSort(v as GoalListSortKey)}
                        options={GOAL_SORT_OPTIONS}
                        className="tw-min-w-0 tw-w-full !tw-text-sm sm:tw-min-w-[176px] sm:tw-w-auto [&_.ant-select-selector]:!tw-min-h-10 [&_.ant-select-selector]:!tw-rounded-xl [&_.ant-select-selector]:!tw-border-slate-200 [&_.ant-select-selector]:!tw-text-slate-800"
                        popupMatchSelectWidth={false}
                      />
                      <Popover
                        placement="bottomLeft"
                        trigger="click"
                        content={
                          <Space direction="vertical" className="tw-w-[min(100vw-48px,360px)]" size={12}>
                            <div>
                              <Text className="tw-mb-1.5 tw-block tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wider tw-text-slate-500">
                                {PERFORMANCE_PAGE_KO.toolbarScopeLabel}
                              </Text>
                              <Segmented
                                block
                                size="middle"
                                value={goalFilters.owner}
                                onChange={(v) =>
                                  setGoalFilters((f) => ({ ...f, owner: (v as 'all' | 'mine') ?? 'mine' }))
                                }
                                options={[
                                  { label: PERFORMANCE_PAGE_KO.scopeMine, value: 'mine' },
                                  { label: PERFORMANCE_PAGE_KO.scopeAll, value: 'all' },
                                ]}
                              />
                            </div>
                            <Space wrap size={[8, 8]} className="tw-w-full">
                              <Select
                                mode="multiple"
                                allowClear
                                placeholder="상태"
                                className="tw-min-w-[160px] tw-max-w-full"
                                value={goalFilters.statuses}
                                onChange={(statuses) =>
                                  setGoalFilters((f) => ({ ...f, statuses: statuses ?? [] }))
                                }
                                options={GOAL_STATUS_FILTER_OPTIONS}
                              />
                              <Select
                                mode="multiple"
                                allowClear
                                placeholder="공개 범위"
                                className="tw-min-w-[160px] tw-max-w-full"
                                value={goalFilters.visibility === 'all' ? undefined : goalFilters.visibility}
                                onChange={(v) =>
                                  setGoalFilters((f) => ({
                                    ...f,
                                    visibility: Array.isArray(v) && v.length > 0 ? (v as Visibility[]) : 'all',
                                  }))
                                }
                                options={VISIBILITY_OPTIONS}
                              />
                              <RangePicker
                                value={goalFilters.period ?? null}
                                onChange={(rng) =>
                                  setGoalFilters((f) => ({
                                    ...f,
                                    period: rng?.[0] && rng[1] ? [rng[0], rng[1]] : null,
                                  }))
                                }
                              />
                              <Button onClick={() => setGoalFilters(narrativeDefaultGoalFilters())}>
                                필터 초기화
                              </Button>
                            </Space>
                            <Paragraph type="secondary" className="!tw-mb-0 !tw-text-xs">
                              {PERFORMANCE_PAGE_KO.filterHint}
                            </Paragraph>
                          </Space>
                        }
                      >
                        <Button
                          icon={<FilterOutlined />}
                          className="!tw-h-10 !tw-w-full !tw-rounded-xl !tw-border-slate-200 !tw-bg-white !tw-text-slate-700 hover:!tw-border-slate-300 hover:!tw-bg-slate-50 sm:!tw-w-auto"
                        >
                          {PERFORMANCE_PAGE_KO.filterButton}
                        </Button>
                      </Popover>
                      <PermissionGuard required={PERM.GOAL_CREATE} fallback={null}>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={openCreateGoal}
                          className="!tw-h-10 !tw-w-full !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-font-semibold hover:!tw-bg-[#152a45] sm:!tw-w-auto"
                        >
                          {PERFORMANCE_PAGE_KO.ctaAddGoal}
                        </Button>
                      </PermissionGuard>
                    </div>
                  </div>

                  {goalsView === 'table' ? (
                    <GoalsListCards
                      goals={sortedFilteredGoals}
                      loading={loadingGoals}
                      memberId={memberId}
                      canCreate={canCreate}
                      emptyTitle={PERFORMANCE_PAGE_KO.emptyGoalsTitle}
                      emptyHint={PERFORMANCE_PAGE_KO.emptyGoalsHint}
                      onOpenDetail={setDetailGoal}
                      onOpenPerf={openPerfForGoal}
                      onActivate={(id) => activateMutation.mutate(id)}
                      activatingGoalId={activatingGoalId}
                    />
                  ) : (
                    <GoalsKanbanBoard
                      goals={sortedFilteredGoals}
                      goalListSort={goalListSort}
                      loading={loadingGoals}
                      companyId={companyId}
                      memberId={memberId}
                      canActivate={canCreate}
                      onOpenDetail={setDetailGoal}
                      onOpenPerf={openPerfForGoal}
                      activateGoal={(id) => activateMutation.mutateAsync(id)}
                      activatingGoalId={activatingGoalId}
                      emptyTitle={PERFORMANCE_PAGE_KO.emptyGoalsTitle}
                      emptyHint={PERFORMANCE_PAGE_KO.emptyGoalsHint}
                    />
                  )}
                </Space>
              ),
            },
            {
              key: 'templates',
              label: PERFORMANCE_PAGE_KO.tabTemplates,
              children: (
                <Space direction="vertical" className="tw-w-full" size={16}>
                  <div className="tw-flex tw-flex-col tw-gap-3 lg:tw-flex-row lg:tw-items-stretch lg:tw-gap-3">
                    <AppSearchField
                      className="lg:tw-flex-1"
                      placeholder={PERFORMANCE_PAGE_KO.searchTemplatesPlaceholder}
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                    />
                    <div className="tw-flex tw-min-h-10 tw-shrink-0 tw-justify-end">
                      <PermissionGuard required={PERM.GOAL_CREATE} fallback={null}>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => setTemplateModalOpen(true)}
                          className="!tw-h-10 !tw-w-full !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-font-semibold hover:!tw-bg-[#152a45] sm:!tw-w-auto"
                        >
                          {PERFORMANCE_PAGE_KO.ctaAddTemplate}
                        </Button>
                      </PermissionGuard>
                    </div>
                  </div>
                  <Paragraph className="!tw-mb-0 !tw-text-sm !tw-leading-relaxed !tw-text-slate-600">
                    {PERFORMANCE_PAGE_KO.tabTemplatesIntro}
                  </Paragraph>
                  <KpiTemplateCards
                    templates={filteredTemplates}
                    loading={loadingTpl}
                    emptyMessage={
                      templates.length > 0 && filteredTemplates.length === 0
                        ? PERFORMANCE_PAGE_KO.emptyTemplatesSearch
                        : PERFORMANCE_PAGE_KO.emptyTemplates
                    }
                  />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <AppModal
        title="KPI 템플릿 등록"
        open={templateModalOpen}
        onCancel={() => setTemplateModalOpen(false)}
        footer={null}
        destroyOnClose
        width={480}
      >
        <Form<CreateKpiTemplatePayload>
          form={tplForm}
          layout="vertical"
          onFinish={(v) => {
            if (!companyId) return;
            createTplMutation.mutate({ ...v, companyId });
          }}
          initialValues={{ measureType: 'HIGHER_BETTER', unitType: 'PERCENTAGE', cycle: 'QUARTERLY', capPct: 120 }}
        >
          <Form.Item name="name" label="템플릿 이름" rules={[{ required: true }]}>
            <Input placeholder="예: 매출 달성률" />
          </Form.Item>
          <Form.Item
            name="measureType"
            label="지표 방향"
            tooltip="달성 수치가 커야 좋은지, 작아야 좋은지, 목표에 맞추면 좋은지 선택합니다."
            rules={[{ required: true }]}
          >
            <Select
              options={MEASURE_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${o.description})` }))}
            />
          </Form.Item>
          <Form.Item name="unitType" label="단위" rules={[{ required: true }]}>
            <Select options={UNIT_OPTIONS} />
          </Form.Item>
          <Form.Item name="cycle" label="주기" rules={[{ required: true }]}>
            <Select options={CYCLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="capPct" label="최대 인정 상한(%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={200} className="tw-w-full" />
          </Form.Item>
          <AppButton type="primary" htmlType="submit" className="tw-w-full" loading={createTplMutation.isPending}>
            저장
          </AppButton>
        </Form>
      </AppModal>

      <AppModal
        title="새 목표"
        open={goalModalOpen}
        onCancel={() => setGoalModalOpen(false)}
        footer={null}
        destroyOnClose
        width={560}
        styles={{ body: { overflowX: 'hidden' } }}
      >
        <Form
          form={goalForm}
          layout="vertical"
          onFinish={(values) => {
            if (!companyId) return;
            const [start, end] = values.range;
            if (!end.isAfter(start, 'day')) {
              message.error('종료일은 시작일보다 이후여야 합니다.');
              return;
            }
            const baseline = Number(values.baseline);
            const targetValue = Number(values.targetValue);
            if (targetValue === baseline) {
              message.error('목표값은 기준값과 달라야 합니다.');
              return;
            }
            const payload: CreateGoalPayload = {
              kpiTemplateId: values.kpiTemplateId,
              companyId,
              ownerType: values.ownerType,
              ownerId: values.ownerId?.trim() || memberId,
              title: values.title.trim(),
              description: values.description.trim(),
              startDate: start.format('YYYY-MM-DD'),
              endDate: end.format('YYYY-MM-DD'),
              measureType: values.measureType,
              unitType: values.unitType,
              baseline,
              targetValue,
              capPct: Math.trunc(Number(values.capPct)),
              visibility: values.visibility,
              weightPct: values.weightPct,
            };
            createGoalMutation.mutate(payload);
          }}
        >
          <Form.Item name="kpiTemplateId" label="KPI 템플릿" rules={[{ required: true, message: '템플릿을 선택하세요.' }]}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              loading={templatesQuery.isFetching}
              placeholder={
                templates.length === 0 && !templatesQuery.isFetching
                  ? 'KPI 템플릿 탭에서 먼저 등록해 주세요'
                  : '템플릿 선택'
              }
              getPopupContainer={(triggerNode) =>
                (triggerNode.closest('.ant-modal-content') as HTMLElement | null) ?? document.body
              }
              options={templates.map((t) => ({
                value: t.id,
                label: t.name?.trim() ? t.name : `템플릿 ${t.id.slice(0, 8)}…`,
              }))}
              onChange={(id) => {
                if (id == null) return;
                const t = templates.find((x) => String(x.id) === String(id));
                if (t) {
                  const cap =
                    t.capPct != null && t.capPct >= 1 ? Math.trunc(t.capPct) : 120;
                  goalForm.setFieldsValue({
                    measureType: t.measureType,
                    unitType: t.unitType as UnitType,
                    capPct: cap,
                  });
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label="목표 제목"
            rules={[{ required: true }, { max: 300, message: '최대 300자입니다.' }]}
          >
            <Input showCount maxLength={300} />
          </Form.Item>
          <Form.Item
            name="description"
            label="설명"
            rules={[
              { required: true, message: '설명을 입력해 주세요.' },
              { max: 300, message: '최대 300자입니다.' },
            ]}
          >
            <Input.TextArea rows={3} showCount maxLength={300} placeholder="백엔드 필수 항목입니다." />
          </Form.Item>
          <Form.Item name="range" label="기간" rules={[{ required: true, message: '기간을 선택하세요.' }]}>
            <RangePicker className="tw-w-full" format="YYYY-MM-DD" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ownerType" label="소유 유형" rules={[{ required: true }]}>
                <Select options={OWNER_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="ownerId"
                label="소유자 ID"
                tooltip="개인 목표는 보통 본인 member UUID입니다."
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="measureType"
                label="지표 방향"
                rules={[{ required: true }]}
              >
                <Select
                  options={MEASURE_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${o.description})` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unitType" label="단위" rules={[{ required: true }]}>
                <Select options={UNIT_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="baseline" label="기준값" rules={[{ required: true }]}>
                <InputNumber className="tw-w-full" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="targetValue"
                label="목표값"
                dependencies={['baseline']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const b = getFieldValue('baseline');
                      if (value != null && b != null && Number(value) === Number(b)) {
                        return Promise.reject(new Error('목표값은 기준값과 달라야 합니다.'));
                      }
                      return Promise.resolve();
                    },
                  }),
                ]}
              >
                <InputNumber className="tw-w-full" min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="capPct"
            label="달성률 상한(%)"
            tooltip="GoalCreateReqDto 필수. KPI 템플릿 capPct를 그대로 쓰는 것을 권장합니다."
            rules={[{ required: true, message: '상한(%)을 입력하세요.' }, { type: 'number', min: 1 }]}
          >
            <InputNumber className="tw-w-full" min={1} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="visibility" label="공개 범위" rules={[{ required: true }]}>
                <Select options={VISIBILITY_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="weightPct" label="가중치(%)" rules={[{ required: true }]}>
                <InputNumber className="tw-w-full" min={0} max={100} />
              </Form.Item>
            </Col>
          </Row>
          <AppButton type="primary" htmlType="submit" className="tw-w-full" loading={createGoalMutation.isPending}>
            목표 만들기
          </AppButton>
        </Form>
      </AppModal>

      <AppModal
        title="실적 입력"
        open={performanceModal !== null}
        onCancel={() => setPerformanceModal(null)}
        footer={null}
        destroyOnClose
      >
        {performanceModal ? (
          <Form
            form={perfForm}
            layout="vertical"
            initialValues={{ inputType: 'NUMBER' as PerformanceInputType }}
            onFinish={(v) =>
              perfMutation.mutate({
                goalId: performanceModal.goal.id,
                body: {
                  inputType: v.inputType,
                  actualValue: v.actualValue,
                  description: v.description,
                  selfScore: v.selfScore,
                },
              })
            }
          >
            <Paragraph type="secondary" className="!tw-text-sm">
              본인 소유 목표만 제출할 수 있습니다. 제출 후 매니저가 검토합니다.
            </Paragraph>
            <Form.Item name="inputType" label="입력 유형" rules={[{ required: true }]}>
              <Select options={PERFORMANCE_INPUT_OPTIONS} />
            </Form.Item>
            <Form.Item name="actualValue" label="달성 수치" rules={[{ required: true }]} className="[&_.ant-input-number]:tw-w-full">
              <InputNumber min={0} className="tw-w-full" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="selfScore" label="자기 평가 점수" rules={[{ required: true }]} className="[&_.ant-input-number]:tw-w-full">
              <InputNumber min={0} max={100} className="tw-w-full" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="description" label="코멘트">
              <Input.TextArea rows={3} placeholder="근거·성과 요약 등" />
            </Form.Item>
            <AppButton type="primary" htmlType="submit" className="tw-w-full" loading={perfMutation.isPending}>
              제출
            </AppButton>
          </Form>
        ) : null}
      </AppModal>

      <AppModal
        title="실적 검토"
        open={reviewModal !== null}
        onCancel={() => setReviewModal(null)}
        footer={null}
        destroyOnClose
      >
        {reviewModal ? (
          <Form
            form={reviewForm}
            layout="vertical"
            initialValues={{ confirmed: true, convertedScore: 80, rejectReason: '' }}
            onFinish={(v) =>
              reviewMutation.mutate({
                goalId: reviewModal.goal.id,
                recordId: reviewModal.record.id,
                body: {
                  confirmed: v.confirmed,
                  convertedScore: v.convertedScore,
                  rejectReason: v.confirmed ? undefined : v.rejectReason,
                },
              })
            }
          >
            <Descriptions size="small" column={1} bordered className="tw-mb-4">
              <Descriptions.Item label="달성">{reviewModal.record.actualValue}</Descriptions.Item>
              <Descriptions.Item label="자기평가">{reviewModal.record.selfScore ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="메모">{reviewModal.record.description ?? '—'}</Descriptions.Item>
            </Descriptions>
            <Form.Item name="confirmed" label="승인 여부" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: true, label: '승인' },
                  { value: false, label: '반려' },
                ]}
              />
            </Form.Item>
            <Form.Item name="convertedScore" label="환산 점수" rules={[{ required: true }]}>
              <InputNumber min={0} max={100} className="tw-w-full" />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(p, c) => p.confirmed !== c.confirmed}>
              {({ getFieldValue }) =>
                getFieldValue('confirmed') === false ? (
                  <Form.Item name="rejectReason" label="반려 사유" rules={[{ required: true, message: '사유를 입력하세요.' }]}>
                    <Input.TextArea rows={3} />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
            <AppButton type="primary" htmlType="submit" className="tw-w-full" loading={reviewMutation.isPending}>
              검토 저장
            </AppButton>
          </Form>
        ) : null}
      </AppModal>

      <AppModal
        title={
          detailGoal ? (
            <div className="tw-min-w-0 tw-pr-8">
              <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
                목표 상세
              </div>
              <div className="tw-mt-1.5 tw-text-xl tw-font-bold tw-leading-snug tw-text-[#1e3a5f] tw-break-words">
                {detailGoal.title}
              </div>
              <div className="tw-mt-3 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                {statusTag(detailGoal.status)}
                {visibilityTag(detailGoal.visibility)}
              </div>
            </div>
          ) : (
            '목표 상세'
          )
        }
        open={detailGoal !== null}
        onCancel={() => setDetailGoal(null)}
        footer={null}
        width={600}
        destroyOnClose
        classNames={{
          content: '!tw-overflow-hidden tw-rounded-2xl tw-p-0 tw-shadow-[0_8px_30px_rgba(15,23,42,0.12)]',
          header: '!tw-m-0 tw-border-b tw-border-slate-100 tw-px-6 tw-py-5',
          body: 'tw-px-6 tw-py-5',
        }}
      >
        {detailGoal ? (
          (() => {
            const prog = goalDetailProgressUi(detailGoal);
            return (
          <div className="tw-flex tw-flex-col tw-gap-5">
            <div className="tw-grid tw-grid-cols-1 tw-gap-3 sm:tw-grid-cols-2">
              <div className="tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60 tw-px-4 tw-py-3">
                <div className="tw-flex tw-items-center tw-gap-1.5 tw-text-xs tw-font-medium tw-text-slate-500">
                  <CalendarOutlined className="tw-text-slate-400" />
                  기간
                </div>
                <div className="tw-mt-1.5 tw-text-sm tw-font-semibold tw-tabular-nums tw-text-slate-800">
                  {detailGoal.startDate} ~ {detailGoal.endDate}
                </div>
              </div>
              <div className="tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60 tw-px-4 tw-py-3">
                <div className="tw-flex tw-items-center tw-gap-1.5 tw-text-xs tw-font-medium tw-text-slate-500">
                  <UserOutlined className="tw-text-slate-400" />
                  담당
                </div>
                <div className="tw-mt-1.5 tw-break-all tw-text-sm tw-font-semibold tw-text-slate-800">
                  <Text code className="!tw-text-[13px] tw-bg-white/80">
                    {detailGoal.ownerId}
                  </Text>
                </div>
              </div>
            </div>

            <div className="tw-grid tw-grid-cols-1 tw-gap-3 sm:tw-grid-cols-3">
              <div className="tw-rounded-lg tw-bg-slate-100/80 tw-px-3 tw-py-2.5">
                <div className="tw-text-[11px] tw-font-medium tw-text-slate-500">측정</div>
                <div className="tw-mt-0.5 tw-text-sm tw-font-medium tw-text-slate-800">
                  {MEASURE_OPTIONS.find((o) => o.value === detailGoal.measureType)?.label ?? detailGoal.measureType}
                </div>
              </div>
              <div className="tw-rounded-lg tw-bg-slate-100/80 tw-px-3 tw-py-2.5">
                <div className="tw-text-[11px] tw-font-medium tw-text-slate-500">단위</div>
                <div className="tw-mt-0.5 tw-text-sm tw-font-medium tw-text-slate-800">
                  {UNIT_OPTIONS.find((o) => o.value === detailGoal.unitType)?.label ?? detailGoal.unitType}
                </div>
              </div>
              <div className="tw-rounded-lg tw-bg-slate-100/80 tw-px-3 tw-py-2.5 sm:tw-col-span-1">
                <div className="tw-text-[11px] tw-font-medium tw-text-slate-500">상한</div>
                <div className="tw-mt-0.5 tw-text-sm tw-font-medium tw-tabular-nums tw-text-slate-800">
                  {detailGoal.capPct != null ? `${detailGoal.capPct}%` : '—'}
                </div>
              </div>
            </div>

            <div className="tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-white tw-px-4 tw-py-4">
              <div className="tw-flex tw-items-baseline tw-justify-between tw-gap-3">
                <span className="tw-text-xs tw-font-semibold tw-text-slate-500">달성 현황</span>
                <span className="tw-text-2xl tw-font-bold tw-tabular-nums tw-text-[#1e3a5f]">{prog.label}</span>
              </div>
              <Progress
                percent={prog.barPct}
                showInfo={false}
                strokeColor={prog.stroke}
                trailColor="rgba(15,23,42,0.06)"
                className="!tw-mt-3 !tw-mb-0"
              />
              <div className="tw-mt-2 tw-text-xs tw-text-slate-500">
                실적 {(detailGoal.actualValue ?? 0).toLocaleString()} / 목표{' '}
                {(detailGoal.targetValue ?? 0).toLocaleString()}
              </div>
            </div>

            {detailGoal.description ? (
              <div>
                <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-text-slate-500">설명</div>
                <div className="tw-rounded-xl tw-bg-slate-50 tw-px-4 tw-py-3 tw-ring-1 tw-ring-slate-200/60">
                  <Paragraph className="!tw-mb-0 !tw-whitespace-pre-wrap !tw-text-sm !tw-leading-relaxed !tw-text-slate-700">
                    {detailGoal.description}
                  </Paragraph>
                </div>
              </div>
            ) : null}

            <div className="tw-border-t tw-border-slate-200 tw-pt-5">
              <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-gap-2">
                <Text className="!tw-m-0 !tw-text-sm !tw-font-semibold !tw-text-slate-800">실적 이력</Text>
                {!detailRecordsQuery.isPending && detailRecordsQuery.data ? (
                  <Tag className="!tw-m-0 tw-border-slate-200 tw-bg-slate-50 tw-text-xs tw-text-slate-600">
                    {detailRecordsQuery.data.length}건
                  </Tag>
                ) : null}
              </div>
              {detailRecordsQuery.isPending ? (
                <div className="tw-flex tw-justify-center tw-py-10">
                  <Spin />
                </div>
              ) : (detailRecordsQuery.data?.length ?? 0) === 0 ? (
                <Empty description="제출된 실적이 없습니다." className="tw-py-6" />
              ) : (
                <div className="tw-flex tw-flex-col tw-gap-2.5">
                  {detailRecordsQuery.data?.map((rec) => (
                    <div
                      key={rec.id}
                      className="tw-rounded-xl tw-border tw-border-slate-200/85 tw-bg-white tw-px-4 tw-py-3 tw-shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    >
                      <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-1.5">
                        <Tag className="!tw-m-0 tw-border-slate-200 tw-bg-slate-50">달성 {rec.actualValue}</Tag>
                        {rec.selfScore != null ? (
                          <Tag color="blue" className="!tw-m-0">
                            자평 {rec.selfScore}
                          </Tag>
                        ) : null}
                        {rec.confirmed === true ? (
                          <Tag color="success" className="!tw-m-0">
                            승인
                          </Tag>
                        ) : null}
                        {rec.confirmed === false ? (
                          <Tag color="error" className="!tw-m-0">
                            반려
                          </Tag>
                        ) : null}
                        {rec.confirmed == null ? (
                          <Tag className="!tw-m-0 tw-border-amber-200 tw-bg-amber-50 tw-text-amber-900">
                            검토 대기
                          </Tag>
                        ) : null}
                      </div>
                      <Text type="secondary" className="!tw-mt-2 !tw-block !tw-text-sm !tw-leading-relaxed">
                        {rec.description?.trim() ? rec.description : '메모 없음'}
                      </Text>
                      {canUpdate && rec.confirmed == null ? (
                        <AppButton
                          size="small"
                          type="primary"
                          className="!tw-mt-3"
                          onClick={() => {
                            reviewForm.setFieldsValue({
                              confirmed: true,
                              convertedScore: rec.selfScore ?? 80,
                              rejectReason: '',
                            });
                            setReviewModal({ goal: detailGoal, record: rec });
                          }}
                        >
                          검토하기
                        </AppButton>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
            );
          })()
        ) : null}
      </AppModal>
    </div>
  );
}
