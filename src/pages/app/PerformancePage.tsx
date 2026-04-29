import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { App as AntdApp, Alert, Card, Input, List, Progress, Select, Space, Tabs, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuth } from '@/features/auth/useAuth';
import { PERM, canManageOrganizationScopedGoals } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { approvalApi } from '@/features/approval/api/approvalApi';
import type { GoalApprovalBundle } from '@/features/approval/model/types';
import { ApprovalQueueList } from '@/features/approval/ui/ApprovalQueueList';
import { BundleDetailModal } from '@/features/approval/ui/BundleDetailModal';
import { goalApi } from '@/features/goals/api/goalApi';
import type { Goal, KpiCycle } from '@/features/goals/model/types';
import { memberApi } from '@/features/member/api/memberApi';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { SingleMemberOrgChartSelectModal } from '@/features/members/ui/SingleMemberOrgChartSelectModal';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { GoalCard } from '@/features/goals/ui/GoalCard';
import { GoalEditModal } from '@/features/goals/ui/GoalEditModal';
import { OrganizationPickerInput } from '@/features/goals/ui/OrganizationPickerInput';
import { AppButton } from '@/shared/ui/AppButton';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const { Text } = Typography;
const SECTION_CARD = 'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

function buildOrganizationNameMap(
  organizations: Array<{ organizationId: string; name: string; children?: unknown[] }> | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (nodes: Array<{ organizationId: string; name: string; children?: unknown[] }>) => {
    nodes.forEach((node) => {
      map.set(node.organizationId, node.name);
      walk((node.children ?? []) as typeof nodes);
    });
  };
  walk(organizations ?? []);
  return map;
}

type PerformanceTab = 'my-objective' | 'integrated';

function resolveEnabledTab(
  enabledTabs: PerformanceTab[],
  candidate?: PerformanceTab,
): PerformanceTab {
  if (candidate && enabledTabs.includes(candidate)) return candidate;
  return enabledTabs[0] ?? 'my-objective';
}

