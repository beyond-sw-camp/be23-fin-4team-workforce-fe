import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  FileDoneOutlined,
  PlusOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App, Card, Collapse, List, Popconfirm, Progress, Select, Space, Tag, Typography } from 'antd';
import { useAuth } from '@/features/auth/useAuth';
import { approvalApi } from '@/features/approval/api/approvalApi';
import type { GoalApprovalBundle } from '@/features/approval/model/types';
import { ApprovalQueueList } from '@/features/approval/ui/ApprovalQueueList';
import { BundleDetailModal } from '@/features/approval/ui/BundleDetailModal';
import { goalApi } from '@/features/goals/api/goalApi';
import type { Goal } from '@/features/goals/model/types';
import { CycleSubmissionPanel } from '@/features/goals/ui/CycleSubmissionPanel';
import { GoalEditModal } from '@/features/goals/ui/GoalEditModal';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { organizationApi, type OrgChartOrgNode } from '@/features/organization/api/organizationApi';
import { canManageOrganizationScopedGoals } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { AppButton } from '@/shared/ui/AppButton';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const { Text } = Typography;
const SECTION_CARD = 'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

type GoalView = 'my' | 'org' | 'company';

export default function PerformancePage() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const search = useSearch({ strict: false }) as { view?: string; bundleId?: string };
  const canManageOrgGoals = canManageOrganizationScopedGoals(hasPermission);
  const canViewCompanyGoals =
    user?.isSystemAdmin === true || hasPermission({ resource: 'GOAL', action: 'READ', scope: 'company' });
  const activeView = normalizeGoalView(search.view, canManageOrgGoals, canViewCompanyGoals);

  const [editOpen, setEditOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [defaultOwnerType, setDefaultOwnerType] = useState<'MEMBER' | 'ORGANIZATION'>('MEMBER');
  const [selectedBundle, setSelectedBundle] = useState<GoalApprovalBundle | null>(null);

  const { data: myGoals = [], isLoading: myGoalsLoading } = useQuery({
    queryKey: ['goals-mine'],
    queryFn: () => goalApi.listMyGoals(),
    enabled: !!user?.id,
  });
  const { data: myObjectives = [], isLoading: myObjectivesLoading } = useQuery({
    queryKey: ['goals-my-objectives'],
    queryFn: () => goalApi.listMyObjectives(),
    enabled: !!user?.id && canManageOrgGoals,
  });
  const { data: companyGoals = [], isLoading: companyGoalsLoading } = useQuery({
    queryKey: ['goals-company'],
    queryFn: async () => {
      try {
        return await goalApi.listCompanyGoals();
      } catch {
        return [];
      }
    },
    enabled: canViewCompanyGoals || canManageOrgGoals,
  });
  const { data: requestedBundles = [] } = useQuery({
    queryKey: ['my-bundles'],
    queryFn: () => approvalApi.listMyRequested(),
    enabled: !!user?.id,
  });
  const { data: routedBundle } = useQuery({
    queryKey: ['goal-approval-bundle', search.bundleId],
    queryFn: () => approvalApi.get(search.bundleId!),
    enabled: !!search.bundleId,
  });

  const ownerIds = useMemo(
    () => Array.from(new Set([...myGoals, ...myObjectives, ...companyGoals].map((g) => g.ownerId).filter(Boolean))),
    [companyGoals, myGoals, myObjectives],
  );
  const { labelFor } = useMemberDisplayNames(ownerIds);

  if (!user) return null;

  const pageCopy = getPageCopy(activeView);
  const canCreateCurrentGoal = activeView === 'my' || (activeView === 'org' && canManageOrgGoals);

  useEffect(() => {
    if (routedBundle) setSelectedBundle(routedBundle);
  }, [routedBundle]);

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-6">
      <AppWorkspacePageTitle
        eyebrow="PERFORMANCE"
        title={pageCopy.title}
        subtitle={pageCopy.subtitle}
        extra={
          canCreateCurrentGoal ? (
            <AppButton
              variant="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setDefaultOwnerType(activeView === 'org' ? 'ORGANIZATION' : 'MEMBER');
                setEditGoal(null);
                setEditOpen(true);
              }}
            >
              {activeView === 'org' ? '조직 목표 생성' : '개인 목표 생성'}
            </AppButton>
          ) : null
        }
      />

      {activeView === 'my' ? (
        <MyGoalsView
          goals={myGoals}
          bundles={requestedBundles}
          loading={myGoalsLoading}
          onBundleSelect={setSelectedBundle}
          onEditGoal={(goal) => {
            setDefaultOwnerType(goal.ownerType);
            setEditGoal(goal);
            setEditOpen(true);
          }}
        />
      ) : null}

      {activeView === 'org' ? (
        <OrgGoalsView
          objectives={myObjectives}
          companyGoals={companyGoals}
          loading={myObjectivesLoading}
          companyGoalsLoading={companyGoalsLoading}
          canManageOrgGoals={canManageOrgGoals}
          labelFor={labelFor}
          onBundleSelect={setSelectedBundle}
        />
      ) : null}

      {activeView === 'company' ? (
        <CompanyGoalsView goals={companyGoals} loading={companyGoalsLoading} />
      ) : null}

      <GoalEditModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditGoal(null);
        }}
        goal={editGoal}
        defaultOwnerId={user.id}
        defaultOwnerType={defaultOwnerType}
      />
      <BundleDetailModal
        open={!!selectedBundle}
        bundle={selectedBundle}
        onClose={() => setSelectedBundle(null)}
        currentUserId={user.id}
      />
    </div>
  );
}

