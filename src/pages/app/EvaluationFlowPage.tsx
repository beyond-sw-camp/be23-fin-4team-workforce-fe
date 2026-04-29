import { useEffect, useMemo, useState } from 'react';
import { App, Card, Result, Tag, Typography } from 'antd';
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  EditOutlined,
  FileSearchOutlined,
  FlagOutlined,
  LockFilled,
  TrophyFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { useAuth } from '@/features/auth/useAuth';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import { CalibrationForm } from '@/features/evaluation/ui/CalibrationForm';
import { ConfirmModal } from '@/features/evaluation/ui/ConfirmModal';
import { EvaluationResultCard } from '@/features/evaluation/ui/EvaluationResultCard';
import { SelfEvaluationForm } from '@/features/evaluation/ui/SelfEvaluationForm';
import type { EvaluationFlowResponse } from '@/features/evaluation/model/workflowTypes';
import { AppButton } from '@/shared/ui/AppButton';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const { Text, Title } = Typography;
const SECTION_CARD = 'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

type EvaluationFlowPageProps = {
  embedded?: boolean;
};

type Stage = EvaluationFlowResponse['stage'];
type FlowListItem = EvaluationFlowResponse & { listOrigin: 'self' | 'evaluator' };
type StepKey = 'self' | 'calibration' | 'confirmed' | 'published';
type FlowSectionKey = 'self-pending' | 'waiting' | 'evaluator' | 'confirmed';

const STAGE_LABEL: Record<Stage, string> = {
  SELF_PENDING: '자기평가 입력',
  SELF_SUBMITTED: '자기평가 제출 완료',
  PEER_OPEN: '다면 의견 수집',
  UPWARD_OPEN: '다면 의견 수집',
  DOWNWARD_OPEN: '다면 의견 수집',
  CALIBRATION_OPEN: '리드 검토 중',
  CALIBRATION_LOCKED: '최종 확정 대기',
  CONFIRMED: '확정 완료',
  SKIPPED_LEAVER: '평가 제외',
};

const STAGE_DESCRIPTION: Record<Stage, string> = {
  SELF_PENDING: '지금 바로 작성해야 하는 자기평가입니다.',
  SELF_SUBMITTED: '자기평가를 제출했고, 이제 검토 결과를 기다리는 단계입니다.',
  PEER_OPEN: '다면 의견 수집 중입니다. 평가자 응답이 모이면 Lead가 최종 검토합니다.',
  UPWARD_OPEN: '다면 의견 수집 중입니다. 평가자 응답이 모이면 Lead가 최종 검토합니다.',
  DOWNWARD_OPEN: '다면 의견 수집 중입니다. 평가자 응답이 모이면 Lead가 최종 검토합니다.',
  CALIBRATION_OPEN: 'Lead와 Assistant가 KR별 등급을 조정하는 단계입니다.',
  CALIBRATION_LOCKED: 'Lead가 최종 확정을 준비하고 있습니다.',
  CONFIRMED: '최종 확정은 끝났고, 결과 공개를 기다리는 상태일 수 있습니다.',
  SKIPPED_LEAVER: '퇴사 또는 운영 처리로 평가 대상에서 제외되었습니다.',
};

const STAGE_TAG_COLOR: Record<Stage, string> = {
  SELF_PENDING: 'gold',
  SELF_SUBMITTED: 'cyan',
  PEER_OPEN: 'orange',
  UPWARD_OPEN: 'orange',
  DOWNWARD_OPEN: 'orange',
  CALIBRATION_OPEN: 'orange',
  CALIBRATION_LOCKED: 'blue',
  CONFIRMED: 'green',
  SKIPPED_LEAVER: 'default',
};

const STEPPER_STEPS = [
  { key: 'self', label: '자기평가', icon: EditOutlined },
  { key: 'calibration', label: '검토/조정', icon: FileSearchOutlined },
  { key: 'confirmed', label: '확정', icon: CheckCircleOutlined },
  { key: 'published', label: '결과 공개', icon: TrophyFilled },
] as const;

