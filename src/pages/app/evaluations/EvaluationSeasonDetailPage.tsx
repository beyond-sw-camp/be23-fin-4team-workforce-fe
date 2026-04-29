import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Alert, App, Button, Card, Space, Tag, Typography } from 'antd';
import { CalendarOutlined, SoundOutlined, StopOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import type { EvaluationDesign, EvaluationSeason } from '@/features/evaluation/model/types';
import { GroupsSection } from '@/features/evaluation/ui/GroupsSection';
import { GroupCreateModal } from '@/features/evaluation/ui/GroupCreateModal';
import { computeSeasonActivationReadiness } from '@/features/evaluation/lib/seasonActivationReadiness';
import { SeasonActivationButton } from '@/features/evaluation/ui/SeasonActivationButton';
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

  const startReadiness = useMemo(() => computeSeasonActivationReadiness(groups), [groups]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['eval-seasons'] });
    void queryClient.invalidateQueries({ queryKey: ['eval-groups', seasonId] });
    void queryClient.invalidateQueries({ queryKey: ['eval-designs'] });
  };

  const closeSeasonMut = useMutation({
    mutationFn: () => evaluationRedesignApi.closeSeason(seasonId),
    onSuccess: () => {
      message.success('시즌을 종료했습니다.');
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
        subtitle="시즌, 그룹, 평가자 매핑을 관리합니다."
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
              대상 OKR 시작일: <strong className="tw-text-slate-800">{season.targetCycleStart}</strong>
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

        {canUpdate && season.status === 'DRAFT' && !startReadiness.ready ? (
          <Alert
            type="warning"
            showIcon
            className="tw-mt-4"
            message="시즌 활성화 전 준비가 더 필요합니다."
            description={startReadiness.reason}
          />
        ) : null}

        {canUpdate ? (
          <div className="tw-mt-4 tw-flex tw-flex-wrap tw-gap-2">
            {season.status === 'DRAFT' ? (
              <SeasonActivationButton
                seasonId={seasonId}
                disabled={!startReadiness.ready}
                disabledTooltip={!startReadiness.ready ? startReadiness.reason : undefined}
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

      <Alert
        type="info"
        showIcon
        message="시즌 활성화 해석"
        description="휴직, 비활성, 중도 입사 구성원은 활성화 시점에 자동 제외됩니다. 반대로 KR 없음, 가중치 불일치, 승인 대기 상태는 활성화를 막는 차단 이슈로 처리됩니다."
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

export default EvaluationSeasonDetailPage;
