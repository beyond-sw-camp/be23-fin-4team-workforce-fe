import { useEffect, useMemo, useState } from 'react';
import { App, Card, Result, Select, Tag, Typography } from 'antd';
import {
  EditOutlined,
  FileSearchOutlined,
  FlagOutlined,
  LockFilled,
  TrophyFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useAuth } from '@/features/auth/useAuth';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import { pickDefaultSeasonFilter } from '@/features/evaluation/lib/defaultSeasonFilter';
import { CalibrationForm } from '@/features/evaluation/ui/CalibrationForm';
import { ConfirmModal } from '@/features/evaluation/ui/ConfirmModal';
import { EvaluationResultCard } from '@/features/evaluation/ui/EvaluationResultCard';
import { SelfEvaluationForm } from '@/features/evaluation/ui/SelfEvaluationForm';
import type { EvaluationFlowResponse } from '@/features/evaluation/model/workflowTypes';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { AppButton } from '@/shared/ui/AppButton';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const { Text, Title } = Typography;
const SECTION_CARD = 'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

type EvaluationFlowPageProps = {
  embedded?: boolean;
  externalSeasonFilter?: string;
  hideSeasonFilter?: boolean;
};

type Stage = EvaluationFlowResponse['stage'];
type FlowListItem = EvaluationFlowResponse & { listOrigin: 'self' | 'evaluator' };

const STAGE_LABEL: Record<Stage, string> = {
  SELF_PENDING: '자기평가 입력',
  SELF_SUBMITTED: '자기평가 제출 완료',
  PEER_OPEN: '상사평가 진행',
  UPWARD_OPEN: '상사평가 진행',
  DOWNWARD_OPEN: '상사평가 진행',
  CALIBRATION_OPEN: '등급 확정 중',
  CALIBRATION_LOCKED: '결과 공개 대기',
  CONFIRMED: '등급 확정 완료',
  SKIPPED_LEAVER: '평가 제외',
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

export default function EvaluationFlowPage({ embedded = false, externalSeasonFilter, hideSeasonFilter = false }: EvaluationFlowPageProps) {
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
  const [seasonFilter, setSeasonFilter] = useState('ALL');
  const [seasonFilterTouched, setSeasonFilterTouched] = useState(false);
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
      .filter((item) => item.stage === 'CONFIRMED')
      .map((item) => ({ ...item, listOrigin: 'self' as const }));

    const evaluator = myEvaluator.map((item) => ({ ...item, listOrigin: 'evaluator' as const }));

    const ordered = [...selfPending, ...waiting, ...evaluator, ...confirmed];
    const deduped = new Map<string, FlowListItem>();
    for (const item of ordered) {
      if (!deduped.has(item.responseId)) deduped.set(item.responseId, item);
    }

    const all = [...deduped.values()].sort((a, b) => {
      const priorityDiff = responsePriority(a) - responsePriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      const aDate = a.createdAt ?? '';
      const bDate = b.createdAt ?? '';
      return bDate.localeCompare(aDate);
    });

    return {
      selfPending,
      waiting,
      evaluator,
      confirmed,
      all,
      evaluatorIds,
    };
  }, [myEvaluator, mySelf]);

  const seasonOptions = useMemo(() => {
    const map = new Map<string, string>();
    grouped.all.forEach((item) => {
      const key = item.seasonId ?? 'UNKNOWN';
      if (!map.has(key)) map.set(key, item.seasonName ?? '평가 기간 미지정');
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [grouped.all]);

  const effectiveSeasonFilter = externalSeasonFilter ?? seasonFilter;
  const displayMemberIds = useMemo(
    () =>
      Array.from(
        new Set(
          grouped.all
            .flatMap((item) => [item.targetMemberId, item.evaluatorId])
            .filter(Boolean),
        ),
      ),
    [grouped.all],
  );
  const { labelFor } = useMemberDisplayNames(displayMemberIds);

  const visibleItems = useMemo(() => {
    if (effectiveSeasonFilter === 'ALL') return grouped.all;
    return grouped.all.filter((item) => (item.seasonId ?? 'UNKNOWN') === effectiveSeasonFilter);
  }, [effectiveSeasonFilter, grouped.all]);

  useEffect(() => {
    if (externalSeasonFilter || seasonFilterTouched || grouped.all.length === 0) return;
    const nextFilter = pickDefaultSeasonFilter(grouped.all);
    setSeasonFilter(nextFilter);
  }, [externalSeasonFilter, grouped.all, seasonFilterTouched]);

  useEffect(() => {
    const firstResponse = visibleItems[0];
    if (!firstResponse) return;
    if (!activeId || !visibleItems.some((item) => item.responseId === activeId)) {
      setActiveId(firstResponse.responseId);
    }
  }, [activeId, visibleItems]);

  const active = useMemo(
    () => visibleItems.find((response) => response.responseId === activeId) ?? visibleItems[0] ?? null,
    [activeId, visibleItems],
  );

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-8">
      {!embedded && (
        <AppWorkspacePageTitle
          eyebrow="EVALUATION FLOW"
          title="평가 진행"
          subtitle="자기평가와 상사평가 작성 대상을 구분해서 보여줍니다."
        />
      )}

      {isLoading ? (
        <Card className={SECTION_CARD} styles={{ body: { padding: 32 } }}>
          <Text className="tw-text-slate-500">평가 목록을 불러오는 중입니다.</Text>
        </Card>
      ) : grouped.all.length === 0 ? (
        <Card className={SECTION_CARD} styles={{ body: { padding: 48 } }}>
          <AppEmptyIllustrated description="지금 진행 중인 평가가 없습니다. 평가가 열리면 여기에서 바로 확인할 수 있습니다." />
        </Card>
      ) : (
        <div className="tw-grid tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-[340px_1fr]">
          <div className="tw-space-y-4">
            {!hideSeasonFilter ? (
              <FlowFilterCard
                seasonFilter={seasonFilter}
                seasonOptions={seasonOptions}
                onSeasonChange={(value) => {
                  setSeasonFilterTouched(true);
                  setSeasonFilter(value);
                  setActiveId(undefined);
                }}
              />
            ) : null}
            <FlowListCard responses={visibleItems} activeId={active?.responseId} onSelect={setActiveId} labelFor={labelFor} />
          </div>

          {active ? <ResponsePanel response={active} currentUserId={currentUserId} labelFor={labelFor} /> : null}
        </div>
      )}
    </div>
  );
}

function FlowFilterCard({
  seasonFilter,
  seasonOptions,
  onSeasonChange,
}: {
  seasonFilter: string;
  seasonOptions: Array<{ value: string; label: string }>;
  onSeasonChange: (value: string) => void;
}) {
  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 18 } }}>
      <div>
        <div className="tw-mb-2 tw-text-sm tw-font-semibold tw-text-slate-900">평가 기간</div>
        <Select
          value={seasonFilter}
          onChange={onSeasonChange}
          className="tw-w-full"
          options={[{ value: 'ALL', label: '전체 평가 기간' }, ...seasonOptions]}
        />
      </div>
    </Card>
  );
}