export default function EvaluationFlowPage({ embedded = false }: EvaluationFlowPageProps) {
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';
  const { data: mySelf = [], isLoading: loadingSelf } = useQuery({
    queryKey: ['my-self-evals'],
    queryFn: () => evaluationRedesignApi.listMySelf(),
  });
  const { data: myEvaluator = [], isLoading: loadingEvaluator } = useQuery({
    queryKey: ['my-evaluator-assignments'],
    queryFn: () => evaluationRedesignApi.listMyEvaluatorAssignments(),
  });

  const [activeId, setActiveId] = useState<string>();
  const isLoading = loadingSelf || loadingEvaluator;

  const grouped = useMemo(() => {
    const evaluatorIds = new Set(myEvaluator.map((item) => item.responseId));
    const selfPending = mySelf
      .filter((item) => item.stage === 'SELF_PENDING')
      .map((item) => ({ ...item, listOrigin: 'self' as const }));

    const waiting = mySelf
      .filter(
        (item) =>
          item.stage === 'SELF_SUBMITTED' ||
          item.stage === 'PEER_OPEN' ||
          item.stage === 'UPWARD_OPEN' ||
          item.stage === 'DOWNWARD_OPEN' ||
          item.stage === 'CALIBRATION_OPEN' ||
          item.stage === 'CALIBRATION_LOCKED',
      )
      .map((item) => ({ ...item, listOrigin: 'self' as const }));

    const confirmed = mySelf
      .filter((item) => item.stage === 'CONFIRMED' && !item.resultsPublishedAt)
      .map((item) => ({ ...item, listOrigin: 'self' as const }));

    const evaluator = myEvaluator.map((item) => ({ ...item, listOrigin: 'evaluator' as const }));

    const ordered = [...selfPending, ...waiting, ...evaluator, ...confirmed];
    const deduped = new Map<string, FlowListItem>();
    for (const item of ordered) {
      if (!deduped.has(item.responseId)) deduped.set(item.responseId, item);
    }

    return {
      selfPending,
      waiting,
      evaluator,
      confirmed,
      all: [...deduped.values()].sort((a, b) => {
        const aDate = a.createdAt ?? '';
        const bDate = b.createdAt ?? '';
        return bDate.localeCompare(aDate);
      }),
      evaluatorIds,
    };
  }, [myEvaluator, mySelf]);

  useEffect(() => {
    const firstResponse = grouped.all[0];
    if (!firstResponse) return;
    if (!activeId || !grouped.all.some((item) => item.responseId === activeId)) {
      setActiveId(firstResponse.responseId);
    }
  }, [activeId, grouped.all]);

  const active = useMemo(
    () => grouped.all.find((response) => response.responseId === activeId) ?? grouped.all[0] ?? null,
    [activeId, grouped.all],
  );

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-8">
      {!embedded && (
        <AppWorkspacePageTitle
          eyebrow="EVALUATION FLOW"
          title="평가 진행"
          subtitle="자기평가 작성, 제출 후 대기, 평가자 참여를 구분해서 보여줍니다."
        />
      )}

      {isLoading ? (
        <Card className={SECTION_CARD} styles={{ body: { padding: 32 } }}>
          <Text className="tw-text-slate-500">평가 목록을 불러오는 중입니다.</Text>
        </Card>
      ) : grouped.all.length === 0 ? (
        <Card className={SECTION_CARD} styles={{ body: { padding: 48 } }}>
          <AppEmptyIllustrated description="지금 진행 중인 평가가 없습니다. 시즌이 열리면 여기에서 바로 확인할 수 있습니다." />
        </Card>
      ) : (
        <div className="tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-[320px_1fr]">
          <div className="tw-space-y-4">
            <FlowSummaryCard grouped={grouped} />
            <FlowSection
              title="지금 작성할 자기평가"
              subtitle="본인이 바로 입력하고 제출해야 하는 평가"
              emptyText="지금 바로 작성해야 할 자기평가는 없습니다."
              sectionKey="self-pending"
              responses={grouped.selfPending}
              activeId={active?.responseId}
              onSelect={setActiveId}
            />
            <FlowSection
              title="제출 후 검토 대기"
              subtitle="자기평가 제출은 끝났고 결과를 기다리는 상태"
              emptyText="제출 후 검토 중인 내 평가는 없습니다."
              sectionKey="waiting"
              responses={grouped.waiting}
              activeId={active?.responseId}
              onSelect={setActiveId}
            />
            <FlowSection
              title="내가 평가자로 참여 중"
              subtitle="Lead 또는 Assistant 역할로 처리할 응답"
              emptyText="현재 평가자로 참여 중인 응답이 없습니다."
              sectionKey="evaluator"
              responses={grouped.evaluator}
              activeId={active?.responseId}
              onSelect={setActiveId}
            />
            <FlowSection
              title="확정 완료 · 공개 대기"
              subtitle="최종 확정은 끝났지만 아직 결과가 공개되지 않은 응답"
              emptyText="확정 후 공개를 기다리는 응답이 없습니다."
              sectionKey="confirmed"
              responses={grouped.confirmed}
              activeId={active?.responseId}
              onSelect={setActiveId}
            />
          </div>

          {active ? <ResponsePanel response={active} currentUserId={currentUserId} /> : null}
        </div>
      )}
    </div>
  );
}

