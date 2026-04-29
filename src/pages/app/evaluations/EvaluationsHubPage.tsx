import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { App, Button, Card, Dropdown, Empty, Table, Tag, Typography } from 'antd';
import { Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  ArrowRightOutlined,
  CalendarOutlined,
  DownOutlined,
  EllipsisOutlined,
  FileTextOutlined,
  PlusOutlined,
  StarFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { EVALUATION_PAGE_KO as L } from '@/app/locale/app-ko';
import EvaluationAdminPage from '@/pages/app/EvaluationAdminPage';
import EvaluationFlowPage from '@/pages/app/EvaluationFlowPage';
import MyEvaluationResultV2Page from '@/pages/app/MyEvaluationResultV2Page';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import type { EvaluationDesign, EvaluationSeason, SeasonStatus, SeasonType } from '@/features/evaluation/model/types';
import { resultsPublishedTag, seasonStatusTag, seasonTypeBadge } from '@/features/evaluation/lib/evaluationLabels';
import { SeasonCreateModal } from '@/features/evaluation/ui/SeasonCreateModal';
import { DesignCreateModal } from '@/features/evaluation/ui/DesignCreateModal';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { AppInlinePillButton } from '@/shared/ui/AppInlinePillButton';
import { AppButton } from '@/shared/ui/AppButton';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { parseApiError } from '@/shared/api/error-parser';

const { Text } = Typography;
const SEASONS_PAGE_SIZE = 5;
const SECTION_CARD =
  'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

const STAGE_LABEL_FOR_PROGRESS: Record<string, string> = {
  SELF_PENDING: '자기평가 입력 필요',
  SELF_SUBMITTED: '자기평가 제출 완료',
  PEER_OPEN: '다면 의견 수집 중',
  UPWARD_OPEN: '다면 의견 수집 중',
  DOWNWARD_OPEN: '다면 의견 수집 중',
  CALIBRATION_OPEN: '리드 검토 중',
  CALIBRATION_LOCKED: '최종 확정 대기',
  CONFIRMED: '확정 완료',
  SKIPPED_LEAVER: '평가 제외',
};

type LatestPublishedResult = {
  seasonName: string;
  grade?: string;
  finalScore?: number | null;
  totalReceived: number;
  latestConfirmedAt?: string | null;
};

type EvaluationView = 'overview' | 'self' | 'results';

/** 운영 요약 카드 내부 탭(시즌 / 설계 / 평가 운영) */
type EvalHubAdminTab = 'seasons' | 'designs' | 'operations';

export function EvaluationsHubPage() {
  const { message, modal } = App.useApp();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    view?: EvaluationView;
    adminTab?: EvalHubAdminTab;
  };
  const canCreate = hasPermission(PERM.EVALUATION_CREATE);
  const canUpdate = hasPermission(PERM.EVALUATION_UPDATE);
  const canRead = hasPermission(PERM.EVALUATION_READ);
  const canManage = canCreate || canUpdate || canRead;

  const requestedView = search.view ?? 'overview';
  const activeView: EvaluationView =
    requestedView === 'self' || requestedView === 'results' || requestedView === 'overview'
      ? requestedView
      : 'overview';

  const [seasonCreateOpen, setSeasonCreateOpen] = useState(false);
  const [designCreateOpen, setDesignCreateOpen] = useState(false);
  const [editingDesign, setEditingDesign] = useState<EvaluationDesign | null>(null);
  const [seasonLimit, setSeasonLimit] = useState(SEASONS_PAGE_SIZE);
  const [adminTab, setAdminTab] = useState<EvalHubAdminTab>(() => {
    const t = search.adminTab;
    if (t === 'designs' || t === 'operations') return t;
    return 'seasons';
  });

  useEffect(() => {
    const next = search.adminTab;
    if (next === 'designs' || next === 'seasons' || next === 'operations') setAdminTab(next);
  }, [search.adminTab]);

  const { data: mySelf = [] } = useQuery({
    queryKey: ['eval-my-self-v2'],
    queryFn: () => evaluationRedesignApi.listMySelf(),
  });
  const { data: myReceivedResults = [] } = useQuery({
    queryKey: ['eval-my-received-v2'],
    queryFn: () => evaluationRedesignApi.listMyReceived(),
  });
  const { data: seasons = [] } = useQuery({
    queryKey: ['eval-seasons'],
    queryFn: async () => {
      const redesigned = await evaluationRedesignApi.listSeasons();
      return redesigned.map((s) => ({
        seasonId: s.seasonId,
        companyId: s.companyId,
        name: s.name,
        type: s.type,
        targetCycle: s.targetCycle,
        targetCycleStart: s.targetCycleStart,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
        resultPublishDate: s.resultPublishDate ?? undefined,
        resultsPublishedAt: s.resultsPublishedAt ?? undefined,
      })) as EvaluationSeason[];
    },
    enabled: canManage,
  });
  const { data: designs = [] } = useQuery<EvaluationDesign[]>({
    queryKey: ['eval-designs'],
    queryFn: () => evaluationRedesignApi.listDesigns(),
    enabled: canManage,
  });

  const invalidateSeasons = () => queryClient.invalidateQueries({ queryKey: ['eval-seasons'] });
  const invalidateDesigns = () => queryClient.invalidateQueries({ queryKey: ['eval-designs'] });

  const duplicateDesignMut = useMutation({
    mutationFn: (designId: string) => evaluationRedesignApi.duplicateDesign(designId),
    onSuccess: () => {
      message.success('평가 설계를 복제했습니다.');
      invalidateDesigns();
    },
    onError: (err) => message.error(parseApiError(err).message),
  });
  const deleteDesignMut = useMutation({
    mutationFn: (designId: string) => evaluationRedesignApi.deleteDesign(designId),
    onSuccess: () => {
      message.success('평가 설계를 삭제했습니다.');
      invalidateDesigns();
    },
    onError: (err) => message.error(parseApiError(err).message),
  });

  const inProgressResponses = useMemo(
    () => mySelf.filter((r) => r.stage !== 'CONFIRMED' && r.stage !== 'SKIPPED_LEAVER'),
    [mySelf],
  );
  const inProgressCount = inProgressResponses.length;
  const currentResponse = inProgressResponses[0] ?? null;

  const latestResult = useMemo<LatestPublishedResult | null>(() => {
    if (myReceivedResults.length === 0) return null;
    const top = [...myReceivedResults].sort((a, b) =>
      (b.confirmedAt ?? b.updatedAt ?? '').localeCompare(a.confirmedAt ?? a.updatedAt ?? ''),
    )[0];
    if (!top) return null;
    return {
      seasonName: top.seasonName ?? '최근 평가',
      grade: top.confirmedGrade ?? undefined,
      finalScore: top.finalScoreSnapshot ?? null,
      totalReceived: myReceivedResults.length,
      latestConfirmedAt: top.confirmedAt ?? top.updatedAt ?? null,
    };
  }, [myReceivedResults]);

  const sortedSeasons = useMemo(() => {
    const statusOrder: Record<SeasonStatus, number> = { ACTIVE: 0, DRAFT: 1, CLOSED: 2 };
    return [...seasons].sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return (b.startDate ?? '').localeCompare(a.startDate ?? '');
    });
  }, [seasons]);

  const visibleSeasons = sortedSeasons.slice(0, seasonLimit);
  const hasMoreSeasons = sortedSeasons.length > visibleSeasons.length;

  const seasonCols: ColumnsType<EvaluationSeason> = [
    {
      title: <ColHead>시즌 이름</ColHead>,
      dataIndex: 'name',
      key: 'name',
      render: (value: string, record) => (
        <div className="tw-flex tw-flex-col tw-gap-1">
          <Text strong className="tw-text-[15px] tw-text-slate-900">
            {value}
          </Text>
          <span className="tw-text-[11px] tw-text-slate-400">ID {record.seasonId.slice(0, 8)}</span>
        </div>
      ),
    },
    {
      title: <ColHead>유형</ColHead>,
      dataIndex: 'type',
      key: 'type',
      width: 90,
      render: (type: SeasonType) => seasonTypeBadge(type),
    },
    {
      title: <ColHead>대상 OKR</ColHead>,
      key: 'okr',
      width: 128,
      render: (_: unknown, record: EvaluationSeason) => (
        <span className="tw-text-sm tw-text-slate-700">
          {record.targetCycleStart ? (
            <>
              <span className="tw-block tw-font-medium tw-text-slate-900">
                {record.targetCycleStart}
              </span>
              {record.targetCycle ? (
                <span className="tw-text-[11px] tw-text-slate-400">{record.targetCycle}</span>
              ) : null}
            </>
          ) : (
            <span className="tw-text-slate-400">미지정</span>
          )}
        </span>
      ),
    },
    {
      title: <ColHead>운영 기간</ColHead>,
      key: 'period',
      width: 220,
      render: (_: unknown, record: EvaluationSeason) => (
        <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-sm tw-text-slate-700">
          <CalendarOutlined className="tw-text-slate-400" />
          {record.startDate} ~ {record.endDate}
        </span>
      ),
    },
    {
      title: <ColHead>상태</ColHead>,
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: SeasonStatus) => seasonStatusTag(status),
    },
    {
      title: <ColHead>결과 공개</ColHead>,
      dataIndex: 'resultsPublishedAt',
      key: 'resultsPublishedAt',
      width: 110,
      render: (value?: string) => resultsPublishedTag(value),
    },
    {
      title: '',
      key: 'actions',
      width: 72,
      align: 'right',
      render: (_: unknown, record) => (
        <AppButton
          variant="subtle"
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            navigate({
              to: '/app/evaluations/seasons/$seasonId',
              params: { seasonId: record.seasonId },
            });
          }}
        >
          상세 <ArrowRightOutlined />
        </AppButton>
      ),
    },
  ];

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-8">
      <AppWorkspacePageTitle
        eyebrow={L.workspaceEyebrow}
        title={L.pageTitle}
        subtitle="평가 진행, 공개 결과, 운영 작업을 한 화면 계열 안에서 이어서 처리합니다."
      />

      <Card className={SECTION_CARD} styles={{ body: { padding: 4 } }}>
        <Tabs
          activeKey={activeView}
          onChange={(next) => {
            const view: EvaluationView =
              next === 'self' || next === 'results' ? next : 'overview';
            navigate({
              to: '/app/evaluations',
              search: { view, adminTab: undefined },
              replace: true,
            });
          }}
          tabBarStyle={{ paddingLeft: 16, paddingRight: 16, marginBottom: 0 }}
          items={[
            {
              key: 'overview',
              label: '대시보드',
              children: (
                <div className="tw-px-4 tw-pb-4 tw-pt-2">
                  <OverviewSection
                    inProgressCount={inProgressCount}
                    currentResponse={currentResponse}
                    latestResult={latestResult}
                    navigate={navigate}
                  />
                </div>
              ),
            },
            {
              key: 'self',
              label: `내 평가${inProgressCount > 0 ? ` (${inProgressCount})` : ''}`,
              children: (
                <div className="tw-px-4 tw-pb-4 tw-pt-2">
                  <EvaluationFlowPage embedded />
                </div>
              ),
            },
            {
              key: 'results',
              label: `공개 결과${myReceivedResults.length > 0 ? ` (${myReceivedResults.length})` : ''}`,
              children: (
                <div className="tw-px-4 tw-pb-4 tw-pt-2">
                  <MyEvaluationResultV2Page embedded />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {canManage && (
        <div className="tw-space-y-4">
          <AppWorkspacePageTitle
            eyebrow={L.workspaceEyebrow}
            title="운영 요약"
            subtitle="시즌·설계·평가 운영을 탭으로 전환하며 이어서 확인합니다."
          />
          <Card className={SECTION_CARD} styles={{ body: { padding: 4 } }}>
            <EvaluationOpsSummarySection
              hubView={activeView}
              canCreate={canCreate}
              sortedSeasons={sortedSeasons}
              visibleSeasons={visibleSeasons}
              hasMoreSeasons={hasMoreSeasons}
              seasonLimit={seasonLimit}
              setSeasonLimit={setSeasonLimit}
              seasonCols={seasonCols}
              adminTab={adminTab}
              setAdminTab={setAdminTab}
              navigate={navigate}
              designs={designs}
              seasons={seasons}
              setSeasonCreateOpen={setSeasonCreateOpen}
              setDesignCreateOpen={setDesignCreateOpen}
              setEditingDesign={setEditingDesign}
              duplicateDesignMutate={duplicateDesignMut.mutate}
              deleteDesignMutateAsync={deleteDesignMut.mutateAsync}
              modal={modal}
            />
          </Card>
        </div>
      )}

      <SeasonCreateModal
        open={seasonCreateOpen}
        onClose={() => setSeasonCreateOpen(false)}
        onCreated={invalidateSeasons}
      />
      <DesignCreateModal
        open={designCreateOpen}
        onClose={() => {
          setDesignCreateOpen(false);
          setEditingDesign(null);
        }}
        onCreated={invalidateDesigns}
        initialDesign={editingDesign}
      />
    </div>
  );
}

function OverviewSection({
  inProgressCount,
  currentResponse,
  latestResult,
  navigate,
}: {
  inProgressCount: number;
  currentResponse: { stage?: string; seasonName?: string | null } | null;
  latestResult: LatestPublishedResult | null;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <div className="tw-space-y-8">
      <section className="tw-space-y-4">
        <div className="tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-2">
          <MyEvaluationCard
            inProgressCount={inProgressCount}
            currentStage={currentResponse?.stage}
            seasonName={currentResponse?.seasonName ?? null}
            onEnter={() => navigate({ to: '/app/evaluations', search: { view: 'self' } })}
          />
          <MyResultCard
            result={latestResult}
            onView={() => navigate({ to: '/app/evaluations', search: { view: 'results' } })}
          />
        </div>
      </section>
    </div>
  );
}

function EvaluationOpsSummarySection({
  hubView,
  canCreate,
  sortedSeasons,
  visibleSeasons,
  hasMoreSeasons,
  seasonLimit,
  setSeasonLimit,
  seasonCols,
  adminTab,
  setAdminTab,
  navigate,
  designs,
  seasons,
  setSeasonCreateOpen,
  setDesignCreateOpen,
  setEditingDesign,
  duplicateDesignMutate,
  deleteDesignMutateAsync,
  modal,
}: {
  hubView: EvaluationView;
  canCreate: boolean;
  sortedSeasons: EvaluationSeason[];
  visibleSeasons: EvaluationSeason[];
  hasMoreSeasons: boolean;
  seasonLimit: number;
  setSeasonLimit: (value: number) => void;
  seasonCols: ColumnsType<EvaluationSeason>;
  adminTab: EvalHubAdminTab;
  setAdminTab: (value: EvalHubAdminTab) => void;
  navigate: ReturnType<typeof useNavigate>;
  designs: EvaluationDesign[];
  seasons: EvaluationSeason[];
  setSeasonCreateOpen: (value: boolean) => void;
  setDesignCreateOpen: (value: boolean) => void;
  setEditingDesign: (value: EvaluationDesign | null) => void;
  duplicateDesignMutate: (designId: string) => void;
  deleteDesignMutateAsync: (designId: string) => Promise<unknown>;
  modal: ReturnType<typeof App.useApp>['modal'];
}) {
  return (
    <Tabs
      activeKey={adminTab}
      onChange={(next) => {
        const tab: EvalHubAdminTab =
          next === 'designs' ? 'designs' : next === 'operations' ? 'operations' : 'seasons';
        setAdminTab(tab);
        navigate({
          to: '/app/evaluations',
          search: { view: hubView, adminTab: tab },
          replace: true,
        });
      }}
      tabBarStyle={{ paddingLeft: 16, paddingRight: 16, marginBottom: 0 }}
      items={[
            {
              key: 'seasons',
              label: `시즌${seasons.length > 0 ? ` (${seasons.length})` : ''}`,
              children: (
                <div className="tw-space-y-3 tw-px-4 tw-pb-4 tw-pt-2">
                  <div className="tw-flex tw-items-center tw-justify-between">
                    <Text className="tw-text-xs tw-text-slate-500">
                      ACTIVE {sortedSeasons.filter((season) => season.status === 'ACTIVE').length} / DRAFT{' '}
                      {sortedSeasons.filter((season) => season.status === 'DRAFT').length} / CLOSED{' '}
                      {sortedSeasons.filter((season) => season.status === 'CLOSED').length}
                    </Text>
                    {canCreate && (
                      <AppButton variant="primary" icon={<PlusOutlined />} onClick={() => setSeasonCreateOpen(true)}>
                        새 시즌
                      </AppButton>
                    )}
                  </div>

                  {visibleSeasons.length === 0 ? (
                    <div className="tw-py-12">
                      <Empty
                        description={
                          <span className="tw-text-sm tw-text-slate-500">등록된 평가 시즌이 없습니다.</span>
                        }
                      />
                    </div>
                  ) : (
                    <Table<EvaluationSeason>
                      columns={seasonCols}
                      dataSource={visibleSeasons}
                      rowKey="seasonId"
                      size="middle"
                      pagination={false}
                      rowClassName="tw-cursor-pointer hover:tw-bg-slate-50/60"
                      onRow={(record) => ({
                        onClick: () =>
                          navigate({
                            to: '/app/evaluations/seasons/$seasonId',
                            params: { seasonId: record.seasonId },
                          }),
                      })}
                    />
                  )}

                  {hasMoreSeasons && (
                    <div className="tw-flex tw-justify-center tw-pt-1">
                      <AppInlinePillButton
                        onClick={() => setSeasonLimit(seasonLimit + SEASONS_PAGE_SIZE)}
                        className="tw-px-4 tw-py-1.5 tw-text-xs tw-font-semibold"
                      >
                        더 보기 <DownOutlined />
                      </AppInlinePillButton>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'designs',
              label: `설계${designs.length > 0 ? ` (${designs.length})` : ''}`,
              children: (
                <div className="tw-space-y-3 tw-px-4 tw-pb-4 tw-pt-2">
                  <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                    <Text className="tw-text-xs tw-text-slate-500">
                      시즌 생성에 사용하는 공통 평가 설계를 관리합니다.
                    </Text>
                    {canCreate && (
                      <AppButton
                        variant="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          setEditingDesign(null);
                          setDesignCreateOpen(true);
                        }}
                      >
                        새 설계
                      </AppButton>
                    )}
                  </div>

                  {designs.length === 0 ? (
                    <Card
                      className="tw-rounded-2xl tw-border tw-border-dashed tw-border-slate-300 tw-bg-slate-50/70"
                      styles={{ body: { padding: 28 } }}
                    >
                      <div className="tw-space-y-2 tw-text-center">
                        <FileTextOutlined className="tw-text-2xl tw-text-slate-300" />
                        <div className="tw-text-sm tw-font-semibold tw-text-slate-700">등록된 평가 설계가 없습니다.</div>
                        <div className="tw-text-xs tw-text-slate-500">
                          먼저 설계를 만들면 시즌 생성 시 바로 선택할 수 있습니다.
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <div className="tw-grid tw-grid-cols-1 tw-gap-3 lg:tw-grid-cols-2 xl:tw-grid-cols-3">
                      {designs.map((design) => {
                        const menuItems: MenuProps['items'] = [
                          {
                            key: 'edit',
                            label: '수정',
                            onClick: () => {
                              setEditingDesign(design);
                              setDesignCreateOpen(true);
                            },
                          },
                          {
                            key: 'duplicate',
                            label: '복제',
                            onClick: () => duplicateDesignMutate(design.designId),
                          },
                          {
                            key: 'delete',
                            danger: true,
                            label: '삭제',
                            onClick: () => {
                              modal.confirm({
                                title: '평가 설계를 삭제할까요?',
                                content: '삭제하면 되돌릴 수 없습니다.',
                                okText: '삭제',
                                okButtonProps: { danger: true },
                                cancelText: '취소',
                                onOk: () => deleteDesignMutateAsync(design.designId),
                              });
                            },
                          },
                        ];

                        return (
                          <Card key={design.designId} className={SECTION_CARD} styles={{ body: { padding: 16 } }}>
                            <div className="tw-flex tw-flex-col tw-gap-3">
                              <div className="tw-flex tw-items-start tw-justify-between tw-gap-2">
                                <div className="tw-min-w-0">
                                  <div className="tw-mb-1 tw-flex tw-items-center tw-gap-1.5">
                                    {design.defaultTemplate && (
                                      <Tag
                                        bordered={false}
                                        className="!tw-m-0 !tw-rounded-full !tw-bg-blue-50 !tw-px-2 !tw-py-0 !tw-text-[10px] !tw-font-bold !tw-text-blue-700"
                                      >
                                        기본
                                      </Tag>
                                    )}
                                    <Text className="!tw-text-[10px] !tw-font-semibold !tw-uppercase !tw-tracking-wide !tw-text-slate-400">
                                      {design.designVersion ?? 'v1'}
                                    </Text>
                                  </div>
                                  <div className="tw-truncate tw-text-[16px] tw-font-bold tw-leading-tight tw-text-slate-900">
                                    {design.name}
                                  </div>
                                </div>
                                <DropdownMenu items={menuItems} />
                              </div>
                              <div className="tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-slate-500">
                                <span>최근 수정</span>
                                <span className="tw-font-medium tw-text-slate-700">
                                  {design.updatedAt ? dayjs(design.updatedAt).format('YYYY-MM-DD') : '-'}
                                </span>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'operations',
              label: `평가 운영${seasons.length > 0 ? ` (${seasons.length})` : ''}`,
              children: (
                <div className="tw-px-4 tw-pb-4 tw-pt-2">
                  <EvaluationAdminPage embedded />
                </div>
              ),
            },
          ]}
    />
  );
}

function DropdownMenu({ items }: { items: MenuProps['items'] }) {
  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
      <Button
        type="text"
        icon={<EllipsisOutlined />}
        className="tw-text-slate-400 hover:tw-text-slate-700"
      />
    </Dropdown>
  );
}

function ColHead({ children }: { children: ReactNode }) {
  return <span className="tw-text-[12px] tw-font-semibold tw-text-slate-700">{children}</span>;
}

function MyEvaluationCard({
  inProgressCount,
  currentStage,
  seasonName,
  onEnter,
}: {
  inProgressCount: number;
  currentStage?: string;
  seasonName?: string | null;
  onEnter: () => void;
}) {
  const hasInProgress = inProgressCount > 0;

  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 24 } }}>
      <div className="tw-flex tw-h-full tw-flex-col tw-justify-between tw-gap-4">
        <div>
          <div className="tw-mb-2 tw-flex tw-items-center tw-gap-2">
            <span className="tw-flex tw-h-9 tw-w-9 tw-items-center tw-justify-center tw-rounded-xl tw-bg-blue-50 tw-text-blue-600">
              <FileTextOutlined />
            </span>
            <Text className="!tw-text-[12px] !tw-font-semibold !tw-uppercase !tw-tracking-wide !tw-text-slate-400">
              진행 중인 평가
            </Text>
          </div>
          {hasInProgress ? (
            <>
              <Text strong className="tw-block tw-text-[24px] tw-leading-tight tw-text-slate-900">
                {inProgressCount}건 진행 중
              </Text>
              <div className="tw-mt-2 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                {seasonName && (
                  <Tag
                    bordered={false}
                    className="!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-medium !tw-text-slate-700"
                  >
                    {seasonName}
                  </Tag>
                )}
                {currentStage && (
                  <Tag
                    bordered={false}
                    className="!tw-m-0 !tw-rounded-full !tw-bg-amber-50 !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold !tw-text-amber-700"
                  >
                    {STAGE_LABEL_FOR_PROGRESS[currentStage] ?? currentStage}
                  </Tag>
                )}
              </div>
            </>
          ) : (
            <>
              <Text strong className="tw-block tw-text-[20px] tw-leading-tight tw-text-slate-700">
                진행 중인 평가 없음
              </Text>
              <Text className="!tw-mt-1.5 !tw-block !tw-text-sm !tw-text-slate-500">
                시즌이 열리면 자기평가와 평가 권한 업무가 여기에 자동으로 모입니다.
              </Text>
            </>
          )}
        </div>
        <AppButton
          variant={hasInProgress ? 'primary' : 'subtle'}
          icon={<ArrowRightOutlined />}
          onClick={onEnter}
          disabled={!hasInProgress}
        >
          {hasInProgress ? '평가 진행하기' : '평가 대기 중'}
        </AppButton>
      </div>
    </Card>
  );
}

function MyResultCard({
  result,
  onView,
}: {
  result: LatestPublishedResult | null;
  onView: () => void;
}) {
  const empty = !result;

  return (
    <Card className={`${SECTION_CARD} tw-overflow-hidden`} styles={{ body: { padding: 0 } }}>
      <div
        className="tw-relative tw-px-6 tw-py-6 tw-text-white"
        style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2c4a73 60%, #3a5d8a 100%)',
        }}
      >
        <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between">
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-flex tw-h-9 tw-w-9 tw-items-center tw-justify-center tw-rounded-xl tw-bg-white/15 tw-text-white">
              <StarFilled />
            </span>
            <span className="tw-text-[12px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-white/70">
              공개된 결과
            </span>
          </div>
          {!empty && (
            <Tag
              bordered={false}
              className="!tw-m-0 !tw-rounded-full !tw-bg-white/15 !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-medium !tw-text-white"
            >
              총 {result.totalReceived}건
            </Tag>
          )}
        </div>

        <div className="tw-min-h-[92px]">
          {empty ? (
            <>
              <div className="tw-text-[20px] tw-font-bold tw-leading-tight">공개된 결과 없음</div>
              <div className="tw-mt-1.5 tw-text-sm tw-text-white/70">
                결과 공개가 끝난 시즌이 아직 없거나 확정 진행 중입니다.
              </div>
            </>
          ) : (
            <>
              <div className="tw-text-[40px] tw-font-bold tw-leading-none tw-tracking-tight">
                {result.grade ? result.grade : '공개됨'}
              </div>
              <div className="tw-mt-1.5 tw-text-sm tw-text-white/70">
                {result.seasonName}
                {result.finalScore != null ? ` · 최종 ${Number(result.finalScore).toFixed(1)}점` : ''}
              </div>
              {result.latestConfirmedAt ? (
                <div className="tw-mt-2 tw-text-[12px] tw-text-white/60">
                  최근 확정 {dayjs(result.latestConfirmedAt).format('YYYY-MM-DD')}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="tw-border-t tw-border-slate-100 tw-bg-white tw-px-6 tw-py-3">
        <button
          type="button"
          onClick={onView}
          disabled={empty}
          className={
            'tw-flex tw-w-full tw-items-center tw-justify-between tw-text-sm tw-font-semibold tw-transition-colors ' +
            (empty
              ? 'tw-cursor-not-allowed tw-text-slate-300'
              : 'tw-text-slate-900 hover:tw-text-[#1e3a5f]')
          }
        >
          <span>결과 상세 보기</span>
          <ArrowRightOutlined />
        </button>
      </div>
    </Card>
  );
}

export default EvaluationsHubPage;