function FlowListCard({
  responses,
  activeId,
  onSelect,
  labelFor,
}: {
  responses: FlowListItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  labelFor: (id: string) => string;
}) {
  const groups = [
    {
      key: 'todo',
      title: '작성 필요',
      items: responses.filter((item) => item.listOrigin === 'self' && item.stage === 'SELF_PENDING'),
    },
    {
      key: 'history',
      title: '제출한 자기평가',
      items: responses.filter(
        (item) =>
          item.listOrigin === 'self' &&
          (item.stage === 'SELF_SUBMITTED' ||
            item.stage === 'PEER_OPEN' ||
            item.stage === 'UPWARD_OPEN' ||
            item.stage === 'DOWNWARD_OPEN' ||
            item.stage === 'CALIBRATION_OPEN' ||
            item.stage === 'CALIBRATION_LOCKED' ||
            item.stage === 'CONFIRMED'),
      ),
    },
    {
      key: 'evaluator',
      title: '상사평가',
      items: responses.filter((item) => item.listOrigin === 'evaluator'),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 12 } }}>
      <div className="tw-mb-3 tw-px-2">
        <Title level={5} className="!tw-m-0 !tw-text-[15px] !tw-font-semibold !tw-text-slate-900">
          평가 목록
        </Title>
      </div>
      {responses.length === 0 ? (
        <div className="tw-rounded-xl tw-bg-slate-50 tw-px-3 tw-py-4 tw-text-sm tw-text-slate-400">선택한 평가 기간에 표시할 평가가 없습니다.</div>
      ) : (
        <div className="tw-flex tw-flex-col tw-gap-4">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="tw-mb-2 tw-flex tw-items-end tw-justify-between tw-gap-2 tw-px-1">
                <div className="tw-text-[12px] tw-font-bold tw-text-slate-800">{group.title}</div>
                <Tag bordered={false} className="!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-text-[10px] !tw-font-semibold !tw-text-slate-500">
                  {group.items.length}건
                </Tag>
              </div>
              <div className="tw-flex tw-flex-col tw-gap-2">
                {group.items.map((response) => (
                  <SectionItem
                    key={response.responseId}
                    response={response}
                    active={response.responseId === activeId}
                    onClick={() => onSelect(response.responseId)}
                    labelFor={labelFor}
                  />
                ))}
              </div>
            </div>
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
  labelFor,
}: {
  response: FlowListItem;
  active: boolean;
  onClick: () => void;
  labelFor: (id: string) => string;
}) {
  const Icon = stepIcon(response.stage);
  const title = responseTitle(response, labelFor);
  const subtitle = responseSubtitle(response);
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
          {title}
        </Text>
      </div>
      {subtitle ? <div className="tw-mb-2 tw-truncate tw-text-[11px] tw-text-slate-400">{subtitle}</div> : null}
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
            상사평가
          </Tag>
        )}
      </div>
    </button>
  );
}

