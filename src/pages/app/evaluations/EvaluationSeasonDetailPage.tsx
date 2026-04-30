import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Alert, App, Button, Card, Progress, Space, Tag, Typography } from 'antd';
import { CalendarOutlined, CheckCircleOutlined, SoundOutlined, StopOutlined, UsergroupAddOutlined, WarningOutlined } from '@ant-design/icons';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import type { EvaluationDesign, EvaluationSeason } from '@/features/evaluation/model/types';
import { GroupsSection } from '@/features/evaluation/ui/GroupsSection';
import { GroupCreateModal } from '@/features/evaluation/ui/GroupCreateModal';
import { computeSeasonActivationReadiness } from '@/features/evaluation/lib/seasonActivationReadiness';
import { SeasonActivationButton } from '@/features/evaluation/ui/SeasonActivationButton';
import { goalApi } from '@/features/goals/api/goalApi';
import type { GoalSeasonReadinessIssue } from '@/features/goals/model/types';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { DetailPageHeader } from '@/shared/ui/DetailPageHeader';
import { parseApiError } from '@/shared/api/error-parser';

const { Text, Title } = Typography;

export function EvaluationSeasonDetailPage() {
  const { message } = App.useApp();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { seasonId } = useParams({ strict: false }) as { seasonId: string };
  const canUpdate = hasPermission(PERM.EVALUATION_UPDATE);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);

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
  });

  const season = useMemo(() => seasons.find((s) => s.seasonId === seasonId), [seasons, seasonId]);

  const { data: designs = [] } = useQuery<EvaluationDesign[]>({
    queryKey: ['eval-designs'],
    queryFn: () => evaluationRedesignApi.listDesigns(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['eval-groups', seasonId],
    queryFn: () => evaluationRedesignApi.listGroups(seasonId),
    enabled: !!seasonId,
  });

  const { data: goalReadiness, isLoading: goalReadinessLoading } = useQuery({
    queryKey: ['season-goal-readiness', seasonId],
    queryFn: () => goalApi.getSeasonReadiness(seasonId),
    enabled: !!seasonId && !!season && canUpdate && season.status === 'DRAFT',
  });

  const startReadiness = useMemo(() => computeSeasonActivationReadiness(groups), [groups]);
  const goalBlockReason =
    goalReadiness && !goalReadiness.ready ? '목표/성과 점검에서 차단 이슈를 먼저 해결해 주세요.' : '';
  const activationReady = startReadiness.ready && (goalReadiness?.ready ?? true);
  const activationBlockReason = !startReadiness.ready ? startReadiness.reason : goalBlockReason;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['eval-seasons'] });
    void queryClient.invalidateQueries({ queryKey: ['eval-groups', seasonId] });
    void queryClient.invalidateQueries({ queryKey: ['eval-designs'] });
    void queryClient.invalidateQueries({ queryKey: ['season-goal-readiness', seasonId] });
  };

  const closeSeasonMut = useMutation({
    mutationFn: () => evaluationRedesignApi.closeSeason(seasonId),
    onSuccess: () => {
      message.success('시즌이 종료되었습니다.');
      invalidate();
    },
    onError: (err) => message.error(parseApiError(err).message),
  });

  const publishResultsMut = useMutation({
    mutationFn: () => evaluationRedesignApi.publishSeason(seasonId),
    onSuccess: () => {
      message.success('결과를 공개했습니다.');
      invalidate();
    },
    onError: (err) => message.error(parseApiError(err).message),
  });

  if (!season) {
    return (
      <div className="tw-mx-auto tw-w-full tw-space-y-4">
        <DetailPageHeader
          backTo="/app/evaluations"
          backLabel="평가 운영"
          title="시즌 상세"
          subtitle="시즌 정보를 불러오는 중이거나 접근 권한이 없습니다."
          showShare={false}
        />
        <Card>
          <Text type="secondary">시즌 정보를 불러오는 중이거나 접근 권한이 없습니다.</Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-5">
      <DetailPageHeader
        backTo="/app/evaluations"
        backLabel="평가 운영"
        title="시즌 상세"
        subtitle="시즌, 그룹, 평가자, 목표 점검 상태를 관리합니다."
        showShare
      />

      <Card
        className="tw-rounded-3xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
        styles={{ body: { padding: 24 } }}
      >
        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
          <Tag color={season.status === 'ACTIVE' ? 'green' : season.status === 'DRAFT' ? 'blue' : 'default'}>
            {season.status}
          </Tag>
          <Tag color={season.resultsPublishedAt ? 'purple' : 'default'}>
            {season.resultsPublishedAt ? '결과 공개됨' : '결과 미공개'}
          </Tag>
        </div>
        <Title level={2} className="!tw-mt-3 !tw-mb-2">
          {season.name}
        </Title>
        <div className="tw-flex tw-flex-col tw-gap-1.5 tw-text-sm tw-text-slate-500">
          <span className="tw-inline-flex tw-items-center tw-gap-1.5">
            <CalendarOutlined />
            평가 운영 {season.startDate} ~ {season.endDate}
          </span>
          {season.targetCycleStart ? (
            <span className="tw-text-xs tw-text-slate-600">
              대상 목표 시작일 <strong className="tw-text-slate-800">{season.targetCycleStart}</strong>
              {season.targetCycle ? <span className="tw-text-slate-400"> · {season.targetCycle}</span> : null}
            </span>
          ) : null}
          {season.resultPublishDate ? (
            <span className="tw-inline-flex tw-items-center tw-gap-1.5">
              <SoundOutlined />
              결과 공개 예정 {season.resultPublishDate}
            </span>
          ) : null}
        </div>

        {canUpdate && season.status === 'DRAFT' && !activationReady ? (
          <Alert
            type="warning"
            showIcon
            className="tw-mt-4"
            message="시즌 활성화 전 준비가 필요합니다."
            description={activationBlockReason}
          />
        ) : null}

        {canUpdate ? (
          <div className="tw-mt-4 tw-flex tw-flex-wrap tw-gap-2">
            {season.status === 'DRAFT' ? (
              <SeasonActivationButton
                seasonId={seasonId}
                disabled={!activationReady}
                disabledTooltip={!activationReady ? activationBlockReason : undefined}
              />
            ) : null}
            {season.status === 'ACTIVE' && !season.resultsPublishedAt ? (
              <Button
                type="primary"
                icon={<SoundOutlined />}
                loading={publishResultsMut.isPending}
                onClick={() => publishResultsMut.mutate()}
                className="!tw-h-9 !tw-rounded-full !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-4 !tw-text-sm !tw-font-semibold hover:!tw-bg-[#152a45]"
              >
                결과 공개
              </Button>
            ) : null}
            {season.status === 'ACTIVE' ? (
              <Button
                danger
                icon={<StopOutlined />}
                loading={closeSeasonMut.isPending}
                onClick={() => closeSeasonMut.mutate()}
                className="!tw-h-9 !tw-rounded-full !tw-px-4 !tw-text-sm !tw-font-semibold"
              >
                시즌 종료
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>

      {canUpdate && season.status === 'DRAFT' ? (
        <SeasonGoalReadinessPanel
          loading={goalReadinessLoading}
          readiness={goalReadiness}
        />
      ) : null}

      <Alert
        type="info"
        showIcon
        message="시즌 활성화 해석"
        description="퇴사, 휴직 등 평가 제외자는 활성화 시점에 자동 제외됩니다. 반대로 개인 목표 없음, 가중치 불일치, 승인 대기, Lead 미지정은 시즌 활성화를 막는 차단 이슈입니다."
      />

      <Card
        title={
          <span className="tw-inline-flex tw-items-center tw-gap-1.5">
            <UsergroupAddOutlined /> 그룹 & 평가자
          </span>
        }
        className="tw-rounded-2xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
        extra={
          <Space>
            <Button onClick={() => navigate({ to: '/app/evaluations', search: { view: 'self' } })}>
              개인 평가 화면
            </Button>
            <Button type="primary" onClick={() => setGroupCreateOpen(true)}>
              그룹 추가
            </Button>
          </Space>
        }
      >
        <GroupsSection
          groups={groups}
          designs={designs}
          selectedSeasonId={seasonId}
          seasonStatus={season.status}
          onAddGroup={() => setGroupCreateOpen(true)}
          onInvalidate={invalidate}
        />
      </Card>

      <GroupCreateModal
        open={groupCreateOpen}
        onClose={() => setGroupCreateOpen(false)}
        seasonId={seasonId}
        designs={designs}
        onCreated={invalidate}
      />
    </div>
  );
}

function SeasonGoalReadinessPanel({
  loading,
  readiness,
}: {
  loading: boolean;
  readiness?: Awaited<ReturnType<typeof goalApi.getSeasonReadiness>>;
}) {
  const completeCount = readiness
    ? Math.max(0, readiness.targetMemberCount - readiness.blockerCount)
    : 0;
  const percent = readiness?.targetMemberCount
    ? Math.round((completeCount / readiness.targetMemberCount) * 100)
    : 0;

  return (
    <Card
      loading={loading}
      className="tw-rounded-2xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
      styles={{ body: { padding: 20 } }}
      title={
        <span className="tw-inline-flex tw-items-center tw-gap-2">
          {readiness?.ready ? <CheckCircleOutlined className="tw-text-emerald-600" /> : <WarningOutlined className="tw-text-amber-600" />}
          목표/성과 마감 전 점검
        </span>
      }
    >
      {!readiness ? (
        <Text type="secondary">점검 정보를 불러오는 중입니다.</Text>
      ) : (
        <div className="tw-space-y-4">
          <div className="tw-grid tw-grid-cols-1 tw-gap-3 md:tw-grid-cols-4">
            <MetricCard label="대상자" value={readiness.targetMemberCount} suffix="명" />
            <MetricCard label="승인된 목표" value={readiness.activeGoalCount} suffix="개" />
            <MetricCard label="차단 이슈" value={readiness.blockerCount} suffix="건" danger={readiness.blockerCount > 0} />
            <MetricCard label="주의 이슈" value={readiness.warningCount} suffix="건" warning={readiness.warningCount > 0} />
          </div>
          <div>
            <div className="tw-mb-1 tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-slate-500">
              <span>활성화 준비율</span>
              <span>{percent}%</span>
            </div>
            <Progress percent={percent} showInfo={false} strokeColor={readiness.ready ? '#059669' : '#f59e0b'} />
          </div>
          <div className="tw-grid tw-grid-cols-1 tw-gap-3 lg:tw-grid-cols-2">
            <IssueList title="개인 목표 없음" issues={readiness.missingGoals} tone="rose" />
            <IssueList title="가중치 100% 불일치" issues={readiness.weightIssues} tone="rose" />
            <IssueList title="승인 대기 bundle" issues={readiness.pendingBundles} tone="amber" />
            <IssueList title="Lead 미지정" issues={readiness.missingLeads} tone="rose" />
            <IssueList title="진행률 업데이트 없음" issues={readiness.missingProgressUpdates} tone="slate" />
          </div>
        </div>
      )}
    </Card>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  danger,
  warning,
}: {
  label: string;
  value: number;
  suffix: string;
  danger?: boolean;
  warning?: boolean;
}) {
  const color = danger ? 'tw-text-rose-600' : warning ? 'tw-text-amber-600' : 'tw-text-[#1e3a5f]';
  return (
    <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3">
      <div className="tw-text-xs tw-text-slate-500">{label}</div>
      <div className={`tw-mt-1 tw-text-2xl tw-font-bold ${color}`}>
        {value}
        <span className="tw-ml-1 tw-text-xs tw-font-semibold tw-text-slate-400">{suffix}</span>
      </div>
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: GoalSeasonReadinessIssue[];
  tone: 'rose' | 'amber' | 'slate';
}) {
  const ids = issues.map((issue) => issue.memberId).filter(Boolean);
  const { labelFor } = useMemberDisplayNames(ids);
  const toneClass = {
    rose: '!tw-bg-rose-50 !tw-text-rose-700',
    amber: '!tw-bg-amber-50 !tw-text-amber-700',
    slate: '!tw-bg-slate-100 !tw-text-slate-600',
  }[tone];

  return (
    <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-3">
      <div className="tw-mb-2 tw-flex tw-items-center tw-justify-between">
        <Tag bordered={false} className={`!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold ${toneClass}`}>
          {title}
        </Tag>
        <span className="tw-text-xs tw-text-slate-400">{issues.length}건</span>
      </div>
      {issues.length === 0 ? (
        <div className="tw-rounded-lg tw-bg-slate-50 tw-px-3 tw-py-2 tw-text-xs tw-text-slate-400">해당 이슈가 없습니다.</div>
      ) : (
        <ul className="wf-scrollbar-modal tw-max-h-44 tw-space-y-1 tw-overflow-auto">
          {issues.map((issue) => (
            <li key={`${title}-${issue.memberId}`} className="tw-rounded-lg tw-bg-slate-50 tw-px-3 tw-py-2">
              <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
                <span className="tw-text-sm tw-font-medium tw-text-slate-800">{labelFor(issue.memberId)}</span>
                {issue.weightSum != null ? (
                  <span className="tw-text-xs tw-text-slate-500">{issue.weightSum}%</span>
                ) : null}
              </div>
              <div className="tw-mt-1 tw-text-xs tw-text-slate-500">{issue.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default EvaluationSeasonDetailPage;
