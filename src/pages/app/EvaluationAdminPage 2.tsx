import { useMemo, useState } from 'react';
import { Alert, App, Card, Empty, Input, Space, Tag, Typography, Select } from 'antd';
import {
  AlertOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  UserDeleteOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import { useMemberDisplayNames } from '@/features/members/hooks/useMemberDisplayNames';
import { SingleMemberOrgChartSelectModal } from '@/features/members/ui/SingleMemberOrgChartSelectModal';
import { AppButton } from '@/shared/ui/AppButton';
import { AppConfirmModal } from '@/shared/ui/AppConfirmModal';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const { Text } = Typography;
const { TextArea } = Input;

const SECTION_CARD =
  'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

const STAGE_LABEL: Record<string, string> = {
  SELF_PENDING: '자기평가 대기',
  SELF_SUBMITTED: '자기평가 제출',
  PEER_OPEN: '동료 의견 수집',
  UPWARD_OPEN: '상향 의견 수집',
  DOWNWARD_OPEN: '하향 의견 수집',
  CALIBRATION_OPEN: '등급 검토 중',
  CALIBRATION_LOCKED: '최종 확정 대기',
  CONFIRMED: '확정 완료',
  SKIPPED_LEAVER: '퇴사/제외 처리',
};

const STAGE_COLOR: Record<string, string> = {
  SELF_PENDING: 'red',
  SELF_SUBMITTED: 'orange',
  PEER_OPEN: 'gold',
  UPWARD_OPEN: 'gold',
  DOWNWARD_OPEN: 'gold',
  CALIBRATION_OPEN: 'cyan',
  CALIBRATION_LOCKED: 'blue',
  CONFIRMED: 'green',
  SKIPPED_LEAVER: 'default',
};

type LeadReassignTarget = { responseId: string; targetMemberLabel: string } | null;
type SkipTarget = { responseId: string; targetMemberLabel: string } | null;

type EvaluationAdminPageProps = {
  embedded?: boolean;
  seasonId?: string;
};

export default function EvaluationAdminPage({ embedded = false, seasonId: fixedSeasonId }: EvaluationAdminPageProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const seasonId = fixedSeasonId || selectedSeasonId;
  const [leadTarget, setLeadTarget] = useState<LeadReassignTarget>(null);
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [reassignReason, setReassignReason] = useState('');
  const [skipTarget, setSkipTarget] = useState<SkipTarget>(null);
  const [skipReason, setSkipReason] = useState('');

  const { data: seasons = [], isLoading: seasonsLoading } = useQuery({
    queryKey: ['evaluation-seasons'],
    queryFn: () => evaluationRedesignApi.listSeasons(),
  });

  const { data: blockers, isLoading: blockersLoading } = useQuery({
    queryKey: ['evaluation-publish-blockers', seasonId],
    queryFn: () => evaluationRedesignApi.getPublishBlockers(seasonId),
    enabled: !!seasonId,
  });

  const { data: meetingStatus } = useQuery({
    queryKey: ['evaluation-meeting-status', seasonId],
    queryFn: () => evaluationRedesignApi.getMeetingSeasonStatus(seasonId),
    enabled: !!seasonId,
  });

  const { data: operationalAlerts } = useQuery({
    queryKey: ['evaluation-operational-alerts', seasonId],
    queryFn: () => evaluationRedesignApi.getOperationalAlerts(seasonId),
    enabled: !!seasonId,
  });

  const memberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const blocker of blockers?.blockers ?? []) {
      ids.add(blocker.targetMemberId);
      ids.add(blocker.evaluatorId);
    }
    for (const alert of operationalAlerts?.alerts ?? []) {
      ids.add(alert.targetMemberId);
      ids.add(alert.evaluatorId);
    }
    return [...ids];
  }, [blockers, operationalAlerts]);

  const { labelFor } = useMemberDisplayNames(memberIds);

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.seasonId === seasonId) ?? null,
    [seasons, seasonId],
  );

  const publishMut = useMutation({
    mutationFn: () => evaluationRedesignApi.publishSeason(seasonId),
    onSuccess: () => {
      message.success('결과 공개와 피드백 면담 생성이 함께 처리되었습니다.');
      invalidateSeasonQueries();
    },
    onError: (error: any) => message.error(error?.message ?? '결과 공개에 실패했습니다.'),
  });

  const regenerateMut = useMutation({
    mutationFn: () => evaluationRedesignApi.regenerateFeedbackMeetings(seasonId),
    onSuccess: () => {
      message.success('피드백 면담을 다시 생성했습니다.');
      queryClient.invalidateQueries({ queryKey: ['evaluation-meeting-status', seasonId] });
    },
    onError: (error: any) => message.error(error?.message ?? '면담 재생성에 실패했습니다.'),
  });

  const reassignMut = useMutation({
    mutationFn: ({ responseId, evaluatorId, reason }: { responseId: string; evaluatorId: string; reason?: string }) =>
      evaluationRedesignApi.reassignLead(responseId, evaluatorId, reason),
    onSuccess: () => {
      message.success('최종 검토자를 변경했습니다.');
      invalidateSeasonQueries();
      setLeadTarget(null);
      setLeadPickerOpen(false);
      setReassignReason('');
    },
    onError: (error: any) => message.error(error?.message ?? '최종 검토자 변경에 실패했습니다.'),
  });

  const skipMut = useMutation({
    mutationFn: ({ responseId, reason }: { responseId: string; reason?: string }) =>
      evaluationRedesignApi.skipLeaver(responseId, reason),
    onSuccess: () => {
      message.success('응답을 제외 상태로 처리했습니다.');
      invalidateSeasonQueries();
      setSkipTarget(null);
      setSkipReason('');
    },
    onError: (error: any) => message.error(error?.message ?? '제외 처리에 실패했습니다.'),
  });

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-6">
      {!embedded ? (
        <AppWorkspacePageTitle
          eyebrow="EVALUATION ADMIN"
          title="평가 운영"
          subtitle="공개 차단 응답, 평가 진행 리스크, 최종 검토자 변경, 제외 처리를 한 화면에서 확인합니다."
        />
      ) : null}

      {!fixedSeasonId ? (
        <Card className={SECTION_CARD} styles={{ body: { padding: 16 } }}>
          <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
            <Text strong className="tw-text-sm tw-text-slate-700">
              평가 기간
            </Text>
            <Select
              loading={seasonsLoading}
              value={seasonId || undefined}
              onChange={setSelectedSeasonId}
              placeholder="관리할 평가를 선택하세요."
              style={{ minWidth: 320 }}
              options={seasons.map((season) => ({
                value: season.seasonId,
                label: `${season.name} · ${season.status}${season.resultsPublishedAt ? ' · 공개 완료' : ''}`,
              }))}
            />
            {selectedSeason?.resultPublishDate ? <Tag>공개 예정 {selectedSeason.resultPublishDate}</Tag> : null}
            {selectedSeason?.resultsPublishedAt ? <Tag color="green">공개 완료</Tag> : null}
          </div>
        </Card>
      ) : null}

      {!seasonId ? <AppEmptyIllustrated description="관리할 평가를 먼저 선택해 주세요." /> : null}

      {seasonId ? (
        <>
          <div className="tw-grid tw-grid-cols-1 tw-gap-4 md:tw-grid-cols-4">
            <KpiCard label="전체 응답" value={blockers?.totalResponses ?? '-'} accent="slate" loading={blockersLoading} />
            <KpiCard
              label="공개 차단 응답"
              value={blockers?.blockers.length ?? '-'}
              accent={blockers?.blockers.length ? 'rose' : 'emerald'}
              hint={blockers?.publishable ? '공개 가능' : '종료 전 응답 존재'}
              loading={blockersLoading}
            />
            <KpiCard
              label="확인 필요 사항 알림"
              value={operationalAlerts?.totalAlerts ?? '-'}
              accent={operationalAlerts?.totalAlerts ? 'rose' : 'emerald'}
              hint={operationalAlerts?.totalAlerts ? '확인 필요' : '이상 없음'}
            />
            <KpiCard
              label="면담 완료"
              value={meetingStatus ? `${meetingStatus.completedCount} / ${meetingStatus.createdCount}` : '-'}
              accent="slate"
              hint={
                meetingStatus
                  ? `미완료 ${meetingStatus.uncompletedCount}`
                  : ''
              }
            />
          </div>

          <Card
            className={SECTION_CARD}
            styles={{ body: { padding: 20 } }}
            title={<Text strong className="tw-text-[15px] tw-text-slate-900">평가 진행 리스크</Text>}
          >
            <div className="tw-mb-4 tw-text-sm tw-text-slate-500">
              평가 진행 중 인사 상태가 바뀐 응답을 관리자 관점에서 먼저 보여줍니다. 이 화면은 자동 처리보다
              관리자 확인을 우선하는 경량 버전입니다.
            </div>
            {!operationalAlerts || operationalAlerts.alerts.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span className="tw-text-sm tw-text-slate-500">현재 확인이 필요한 리스크 알림이 없습니다.</span>}
              />
            ) : (
              <div className="tw-space-y-3">
                {operationalAlerts.alerts.map((alert) => {
                  const targetLabel = labelFor(alert.targetMemberId) || alert.targetMemberId;
                  const evaluatorLabel = labelFor(alert.evaluatorId) || alert.evaluatorId;
                  const isHigh = alert.severity === 'HIGH';
                  return (
                    <Alert
                      key={`${alert.alertType}-${alert.responseId}`}
                      type={isHigh ? 'error' : 'warning'}
                      showIcon
                      message={
                        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                          <span className="tw-font-semibold tw-text-slate-900">{targetLabel}</span>
                          <Tag color={isHigh ? 'red' : 'gold'} bordered={false}>
                            {alert.alertType}
                          </Tag>
                          <span className="tw-text-xs tw-text-slate-500">최종 검토자: {evaluatorLabel}</span>
                        </div>
                      }
                      description={
                        <div className="tw-space-y-3">
                          <div className="tw-text-sm tw-leading-6 tw-text-slate-600">{toUserFriendlyMessage(alert.message)}</div>
                          <div className="tw-flex tw-flex-wrap tw-gap-2">
                            <AppButton
                              size="small"
                              variant="secondary"
                              icon={<UserSwitchOutlined />}
                              onClick={() => {
                                setLeadTarget({
                                  responseId: alert.responseId,
                                  targetMemberLabel: targetLabel,
                                });
                                setLeadPickerOpen(true);
                              }}
                            >
                              최종 검토자 변경
                            </AppButton>
                            <AppButton
                              size="small"
                              variant="secondary"
                              icon={<UserDeleteOutlined />}
                              onClick={() =>
                                setSkipTarget({
                                  responseId: alert.responseId,
                                  targetMemberLabel: targetLabel,
                                })
                              }
                            >
                              제외 처리
                            </AppButton>
                          </div>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            className={SECTION_CARD}
            styles={{ body: { padding: 20 } }}
            title={<Text strong className="tw-text-[15px] tw-text-slate-900">응답 단계 분포</Text>}
            extra={
              <Space>
                <AppButton
                  variant="secondary"
                  icon={<ReloadOutlined />}
                  loading={regenerateMut.isPending}
                  onClick={() => regenerateMut.mutate()}
                >
                  면담 재생성
                </AppButton>
                <AppButton
                  variant="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={!blockers?.publishable || !!selectedSeason?.resultsPublishedAt}
                  loading={publishMut.isPending}
                  onClick={() => publishMut.mutate()}
                >
                  {selectedSeason?.resultsPublishedAt ? '이미 공개됨' : '결과 공개'}
                </AppButton>
              </Space>
            }
          >
            <div className="tw-mb-4 tw-text-sm tw-text-slate-500">
              결과 공개는 모든 응답이 `CONFIRMED` 또는 `SKIPPED_LEAVER` 일 때만 가능합니다.
            </div>
            {blockers ? (
              <div className="tw-flex tw-flex-wrap tw-gap-2">
                {Object.entries(blockers.byStage).map(([stage, count]) => (
                  <Tag
                    key={stage}
                    color={count > 0 ? STAGE_COLOR[stage] : 'default'}
                    bordered={false}
                    className="!tw-rounded-full !tw-px-3 !tw-py-1 !tw-text-[12px] !tw-font-medium"
                  >
                    {STAGE_LABEL[stage] ?? stage} · {count}
                  </Tag>
                ))}
              </div>
            ) : null}
          </Card>

          <Card
            className={SECTION_CARD}
            styles={{ body: { padding: 0 } }}
            title={
              <div className="tw-flex tw-items-center tw-gap-2 tw-px-1">
                <AlertOutlined className="tw-text-rose-500" />
                <Text strong className="tw-text-[15px] tw-text-slate-900">
                  공개 차단 응답
                </Text>
                <span className="tw-text-xs tw-text-slate-500">{blockers?.blockers.length ?? 0}건</span>
              </div>
            }
          >
            {blockers && blockers.blockers.length === 0 ? (
              <div className="tw-py-10">
                <Empty
                  description={
                    <span className="tw-text-sm tw-text-slate-500">
                      모든 응답이 종료 상태입니다. 결과 공개가 가능합니다.
                    </span>
                  }
                />
              </div>
            ) : (
              <div className="tw-divide-y tw-divide-slate-100">
                {blockers?.blockers.map((blocker) => (
                  <div
                    key={blocker.responseId}
                    className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-4 tw-px-5 tw-py-3"
                  >
                    <div className="tw-min-w-0 tw-flex tw-items-center tw-gap-3">
                      <Tag
                        color={STAGE_COLOR[blocker.stage]}
                        bordered={false}
                        className="!tw-m-0 !tw-rounded-full !tw-px-2.5 !tw-py-0.5 !tw-text-[11px] !tw-font-semibold"
                      >
                        {STAGE_LABEL[blocker.stage] ?? blocker.stage}
                      </Tag>
                      <span className="tw-truncate tw-text-sm tw-font-medium tw-text-slate-900">
                        {labelFor(blocker.targetMemberId) || blocker.targetMemberId.slice(0, 8)}
                      </span>
                      <span className="tw-text-xs tw-text-slate-400">
                        최종 검토자: {labelFor(blocker.evaluatorId) || blocker.evaluatorId.slice(0, 8)}
                      </span>
                    </div>
                    <Space>
                      <AppButton
                        size="small"
                        variant="secondary"
                        icon={<UserSwitchOutlined />}
                        onClick={() => {
                          setLeadTarget({
                            responseId: blocker.responseId,
                            targetMemberLabel: labelFor(blocker.targetMemberId) || blocker.targetMemberId,
                          });
                          setLeadPickerOpen(true);
                        }}
                      >
                        최종 검토자 변경
                      </AppButton>
                      <AppButton
                        size="small"
                        variant="secondary"
                        icon={<UserDeleteOutlined />}
                        onClick={() =>
                          setSkipTarget({
                            responseId: blocker.responseId,
                            targetMemberLabel: labelFor(blocker.targetMemberId) || blocker.targetMemberId,
                          })
                        }
                      >
                        제외 처리
                      </AppButton>
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {selectedSeason?.resultsPublishedAt ? (
            <Card className={SECTION_CARD} styles={{ body: { padding: 20 } }}>
              <div className="tw-text-sm tw-text-slate-600">
                이 평가는 이미 공개되었습니다. 추가 정정이 필요하면 개별 응답을 reopen 한 뒤 다시 확정해 주세요.
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      <SingleMemberOrgChartSelectModal
        open={leadPickerOpen && !!leadTarget}
        title="새 최종 검토자 선택"
        onClose={() => {
          setLeadPickerOpen(false);
          setLeadTarget(null);
          setReassignReason('');
        }}
        onSelect={(member) => {
          if (!leadTarget) return;
          reassignMut.mutate({
            responseId: leadTarget.responseId,
            evaluatorId: member.memberId,
            reason: reassignReason || undefined,
          });
        }}
      />

      <AppConfirmModal
        open={!!leadTarget}
        title="최종 검토자 변경 사유"
        onOk={() => setLeadPickerOpen(true)}
        onCancel={() => {
          setLeadTarget(null);
          setReassignReason('');
        }}
      >
        <div className="tw-space-y-3">
          <div className="tw-text-sm tw-text-slate-600">
            <strong>{leadTarget?.targetMemberLabel}</strong> 응답의 최종 검토자를 바꾸기 전에 사유를 남겨주세요.
          </div>
          <TextArea
            rows={4}
            value={reassignReason}
            onChange={(event) => setReassignReason(event.target.value)}
            placeholder="예: 조직 이동으로 기존 최종 검토자가 더 이상 평가를 진행하기 어렵습니다."
          />
        </div>
      </AppConfirmModal>

      <AppConfirmModal
        open={!!skipTarget}
        title="제외 처리 확인"
        onOk={() =>
          skipTarget &&
          skipMut.mutate({
            responseId: skipTarget.responseId,
            reason: skipReason || undefined,
          })
        }
        onCancel={() => {
          setSkipTarget(null);
          setSkipReason('');
        }}
      >
        <div className="tw-space-y-3">
          <div className="tw-text-sm tw-text-slate-700">
            <strong>{skipTarget?.targetMemberLabel}</strong> 응답을 `SKIPPED_LEAVER` 상태로 전환합니다. 이 응답은
            공개 검증과 피드백 면담 자동 생성 대상에서 제외됩니다.
          </div>
          <TextArea
            rows={4}
            value={skipReason}
            onChange={(event) => setSkipReason(event.target.value)}
            placeholder="예: 평가 종료 전 퇴사로 평가 진행 불가"
          />
        </div>
      </AppConfirmModal>
    </div>
  );

  function invalidateSeasonQueries() {
    void queryClient.invalidateQueries({ queryKey: ['evaluation-publish-blockers', seasonId] });
    void queryClient.invalidateQueries({ queryKey: ['evaluation-meeting-status', seasonId] });
    void queryClient.invalidateQueries({ queryKey: ['evaluation-operational-alerts', seasonId] });
    void queryClient.invalidateQueries({ queryKey: ['evaluation-seasons'] });
  }
}

function toUserFriendlyMessage(message?: string | null) {
  return (message ?? '')
    .replaceAll('Lead evaluator', '최종 검토자')
    .replaceAll('Lead 평가자', '최종 검토자')
    .replaceAll('Lead', '최종 검토자')
    .replaceAll('DOWNWARD', '상급자 평가');
}

function KpiCard({
  label,
  value,
  accent = 'slate',
  hint,
  loading,
}: {
  label: string;
  value: string | number;
  accent?: 'slate' | 'emerald' | 'rose';
  hint?: string;
  loading?: boolean;
}) {
  const accentClass =
    accent === 'emerald'
      ? 'tw-text-emerald-600'
      : accent === 'rose'
        ? 'tw-text-rose-600'
        : 'tw-text-[#1e3a5f]';

  return (
    <Card className={SECTION_CARD} styles={{ body: { padding: 18 } }}>
      <div className="tw-flex tw-items-baseline tw-justify-between tw-gap-2">
        <span className="tw-text-[12px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
          {label}
        </span>
        {hint ? <span className="tw-text-[11px] tw-text-slate-400">{hint}</span> : null}
      </div>
      <div className={`tw-mt-1 tw-text-[28px] tw-font-bold tw-leading-none ${accentClass}`}>
        {loading ? '-' : value}
      </div>
    </Card>
  );
}