function FlowSummaryCard({
  grouped,
}: {
  grouped: {
    selfPending: FlowListItem[];
    waiting: FlowListItem[];
    evaluator: FlowListItem[];
    confirmed: FlowListItem[];
  };
}) {
  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 18 } }}>
      <div className="tw-grid tw-grid-cols-2 tw-gap-3">
        <SummaryMetric label="작성 필요" value={grouped.selfPending.length} accent="gold" />
        <SummaryMetric label="검토 대기" value={grouped.waiting.length} accent="blue" />
        <SummaryMetric label="평가자 역할" value={grouped.evaluator.length} accent="purple" />
        <SummaryMetric label="확정 대기" value={grouped.confirmed.length} accent="green" />
      </div>
    </Card>
  );
}

function SummaryMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'gold' | 'blue' | 'purple' | 'green';
}) {
  const tone =
    accent === 'gold'
      ? 'tw-bg-amber-50 tw-text-amber-700'
      : accent === 'blue'
        ? 'tw-bg-blue-50 tw-text-blue-700'
        : accent === 'purple'
          ? 'tw-bg-purple-50 tw-text-purple-700'
          : 'tw-bg-emerald-50 tw-text-emerald-700';
  return (
    <div className="tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-3">
      <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
        {label}
      </div>
      <div className={`tw-mt-2 tw-inline-flex tw-rounded-full tw-px-3 tw-py-1 tw-text-sm tw-font-bold ${tone}`}>
        {value}건
      </div>
    </div>
  );
}