function MyGoalsView({
  goals,
  bundles,
  loading,
  onBundleSelect,
  onEditGoal,
}: {
  goals: Goal[];
  bundles: GoalApprovalBundle[];
  loading: boolean;
  onBundleSelect: (bundle: GoalApprovalBundle) => void;
  onEditGoal: (goal: Goal) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const memberGoalsAll = goals.filter((goal) => goal.ownerType === 'MEMBER');
  const { cycleFilter, setCycleFilter, cycleOptions } = useCycleFilter(memberGoalsAll);
  const memberGoals = filterGoalsByCycle(memberGoalsAll, cycleFilter);
  const filteredBundles = filterBundlesByCycle(bundles, cycleFilter);
  const goalsByCycle = groupByCycle(memberGoals);
  const pendingByCycle = useMemo(() => {
    const map = new Map<string, GoalApprovalBundle>();
    filteredBundles.filter((bundle) => bundle.status === 'PENDING').forEach((bundle) => map.set(bundle.cycleKey, bundle));
    return map;
  }, [filteredBundles]);
  const approvedByCycle = useMemo(() => {
    const map = new Map<string, GoalApprovalBundle>();
    filteredBundles
      .filter((bundle) => bundle.status === 'APPROVED')
      .forEach((bundle) => {
        const current = map.get(bundle.cycleKey);
        const nextAt = bundle.updatedAt ?? bundle.requestedAt ?? '';
        const currentAt = current?.updatedAt ?? current?.requestedAt ?? '';
        if (!current || nextAt.localeCompare(currentAt) > 0) map.set(bundle.cycleKey, bundle);
      });
    return map;
  }, [filteredBundles]);
  const lastRejectedByCycle = useMemo(() => {
    const map = new Map<string, GoalApprovalBundle>();
    filteredBundles
      .filter((bundle) => bundle.status === 'REJECTED')
      .forEach((bundle) => {
        const current = map.get(bundle.cycleKey);
        const nextAt = bundle.updatedAt ?? bundle.requestedAt ?? '';
        const currentAt = current?.updatedAt ?? current?.requestedAt ?? '';
        if (!current || nextAt.localeCompare(currentAt) > 0) map.set(bundle.cycleKey, bundle);
      });
    return map;
  }, [filteredBundles]);
  const deleteGoalMut = useMutation({
    mutationFn: (goalId: string) => goalApi.deleteGoal(goalId),
    onSuccess: () => {
      message.success('작성 중인 개인 목표를 삭제했어요.');
      queryClient.invalidateQueries({ queryKey: ['goals-mine'] });
      queryClient.invalidateQueries({ queryKey: ['goals-my-objectives'] });
      queryClient.invalidateQueries({ queryKey: ['my-bundles'] });
      queryClient.invalidateQueries({ queryKey: ['my-approval-queue'] });
    },
    onError: () => message.error('개인 목표 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.'),
  });

  return (
    <div className="tw-space-y-4">
      <CycleFilterBar value={cycleFilter} onChange={setCycleFilter} options={cycleOptions} />
      {loading ? (
        <Card className={SECTION_CARD} styles={{ body: { padding: 24 } }}>
          <Text className="tw-text-sm tw-text-slate-500">내 목표를 불러오는 중입니다.</Text>
        </Card>
      ) : goalsByCycle.length === 0 ? (
        <Card className={SECTION_CARD} styles={{ body: { padding: 40 } }}>
          <AppEmptyIllustrated description="아직 작성한 개인 목표가 없습니다." />
        </Card>
      ) : (
        <Space direction="vertical" size={12} className="tw-w-full">
          {goalsByCycle.map(([cycleKey, cycleGoals]) => (
            <CycleSubmissionPanel
              key={cycleKey}
              cycleKey={cycleKey}
              goals={cycleGoals}
              pendingBundle={pendingByCycle.get(cycleKey)}
              approvedBundle={approvedByCycle.get(cycleKey)}
              lastRejected={lastRejectedByCycle.get(cycleKey)}
              onEditGoal={onEditGoal}
              onDeleteGoal={(goal) => deleteGoalMut.mutate(goal.goalId)}
              deletingGoalId={deleteGoalMut.variables}
              onBundleSelect={onBundleSelect}
            />
          ))}
        </Space>
      )}
      <ApprovalHistoryPanel bundles={filteredBundles} onSelect={onBundleSelect} />
    </div>
  );
}

function OrgGoalsView({
  objectives,
  companyGoals,
  loading,
  companyGoalsLoading,
  canManageOrgGoals,
  labelFor,
  onBundleSelect,
}: {
  objectives: Goal[];
  companyGoals: Goal[];
  loading: boolean;
  companyGoalsLoading: boolean;
  canManageOrgGoals: boolean;
  labelFor: (memberId: string) => string;
  onBundleSelect: (bundle: GoalApprovalBundle) => void;
}) {
  const { data: orgChart } = useQuery({
    queryKey: ['performance-org-goals-org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    enabled: canManageOrgGoals,
  });
  const orgObjectivesAll = objectives.filter((goal) => goal.ownerType === 'ORGANIZATION');
  const orgIdsByParent = useMemo(() => buildDescendantOrgIdMap(orgChart?.organizations ?? []), [orgChart]);
  const managedOrgIds = useMemo(
    () =>
      Array.from(
        new Set(
          orgObjectivesAll.flatMap((goal) => {
            if (!goal.ownerId) return [];
            return orgIdsByParent.get(goal.ownerId) ?? [goal.ownerId];
          }),
        ),
      ),
    [orgIdsByParent, orgObjectivesAll],
  );
  const orgGoalQueries = useQueries({
    queries: managedOrgIds.map((orgId) => ({
      queryKey: ['goals-organization-members', orgId],
      queryFn: () => goalApi.listOrgGoals({ orgId }),
      enabled: canManageOrgGoals,
    })),
  });
  const orgMemberGoals = useMemo(
    () => uniqueGoalsById(orgGoalQueries.flatMap((query) => query.data ?? [])),
    [orgGoalQueries],
  );
  const orgMemberGoalsLoading = orgGoalQueries.some((query) => query.isLoading);
  const scopedGoals = useMemo(() => uniqueGoalsById([...orgMemberGoals, ...companyGoals]), [companyGoals, orgMemberGoals]);
  const { cycleFilter, setCycleFilter, cycleOptions } = useCycleFilter([...orgObjectivesAll, ...scopedGoals]);
  const orgObjectives = filterGoalsByCycle(orgObjectivesAll, cycleFilter);
  const scopedGoalsInCycle = filterGoalsByCycle(scopedGoals, cycleFilter);
  const objectiveIds = new Set(orgObjectives.map((goal) => goal.goalId));
  const approvedMemberGoals = scopedGoalsInCycle
    .filter(
      (goal) =>
        goal.ownerType === 'MEMBER' &&
        isApprovedGoal(goal) &&
        !!goal.alignedOrgGoalId &&
        objectiveIds.has(goal.alignedOrgGoalId),
    )
    .sort((a, b) => (a.objectiveTitle || '').localeCompare(b.objectiveTitle || '') || b.weightPct - a.weightPct);
  const approvedMemberIds = useMemo(
    () => Array.from(new Set(approvedMemberGoals.map((goal) => goal.ownerId).filter(Boolean))),
    [approvedMemberGoals],
  );
  const managedMembers = useMemo(
    () => collectMembersByOrgIds(orgChart?.organizations ?? [], managedOrgIds),
    [managedOrgIds, orgChart],
  );
  const setupStatus = useMemo(
    () => buildGoalSetupStatus(managedMembers, scopedGoalsInCycle, objectiveIds),
    [managedMembers, objectiveIds, scopedGoalsInCycle],
  );
  const orgMetrics = useMemo(
    () => ({
      objectives: orgObjectives.length,
      criteriaReady: orgObjectives.filter(hasAllCriteria).length,
      approvedMembers: new Set(approvedMemberGoals.map((goal) => goal.ownerId).filter(Boolean)).size,
      approvedGoals: approvedMemberGoals.length,
    }),
    [approvedMemberGoals, orgObjectives],
  );
  const { labelFor: labelMemberFor } = useMemberDisplayNames(approvedMemberIds);

  if (!canManageOrgGoals) {
    return (
      <Card className={SECTION_CARD}>
        <AppEmptyIllustrated description="조직 목표 관리 권한이 없습니다." />
      </Card>
    );
  }

  return (
    <div className="tw-space-y-5">
      <CycleFilterBar value={cycleFilter} onChange={setCycleFilter} options={cycleOptions} />
      <GoalManagementStatusPanel orgMetrics={orgMetrics} setupStatus={setupStatus} />
      <div className="tw-grid tw-grid-cols-1 tw-gap-5 xl:tw-grid-cols-[minmax(0,1fr)_420px]">
        <Card title="조직 목표" className={SECTION_CARD} loading={loading}>
          <CompactGoalRows goals={orgObjectives} empty="담당 조직 목표가 없습니다." mode="objective" />
        </Card>
        <Card title="팀 목표 승인 큐" className={SECTION_CARD}>
          <ApprovalQueueList onSelect={onBundleSelect} />
        </Card>
      </div>
      <Card title="승인된 개인 목표" className={SECTION_CARD} loading={companyGoalsLoading || orgMemberGoalsLoading}>
        <MemberGroupedGoalList
          goals={approvedMemberGoals}
          empty="담당 조직 목표에 연결되어 승인된 개인 목표가 없습니다."
          labelFor={(memberId) => labelMemberFor(memberId) || labelFor(memberId)}
        />
      </Card>
    </div>
  );
}

function ApprovalHistoryPanel({
  bundles,
  onSelect,
}: {
  bundles: GoalApprovalBundle[];
  onSelect: (bundle: GoalApprovalBundle) => void;
}) {
  const sorted = useMemo(
    () =>
      [...bundles].sort((a, b) => {
        const aDate = a.updatedAt ?? a.requestedAt ?? '';
        const bDate = b.updatedAt ?? b.requestedAt ?? '';
        return bDate.localeCompare(aDate);
      }),
    [bundles],
  );

  return (
    <Card title="목표 승인 이력" className={SECTION_CARD}>
      {sorted.length === 0 ? (
        <AppEmptyIllustrated description="아직 승인 요청 이력이 없습니다." />
      ) : (
        <Collapse
          ghost
          items={[
            {
              key: 'history',
              label: (
                <span className="tw-text-sm tw-font-semibold tw-text-slate-900">
                  승인 요청 이력 {sorted.length}건
                </span>
              ),
              children: (
                <List
                  dataSource={sorted}
                  renderItem={(bundle) => (
                    <List.Item
                      className="tw-cursor-pointer hover:tw-bg-slate-50"
                      onClick={() => onSelect(bundle)}
                    >
                      <List.Item.Meta
                        title={
                          <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                            <Text strong>{bundle.cycleKey}</Text>
                            <StatusTag status={bundle.status} />
                          </div>
                        }
                        description={
                          <div className="tw-flex tw-flex-wrap tw-gap-2 tw-text-xs tw-text-slate-500">
                            <span>목표 {bundle.goalIds.length}개</span>
                            <span>가중치 {bundle.weightSumSnapshot}%</span>
                            {bundle.requestedAt ? <span>요청일 {bundle.requestedAt.slice(0, 10)}</span> : null}
                            {bundle.revision ? <span>revision {bundle.revision}</span> : null}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}

function CompanyGoalsView({
  goals,
  loading,
}: {
  goals: Goal[];
  loading: boolean;
}) {
  const { cycleFilter, setCycleFilter, cycleOptions } = useCycleFilter(goals);
  const { data: orgChart } = useQuery({
    queryKey: ['performance-company-org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
  });
  const filteredGoals = filterGoalsByCycle(goals, cycleFilter);
  const orgGoals = filteredGoals.filter((goal) => goal.ownerType === 'ORGANIZATION');
  const orgNameById = useMemo(() => buildOrgNameMap(orgChart?.organizations ?? []), [orgChart]);
  const groupedOrgGoals = groupOrgGoalsByOwner(orgGoals, orgNameById);
  const companyMetrics = buildCompanyGoalMetrics(orgGoals);

  return (
    <div className="tw-space-y-5">
      <CycleFilterBar value={cycleFilter} onChange={setCycleFilter} options={cycleOptions} />
      <Card title="전사 목표 지표" className={SECTION_CARD}>
        <div className="tw-grid tw-grid-cols-2 tw-gap-3 md:tw-grid-cols-4">
          <StatusMetric
            label="등록된 조직 목표"
            value={companyMetrics.totalGoals}
            description="선택한 목표 기간에 생성된 조직 목표 수"
          />
          <StatusMetric
            label="목표를 낸 조직"
            value={companyMetrics.organizationsWithGoals}
            description="조직 목표를 1개 이상 가진 조직 수"
          />
          <StatusMetric
            label="평가 기준 완료"
            value={companyMetrics.criteriaReady}
            tone="green"
            description="S/A/B/C 기준이 모두 입력된 조직 목표 수"
          />
          <StatusMetric
            label="평가에 사용될 목표"
            value={companyMetrics.activeGoals}
            tone="gold"
            description="현재 평가 대상 상태인 조직 목표 수"
          />
        </div>
      </Card>
      <Card title="조직별 목표" className={SECTION_CARD} loading={loading}>
        {groupedOrgGoals.length === 0 ? (
          <AppEmptyIllustrated description="전사 조직 목표가 없습니다." />
        ) : (
          <OrganizationGroupedGoalList groups={groupedOrgGoals} />
        )}
      </Card>
    </div>
  );
}

function CycleFilterBar({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 16 } }}>
      <div className="tw-flex tw-flex-col tw-gap-3 md:tw-flex-row md:tw-items-center md:tw-justify-between">
        <div>
          <Text strong className="!tw-text-sm !tw-text-slate-900">
            목표 기간 필터
          </Text>
          <div className="tw-mt-1 tw-text-xs tw-text-slate-500">
            목표 수립, 승인 요청, 평가 대상 현황을 같은 목표 기간 기준으로 확인합니다.
          </div>
        </div>
        <Select
          value={value}
          onChange={onChange}
          className="tw-w-full md:tw-w-[220px]"
          options={[{ value: 'ALL', label: '전체 목표 기간' }, ...options]}
        />
      </div>
    </Card>
  );
}

type GoalSetupMemberStatus = {
  memberId: string;
  memberName: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DRAFT' | 'EMPTY';
  goalCount: number;
  weightPct: number;
  updatedAt?: string;
};

type GoalSetupStatus = {
  total: number;
  approved: number;
  pending: number;
  notReady: number;
  incompleteMembers: GoalSetupMemberStatus[];
};

type OrgGoalMetrics = {
  objectives: number;
  criteriaReady: number;
  approvedMembers: number;
  approvedGoals: number;
};

function percentOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function GoalManagementStatusPanel({
  orgMetrics,
  setupStatus,
}: {
  orgMetrics: OrgGoalMetrics;
  setupStatus: GoalSetupStatus;
}) {
  const criteriaPct = percentOf(orgMetrics.criteriaReady, orgMetrics.objectives);
  const approvedPct = percentOf(setupStatus.approved, setupStatus.total);
  const waitingCount = setupStatus.pending + setupStatus.notReady;

  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 20 } }}>
      <div className="tw-flex tw-flex-col tw-gap-1 md:tw-flex-row md:tw-items-start md:tw-justify-between">
        <div>
          <Text strong className="!tw-text-base !tw-text-slate-900">
            조직 목표 관리 현황
          </Text>
          <div className="tw-mt-1 tw-text-xs tw-leading-relaxed tw-text-slate-500">
            조직 목표는 평가 기준 입력 상태를, 구성원 목표는 개인 목표 승인 완료 여부를 보여줍니다.
          </div>
        </div>
        <Tag
          className={`!tw-m-0 !tw-rounded-full !tw-px-3 !tw-py-1 !tw-text-xs !tw-font-semibold ${
            waitingCount === 0
              ? '!tw-border-emerald-100 !tw-bg-emerald-50 !tw-text-emerald-700'
              : '!tw-border-amber-100 !tw-bg-amber-50 !tw-text-amber-700'
          }`}
        >
          {waitingCount === 0 ? '수립 완료' : `확인 필요 ${waitingCount}명`}
        </Tag>
      </div>

      <div className="tw-mt-5 tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-2">
        <div className="tw-rounded-2xl tw-border tw-border-slate-100 tw-bg-slate-50/70 tw-p-4">
          <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
            <div>
              <div className="tw-text-sm tw-font-semibold tw-text-slate-900">조직 목표 준비도</div>
              <div className="tw-mt-1 tw-text-xs tw-leading-relaxed tw-text-slate-500">
                담당 조직 목표 중 S/A/B/C 평가 기준이 모두 입력된 비율입니다.
              </div>
            </div>
            <div className="tw-text-right">
              <div className="tw-text-2xl tw-font-bold tw-tabular-nums tw-text-[#1e3a5f]">
                {orgMetrics.criteriaReady}/{orgMetrics.objectives}
              </div>
              <div className="tw-text-[11px] tw-text-slate-400">기준 완료</div>
            </div>
          </div>
          <Progress
            percent={criteriaPct}
            showInfo={false}
            strokeColor={criteriaPct === 100 ? '#059669' : '#1e3a5f'}
            trailColor="#e2e8f0"
            className="!tw-mt-3"
          />
          <div className="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2">
            <Tag className="!tw-m-0">조직 목표 {orgMetrics.objectives}개</Tag>
            <Tag className="!tw-m-0">연결 승인 목표 {orgMetrics.approvedGoals}개</Tag>
          </div>
        </div>

        <div className="tw-rounded-2xl tw-border tw-border-slate-100 tw-bg-white tw-p-4">
          <div className="tw-flex tw-items-start tw-justify-between tw-gap-3">
            <div>
              <div className="tw-text-sm tw-font-semibold tw-text-slate-900">구성원 목표 수립 진행</div>
              <div className="tw-mt-1 tw-text-xs tw-leading-relaxed tw-text-slate-500">
                담당 조직 구성원 중 개인 목표가 승인 완료되어 평가 대상으로 준비된 인원입니다.
              </div>
            </div>
            <div className="tw-text-right">
              <div className="tw-text-2xl tw-font-bold tw-tabular-nums tw-text-emerald-700">
                {setupStatus.approved}/{setupStatus.total}
              </div>
              <div className="tw-text-[11px] tw-text-slate-400">승인 완료</div>
            </div>
          </div>
          <Progress
            percent={approvedPct}
            showInfo={false}
            strokeColor={approvedPct === 100 ? '#059669' : '#d97706'}
            trailColor="#e2e8f0"
            className="!tw-mt-3"
          />
          <div className="tw-mt-3 tw-flex tw-flex-wrap tw-gap-2">
            <Tag color="green" className="!tw-m-0">완료 {setupStatus.approved}명</Tag>
            <Tag color="gold" className="!tw-m-0">승인 대기 {setupStatus.pending}명</Tag>
            <Tag color="red" className="!tw-m-0">미완료 {setupStatus.notReady}명</Tag>
          </div>
        </div>
      </div>

      <Collapse
        ghost
        className="tw-mt-3"
        items={[
          {
            key: 'incomplete-members',
            label: (
              <span className="tw-text-sm tw-font-semibold tw-text-slate-900">
                미완료/승인 대기 구성원 {setupStatus.incompleteMembers.length}명 보기
              </span>
            ),
            children:
              setupStatus.incompleteMembers.length === 0 ? (
                <AppEmptyIllustrated description="모든 구성원의 목표가 승인 완료되었습니다." />
              ) : (
                <List
                  dataSource={setupStatus.incompleteMembers}
                  renderItem={(member) => (
                    <List.Item className="!tw-items-start">
                      <List.Item.Meta
                        avatar={<UserOutlined />}
                        title={
                          <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                            <Text strong className="!tw-text-[14px] !tw-text-slate-900">
                              {member.memberName}
                            </Text>
                            <GoalSetupStatusTag status={member.status} />
                          </div>
                        }
                        description={
                          <div className="tw-flex tw-flex-wrap tw-gap-2 tw-text-xs tw-text-slate-500">
                            <span>개인 목표 {member.goalCount}개</span>
                            <span>가중치 {member.weightPct}%</span>
                            {member.updatedAt ? <span>최근 수정 {member.updatedAt.slice(0, 10)}</span> : null}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ),
          },
        ]}
      />
    </Card>
  );
}

function StatusMetric({
  label,
  value,
  description,
  tone = 'default',
}: {
  label: string;
  value: number;
  description?: string;
  tone?: 'default' | 'green' | 'gold' | 'red';
}) {
  const toneClass =
    tone === 'green'
      ? 'tw-bg-emerald-50 tw-text-emerald-700'
      : tone === 'gold'
        ? 'tw-bg-amber-50 tw-text-amber-700'
        : tone === 'red'
          ? 'tw-bg-rose-50 tw-text-rose-700'
          : 'tw-bg-slate-50 tw-text-slate-700';
  return (
    <div className={`tw-rounded-xl tw-p-4 ${toneClass}`}>
      <div className="tw-text-xs tw-font-semibold">{label}</div>
      <div className="tw-mt-1 tw-text-2xl tw-font-bold">{value}</div>
      {description ? <div className="tw-mt-2 tw-text-[11px] tw-leading-4 tw-opacity-80">{description}</div> : null}
    </div>
  );
}

function GoalSetupStatusTag({ status }: { status: GoalSetupMemberStatus['status'] }) {
  const map: Record<GoalSetupMemberStatus['status'], { color: string; label: string }> = {
    APPROVED: { color: 'green', label: '승인 완료' },
    PENDING: { color: 'gold', label: '승인 대기' },
    REJECTED: { color: 'red', label: '반려' },
    DRAFT: { color: 'default', label: '작성 중' },
    EMPTY: { color: 'default', label: '미작성' },
  };
  const next = map[status];
  return <Tag color={next.color}>{next.label}</Tag>;
}

function GoalList({
  goals,
  empty,
  labelFor,
  showOwner = true,
  showOwnerTag = true,
  onEdit,
  onDelete,
  deletingGoalId,
}: {
  goals: Goal[];
  empty: string;
  labelFor?: (memberId: string) => string;
  showOwner?: boolean;
  showOwnerTag?: boolean;
  onEdit?: (goal: Goal) => void;
  onDelete?: (goal: Goal) => void;
  deletingGoalId?: string;
}) {
  if (goals.length === 0) return <AppEmptyIllustrated description={empty} />;
  return (
    <List
      dataSource={goals}
      renderItem={(goal) => (
        <List.Item
          className={onEdit ? 'tw-cursor-pointer !tw-items-start hover:tw-bg-slate-50' : '!tw-items-start'}
          onClick={() => onEdit?.(goal)}
          actions={
            onDelete && goal.ownerType === 'MEMBER' && goal.status === 'DRAFT'
              ? [
                  <span key="delete" onClick={(event) => event.stopPropagation()}>
                    <Popconfirm
                      title="작성 중인 목표 삭제"
                      description="삭제한 목표는 되돌릴 수 없습니다."
                      okText="삭제"
                      cancelText="취소"
                      okButtonProps={{ danger: true, loading: deletingGoalId === goal.goalId }}
                      onConfirm={() => onDelete(goal)}
                    >
                      <AppButton
                        variant="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        loading={deletingGoalId === goal.goalId}
                      >
                        삭제
                      </AppButton>
                    </Popconfirm>
                  </span>,
                ]
              : undefined
          }
        >
          <List.Item.Meta
            avatar={goal.ownerType === 'ORGANIZATION' ? <TeamOutlined /> : <UserOutlined />}
            title={
              <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                <Text strong className="!tw-text-[15px] !tw-text-slate-900">
                  {goal.title}
                </Text>
                {showOwnerTag ? <OwnerTag goal={goal} /> : null}
                <StatusTag status={goal.status} />
              </div>
            }
            description={
              <div className="tw-space-y-2">
                <div className="tw-flex tw-flex-wrap tw-gap-2 tw-text-xs tw-text-slate-500">
                  <span>{goal.cycleKey || goal.cycle}</span>
                  {goal.ownerType === 'MEMBER' ? <span>가중치 {goal.weightPct}%</span> : null}
                  {showOwner && labelFor && goal.ownerType === 'MEMBER' ? <span>{labelFor(goal.ownerId)}</span> : null}
                  {goal.objectiveTitle ? <span>상위 목표: {goal.objectiveTitle}</span> : null}
                </div>
                <Text className="!tw-text-sm !tw-text-slate-600">{goal.description}</Text>
                <GradeCriteria goal={goal} />
              </div>
            }
          />
        </List.Item>
      )}
    />
  );
}

function MemberGroupedGoalList({
  goals,
  empty,
  labelFor,
}: {
  goals: Goal[];
  empty: string;
  labelFor: (memberId: string) => string;
}) {
  const groups = useMemo(() => groupMemberGoalsByOwner(goals, labelFor), [goals, labelFor]);
  if (groups.length === 0) return <AppEmptyIllustrated description={empty} />;

  return (
    <Collapse
      className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white"
      items={groups.map((group) => ({
        key: group.memberId,
        label: (
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
            <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-3">
              <div className="tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-bg-emerald-50 tw-text-sm tw-font-bold tw-text-emerald-700">
                {group.memberName.slice(0, 1)}
              </div>
              <div className="tw-min-w-0">
                <div className="tw-truncate tw-text-[15px] tw-font-semibold tw-text-slate-900">{group.memberName}</div>
                <div className="tw-mt-0.5 tw-text-[11px] tw-text-slate-400">구성원 ID {shortId(group.memberId)}</div>
              </div>
            </div>
            <div className="tw-flex tw-flex-wrap tw-gap-1.5">
              <Tag color="green" className="!tw-m-0">
                승인 목표 {group.goals.length}개
              </Tag>
              <Tag color={group.totalWeight === 100 ? 'blue' : 'gold'} className="!tw-m-0">
                가중치 {group.totalWeight}%
              </Tag>
            </div>
          </div>
        ),
        children: (
          <div className="tw-rounded-xl tw-bg-slate-50/70 tw-p-3">
            <CompactGoalRows goals={group.goals} empty="승인된 개인 목표가 없습니다." mode="member" />
          </div>
        ),
      }))}
    />
  );
}

function OrganizationGroupedGoalList({
  groups,
}: {
  groups: Array<{ ownerId: string; organizationName: string; goals: Goal[] }>;
}) {
  return (
    <Collapse
      className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white"
      items={groups.map((group) => ({
        key: group.ownerId,
        label: (
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
            <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-3">
              <div className="tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full tw-bg-blue-50 tw-text-sm tw-font-bold tw-text-blue-700">
                {group.organizationName.slice(0, 1)}
              </div>
              <div className="tw-min-w-0">
                <div className="tw-truncate tw-text-[15px] tw-font-semibold tw-text-slate-900">
                  {group.organizationName}
                </div>
                <div className="tw-mt-0.5 tw-text-[11px] tw-text-slate-400">조직 ID {shortId(group.ownerId)}</div>
              </div>
            </div>
            <div className="tw-flex tw-flex-wrap tw-gap-1.5">
              <Tag color="blue" className="!tw-m-0">
                조직 목표 {group.goals.length}개
              </Tag>
              <Tag color={group.goals.every(hasAllCriteria) ? 'green' : 'gold'} className="!tw-m-0">
                평가 기준 {group.goals.filter(hasAllCriteria).length}/{group.goals.length}
              </Tag>
            </div>
          </div>
        ),
        children: (
          <div className="tw-rounded-xl tw-bg-slate-50/70 tw-p-3">
            <CompactGoalRows goals={group.goals} empty="조직 목표가 없습니다." mode="objective" />
          </div>
        ),
      }))}
    />
  );
}

function CompactGoalRows({
  goals,
  empty,
  mode,
}: {
  goals: Goal[];
  empty: string;
  mode: 'objective' | 'member';
}) {
  if (goals.length === 0) return <AppEmptyIllustrated description={empty} />;
  return (
    <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white">
      <div
        className={
          'tw-grid tw-gap-3 tw-border-b tw-border-slate-100 tw-bg-slate-50 tw-px-4 tw-py-2 tw-text-[11px] tw-font-semibold tw-text-slate-500 ' +
          (mode === 'member' ? 'tw-grid-cols-[minmax(0,1fr)_88px_96px]' : 'tw-grid-cols-[minmax(0,1fr)_108px_96px]')
        }
      >
        <span>목표</span>
        <span className={mode === 'member' ? 'tw-text-right' : 'tw-text-center'}>
          {mode === 'member' ? '가중치' : '평가 기준'}
        </span>
        <span className="tw-text-center">상태</span>
      </div>
      {goals.map((goal) => (
        <div
          key={goal.goalId}
          className={
            'tw-grid tw-gap-3 tw-border-b tw-border-slate-100 tw-px-4 tw-py-3 last:tw-border-b-0 ' +
            (mode === 'member' ? 'tw-grid-cols-[minmax(0,1fr)_88px_96px]' : 'tw-grid-cols-[minmax(0,1fr)_108px_96px]')
          }
        >
          <div className="tw-min-w-0">
            <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">{goal.title}</div>
            <div className="tw-mt-1 tw-line-clamp-1 tw-text-xs tw-text-slate-500">
              {mode === 'member'
                ? goal.objectiveTitle
                  ? `연결 목표: ${goal.objectiveTitle}`
                  : goal.description || '연결된 조직 목표 없음'
                : goal.description || '설명 없음'}
            </div>
          </div>
          <div className={mode === 'member' ? 'tw-self-center tw-text-right tw-text-sm tw-font-bold tw-text-[#1e3a5f]' : 'tw-self-center tw-text-center'}>
            {mode === 'member' ? `${goal.weightPct}%` : <CriteriaReadyTag goal={goal} />}
          </div>
          <div className="tw-self-center tw-text-center">
            <StatusTag status={goal.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CriteriaReadyTag({ goal }: { goal: Goal }) {
  const ready = hasAllCriteria(goal);
  return <Tag color={ready ? 'green' : 'gold'} className="!tw-m-0">{ready ? '완료' : '미완료'}</Tag>;
}

function OwnerTag({ goal }: { goal: Goal }) {
  if (goal.ownerType === 'ORGANIZATION') return <Tag color="blue">조직 목표</Tag>;
  if (goal.alignedOrgGoalId) return <Tag color="cyan">조직 목표 연결</Tag>;
  return <Tag>개인 목표</Tag>;
}

function StatusTag({ status }: { status: string }) {
  const color =
    status === 'ACTIVE' || status === 'APPROVED'
      ? 'green'
      : status === 'PENDING'
        ? 'gold'
        : status === 'REJECTED'
          ? 'red'
          : 'default';
  const label: Record<string, string> = {
    DRAFT: '작성 중',
    PENDING: '승인 대기',
    ACTIVE: '평가 대상',
    COMPLETED: '완료',
    CANCELLED: '취소',
    SKIPPED: '제외',
    APPROVED: '승인',
    REJECTED: '반려',
    WITHDRAWN: '철회',
  };
  return <Tag color={color}>{label[status] ?? status}</Tag>;
}

function GradeCriteria({ goal }: { goal: Goal }) {
  if (!hasAnyCriteria(goal)) {
    return (
      <Tag icon={<FileDoneOutlined />} color="default">
        직접 입력 기준 필요
      </Tag>
    );
  }
  return (
    <div className="tw-flex tw-flex-wrap tw-gap-1.5">
      {(['S', 'A', 'B', 'C'] as const).map((grade) => {
        const value = goal[`grade${grade}` as keyof Goal] as string | undefined;
        return value ? (
          <Tag key={grade} className="!tw-m-0 !tw-rounded-full" icon={grade === 'S' ? <CheckCircleOutlined /> : undefined}>
            {grade}: {value}
          </Tag>
        ) : null;
      })}
    </div>
  );
}

function groupByCycle(goals: Goal[]) {
  const map = new Map<string, Goal[]>();
  goals.forEach((goal) => {
    const key = goal.cycleKey || `${goal.cycle}:${goal.cycleStartDate}`;
    map.set(key, [...(map.get(key) ?? []), goal]);
  });
  return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
}

function useCycleFilter(goals: Goal[]) {
  const cycleOptions = useMemo(() => cycleOptionsFromGoals(goals), [goals]);
  const defaultCycle = useMemo(() => resolveDefaultCycleFilter(goals, cycleOptions), [cycleOptions, goals]);
  const [cycleFilter, setCycleFilterValue] = useState(defaultCycle);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const values = new Set(['ALL', ...cycleOptions.map((option) => option.value)]);
    if (!values.has(cycleFilter)) {
      setCycleFilterValue(defaultCycle);
      setTouched(false);
      return;
    }
    if (!touched && cycleFilter !== defaultCycle) {
      setCycleFilterValue(defaultCycle);
    }
  }, [cycleFilter, cycleOptions, defaultCycle, touched]);

  const setCycleFilter = (value: string) => {
    setTouched(true);
    setCycleFilterValue(value);
  };

  return { cycleFilter, setCycleFilter, cycleOptions };
}

function cycleOptionsFromGoals(goals: Goal[]) {
  return Array.from(new Set(goals.map((goal) => goal.cycleKey || `${goal.cycle}:${goal.cycleStartDate}`).filter(Boolean)))
    .sort((a, b) => b.localeCompare(a))
    .map((cycleKey) => ({ value: cycleKey, label: cycleKey }));
}

function resolveDefaultCycleFilter(goals: Goal[], options: Array<{ value: string; label: string }>) {
  if (options.length === 0) return 'ALL';
  const today = toDayNumber(new Date());
  const currentGoal = goals
    .filter((goal) => goal.cycleStartDate && goal.cycleEndDate)
    .find((goal) => {
      const start = toDayNumber(goal.cycleStartDate);
      const end = toDayNumber(goal.cycleEndDate);
      return start <= today && today <= end;
    });
  if (currentGoal) {
    return currentGoal.cycleKey || `${currentGoal.cycle}:${currentGoal.cycleStartDate}`;
  }
  const currentHalf = currentHalfYearCycleKey(new Date());
  if (options.some((option) => option.value === currentHalf)) return currentHalf;
  const currentYear = String(new Date().getFullYear());
  const yearOption = options.find((option) => option.value.includes(currentYear));
  return yearOption?.value ?? options[0]?.value ?? 'ALL';
}

function filterGoalsByCycle(goals: Goal[], cycleKey: string) {
  if (cycleKey === 'ALL') return goals;
  return goals.filter((goal) => (goal.cycleKey || `${goal.cycle}:${goal.cycleStartDate}`) === cycleKey);
}

function filterBundlesByCycle(bundles: GoalApprovalBundle[], cycleKey: string) {
  if (cycleKey === 'ALL') return bundles;
  return bundles.filter((bundle) => bundle.cycleKey === cycleKey);
}

function toDayNumber(value: Date | string) {
  if (value instanceof Date) {
    return Number(
      `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, '0')}${String(value.getDate()).padStart(2, '0')}`,
    );
  }
  return Number(value.slice(0, 10).replaceAll('-', '')) || 0;
}

function currentHalfYearCycleKey(date: Date) {
  const half = date.getMonth() < 6 ? 'H1' : 'H2';
  return `${date.getFullYear()}-${half}`;
}

function hasAnyCriteria(goal: Goal) {
  return Boolean(goal.gradeS || goal.gradeA || goal.gradeB || goal.gradeC);
}

function isApprovedGoal(goal: Goal) {
  return (
    goal.status === 'ACTIVE' ||
    goal.status === 'COMPLETED' ||
    goal.goalApprovalStatus === 'APPROVED' ||
    Boolean(goal.approvedAt)
  );
}

function uniqueGoalsById(goals: Goal[]) {
  const map = new Map<string, Goal>();
  goals.forEach((goal) => {
    const key = goal.goalId || goal.id;
    if (key && !map.has(key)) map.set(key, goal);
  });
  return Array.from(map.values());
}

function buildOrgNameMap(organizations: OrgChartOrgNode[]) {
  const map = new Map<string, string>();
  const walk = (nodes: OrgChartOrgNode[]) => {
    nodes.forEach((node) => {
      map.set(node.organizationId, node.name);
      walk(node.children ?? []);
    });
  };
  walk(organizations);
  return map;
}

function buildDescendantOrgIdMap(organizations: OrgChartOrgNode[]) {
  const map = new Map<string, string[]>();
  const walk = (node: OrgChartOrgNode): string[] => {
    const descendants = node.children.flatMap(walk);
    const ids = [node.organizationId, ...descendants];
    map.set(node.organizationId, ids);
    return ids;
  };
  organizations.forEach(walk);
  return map;
}

function collectMembersByOrgIds(organizations: OrgChartOrgNode[], orgIds: string[]) {
  const targetIds = new Set(orgIds);
  const map = new Map<string, { memberId: string; name: string }>();
  const walk = (nodes: OrgChartOrgNode[]) => {
    nodes.forEach((node) => {
      if (targetIds.has(node.organizationId)) {
        node.members.forEach((member) => {
          if (member.memberId) map.set(member.memberId, { memberId: member.memberId, name: member.name });
        });
      }
      walk(node.children ?? []);
    });
  };
  walk(organizations);
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildGoalSetupStatus(
  members: Array<{ memberId: string; name: string }>,
  goals: Goal[],
  objectiveIds: Set<string>,
): GoalSetupStatus {
  const rows = members.map((member) => {
    const memberGoals = goals.filter(
      (goal) =>
        goal.ownerType === 'MEMBER' &&
        goal.ownerId === member.memberId &&
        !!goal.alignedOrgGoalId &&
        objectiveIds.has(goal.alignedOrgGoalId),
    );
    const approvedGoals = memberGoals.filter(isApprovedGoal);
    const approvedWeight = approvedGoals.reduce((sum, goal) => sum + (goal.weightPct || 0), 0);
    const status: GoalSetupMemberStatus['status'] =
      approvedGoals.length > 0 && approvedWeight >= 100
        ? 'APPROVED'
        : memberGoals.some((goal) => goal.status === 'PENDING' || goal.goalApprovalStatus === 'PENDING')
          ? 'PENDING'
          : memberGoals.some((goal) => goal.goalApprovalStatus === 'REJECTED')
            ? 'REJECTED'
            : memberGoals.length > 0
              ? 'DRAFT'
              : 'EMPTY';

    return {
      memberId: member.memberId,
      memberName: member.name,
      status,
      goalCount: memberGoals.length,
      weightPct: memberGoals.reduce((sum, goal) => sum + (goal.weightPct || 0), 0),
      updatedAt: memberGoals
        .map((goal) => goal.updatedAt || goal.createdAt || '')
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a))[0],
    };
  });

  const approved = rows.filter((row) => row.status === 'APPROVED').length;
  const pending = rows.filter((row) => row.status === 'PENDING').length;
  const incompleteMembers = rows
    .filter((row) => row.status !== 'APPROVED')
    .sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || a.memberName.localeCompare(b.memberName));

  return {
    total: rows.length,
    approved,
    pending,
    notReady: rows.length - approved,
    incompleteMembers,
  };
}

function statusOrder(status: GoalSetupMemberStatus['status']) {
  const order: Record<GoalSetupMemberStatus['status'], number> = {
    PENDING: 0,
    REJECTED: 1,
    DRAFT: 2,
    EMPTY: 3,
    APPROVED: 4,
  };
  return order[status];
}

function buildCompanyGoalMetrics(goals: Goal[]) {
  return {
    totalGoals: goals.length,
    organizationsWithGoals: new Set(goals.map((goal) => goal.ownerId).filter(Boolean)).size,
    criteriaReady: goals.filter(hasAllCriteria).length,
    activeGoals: goals.filter((goal) => goal.status === 'ACTIVE').length,
  };
}

function hasAllCriteria(goal: Goal) {
  return Boolean(goal.gradeS && goal.gradeA && goal.gradeB && goal.gradeC);
}

function groupOrgGoalsByOwner(goals: Goal[], orgNameById: Map<string, string>) {
  const map = new Map<string, Goal[]>();
  goals.forEach((goal) => {
    const key = goal.ownerId || 'UNKNOWN';
    map.set(key, [...(map.get(key) ?? []), goal]);
  });
  return Array.from(map.entries())
    .map(([ownerId, groupGoals]) => ({
      ownerId,
      organizationName: orgNameById.get(ownerId) ?? `조직 ${shortId(ownerId)}`,
      goals: groupGoals.sort((a, b) => (a.cycleKey || '').localeCompare(b.cycleKey || '') || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName));
}

function groupMemberGoalsByOwner(goals: Goal[], labelFor: (memberId: string) => string) {
  const map = new Map<string, Goal[]>();
  goals.forEach((goal) => {
    const key = goal.ownerId || 'UNKNOWN';
    map.set(key, [...(map.get(key) ?? []), goal]);
  });
  return Array.from(map.entries())
    .map(([memberId, groupGoals]) => ({
      memberId,
      memberName: labelFor(memberId) || `구성원 ${shortId(memberId)}`,
      totalWeight: groupGoals.reduce((sum, goal) => sum + (goal.weightPct || 0), 0),
      goals: groupGoals.sort((a, b) => (a.objectiveTitle || '').localeCompare(b.objectiveTitle || '') || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.memberName.localeCompare(b.memberName));
}

function shortId(id: string) {
  return id && id !== 'UNKNOWN' ? id.slice(0, 8) : '미확인';
}

function normalizeGoalView(view: string | undefined, canManageOrgGoals: boolean, canViewCompanyGoals: boolean): GoalView {
  if (view === 'org' && canManageOrgGoals) return 'org';
  if (view === 'company' && canViewCompanyGoals) return 'company';
  return 'my';
}

function getPageCopy(view: GoalView) {
  const copy: Record<GoalView, { title: string; subtitle: string }> = {
    my: {
      title: '내 목표',
      subtitle: '개인 목표를 작성하고, 가중치 100%를 맞춘 뒤 같은 화면에서 승인 요청까지 진행합니다.',
    },
    org: {
      title: '조직 목표 관리',
      subtitle: '조직 목표와 평가 기준을 만들고 팀원의 목표 승인 요청을 처리합니다.',
    },
    company: {
      title: '전사 목표 현황',
      subtitle: '특수 관리자 전용 화면입니다. 모든 조직의 목표를 목표 기간 기준으로 확인합니다.',
    },
  };
  return copy[view];
}
