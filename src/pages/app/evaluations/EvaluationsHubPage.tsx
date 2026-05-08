import type { ReactNode } from 'react';
import {
  useEffect,
  useMemo,
  useState } from 'react';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import { useNavigate,
  useSearch } from '@tanstack/react-router';
import { App,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Tabs,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowRightOutlined,
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import EvaluationFlowPage from '@/pages/app/EvaluationFlowPage';
import { AppTabLabel } from '@/shared/ui/AppTabLabel';
import MyEvaluationResultV2Page from '@/pages/app/MyEvaluationResultV2Page';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import { pickDefaultSeasonFilter } from '@/features/evaluation/lib/defaultSeasonFilter';
import { resultsPublishedTag, seasonStatusTag, seasonTypeBadge } from '@/features/evaluation/lib/evaluationLabels';
import type { EvaluationSeason, SeasonStatus, SeasonType, UpdateSeasonPayload } from '@/features/evaluation/model/types';
import { SeasonCreateModal } from '@/features/evaluation/ui/SeasonCreateModal';
import { PERM, canManageOrganizationScopedGoals } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { AppButton } from '@/shared/ui/AppButton';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

import { AppDataTable } from '@/shared/ui/AppDataTable';

const { Text } = Typography;
const { RangePicker } = DatePicker;
const SEASONS_PAGE_SIZE = 8;
const SECTION_CARD = 'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

const SEASON_STATUS_ORDER: Record<SeasonStatus, number> = {
  SELF_EVAL: 0,
  MANAGER_EVAL: 1,
  GRADE_CONFIRM: 2,
  RESULT_PUBLISHED: 3,
  INTERVIEW: 4,
  DRAFT: 5,
  CLOSED: 6,
};

type EvalPageMode = 'my' | 'management';

export default function EvaluationsHubPage() {
  const { hasPermission } = usePermissions();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { view?: 'overview'; adminTab?: string };

  const canCreate = hasPermission(PERM.EVALUATION_CREATE);
  const canUpdate = hasPermission(PERM.EVALUATION_UPDATE);
  const canDelete = hasPermission(PERM.EVALUATION_DELETE);
  const canRead = hasPermission(PERM.EVALUATION_READ);
  const canManageGoals = canManageOrganizationScopedGoals(hasPermission);
  const canManage = canManageGoals && (canCreate || canUpdate || canRead);

  const activeMode: EvalPageMode = (() => {
    if (search.view === 'overview' && canManage) return 'management';
    return 'my';
  })();

  const [seasonCreateOpen, setSeasonCreateOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<EvaluationSeason | null>(null);
  const [seasonLimit, setSeasonLimit] = useState(SEASONS_PAGE_SIZE);

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

  const sortedSeasons = useMemo(() => {
    return [...seasons].sort((a, b) => {
      const orderDiff = SEASON_STATUS_ORDER[a.status] - SEASON_STATUS_ORDER[b.status];
      if (orderDiff !== 0) return orderDiff;
      return (b.startDate ?? '').localeCompare(a.startDate ?? '');
    });
  }, [seasons]);

  const visibleSeasons = sortedSeasons.slice(0, seasonLimit);
  const hasMoreSeasons = sortedSeasons.length > visibleSeasons.length;

  const deleteSeasonMut = useMutation({
    mutationFn: (seasonId: string) => evaluationRedesignApi.deleteSeason(seasonId),
    onSuccess: () => {
      message.success('평가 기간을 삭제했습니다.');
      void queryClient.invalidateQueries({ queryKey: ['eval-seasons'] });
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '평가 기간 삭제에 실패했습니다.'),
  });

  const seasonCols: ColumnsType<EvaluationSeason> = [
    {
      title: <ColHead>평가 기간</ColHead>,
      dataIndex: 'name',
      key: 'name',
      render: (value: string, record) => (
        <div className="tw-flex tw-flex-col tw-gap-1">
          <Text strong className="tw-text-[15px] tw-text-slate-900">{value}</Text>
          <span className="tw-text-[11px] tw-text-slate-400">ID {record.seasonId.slice(0, 8)}</span>
        </div>
      ),
    },
    {
      title: <ColHead>유형</ColHead>,
      dataIndex: 'type',
      key: 'type',
      width: 96,
      render: (type: SeasonType) => seasonTypeBadge(type),
    },
    {
      title: <ColHead>목표 기간</ColHead>,
      key: 'targetCycle',
      width: 138,
      render: (_: unknown, record) => (
        <span className="tw-text-sm tw-text-slate-700">
          {record.targetCycleStart ? (
            <>
              <span className="tw-block tw-font-medium tw-text-slate-900">{record.targetCycleStart}</span>
              {record.targetCycle ? <span className="tw-text-[11px] tw-text-slate-400">{record.targetCycle}</span> : null}
            </>
          ) : (
            <span className="tw-text-slate-400">미설정</span>
          )}
        </span>
      ),
    },
    {
      title: <ColHead>진행 기간</ColHead>,
      key: 'period',
      width: 220,
      render: (_: unknown, record) => (
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
      width: 128,
      render: (status: SeasonStatus) => seasonStatusTag(status),
    },
    {
      title: <ColHead>결과 공개</ColHead>,
      dataIndex: 'resultsPublishedAt',
      key: 'resultsPublishedAt',
      width: 120,
      render: (value?: string) => resultsPublishedTag(value),
    },
    {
      title: '',
      key: 'actions',
      width: 220,
      align: 'right',
      render: (_: unknown, record) => (
        <Space size={6} onClick={(event) => event.stopPropagation()}>
          {canUpdate && record.status === 'DRAFT' ? (
            <Tooltip title="수정">
              <Button
                size="small"
                icon={<EditOutlined />}
                aria-label={`${record.name} 평가 기간 수정`}
                onClick={() => setEditingSeason(record)}
              />
            </Tooltip>
          ) : null}
          {canDelete && record.status === 'DRAFT' ? (
            <Popconfirm
              title="평가 기간을 삭제할까요?"
              description="아직 시작 전인 평가만 삭제할 수 있으며, 자동 로드된 평가 대상자도 함께 정리됩니다."
              okText="삭제"
              cancelText="취소"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteSeasonMut.mutate(record.seasonId)}
            >
              <Tooltip title="삭제">
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  aria-label={`${record.name} 평가 기간 삭제`}
                  loading={deleteSeasonMut.isPending}
                />
              </Tooltip>
            </Popconfirm>
          ) : null}
          <AppButton
            variant="subtle"
            size="small"
            onClick={() => navigate({ to: '/app/evaluations/seasons/$seasonId', params: { seasonId: record.seasonId } })}
          >
            보기 <ArrowRightOutlined />
          </AppButton>
        </Space>
      ),
    },
  ];

  const pageTitle = activeMode === 'management' ? '평가 운영 관리' : '내 평가';
  const pageSubtitle =
    activeMode === 'management'
      ? '평가를 생성하고, 각 평가의 보기 화면에서 단계 전환과 운영 관리를 진행합니다.'
      : '이번 평가 기간에 내가 작성할 평가, 공개된 결과, 피드백 면담 흐름을 한 화면에서 확인합니다.';

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-6">
      <AppWorkspacePageTitle
        eyebrow="EVALUATION"
        title={pageTitle}
        subtitle={pageSubtitle}
        extra={canCreate && activeMode === 'management' ? (
          <AppButton icon={<PlusOutlined />} onClick={() => setSeasonCreateOpen(true)}>
            평가 생성
          </AppButton>
        ) : null}
      />

      {activeMode === 'my' ? <MyEvaluationHome /> : null}

      {canManage && activeMode === 'management' ? (
        <div className="tw-space-y-5">
          <Card className={SECTION_CARD} styles={{ body: { padding: 20 } }} title="평가 기간">
            <div className="tw-space-y-4">
              {visibleSeasons.length === 0 ? (
                <Empty description="생성된 평가가 없습니다." />
              ) : (
                <AppDataTable
                  rowKey="seasonId"
                  columns={seasonCols}
                  dataSource={visibleSeasons}
                  pagination={false}
                  onRow={(record) => ({
                    onClick: () => navigate({ to: '/app/evaluations/seasons/$seasonId', params: { seasonId: record.seasonId } }),
                    className: 'tw-cursor-pointer',
                  })}
                />
              )}
              {hasMoreSeasons ? (
                <div className="tw-flex tw-justify-center">
                  <Button onClick={() => setSeasonLimit((prev) => prev + SEASONS_PAGE_SIZE)}>더 보기</Button>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}

      <SeasonCreateModal
        open={seasonCreateOpen}
        onClose={() => setSeasonCreateOpen(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ['eval-seasons'] })}
      />
      <SeasonEditModal
        season={editingSeason}
        onClose={() => setEditingSeason(null)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['eval-seasons'] })}
      />
    </div>
  );
}

function MyEvaluationHome() {
  const selfQ = useQuery({
    queryKey: ['my-evaluation-home', 'self'],
    queryFn: () => evaluationRedesignApi.listMySelf(),
    staleTime: 60_000,
  });
  const evaluatorQ = useQuery({
    queryKey: ['my-evaluation-home', 'evaluator'],
    queryFn: () => evaluationRedesignApi.listMyEvaluatorAssignments(),
    staleTime: 60_000,
  });
  const resultsQ = useQuery({
    queryKey: ['my-evaluation-home', 'results'],
    queryFn: () => evaluationRedesignApi.listMyReceived(),
    staleTime: 60_000,
  });
  const [activeTab, setActiveTab] = useState<'write' | 'results'>('write');
  const [seasonFilter, setSeasonFilter] = useState('ALL');
  const [seasonFilterTouched, setSeasonFilterTouched] = useState(false);

  const selfItems = selfQ.data ?? [];
  const evaluatorItems = evaluatorQ.data ?? [];
  const resultItems = resultsQ.data ?? [];
  const allSeasonItems = useMemo(
    () => [...selfItems, ...evaluatorItems, ...resultItems],
    [evaluatorItems, resultItems, selfItems],
  );
  const seasonOptions = useMemo(() => {
    const map = new Map<string, string>();
    allSeasonItems.forEach((item) => {
      const key = item.seasonId ?? 'UNKNOWN';
      if (!map.has(key)) map.set(key, item.seasonName ?? '평가 기간 미지정');
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [allSeasonItems]);
  const filteredSelfItems = useMemo(
    () => filterBySeason(selfItems, seasonFilter),
    [seasonFilter, selfItems],
  );
  const filteredEvaluatorItems = useMemo(
    () => filterBySeason(evaluatorItems, seasonFilter),
    [evaluatorItems, seasonFilter],
  );
  const filteredResultItems = useMemo(
    () => filterBySeason(resultItems, seasonFilter),
    [resultItems, seasonFilter],
  );
  const writeCount =
    filteredSelfItems.filter((item) => item.stage === 'SELF_PENDING').length +
    filteredEvaluatorItems.filter((item) => item.stage !== 'CONFIRMED' && item.stage !== 'SKIPPED_LEAVER').length;
  const resultCount = filteredResultItems.filter((item) => !!item.resultsPublishedAt).length;

  useEffect(() => {
    if (seasonFilterTouched || allSeasonItems.length === 0) return;
    setSeasonFilter(pickDefaultSeasonFilter(allSeasonItems));
  }, [allSeasonItems, seasonFilterTouched]);

  return (
    <div className="tw-space-y-4">
      <Card className={SECTION_CARD} styles={{ body: { padding: 16 } }}>
        <div className="tw-flex tw-flex-col tw-gap-3 lg:tw-flex-row lg:tw-items-center lg:tw-justify-between">
          <div>
            <Text strong className="!tw-text-sm !tw-text-slate-900">
              평가 기간
            </Text>
            <div className="tw-mt-1 tw-text-xs tw-text-slate-500">
              선택한 평가 기간 기준으로 작성 대상과 공개 결과를 함께 필터링합니다.
            </div>
          </div>
          <Select
            value={seasonFilter}
            onChange={(value) => {
              setSeasonFilterTouched(true);
              setSeasonFilter(value);
            }}
            className="tw-w-full lg:tw-w-[320px]"
            options={[{ value: 'ALL', label: '전체 평가 기간' }, ...seasonOptions]}
          />
        </div>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'write' | 'results')}
        items={[
          {
            key: 'write',
            label: <AppTabLabel count={writeCount}>평가 작성</AppTabLabel>,
            children: (
              <EvaluationFlowPage
                embedded
                hideSeasonFilter
                externalSeasonFilter={seasonFilter}
              />
            ),
          },
          {
            key: 'results',
            label: <AppTabLabel count={resultCount}>평가 결과</AppTabLabel>,
            children: (
              <MyEvaluationResultV2Page
                embedded
                hideSeasonFilter
                externalSeasonFilter={seasonFilter}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function filterBySeason<T extends { seasonId?: string | null }>(items: T[], seasonFilter: string): T[] {
  if (seasonFilter === 'ALL') return items;
  return items.filter((item) => (item.seasonId ?? 'UNKNOWN') === seasonFilter);
}

function ColHead({ children }: { children: ReactNode }) {
  return <span className="tw-text-xs tw-font-semibold tw-text-slate-500">{children}</span>;
}

type SeasonEditFormValues = {
  name: string;
  period: [dayjs.Dayjs, dayjs.Dayjs];
  resultPublishDate?: dayjs.Dayjs;
};

function SeasonEditModal({
  season,
  onClose,
  onSaved,
}: {
  season: EvaluationSeason | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<SeasonEditFormValues>();
  const open = !!season;

  useEffect(() => {
    if (!season) return;
    form.setFieldsValue({
      name: season.name,
      period: [dayjs(season.startDate), dayjs(season.endDate)],
      resultPublishDate: season.resultPublishDate ? dayjs(season.resultPublishDate) : undefined,
    });
  }, [form, season]);

  const updateMut = useMutation({
    mutationFn: ({ seasonId, body }: { seasonId: string; body: UpdateSeasonPayload }) =>
      evaluationRedesignApi.updateSeason(seasonId, body),
    onSuccess: () => {
      message.success('평가를 수정했습니다.');
      onSaved();
      onClose();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '평가 수정에 실패했습니다.'),
  });

  return (
    <AppDoubleActionModal
      title="평가 수정"
      open={open}
      onClose={onClose}
      onConfirm={() => form.submit()}
      width={560}
      destroyOnHidden
      cancelText="취소"
      confirmText="저장"
      confirmLoading={updateMut.isPending}
    >
      <Form<SeasonEditFormValues>
        form={form}
        layout="vertical"
        className="tw-px-5 tw-py-4"
        onFinish={(values) => {
          if (!season) return;
          updateMut.mutate({
            seasonId: season.seasonId,
            body: {
              name: values.name,
              startDate: values.period[0].format('YYYY-MM-DD'),
              endDate: values.period[1].format('YYYY-MM-DD'),
              resultPublishDate: values.resultPublishDate?.format('YYYY-MM-DD'),
            },
          });
        }}
      >
        <Form.Item name="name" label="평가명" rules={[{ required: true, message: '평가명을 입력해 주세요.' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="period" label="평가 진행 기간" rules={[{ required: true, message: '진행 기간을 선택해 주세요.' }]}>
          <RangePicker className="tw-w-full" />
        </Form.Item>
        <Form.Item name="resultPublishDate" label="결과 공개 예정일">
          <DatePicker className="tw-w-full" allowClear />
        </Form.Item>
        <div className="tw-rounded-xl tw-bg-slate-50 tw-p-3 tw-text-xs tw-text-slate-500">
          평가 기준 목표 기간은 평가 기준이므로 수정하지 않습니다. 목표 기간을 바꿔야 한다면 시작 전인 평가를 삭제하고 새로 생성하세요.
        </div>
      </Form>
    </AppDoubleActionModal>
  );
}