function FlowSection({
  title,
  subtitle,
  emptyText,
  sectionKey,
  responses,
  activeId,
  onSelect,
}: {
  title: string;
  subtitle: string;
  emptyText: string;
  sectionKey: FlowSectionKey;
  responses: FlowListItem[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 12 } }}>
      <div className="tw-mb-3 tw-px-2">
        <Title level={5} className="!tw-m-0 !tw-text-[15px] !tw-font-semibold !tw-text-slate-900">
          {title}
        </Title>
        <Text className="!tw-mt-1 !tw-block !tw-text-[12px] !tw-text-slate-500">{subtitle}</Text>
      </div>
      {responses.length === 0 ? (
        <div className="tw-rounded-xl tw-bg-slate-50 tw-px-3 tw-py-4 tw-text-sm tw-text-slate-400">{emptyText}</div>
      ) : (
        <div className="tw-flex tw-flex-col tw-gap-2">
          {responses.map((response) => (
            <SectionItem
              key={`${sectionKey}-${response.responseId}`}
              response={response}
              active={response.responseId === activeId}
              onClick={() => onSelect(response.responseId)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function SectionItem({
  response,
  active,
  onClick,
}: {
  response: FlowListItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = stepIcon(response.stage);
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'tw-rounded-xl tw-border tw-px-3 tw-py-3 tw-text-left tw-transition-colors ' +
        (active ? 'tw-border-slate-200 tw-bg-slate-100' : 'tw-border-transparent tw-bg-white hover:tw-bg-slate-50')
      }
    >
      <div className="tw-mb-1 tw-flex tw-items-center tw-gap-2">
        <Icon className={active ? 'tw-text-[#1e3a5f]' : 'tw-text-slate-400'} />
        <Text className={'tw-truncate tw-text-[13px] tw-font-semibold ' + (active ? '!tw-text-slate-900' : '!tw-text-slate-700')}>
          {buildResponseLabel(response)}
        </Text>
      </div>
      <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
        <Tag
          color={STAGE_TAG_COLOR[response.stage]}
          bordered={false}
          className="!tw-m-0 !tw-rounded-full !tw-px-2 !tw-py-0 !tw-text-[10px] !tw-font-semibold"
        >
          {STAGE_LABEL[response.stage]}
        </Tag>
        {response.listOrigin === 'evaluator' && (
          <Tag
            bordered={false}
            className="!tw-m-0 !tw-rounded-full !tw-bg-purple-50 !tw-px-2 !tw-py-0 !tw-text-[10px] !tw-font-semibold !tw-text-purple-700"
          >
            평가자 역할
          </Tag>
        )}
      </div>
    </button>
  );
}

function ResponsePanel({ response, currentUserId }: { response: FlowListItem; currentUserId: string }) {
  const step = currentStep(response.stage, response.resultsPublishedAt);
  const isSelfOwner = response.targetMemberId === currentUserId;
  const roleLabel = response.listOrigin === 'evaluator' ? 'Lead / Assistant 역할 응답' : '내 자기평가 응답';

  return (
    <div className="tw-space-y-4">
      <FlowStateBanner response={response} currentUserId={currentUserId} />

      <Card className={SECTION_CARD} styles={{ body: { padding: 24 } }}>
        <div className="tw-mb-5 tw-flex tw-items-start tw-justify-between tw-gap-4">
          <div className="tw-min-w-0">
            <div className="tw-mb-1.5 tw-flex tw-items-center tw-gap-2">
              <FlagOutlined className="tw-text-slate-400" />
              <Text className="!tw-text-[12px] !tw-font-semibold !tw-uppercase !tw-tracking-wide !tw-text-slate-400">
                {roleLabel}
              </Text>
            </div>
            <Text strong className="tw-mb-1 tw-block tw-text-[20px] tw-text-slate-900">
              {buildResponseLabel(response)}
            </Text>
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
              <Tag
                color={STAGE_TAG_COLOR[response.stage]}
                bordered={false}
                className="!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold"
              >
                {STAGE_LABEL[response.stage]}
              </Tag>
              <Text className="tw-text-xs tw-text-slate-500">{STAGE_DESCRIPTION[response.stage]}</Text>
            </div>
          </div>
        </div>
        <Stepper currentStep={step} />
      </Card>

      {response.stage === 'CONFIRMED' && response.resultsPublishedAt && isSelfOwner && (
        <Card className={SECTION_CARD} styles={{ body: { padding: 16 } }}>
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
            <div className="tw-text-sm tw-text-slate-600">
              결과가 공개되었습니다. 상세 결과와 피드백 면담 일정은 결과 화면에서 확인할 수 있습니다.
            </div>
            <Link to="/app/evaluations" search={{ view: 'results' }}>
              <AppButton variant="secondary">결과 화면으로 이동</AppButton>
            </Link>
          </div>
        </Card>
      )}

      <ResponseRouter response={response} currentUserId={currentUserId} />
    </div>
  );
}

function FlowStateBanner({
  response,
  currentUserId,
}: {
  response: FlowListItem;
  currentUserId: string;
}) {
  const isSelfOwner = response.targetMemberId === currentUserId;

  if (response.stage === 'SELF_PENDING' && isSelfOwner) {
    return (
      <BannerCard tone="gold" title="지금 해야 할 일">
        이 평가는 아직 작성 전입니다. KR별로 등급을 선택하고 제출하면 다음 단계로 넘어갑니다.
      </BannerCard>
    );
  }

  if (
    isSelfOwner &&
    (response.stage === 'SELF_SUBMITTED' ||
      response.stage === 'PEER_OPEN' ||
      response.stage === 'UPWARD_OPEN' ||
      response.stage === 'DOWNWARD_OPEN' ||
      response.stage === 'CALIBRATION_OPEN' ||
      response.stage === 'CALIBRATION_LOCKED')
  ) {
    return (
      <BannerCard tone="blue" title="제출 완료 · 검토 진행 중">
        자기평가는 끝났습니다. 이제 Lead와 평가자 검토가 진행되며, 결과가 확정되고 공개되면 결과 탭에서 확인할 수 있습니다.
      </BannerCard>
    );
  }

  if (response.listOrigin === 'evaluator') {
    return (
      <BannerCard tone="purple" title="평가자 역할">
        이 응답은 내가 평가자로 참여 중인 건입니다. 제안 등급 또는 최종 등급 입력이 필요한지 아래에서 확인하면 됩니다.
      </BannerCard>
    );
  }

  if (response.stage === 'CONFIRMED' && !response.resultsPublishedAt) {
    return (
      <BannerCard tone="green" title="최종 확정 완료 · 공개 대기">
        최종 확정은 끝났지만 아직 시즌 결과 공개 전입니다. 공식 공개 전에는 결과 탭에 나타나지 않습니다.
      </BannerCard>
    );
  }

  return null;
}

function BannerCard({
  tone,
  title,
  children,
}: {
  tone: 'gold' | 'blue' | 'purple' | 'green';
  title: string;
  children: React.ReactNode;
}) {
  const className =
    tone === 'gold'
      ? 'tw-border-amber-200 tw-bg-amber-50/50'
      : tone === 'blue'
        ? 'tw-border-blue-200 tw-bg-blue-50/50'
        : tone === 'purple'
          ? 'tw-border-purple-200 tw-bg-purple-50/50'
          : 'tw-border-emerald-200 tw-bg-emerald-50/50';
  return (
    <Card className={`tw-rounded-2xl ${className}`} styles={{ body: { padding: 16 } }}>
      <div className="tw-text-sm tw-font-semibold tw-text-slate-900">{title}</div>
      <div className="tw-mt-1 tw-text-sm tw-text-slate-600">{children}</div>
    </Card>
  );
}

function ResponseRouter({ response, currentUserId }: { response: FlowListItem; currentUserId: string }) {
  const stage = response.stage;
  if (stage === 'SKIPPED_LEAVER') {
    return (
      <Card className={SECTION_CARD} styles={{ body: { padding: 32 } }}>
        <Result status="warning" title="평가 제외" subTitle="퇴사 또는 운영 처리로 평가 대상에서 제외되었습니다." />
      </Card>
    );
  }

  if (stage === 'SELF_PENDING') {
    if (response.targetMemberId !== currentUserId) {
      return (
        <Card className={SECTION_CARD} styles={{ body: { padding: 32 } }}>
          <AppEmptyIllustrated description="아직 대상자의 자기평가 제출을 기다리는 단계입니다. 제출 후 검토 화면으로 이어집니다." />
        </Card>
      );
    }
    return <SelfEvaluationForm response={response} />;
  }

  if (
    stage === 'SELF_SUBMITTED' ||
    stage === 'PEER_OPEN' ||
    stage === 'UPWARD_OPEN' ||
    stage === 'DOWNWARD_OPEN' ||
    stage === 'CALIBRATION_OPEN' ||
    stage === 'CALIBRATION_LOCKED'
  ) {
    return <CalibrationStage response={response} currentUserId={currentUserId} />;
  }

  if (stage === 'CONFIRMED') {
    return <ConfirmedStage response={response} currentUserId={currentUserId} />;
  }

  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 32 } }}>
      <AppEmptyIllustrated description={`알 수 없는 단계입니다. ${stage}`} />
    </Card>
  );
}

function CalibrationStage({ response, currentUserId }: { response: FlowListItem; currentUserId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: calibrations = [] } = useQuery({
    queryKey: ['calibrations', response.responseId],
    queryFn: () => evaluationRedesignApi.listCalibrations(response.responseId),
  });
  const myCalibration = calibrations.find((item) => item.evaluatorId === currentUserId);
  const leadCalibration = calibrations.find((item) => item.role === 'LEAD');
  const isLead = myCalibration?.role === 'LEAD';

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <RoleHintCard isLead={isLead} />
      {isLead && (
        <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60" styles={{ body: { padding: 16 } }}>
          <div className="tw-text-sm tw-text-slate-700">
            Lead는 KR별 최종 등급만 정리하면 됩니다. 전체 등급과 최종 점수는 확정 시 평가 설계 정책에 따라 자동 계산됩니다.
          </div>
        </Card>
      )}
      <CalibrationForm response={response} currentUserId={currentUserId} />
      {isLead && (
        <Card className="tw-rounded-2xl tw-border tw-border-amber-200 tw-bg-amber-50/40" styles={{ body: { padding: 16 } }}>
          <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
            <div>
              <div className="tw-text-sm tw-font-semibold tw-text-slate-900">최종 확정 권한</div>
              <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
                모든 KR의 final grade를 채운 뒤 최종 확정 단계로 넘길 수 있습니다.
              </div>
            </div>
            <AppButton variant="primary" onClick={() => setConfirmOpen(true)}>
              최종 확정
            </AppButton>
          </div>
        </Card>
      )}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        response={response}
        leadCalibration={leadCalibration ?? null}
      />
    </div>
  );
}