export default function PerformancePage() {
  const { user } = useAuth();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { view?: PerformanceTab };
  const { hasPermission } = usePermissions();
  const canReadCompany = hasPermission(PERM.GOAL_READ);
  const canReadOrganization = hasPermission(PERM.ORGANIZATION_READ);
  /** 조직 목표 작성·상세 수정 권한은 백엔드 TEAM/COMPANY CREATE·UPDATE 정책과 맞춘다. */
  const canManageOrgObjectives = canManageOrganizationScopedGoals(hasPermission);
  const showObjectiveCreate = canManageOrgObjectives;

  const enabledTabs = useMemo<PerformanceTab[]>(() => {
    const tabs: PerformanceTab[] = ['my-objective'];
    if (canReadCompany || canReadOrganization) tabs.push('integrated');
    return tabs;
  }, [canReadCompany, canReadOrganization]);

  const [tab, setTab] = useState<PerformanceTab>(resolveEnabledTab(enabledTabs, search.view as PerformanceTab | undefined));
  const [editOpen, setEditOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [presetAlignedOrgGoalId, setPresetAlignedOrgGoalId] = useState<string | null>(null);
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<GoalApprovalBundle | null>(null);
  const [defaultOwnerType, setDefaultOwnerType] = useState<'MEMBER' | 'ORGANIZATION'>('MEMBER');

  useEffect(() => {
    if (!enabledTabs.includes(tab)) {
      setTab(resolveEnabledTab(enabledTabs));
    }
  }, [enabledTabs, tab]);

  useEffect(() => {
    const next = resolveEnabledTab(enabledTabs, search.view as PerformanceTab | undefined);
    if (next !== tab) {
      setTab(next);
    }
  }, [enabledTabs, search.view, tab]);

  const { data: myBundlesForKrGuard = [] } = useQuery({
    queryKey: ['my-bundles'],
    queryFn: () => approvalApi.listMyRequested(),
  });
  const cycleHasPendingApproval = useMemo(() => {
    const set = new Set<string>();
    myBundlesForKrGuard.forEach((b) => {
      if (b.status === 'PENDING') set.add(b.cycleKey);
    });
    return (cycleKey: string) => set.has(cycleKey);
  }, [myBundlesForKrGuard]);

  const openEditWithGuard = useCallback(
    (goal: Goal) => {
      if (goal.ownerType === 'MEMBER') {
        if (goal.status !== 'DRAFT') {
          message.warning('승인 대기 중이거나 완료된 개인 목표는 수정할 수 없어요.');
          return;
        }
        if (cycleHasPendingApproval(goal.cycleKey)) {
          message.warning('승인 요청이 진행 중인 사이클의 개인 목표는 수정할 수 없어요.');
          return;
        }
      }
      setEditGoal(goal);
      setPresetAlignedOrgGoalId(null);
      setDefaultOwnerType(goal.ownerType);
      setEditOpen(true);
    },
    [cycleHasPendingApproval, message],
  );

  const openCreateKrFromObjective = useCallback(
    (objective: Goal) => {
      if (cycleHasPendingApproval(objective.cycleKey)) {
        message.warning('승인 요청이 진행 중인 사이클에는 개인 목표를 추가할 수 없어요.');
        return;
      }
      setEditGoal(null);
      setDefaultOwnerType('MEMBER');
      setPresetAlignedOrgGoalId(objective.goalId);
      setEditOpen(true);
    },
    [cycleHasPendingApproval, message],
  );

  if (!user) return null;

  const tabItems = [
    {
      key: 'my-objective',
      label: '내 조직 목표',
      children: (
        <div className="tw-px-4 tw-pb-4 tw-pt-2">
          <MyObjectivesTab
            onEdit={openEditWithGuard}
            onOpenDetail={setDetailGoal}
            onCreateKrFromObjective={openCreateKrFromObjective}
          />
        </div>
      ),
    },
    ...(canReadCompany || canReadOrganization
      ? [
          {
            key: 'integrated',
            label: '전사+구성원 개인 목표',
            children: (
              <div className="tw-px-4 tw-pb-4 tw-pt-2">
                <IntegratedGoalsTab
                  canReadCompany={canReadCompany}
                  onOpenDetail={setDetailGoal}
                  onCreateKrFromObjective={openCreateKrFromObjective}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-10">
      <AppWorkspacePageTitle
        eyebrow="PERFORMANCE"
        title="목표"
        subtitle="내 개인 목표와 우리 조직의 조직 목표, 그리고 전사 공개 목표를 한 곳에서 관리할 수 있어요."
        extra={
          <Space>
            {showObjectiveCreate && (
              <AppButton
                variant="secondary"
                onClick={() => {
                  setEditGoal(null);
                  setPresetAlignedOrgGoalId(null);
                  setDefaultOwnerType('ORGANIZATION');
                  setEditOpen(true);
                }}
              >
                조직 목표 작성
              </AppButton>
            )}
            <AppButton
              variant="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditGoal(null);
                setPresetAlignedOrgGoalId(null);
                setDefaultOwnerType('MEMBER');
                setEditOpen(true);
              }}
            >
              개인 목표 작성
            </AppButton>
          </Space>
        }
      />

      <Card className={SECTION_CARD} styles={{ body: { padding: 4 } }}>
        <Tabs
          activeKey={tab}
          onChange={(next) => {
            if (!enabledTabs.includes(next as PerformanceTab)) return;
            setTab(next as PerformanceTab);
            navigate({
              to: '/app/performance',
              search: { view: next as PerformanceTab },
              replace: true,
            });
          }}
          tabBarStyle={{ paddingLeft: 16, paddingRight: 16, marginBottom: 0 }}
          items={tabItems}
        />
      </Card>

      <section className="tw-space-y-4">
        <div>
          <Text strong className="tw-text-[16px] tw-text-slate-900">승인 센터</Text>
          <div className="tw-mt-1 tw-text-sm tw-text-slate-500">
            사이클 단위로 묶인 목표 승인 요청을 한 곳에서 처리하고, 내가 올린 요청 이력도 확인할 수 있어요.
          </div>
        </div>
        <Card className={SECTION_CARD} styles={{ body: { padding: 4 } }}>
          <Tabs
            tabBarStyle={{ paddingLeft: 16, paddingRight: 16, marginBottom: 0 }}
            items={[
              {
                key: 'queue',
                label: '결재 처리',
                children: (
                  <div className="tw-px-4 tw-pb-4 tw-pt-2">
                    <ApprovalQueueList onSelect={setSelectedBundle} />
                  </div>
                ),
              },
              {
                key: 'history',
                label: '내 요청 이력',
                children: (
                  <div className="tw-px-4 tw-pb-4 tw-pt-2">
                    <RequestedHistory onSelect={setSelectedBundle} />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </section>

      <GoalEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        goal={editGoal}
        defaultOwnerId={user.id}
        defaultOwnerType={defaultOwnerType}
        presetAlignedOrgGoalId={presetAlignedOrgGoalId}
      />
      <BundleDetailModal
        open={!!selectedBundle}
        bundle={selectedBundle}
        onClose={() => setSelectedBundle(null)}
        currentUserId={user.id}
      />
      <GoalDetailModal
        goal={detailGoal}
        myBundles={myBundlesForKrGuard}
        onClose={() => setDetailGoal(null)}
        onEdit={(goal) => {
          setDetailGoal(null);
          openEditWithGuard(goal);
        }}
        canEditObjective={canManageOrgObjectives}
      />
    </div>
  );
}

function MyObjectivesTab({
  onEdit,
  onOpenDetail,
  onCreateKrFromObjective,
}: {
  onEdit?: (goal: Goal) => void;
  onOpenDetail: (goal: Goal) => void;
  onCreateKrFromObjective: (objective: Goal) => void;
}) {
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [selectedCycleKey, setSelectedCycleKey] = useState('');
  const { data: objectives = [], isLoading } = useQuery({
    queryKey: ['goals-my-objectives'],
    queryFn: () => goalApi.listMyObjectives(),
  });
  const cycleOptions = useMemo(
    () =>
      Array.from(new Set(objectives.map((goal) => goal.cycleKey)))
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a))
        .map((cycleKey) => ({ value: cycleKey, label: cycleKey })),
    [objectives],
  );
  const selectedCycleObjectives = useMemo(
    () => objectives.filter((goal) => goal.cycleKey === selectedCycleKey),
    [objectives, selectedCycleKey],
  );
  const { data: myGoals = [] } = useQuery({
    queryKey: ['goals-mine'],
    queryFn: () => goalApi.listMyGoals(),
  });
  const { data: myBundles = [] } = useQuery({
    queryKey: ['my-bundles'],
    queryFn: () => approvalApi.listMyRequested(),
  });
  const { data: orgChart } = useQuery({
    queryKey: ['organization-org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
  });
  const orgNameMap = useMemo(() => buildOrganizationNameMap(orgChart?.organizations), [orgChart]);
  const requestTargetKrs = useMemo(() => {
    if (!selectedCycleKey) return [];
    return myGoals
      .filter(
        (goal) =>
          goal.ownerType === 'MEMBER' &&
          goal.cycleKey === selectedCycleKey &&
          (goal.status === 'DRAFT' || goal.status === 'PENDING'),
      )
      .sort((a, b) => (b.weightPct || 0) - (a.weightPct || 0));
  }, [myGoals, selectedCycleKey]);
  const selectedCycleApprovedBundle = useMemo(
    () => myBundles.find((bundle) => bundle.cycleKey === selectedCycleKey && bundle.status === 'APPROVED') ?? null,
    [myBundles, selectedCycleKey],
  );
  const selectedCyclePendingBundle = useMemo(
    () => myBundles.find((bundle) => bundle.cycleKey === selectedCycleKey && bundle.status === 'PENDING') ?? null,
    [myBundles, selectedCycleKey],
  );
  const showKrDraftActions = !selectedCycleApprovedBundle && !selectedCyclePendingBundle;
  const approvedCycleKrs = useMemo(() => {
    if (!selectedCycleKey) return [];
    return myGoals
      .filter(
        (goal) =>
          goal.ownerType === 'MEMBER' &&
          goal.cycleKey === selectedCycleKey &&
          (goal.status === 'ACTIVE' || goal.status === 'COMPLETED'),
      )
      .sort((a, b) => (b.weightPct || 0) - (a.weightPct || 0));
  }, [myGoals, selectedCycleKey]);
  const cycleKrList = selectedCycleApprovedBundle ? approvedCycleKrs : requestTargetKrs;
  const deleteMut = useMutation({
    mutationFn: (goalId: string) => goalApi.deleteGoal(goalId),
    onSuccess: () => {
      message.success('개인 목표를 삭제했어요.');
      queryClient.invalidateQueries({ queryKey: ['goals-mine'] });
      queryClient.invalidateQueries({ queryKey: ['goals-my-objectives'] });
      queryClient.invalidateQueries({ queryKey: ['my-bundles'] });
    },
    onError: (error: any) => message.error(error?.message ?? '개인 목표 삭제에 실패했어요.'),
  });

  useEffect(() => {
    const firstCycleOption = cycleOptions[0];
    if (!selectedCycleKey && firstCycleOption) {
      setSelectedCycleKey(String(firstCycleOption.value));
      return;
    }
    if (selectedCycleKey && !cycleOptions.some((option) => option.value === selectedCycleKey)) {
      setSelectedCycleKey(String(firstCycleOption?.value ?? ''));
    }
  }, [cycleOptions, selectedCycleKey]);

  const cycleKrCount = selectedCycleApprovedBundle ? approvedCycleKrs.length : requestTargetKrs.length;

  return (
    <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-gap-4">
      <div className="tw-grid tw-min-h-0 tw-flex-1 tw-gap-4 lg:tw-grid-cols-[320px_1fr]">
        <Card className="tw-h-fit tw-border-slate-200/80 tw-shadow-sm" styles={{ body: { padding: 12 } }}>
          <aside className="tw-bg-white lg:tw-sticky lg:tw-top-4 lg:tw-self-start">
            <div className="tw-mb-2 tw-mt-4 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500">
              {selectedCycleApprovedBundle ? '승인 완료 개인 목표 목록' : '승인 요청 대상 개인 목표'}
            </div>
            <div className="tw-flex tw-flex-col tw-gap-2">
              {cycleKrList.length === 0 ? (
                <div className="tw-rounded-xl tw-border tw-border-dashed tw-border-slate-200 tw-bg-slate-50 tw-p-3 tw-text-xs tw-text-slate-500">
                  {selectedCycleApprovedBundle
                    ? '선택한 사이클에 승인 완료된 개인 목표가 없어요.'
                    : '선택한 사이클에 승인 요청 대상 개인 목표가 없어요.'}
                </div>
              ) : (
                cycleKrList.map((goal) => (
                  <div
                    key={goal.goalId}
                    className="tw-cursor-pointer tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-3 hover:tw-border-slate-300 hover:tw-bg-slate-50"
                    onClick={() => onOpenDetail(goal)}
                  >
                    <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">{goal.title}</div>
                    <div className="tw-mt-1 tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-slate-500">
                      <span>
                        {selectedCycleApprovedBundle
                          ? goal.status === 'COMPLETED'
                            ? '완료'
                            : '승인 완료'
                          : goal.status === 'PENDING'
                            ? '승인 대기'
                            : '작성 중'}
                      </span>
                      <span>가중치 {goal.weightPct}%</span>
                    </div>
                    {showKrDraftActions && (
                      <div className="tw-mt-2 tw-flex tw-gap-1.5">
                        <AppButton
                          variant="secondary"
                          size="small"
                          className="!tw-h-7 !tw-rounded-lg !tw-px-2.5 !tw-text-xs !tw-font-semibold"
                          disabled={!onEdit || goal.status !== 'DRAFT' || deleteMut.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit?.(goal);
                          }}
                        >
                          수정
                        </AppButton>
                        <AppButton
                          variant="danger"
                          size="small"
                          className="!tw-h-7 !tw-rounded-lg !tw-px-2.5 !tw-text-xs !tw-font-semibold"
                          disabled={goal.status !== 'DRAFT'}
                          loading={deleteMut.isPending}
                          onClick={(event) => {
                            event.stopPropagation();
                            modal.confirm({
                              title: '개인 목표 삭제',
                              content: '삭제한 개인 목표는 복구할 수 없어요. 계속할까요?',
                              onOk: () => deleteMut.mutate(goal.goalId),
                            });
                          }}
                        >
                          삭제
                        </AppButton>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            {selectedCycleKey && !selectedCycleApprovedBundle && (
              <div className="tw-mt-3 tw-border-t tw-border-slate-100 tw-pt-3">
                <CycleSubmissionQuickPanel
                  cycleKey={selectedCycleKey}
                  goals={myGoals}
                  bundles={myBundles}
                />
              </div>
            )}
          </aside>
        </Card>

        <Card className="tw-min-w-0 tw-border-slate-200/80 tw-shadow-sm" styles={{ body: { padding: 12 } }}>
          <div className="tw-min-w-0 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-4">
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
              <span className="tw-text-sm tw-text-slate-500">기준 사이클</span>
              <Select
                value={selectedCycleKey || undefined}
                style={{ width: 188 }}
                options={cycleOptions}
                onChange={setSelectedCycleKey}
                showSearch
                optionFilterProp="label"
                placeholder="사이클 선택"
              />
              <span className="tw-ml-2 tw-text-sm tw-text-slate-500">
                {selectedCycleApprovedBundle ? '승인 완료 개인 목표' : '승인 대상 개인 목표'}
              </span>
              <span className="tw-rounded-lg tw-bg-slate-100 tw-px-2.5 tw-py-1 tw-text-sm tw-font-semibold tw-text-slate-800">
                {cycleKrCount}건
              </span>
            </div>
            <div className="tw-mt-4 tw-min-w-0 tw-overflow-x-auto wf-scrollbar">
              <div className="tw-min-w-[800px]">
                {!isLoading && objectives.length === 0 ? (
                  <AppEmptyIllustrated description="소속 조직에 등록된 조직 목표가 아직 없어요. 조직 목표가 생기면 그 기준과 연결된 개인 목표를 여기서 함께 볼 수 있어요." />
                ) : selectedCycleObjectives.length > 0 ? (
                  <Space direction="vertical" size={10} className="tw-w-full">
                    {selectedCycleObjectives.map((objective, index) => (
                      <ObjectiveDrilldownCard
                        key={objective.goalId}
                        goal={objective}
                        onOpenDetail={onOpenDetail}
                        onCreateKr={() => onCreateKrFromObjective(objective)}
                        showHeader={index === 0}
                        organizationDisplayName={orgNameMap.get(objective.ownerId)}
                        disableCreateKr={!!selectedCyclePendingBundle}
                      />
                    ))}
                  </Space>
                ) : (
                  <AppEmptyIllustrated description="선택한 사이클의 조직 목표가 없어요." />
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function IntegratedGoalsTab({
  canReadCompany,
  onOpenDetail,
  onCreateKrFromObjective,
}: {
  canReadCompany: boolean;
  onOpenDetail: (goal: Goal) => void;
  onCreateKrFromObjective: (objective: Goal) => void;
}) {
  const [selectedCycleKey, setSelectedCycleKey] = useState('');
  const [orgFilter, setOrgFilter] = useState('ALL');
  const [objectiveKeyword, setObjectiveKeyword] = useState('');
  const [krKeyword, setKrKeyword] = useState('');
  const { data: companyGoals = [], isLoading } = useQuery({
    queryKey: ['goals-company-all'],
    queryFn: () => goalApi.listCompanyGoals(),
    enabled: canReadCompany,
  });
  const { data: orgChart } = useQuery({
    queryKey: ['organization-org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
  });
  const objectives = useMemo(
    () => companyGoals.filter((goal) => goal.ownerType === 'ORGANIZATION'),
    [companyGoals],
  );
  const memberGoals = useMemo(
    () => companyGoals.filter((goal) => goal.ownerType === 'MEMBER'),
    [companyGoals],
  );
  const cycleOptions = useMemo(
    () =>
      Array.from(new Set(companyGoals.map((goal) => goal.cycleKey)))
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a))
        .map((cycleKey) => ({ value: cycleKey, label: cycleKey })),
    [companyGoals],
  );
  const selectedCycleObjectives = useMemo(
    () => objectives.filter((goal) => goal.cycleKey === selectedCycleKey),
    [objectives, selectedCycleKey],
  );
  const orgNameMap = useMemo(() => buildOrganizationNameMap(orgChart?.organizations), [orgChart]);
  const memberIds = useMemo(
    () => Array.from(new Set(memberGoals.map((goal) => goal.ownerId).filter(Boolean))),
    [memberGoals],
  );
  const { data: memberProfiles = [] } = useQuery({
    queryKey: ['members-detail-by-goals', memberIds],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(memberIds.map((id) => memberApi.detailOrNull(id)));
      return rows.filter((row): row is NonNullable<typeof row> => !!row);
    },
  });
  const memberMetaMap = useMemo(() => {
    const map = new Map<string, { name: string; organizationName: string; jobGradeName: string }>();
    memberProfiles.forEach((profile) => {
      map.set(profile.memberId, {
        name: profile.name || '-',
        organizationName: profile.organizationName || '-',
        jobGradeName: profile.jobGradeName || profile.jobTitleName || '-',
      });
    });
    return map;
  }, [memberProfiles]);
  const orgOptions = useMemo(() => {
    const options = Array.from(orgNameMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: 'ALL', label: '전체 조직' }, ...options];
  }, [orgNameMap]);
  const childrenByObjective = useMemo(() => {
    const map = new Map<string, Goal[]>();
    memberGoals.forEach((goal) => {
      if (goal.cycleKey !== selectedCycleKey || !goal.alignedOrgGoalId) return;
      if (!map.has(goal.alignedOrgGoalId)) map.set(goal.alignedOrgGoalId, []);
      map.get(goal.alignedOrgGoalId)!.push(goal);
    });
    map.forEach((goals) => goals.sort((a, b) => (b.weightPct || 0) - (a.weightPct || 0)));
    return map;
  }, [memberGoals, selectedCycleKey]);
  const filteredObjectives = useMemo(() => {
    const objectiveQ = objectiveKeyword.trim().toLowerCase();
    const krQ = krKeyword.trim().toLowerCase();
    return selectedCycleObjectives.filter((objective) => {
      if (orgFilter !== 'ALL' && objective.ownerId !== orgFilter) return false;
      if (objectiveQ) {
        const hay = `${objective.title} ${objective.description}`.toLowerCase();
        if (!hay.includes(objectiveQ)) return false;
      }
      const children = childrenByObjective.get(objective.goalId) || [];
      if (!krQ) return true;
      return children.some((kr) => `${kr.title} ${kr.description}`.toLowerCase().includes(krQ));
    });
  }, [childrenByObjective, krKeyword, objectiveKeyword, orgFilter, selectedCycleObjectives]);

  useEffect(() => {
    const firstCycleOption = cycleOptions[0];
    if (!selectedCycleKey && firstCycleOption) {
      setSelectedCycleKey(String(firstCycleOption.value));
      return;
    }
    if (selectedCycleKey && !cycleOptions.some((option) => option.value === selectedCycleKey)) {
      setSelectedCycleKey(String(firstCycleOption?.value ?? ''));
    }
  }, [cycleOptions, selectedCycleKey]);

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <div className="tw-grid tw-grid-cols-1 tw-gap-3 lg:tw-grid-cols-4">
        <Select
          value={selectedCycleKey || undefined}
          options={cycleOptions}
          onChange={setSelectedCycleKey}
          showSearch
          optionFilterProp="label"
          placeholder="기준 사이클"
        />
        <Select value={orgFilter} options={orgOptions} onChange={setOrgFilter} showSearch optionFilterProp="label" />
        <Input value={objectiveKeyword} onChange={(event) => setObjectiveKeyword(event.target.value)} placeholder="조직 목표 필터" />
        <Input value={krKeyword} onChange={(event) => setKrKeyword(event.target.value)} placeholder="개인 목표 필터" />
      </div>
      {!isLoading && filteredObjectives.length === 0 ? (
        <AppEmptyIllustrated description="조건에 맞는 조직 목표나 개인 목표가 없어요." />
      ) : (
        <div className="tw-min-w-0 tw-overflow-x-auto wf-scrollbar">
          <div className="tw-min-w-[800px]">
        <Space direction="vertical" size={10} className="tw-w-full">
          {filteredObjectives.map((objective, index) => {
            const children = childrenByObjective.get(objective.goalId) || [];
            const krQ = krKeyword.trim().toLowerCase();
            const filteredChildren = children.filter((kr) => {
              if (krQ && !`${kr.title} ${kr.description}`.toLowerCase().includes(krQ)) return false;
              if (orgFilter === 'ALL') return true;
              const meta = memberMetaMap.get(kr.ownerId);
              const krOrg = meta?.organizationName || '-';
              const selectedLabel = orgNameMap.get(orgFilter) || krOrg;
              return krOrg === selectedLabel || objective.ownerId === orgFilter;
            });
            return (
              <ObjectiveDrilldownCard
                key={objective.goalId}
                goal={objective}
                onOpenDetail={onOpenDetail}
                onCreateKr={() => onCreateKrFromObjective(objective)}
                showHeader={index === 0}
                prefetchedChildren={filteredChildren}
                organizationDisplayName={orgNameMap.get(objective.ownerId)}
                childOwnerColumnLabel={(child) => memberMetaMap.get(child.ownerId)?.name?.trim() || '구성원'}
              />
            );
          })}
        </Space>
          </div>
        </div>
      )}
    </div>
  );
}

function CycleSubmissionQuickPanel({
  cycleKey,
  goals,
  bundles,
}: {
  cycleKey: string;
  goals: Goal[];
  bundles: GoalApprovalBundle[];
}) {
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [approverId, setApproverId] = useState('');
  const [approverName, setApproverName] = useState('');
  const [approverPickerOpen, setApproverPickerOpen] = useState(false);

  const cycleGoals = useMemo(
    () => goals.filter((goal) => goal.cycleKey === cycleKey && (goal.status === 'DRAFT' || goal.status === 'PENDING')),
    [cycleKey, goals],
  );
  const krGoals = useMemo(() => cycleGoals.filter((goal) => goal.ownerType === 'MEMBER'), [cycleGoals]);
  const sumWeight = useMemo(() => krGoals.reduce((total, goal) => total + (goal.weightPct || 0), 0), [krGoals]);
  const pendingBundle = useMemo(
    () => bundles.find((bundle) => bundle.cycleKey === cycleKey && bundle.status === 'PENDING'),
    [bundles, cycleKey],
  );
  const lastRejected = useMemo(
    () =>
      bundles
        .filter((bundle) => bundle.cycleKey === cycleKey && bundle.status === 'REJECTED')
        .sort((a, b) => b.revision - a.revision)[0],
    [bundles, cycleKey],
  );
  const submittable = krGoals.length > 0 && sumWeight === 100;

  const submitMut = useMutation({
    mutationFn: () =>
      approvalApi.submitCycle(cycleKey, {
        approverId: approverId || null,
        watcherIds: [],
      }),
    onSuccess: () => {
      message.success('승인 요청을 등록했어요.');
      invalidate();
    },
    onError: (error: any) => message.error(error?.message ?? '승인 요청 등록에 실패했어요.'),
  });

  const withdrawMut = useMutation({
    mutationFn: () => approvalApi.withdraw(pendingBundle!.bundleId),
    onSuccess: () => {
      message.success('승인 요청을 회수했어요.');
      invalidate();
    },
    onError: (error: any) => message.error(error?.message ?? '요청 회수에 실패했어요.'),
  });

  return (
    <div className="tw-space-y-3">
      <div className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500">승인 요청</div>
      <div className="tw-rounded-xl tw-bg-slate-50 tw-p-3">
        <div className="tw-mb-1 tw-flex tw-items-center tw-justify-between">
          <span className="tw-text-xs tw-text-slate-500">개인 목표 가중치 합</span>
          <span className={sumWeight === 100 ? 'tw-text-xs tw-font-semibold tw-text-emerald-600' : 'tw-text-xs tw-font-semibold tw-text-rose-600'}>
            {sumWeight}/100
          </span>
        </div>
        <Progress percent={Math.min(sumWeight, 100)} showInfo={false} strokeWidth={6} />
      </div>

      {!pendingBundle && (
        <div className="tw-flex tw-items-center tw-gap-2">
          <Input
            readOnly
            size="small"
            className="!tw-rounded-lg"
            placeholder="승인자 자동 매핑 (선택 가능)"
            value={approverId ? ((approverName || '선택된 구성원') + ' (' + approverId + ')') : ''}
          />
          <AppButton
            variant="secondary"
            size="small"
            className="!tw-h-8 !tw-rounded-lg !tw-px-3 !tw-text-xs !tw-font-semibold"
            onClick={() => setApproverPickerOpen(true)}
          >
                선택
          </AppButton>
        </div>
      )}

      {pendingBundle ? (
        <AppButton
          variant="danger"
          className="tw-w-full"
          loading={withdrawMut.isPending}
          onClick={() =>
            modal.confirm({
              title: '승인 요청 회수',
              content: '회수하면 현재 사이클의 개인 목표가 다시 DRAFT 상태로 돌아갑니다.',
              onOk: () => withdrawMut.mutate(),
            })
          }
        >
            요청 회수
        </AppButton>
      ) : (
        <AppButton variant="primary" className="tw-w-full" disabled={!submittable} loading={submitMut.isPending} onClick={() => submitMut.mutate()}>
          일괄 승인 요청
        </AppButton>
      )}

      {lastRejected && (
        <Alert
          type="warning"
          showIcon
          className="!tw-rounded-xl"
          message={`반려 이력 (revision ${lastRejected.revision})`}
          description={lastRejected.lastRejectedReason ?? '반려 사유가 없어요.'}
        />
      )}

      <SingleMemberOrgChartSelectModal
        open={approverPickerOpen}
        title="승인자 선택"
        selectedMemberId={approverId || undefined}
        onClose={() => setApproverPickerOpen(false)}
        onSelect={(member) => {
          setApproverId(member.memberId);
          setApproverName(`${member.name} 쨌 ${member.organizationName} 쨌 ${member.jobGradeName}`);
          setApproverPickerOpen(false);
        }}
      />
    </div>
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['goals-mine'] });
    queryClient.invalidateQueries({ queryKey: ['my-bundles'] });
  }
}

function CompanyGoalsTab() {
  const [cycle, setCycle] = useState<KpiCycle | undefined>();
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'OBJECTIVE' | 'KR'>('ALL');
  const { data: goals = [], isLoading } = useQuery({
    queryKey: ['goals-company', cycle],
    queryFn: () => goalApi.listCompanyGoals({ cycle }),
  });

  const filtered = useMemo(() => {
    if (typeFilter === 'OBJECTIVE') return goals.filter((goal) => goal.ownerType === 'ORGANIZATION');
    if (typeFilter === 'KR') return goals.filter((goal) => goal.ownerType === 'MEMBER');
    return goals;
  }, [goals, typeFilter]);

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <div className="tw-flex tw-flex-wrap tw-gap-2">
        <FilterChip active={typeFilter === 'ALL'} onClick={() => setTypeFilter('ALL')}>전체</FilterChip>
        <FilterChip active={typeFilter === 'OBJECTIVE'} onClick={() => setTypeFilter('OBJECTIVE')}>조직 목표</FilterChip>
        <FilterChip active={typeFilter === 'KR'} onClick={() => setTypeFilter('KR')}>개인 목표</FilterChip>
      </div>
      <CycleFilterRow cycle={cycle} onChange={setCycle} />
      {!isLoading && filtered.length === 0 ? (
        <AppEmptyIllustrated description="조건에 맞는 목표가 없어요." />
      ) : (
        <Space direction="vertical" size={4} className="tw-w-full">
          {filtered.map((goal) => (
            <GoalCard key={goal.goalId} goal={goal} />
          ))}
        </Space>
      )}
    </div>
  );
}

function MemberKrTab() {
  const [orgId, setOrgId] = useState('');
  const { data: objectives = [] } = useQuery({
    queryKey: ['goals-org-objectives', orgId],
    queryFn: () => goalApi.listOrgObjectives({ orgId }),
    enabled: !!orgId,
  });
  const { data: krs = [], isLoading } = useQuery({
    queryKey: ['goals-org', orgId],
    queryFn: () => goalApi.listOrgGoals({ orgId }),
    enabled: !!orgId,
  });

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <OrganizationPickerInput value={orgId} onChange={setOrgId} />
      {!orgId ? (
        <AppEmptyIllustrated description="구성원 개인 목표를 보려면 조직을 먼저 선택해 주세요." />
      ) : (
        <>
          <Card
            className={SECTION_CARD}
            styles={{ body: { padding: 20 } }}
            title={<Text strong className="tw-text-[15px] tw-text-slate-900">조직 목표</Text>}
          >
            {objectives.length === 0 ? (
              <AppEmptyIllustrated description="선택한 조직에 등록된 조직 목표가 없어요." />
            ) : (
              <Space direction="vertical" size={4} className="tw-w-full">
                {objectives.map((goal) => (
                  <GoalCard key={goal.goalId} goal={goal} />
                ))}
              </Space>
            )}
          </Card>

          <Card
            className={SECTION_CARD}
            styles={{ body: { padding: 20 } }}
            title={<Text strong className="tw-text-[15px] tw-text-slate-900">구성원 개인 목표</Text>}
          >
            {!isLoading && krs.length === 0 ? (
              <AppEmptyIllustrated description="선택한 조직의 개인 목표가 없어요." />
            ) : (
              <Space direction="vertical" size={4} className="tw-w-full">
                {krs.map((goal) => (
                  <GoalCard key={goal.goalId} goal={goal} showOwnerName />
                ))}
              </Space>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const OBJECTIVE_DRILLDOWN_GRID =
  'tw-grid tw-w-full tw-grid-cols-[minmax(220px,1fr)_96px_96px_120px_96px_120px] tw-items-center tw-gap-2';

function ObjectiveDrilldownCard({
  goal,
  onOpenDetail,
  onCreateKr,
  showHeader = false,
  prefetchedChildren,
  childOwnerColumnLabel,
  organizationDisplayName,
  disableCreateKr = false,
}: {
  goal: Goal;
  onOpenDetail: (goal: Goal) => void;
  onCreateKr: () => void;
  showHeader?: boolean;
  /** 통합 목록 화면에서는 필요할 때 자식 개인 목표 목록을 프리패치해서 사용한다. */
  prefetchedChildren?: Goal[];
  childOwnerColumnLabel?: (child: Goal) => string;
  organizationDisplayName?: string;
  disableCreateKr?: boolean;
}) {
  const usePrefetch = prefetchedChildren !== undefined;
  const [expanded, setExpanded] = useState(false);
  const { data: fetchedChildren = [], isLoading } = useQuery({
    queryKey: ['goal-children', goal.goalId],
    queryFn: () => goalApi.listObjectiveChildren(goal.goalId),
    enabled: expanded && !usePrefetch,
  });
  const children = usePrefetch ? prefetchedChildren : fetchedChildren;
  const childrenLoading = expanded && !usePrefetch && isLoading;
  const statusText = (status: Goal['status']) => {
    if (status === 'DRAFT') return '작성 중';
    if (status === 'PENDING') return '승인 대기';
    if (status === 'ACTIVE') return '진행 중';
    if (status === 'COMPLETED') return '완료';
    if (status === 'CANCELLED') return '취소';
    if (status === 'SKIPPED') return '제외';
    return status;
  };
  const statusToneClass = (status: Goal['status']) => {
    if (status === 'DRAFT') return '!tw-bg-slate-100 !tw-text-slate-700';
    if (status === 'PENDING') return '!tw-bg-amber-50 !tw-text-amber-700';
    if (status === 'ACTIVE') return '!tw-bg-emerald-50 !tw-text-emerald-700';
    if (status === 'COMPLETED') return '!tw-bg-blue-50 !tw-text-blue-700';
    if (status === 'CANCELLED') return '!tw-bg-rose-50 !tw-text-rose-700';
    return '!tw-bg-orange-50 !tw-text-orange-700';
  };

  return (
    <div className="tw-overflow-hidden tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-white">
      {showHeader && (
        <div
          className={`${OBJECTIVE_DRILLDOWN_GRID} tw-border-b tw-border-slate-200/80 tw-bg-slate-50 tw-px-4 tw-py-2 tw-text-[11px] tw-font-semibold tw-tracking-wide tw-text-slate-500`}
        >
          <div className="tw-pl-0.5">제목</div>
          <div className="tw-text-left">대상</div>
          <div className="tw-text-left">사이클</div>
          <div className="tw-text-left">종료일</div>
          <div className="tw-text-left">가중치</div>
          <div className="tw-text-right">작업</div>
        </div>
      )}
      <div className={`${OBJECTIVE_DRILLDOWN_GRID} tw-px-4 tw-py-3`}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpenDetail(goal)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onOpenDetail(goal);
          }}
          className="tw-flex tw-min-w-0 tw-items-center tw-gap-2 tw-text-left"
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
            aria-label={expanded ? '연결된 개인 목표 접기' : '연결된 개인 목표 펼치기'}
            className="tw-inline-flex tw-h-5 tw-w-5 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-md tw-border tw-border-slate-200 tw-bg-white tw-text-slate-500 tw-transition-colors hover:tw-bg-slate-50"
          >
            {expanded ? <DownOutlined className="tw-text-[10px]" /> : <RightOutlined className="tw-text-[10px]" />}
          </button>
          <Tag bordered={false} className={`!tw-m-0 !tw-rounded-full !tw-px-2 !tw-py-0 !tw-text-[10px] !tw-font-semibold ${statusToneClass(goal.status)}`}>
            {statusText(goal.status)}
          </Tag>
          <span className="tw-truncate tw-text-[15px] tw-font-semibold tw-text-slate-900">{goal.title}</span>
        </div>
        <div
          className="tw-min-w-0 tw-truncate tw-text-xs tw-text-slate-700"
          title={
            goal.ownerType === 'ORGANIZATION'
              ? (organizationDisplayName?.trim() || undefined)
              : undefined
          }
        >
          {goal.ownerType === 'ORGANIZATION'
            ? organizationDisplayName?.trim() || '-'
            : '개인'}
        </div>
        <div className="tw-text-xs tw-text-slate-700">{goal.cycleKey || '-'}</div>
        <div className="tw-text-xs tw-text-slate-700">{goal.cycleEndDate ? goal.cycleEndDate.slice(0, 10) : '-'}</div>
        <div
          className={
            goal.ownerType === 'ORGANIZATION'
              ? 'tw-text-xs tw-font-semibold tw-text-slate-500'
              : 'tw-text-xs tw-font-semibold tw-leading-none tw-text-[#1e3a5f]'
          }
        >
          {goal.ownerType === 'ORGANIZATION' ? (
            '-'
          ) : (
            <>
              {goal.weightPct ?? 0}
              <span className="tw-ml-0.5 tw-text-xs tw-font-semibold tw-text-slate-400">%</span>
            </>
          )}
        </div>
        <div className="tw-flex tw-items-center tw-justify-end tw-gap-1.5" onClick={(event) => event.stopPropagation()}>
          <AppButton
            variant="text"
            size="small"
            className="!tw-h-7 !tw-rounded-lg !tw-px-2.5 !tw-text-xs !tw-font-semibold"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetail(goal);
            }}
          >
            상세
          </AppButton>
          <AppButton
            variant="secondary"
            size="small"
            icon={<PlusOutlined />}
            disabled={disableCreateKr}
            onClick={(event) => {
              event.stopPropagation();
              onCreateKr();
            }}
            aria-label="개인 목표 작성"
            title={
              disableCreateKr ? '승인 요청이 진행 중인 사이클에는 개인 목표를 추가할 수 없어요.' : '개인 목표 작성'
            }
            className="tw-h-8 tw-w-8 !tw-rounded-full !tw-p-0"
          />
        </div>
      </div>
      {expanded && (
        <div className="tw-border-t tw-border-slate-200/80 tw-bg-slate-50/40">
          {childrenLoading ? (
            <div className="tw-p-4 tw-text-sm tw-text-slate-500">연결된 개인 목표를 불러오는 중이에요.</div>
          ) : children.length === 0 ? (
            <div className="tw-p-4 tw-text-sm tw-text-slate-500">이 조직 목표에 연결된 개인 목표가 없어요.</div>
          ) : (
            children.map((child, index) => (
              <div
                key={child.goalId}
                role="button"
                tabIndex={0}
                onClick={() => onOpenDetail(child)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onOpenDetail(child);
                }}
                className={`${OBJECTIVE_DRILLDOWN_GRID} tw-cursor-pointer tw-px-4 tw-py-2.5 tw-text-left tw-transition-colors hover:tw-bg-slate-100/70 ${index > 0 ? 'tw-border-t tw-border-slate-200/70' : ''}`}
              >
                <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-2 tw-pl-7">
                  <span className="tw-inline-flex tw-h-4 tw-min-w-4 tw-items-center tw-justify-center tw-rounded tw-bg-slate-200 tw-px-1 tw-text-[10px] tw-font-semibold tw-text-slate-700">
                    {index + 1}
                  </span>
                  <Tag bordered={false} className={`!tw-m-0 !tw-rounded-full !tw-px-2 !tw-py-0 !tw-text-[10px] !tw-font-semibold ${statusToneClass(child.status)}`}>
                    {statusText(child.status)}
                  </Tag>
                  <span className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-900">{child.title}</span>
                </div>
                <div className="tw-text-xs tw-text-slate-700">
                  {childOwnerColumnLabel
                    ? childOwnerColumnLabel(child)
                    : child.ownerType === 'ORGANIZATION'
                      ? '조직'
                      : '개인'}
                </div>
                <div className="tw-text-xs tw-text-slate-700">{child.cycleKey || '-'}</div>
                <div className="tw-text-xs tw-text-slate-700">{child.cycleEndDate ? child.cycleEndDate.slice(0, 10) : '-'}</div>
                <div className="tw-text-xs tw-font-semibold tw-leading-none tw-text-[#1e3a5f]">
                  {child.weightPct ?? 0}
                  <span className="tw-ml-0.5 tw-text-xs tw-font-semibold tw-text-slate-400">%</span>
                </div>
                <div className="tw-flex tw-items-center tw-justify-end" onClick={(event) => event.stopPropagation()}>
                  <AppButton
                    variant="text"
                    size="small"
                    className="!tw-h-7 !tw-rounded-lg !tw-px-2.5 !tw-text-xs !tw-font-semibold"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDetail(child);
                    }}
                  >
                    상세
                  </AppButton>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function GoalDetailModal({
  goal,
  myBundles,
  onClose,
  onEdit,
  canEditObjective,
}: {
  goal: Goal | null;
  myBundles: GoalApprovalBundle[];
  onClose: () => void;
  onEdit: (goal: Goal) => void;
  canEditObjective: boolean;
}) {
  const canEditInModal =
    !!goal &&
    (goal.ownerType === 'MEMBER'
      ? goal.status === 'DRAFT' &&
        !myBundles.some((b) => b.cycleKey === goal.cycleKey && b.status === 'PENDING')
      : goal.ownerType === 'ORGANIZATION' && canEditObjective);
  const confirmText = goal?.ownerType === 'MEMBER' ? '개인 목표 수정' : '조직 목표 수정';
  return (
    <AppDoubleActionModal
      open={!!goal}
      title={goal ? ((goal.ownerType === 'ORGANIZATION' ? '조직 목표' : '개인 목표') + ' 상세') : '상세'}
      onClose={onClose}
      onConfirm={() => {
        if (goal && canEditInModal) onEdit(goal);
      }}
      cancelText="닫기"
      confirmText={confirmText}
      confirmDisabled={!canEditInModal}
      width={860}
      destroyOnHidden
    >
      {goal ? (
        <div className="tw-space-y-4 tw-px-5 tw-py-4">
          <GoalCard goal={goal} />
          <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-4">
            <div className="tw-mb-2 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-500">설명</div>
            <div className="tw-whitespace-pre-wrap tw-text-sm tw-text-slate-700">{goal.description || '-'}</div>
          </div>
          <div className="tw-grid tw-grid-cols-2 tw-gap-3">
            <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3">
              <div className="tw-text-xs tw-text-slate-500">사이클</div>
              <div className="tw-mt-1 tw-text-sm tw-font-semibold tw-text-slate-900">{goal.cycleKey}</div>
            </div>
            <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3">
              <div className="tw-text-xs tw-text-slate-500">{goal.ownerType === 'ORGANIZATION' ? '공개 범위' : '가중치'}</div>
              <div className="tw-mt-1 tw-text-sm tw-font-semibold tw-text-slate-900">
                {goal.ownerType === 'ORGANIZATION' ? goal.visibility : `${goal.weightPct}%`}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppDoubleActionModal>
  );
}

function RequestedHistory({ onSelect }: { onSelect: (bundle: GoalApprovalBundle) => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['my-bundles'],
    queryFn: () => approvalApi.listMyRequested(),
  });
  const ids = data.flatMap(
    (bundle) => [bundle.approverId, bundle.delegateApproverId].filter(Boolean) as string[],
  );
  useMemberDisplayNames(ids);

  if (!isLoading && data.length === 0) {
    return <AppEmptyIllustrated description="요청한 승인 이력이 없어요." />;
  }

  return (
    <List
      loading={isLoading}
      dataSource={data}
      renderItem={(bundle) => (
        <List.Item
          className="tw-cursor-pointer hover:tw-bg-slate-50 !tw-px-3 !tw-rounded-xl"
          onClick={() => onSelect(bundle)}
        >
          <List.Item.Meta
            title={
              <div className="tw-flex tw-items-center tw-gap-2 tw-flex-wrap">
                <Tag
                  color={statusColor(bundle.status)}
                  className="!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold"
                >
                  {statusLabel(bundle.status)}
                </Tag>
                <Tag
                  bordered={false}
                  className="!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-medium !tw-text-slate-700"
                >
                  {bundle.cycleKey}
                </Tag>
                {bundle.revision > 1 && (
                  <Tag
                    bordered={false}
                    className="!tw-m-0 !tw-rounded-full !tw-bg-amber-50 !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-medium !tw-text-amber-700"
                  >
                    재상신 r{bundle.revision}
                  </Tag>
                )}
              </div>
            }
            description={
              <Text className="!tw-text-sm !tw-text-slate-500">
                목표 {bundle.goalIds.length}개 · 가중치 {bundle.weightSumSnapshot}% ·{' '}
                {bundle.requestedAt && new Date(bundle.requestedAt).toLocaleString('ko-KR')}
              </Text>
            }
          />
        </List.Item>
      )}
    />
  );
}

function statusColor(status: GoalApprovalBundle['status']) {
  switch (status) {
    case 'PENDING': return 'gold';
    case 'APPROVED': return 'green';
    case 'REJECTED': return 'red';
    case 'WITHDRAWN': return 'default';
  }
}

function statusLabel(status: GoalApprovalBundle['status']) {
  switch (status) {
    case 'PENDING': return '대기';
    case 'APPROVED': return '승인';
    case 'REJECTED': return '반려';
    case 'WITHDRAWN': return '회수';
  }
}

function CycleFilterRow({ cycle, onChange }: { cycle?: KpiCycle; onChange: (cycle?: KpiCycle) => void }) {
  return (
    <div className="tw-flex tw-flex-wrap tw-gap-2">
      <FilterChip active={!cycle} onClick={() => onChange(undefined)}>전체 사이클</FilterChip>
      <FilterChip active={cycle === 'QUARTERLY'} onClick={() => onChange('QUARTERLY')}>분기</FilterChip>
      <FilterChip active={cycle === 'HALF_YEARLY'} onClick={() => onChange('HALF_YEARLY')}>반기</FilterChip>
      <FilterChip active={cycle === 'YEARLY'} onClick={() => onChange('YEARLY')}>연간</FilterChip>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'tw-h-9 tw-rounded-full tw-border-0 tw-bg-[#1e3a5f] tw-px-4 tw-text-sm tw-font-semibold tw-text-white hover:tw-bg-[#152a45]'
          : 'tw-h-9 tw-rounded-full tw-border tw-border-slate-200 tw-bg-white tw-px-4 tw-text-sm tw-font-medium tw-text-slate-700 hover:tw-border-[#2563EB]/30 hover:tw-bg-[#EFF6FF] hover:tw-text-[#2563EB]'
      }
    >
      {children}
    </button>
  );
}