function ResponsePanel({
  response,
  currentUserId,
  labelFor,
}: {
  response: FlowListItem;
  currentUserId: string;
  labelFor: (id: string) => string;
}) {
  const roleLabel = response.listOrigin === 'evaluator' ? '상사평가 응답' : '내 자기평가 응답';
  const showHeader = response.listOrigin === 'evaluator';

  return (
    <div className="tw-space-y-4">
      {showHeader && (
        <Card className={SECTION_CARD} styles={{ body: { padding: 16 } }}>
          <div className="tw-flex tw-items-start tw-justify-between tw-gap-4">
            <div className="tw-min-w-0">
              <div className="tw-mb-1 tw-flex tw-items-center tw-gap-2">
                <FlagOutlined className="tw-text-slate-400" />
                <Text className="!tw-text-[12px] !tw-font-semibold !tw-text-slate-400">{roleLabel}</Text>
              </div>
              <Text strong className="tw-block tw-text-[18px] tw-text-slate-900">
                {responseTitle(response, labelFor)}
              </Text>
              <div className="tw-mt-3 tw-grid tw-grid-cols-1 tw-gap-2 sm:tw-grid-cols-3">
                <InfoPill label="평가 대상" value={labelFor(response.targetMemberId)} />
                <InfoPill label="평가 기간" value={response.seasonName ?? '평가 기간 미지정'} />
                <InfoPill label="상사평가자" value={labelFor(response.evaluatorId)} />
              </div>
            </div>
            <Tag
              color={STAGE_TAG_COLOR[response.stage]}
              bordered={false}
              className="!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold"
            >
              {STAGE_LABEL[response.stage]}
            </Tag>
          </div>
        </Card>
      )}

      <ResponseRouter response={response} currentUserId={currentUserId} />
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="tw-rounded-xl tw-bg-slate-50 tw-px-3 tw-py-2">
      <div className="tw-text-[10px] tw-font-semibold tw-text-slate-400">{label}</div>
      <div className="tw-mt-0.5 tw-truncate tw-text-xs tw-font-semibold tw-text-slate-800">{value}</div>
    </div>
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
    if (response.targetMemberId === currentUserId && response.listOrigin === 'self') {
      return <SelfEvaluationForm response={response} />;
    }
    return <CalibrationStage response={response} currentUserId={currentUserId} />;
  }

  if (stage === 'CONFIRMED') {
    if (response.targetMemberId === currentUserId && response.listOrigin === 'self') {
      return <SelfEvaluationForm response={response} />;
    }
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
      <CalibrationForm response={response} currentUserId={currentUserId} />
      {isLead && (
        <Card className="tw-rounded-2xl tw-border tw-border-amber-200 tw-bg-amber-50/40" styles={{ body: { padding: 16 } }}>
          <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
            <div>
              <div className="tw-text-sm tw-font-semibold tw-text-slate-900">등급 확정 권한</div>
              <div className="tw-mt-0.5 tw-text-xs tw-text-slate-500">
                모든 목표의 최종 등급을 채운 뒤 등급 확정 단계로 넘길 수 있습니다.
              </div>
            </div>
            <AppButton variant="primary" onClick={() => setConfirmOpen(true)}>
              등급 확정
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
            <strong>확정은 끝났지만 아직 공개 전입니다.</strong> 평가 결과 공개 전까지는 최종 결과가 구성원에게 노출되지 않습니다.
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
            <span className="tw-text-xs tw-text-slate-500">결과 공개 전까지는 확정을 되돌릴 수 있습니다.</span>
            <AppButton variant="danger" loading={unconfirmMut.isPending} onClick={() => unconfirmMut.mutate()}>
              등급 확정 되돌리기
            </AppButton>
          </div>
        </Card>
      )}
    </div>
  );
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
  return response.listOrigin === 'evaluator' ? `${base} · 상사평가` : base;
}

function responseTitle(response: FlowListItem, labelFor: (id: string) => string) {
  if (response.listOrigin === 'evaluator') return `${labelFor(response.targetMemberId)} 상사평가`;
  return buildResponseLabel(response);
}

function responseSubtitle(response: FlowListItem) {
  if (response.listOrigin === 'evaluator') {
    return response.seasonName ?? '평가 기간 미지정';
  }
  return null;
}

function responsePriority(response: FlowListItem) {
  if (response.listOrigin === 'self' && response.stage === 'SELF_PENDING') return 0;
  if (response.listOrigin === 'evaluator') return 1;
  if (
    response.stage === 'SELF_SUBMITTED' ||
    response.stage === 'PEER_OPEN' ||
    response.stage === 'UPWARD_OPEN' ||
    response.stage === 'DOWNWARD_OPEN' ||
    response.stage === 'CALIBRATION_OPEN' ||
    response.stage === 'CALIBRATION_LOCKED'
  ) {
    return 2;
  }
  if (response.stage === 'CONFIRMED') return 3;
  return 4;
}