function ConfirmedStage({ response, currentUserId }: { response: FlowListItem; currentUserId: string }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: calibrations = [] } = useQuery({
    queryKey: ['calibrations', response.responseId],
    queryFn: () => evaluationRedesignApi.listCalibrations(response.responseId),
  });
  const myCalibration = calibrations.find((item) => item.evaluatorId === currentUserId);
  const isLead = myCalibration?.role === 'LEAD';
  const isPublished = !!response.resultsPublishedAt;

  const unconfirmMut = useMutation({
    mutationFn: () => evaluationRedesignApi.unconfirmResponse(response.responseId),
    onSuccess: () => {
      message.success('확정을 되돌렸습니다.');
      queryClient.invalidateQueries({ queryKey: ['my-self-evals'] });
      queryClient.invalidateQueries({ queryKey: ['my-evaluator-assignments'] });
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '확정 해제에 실패했습니다.'),
  });

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      {!isPublished && (
        <Card className="tw-rounded-2xl tw-border tw-border-blue-200 tw-bg-blue-50/40" styles={{ body: { padding: 16 } }}>
          <div className="tw-text-sm tw-text-slate-700">
            <strong>확정은 끝났지만 아직 공개 전입니다.</strong> 시즌 결과 공개 전까지는 최종 결과가 구성원에게 노출되지 않습니다.
          </div>
        </Card>
      )}
      <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60" styles={{ body: { padding: 16 } }}>
        <div className="tw-text-sm tw-text-slate-700">
          현재 표시되는 최종 등급은 KR별 확정 등급과 평가 설계 규칙을 기준으로 자동 산정된 결과입니다.
        </div>
      </Card>
      <EvaluationResultCard response={response} />
      {isLead && !isPublished && (
        <Card className="tw-rounded-2xl tw-border tw-border-slate-200/90" styles={{ body: { padding: 16 } }}>
          <div className="tw-flex tw-items-center tw-justify-between tw-gap-3">
            <span className="tw-text-xs tw-text-slate-500">시즌 공개 전까지는 확정을 되돌릴 수 있습니다.</span>
            <AppButton variant="danger" loading={unconfirmMut.isPending} onClick={() => unconfirmMut.mutate()}>
              확정 되돌리기
            </AppButton>
          </div>
        </Card>
      )}
    </div>
  );
}

function RoleHintCard({ isLead }: { isLead: boolean }) {
  return (
    <Card
      className={
        isLead
          ? 'tw-rounded-2xl tw-border tw-border-amber-200 tw-bg-amber-50/40'
          : 'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-slate-50/50'
      }
      styles={{ body: { padding: 16 } }}
    >
      <div className="tw-text-sm tw-text-slate-700">
        {isLead
          ? 'Lead는 자기평가와 Assistant 의견을 참고해 KR별 최종 등급을 정리합니다.'
          : 'Assistant는 제안 등급과 코멘트를 남기고, 최종 확정은 Lead가 진행합니다.'}
      </div>
    </Card>
  );
}

function Stepper({ currentStep }: { currentStep: StepKey }) {
  const stepIndex = STEPPER_STEPS.findIndex((step) => step.key === currentStep);
  return (
    <div className="tw-flex tw-items-center tw-gap-1 sm:tw-gap-2">
      {STEPPER_STEPS.map((step, index) => {
        const Icon = step.icon;
        const reached = index <= stepIndex;
        const isCurrent = index === stepIndex;
        return (
          <div key={step.key} className="tw-flex tw-flex-1 tw-items-center">
            <div className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col tw-items-center tw-gap-1.5">
              <div
                className={
                  'tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-full ' +
                  (isCurrent
                    ? 'tw-bg-[#1e3a5f] tw-text-white tw-shadow-lg tw-shadow-slate-900/20'
                    : reached
                      ? 'tw-bg-emerald-100 tw-text-emerald-600'
                      : 'tw-bg-slate-100 tw-text-slate-400')
                }
              >
                {reached && !isCurrent ? <CheckCircleFilled /> : <Icon />}
              </div>
              <Text
                className={
                  'tw-truncate tw-text-[11px] tw-font-medium ' +
                  (isCurrent
                    ? '!tw-font-semibold !tw-text-[#1e3a5f]'
                    : reached
                      ? '!tw-text-slate-700'
                      : '!tw-text-slate-400')
                }
              >
                {step.label}
              </Text>
            </div>
            {index < STEPPER_STEPS.length - 1 && (
              <div
                className={
                  'tw-mx-1 tw-h-[2px] tw-flex-1 tw-rounded-full ' +
                  (index < stepIndex ? 'tw-bg-emerald-300' : 'tw-bg-slate-200')
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function currentStep(stage: Stage, resultsPublishedAt?: string | null): StepKey {
  if (stage === 'SKIPPED_LEAVER' || stage === 'SELF_PENDING') return 'self';
  if (
    stage === 'SELF_SUBMITTED' ||
    stage === 'PEER_OPEN' ||
    stage === 'UPWARD_OPEN' ||
    stage === 'DOWNWARD_OPEN' ||
    stage === 'CALIBRATION_OPEN' ||
    stage === 'CALIBRATION_LOCKED'
  ) {
    return 'calibration';
  }
  if (stage === 'CONFIRMED') return resultsPublishedAt ? 'published' : 'confirmed';
  return 'self';
}

function stepIcon(stage: Stage) {
  if (stage === 'SELF_PENDING' || stage === 'SKIPPED_LEAVER') return EditOutlined;
  if (stage === 'CONFIRMED') return TrophyFilled;
  if (stage === 'CALIBRATION_LOCKED') return LockFilled;
  return FileSearchOutlined;
}

function buildResponseLabel(response: FlowListItem) {
  const base = response.seasonName
    ? response.seasonName
    : response.createdAt
      ? `${dayjs(response.createdAt).format('YYYY-MM')} 평가`
      : `평가 #${response.responseId.slice(0, 6)}`;
  return response.listOrigin === 'evaluator' ? `${base} · 평가자 참여` : base;
}
