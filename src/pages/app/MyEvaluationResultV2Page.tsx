import { useMemo, useState } from 'react';
import { App, Card, Empty, Input, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { evaluationRedesignApi } from '@/features/evaluation/api/evaluationRedesignApi';
import type { EvaluationFlowResponse } from '@/features/evaluation/model/workflowTypes';
import { EvaluationResultCard } from '@/features/evaluation/ui/EvaluationResultCard';
import { meetingApi } from '@/features/meetings/api/meetingApi';
import { AppButton } from '@/shared/ui/AppButton';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';

const { TextArea } = Input;
const { Text } = Typography;

const SECTION_CARD = 'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

type MyEvaluationResultV2PageProps = {
  embedded?: boolean;
};

export default function MyEvaluationResultV2Page({ embedded = false }: MyEvaluationResultV2PageProps) {
  const { data: results = [], isLoading } = useQuery({
    queryKey: ['my-received-evals'],
    queryFn: () => evaluationRedesignApi.listMyReceived(),
  });
  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings', 'as-member'],
    queryFn: () => meetingApi.listMyMeetingsAsMember(),
  });
  const [objectionTarget, setObjectionTarget] = useState<EvaluationFlowResponse | null>(null);

  const feedbackMeetingsBySeason = useMemo(() => {
    const entries = new Map<string, (typeof meetings)[number]>();
    for (const meeting of meetings) {
      if (!meeting.relatedSeasonId) continue;
      const current = entries.get(meeting.relatedSeasonId);
      if (!current || dayjs(meeting.scheduledAt).isAfter(dayjs(current.scheduledAt))) {
        entries.set(meeting.relatedSeasonId, meeting);
      }
    }
    return entries;
  }, [meetings]);

  return (
    <div className="tw-mx-auto tw-w-full tw-space-y-10">
      {!embedded && <AppWorkspacePageTitle
        eyebrow="MY RESULT"
        title="내 평가 결과"
        subtitle="공개된 평가 결과를 확인하고, 필요한 경우 이의제기와 피드백 면담까지 같은 흐름에서 이어서 처리합니다."
      />}

      {!isLoading && results.length === 0 ? (
        <AppEmptyIllustrated description="아직 공개된 평가 결과가 없습니다. 결과가 공개되면 이곳에서 바로 확인할 수 있습니다." />
      ) : (
        <Space direction="vertical" size={12} className="tw-w-full">
          {results.map((result) => {
            const feedbackMeeting = result.seasonId ? feedbackMeetingsBySeason.get(result.seasonId) : undefined;
            return (
              <Card key={result.responseId} className={SECTION_CARD} styles={{ body: { padding: 20 } }}>
                <div className="tw-space-y-4">
                  <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
                    <div>
                      <div className="tw-text-lg tw-font-semibold tw-text-slate-900">
                        {result.seasonName ?? '평가 결과'}
                      </div>
                      <div className="tw-mt-1 tw-text-sm tw-text-slate-500">
                        {result.resultsPublishedAt
                          ? `공개일 ${dayjs(result.resultsPublishedAt).format('YYYY-MM-DD')}`
                          : '공개 시점 정보 없음'}
                      </div>
                    </div>
                    <Space wrap>
                      {result.resultsPublishedAt && <Tag color="green">공개 완료</Tag>}
                      {result.selfEvalEmpty && <Tag color="orange">자기평가 미제출</Tag>}
                      {feedbackMeeting?.completedAt ? <Tag color="blue">면담 완료</Tag> : <Tag color="processing">면담 진행 예정</Tag>}
                    </Space>
                  </div>

                  <EvaluationResultCard response={result} />
                  <Card
                    className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-slate-50/60"
                    styles={{ body: { padding: 16 } }}
                  >
                    <div className="tw-text-sm tw-text-slate-700">
                      이 결과의 최종 등급은 Lead가 확정한 KR별 등급과 평가 설계 정책을 바탕으로 자동 산정되었습니다.
                    </div>
                  </Card>

                  <div className="tw-grid tw-gap-3 lg:tw-grid-cols-[1.4fr_1fr]">
                    <Card
                      className="tw-rounded-xl tw-border tw-border-slate-200/80"
                      styles={{ body: { padding: 16 } }}
                      title={<Text strong>피드백 면담</Text>}
                    >
                      {feedbackMeeting ? (
                        <div className="tw-space-y-3">
                          <div className="tw-text-sm tw-text-slate-600">
                            {feedbackMeeting.completedAt ? '면담이 완료되었습니다.' : '결과 공개 후 생성된 피드백 면담 일정입니다.'}
                          </div>
                          <div className="tw-text-sm tw-font-medium tw-text-slate-900">
                            {dayjs(feedbackMeeting.scheduledAt).format('YYYY-MM-DD (ddd) HH:mm')}
                          </div>
                          <Link to="/app/meetings/$meetingId" params={{ meetingId: feedbackMeeting.meetingRecordId }}>
                            <AppButton variant="secondary">면담 상세 보기</AppButton>
                          </Link>
                        </div>
                      ) : (
                        <div className="tw-space-y-2">
                          <div className="tw-text-sm tw-text-slate-500">아직 연결된 피드백 면담이 보이지 않습니다.</div>
                          <div className="tw-text-xs tw-text-slate-400">자동 생성 직후에는 반영까지 잠시 시간이 걸릴 수 있습니다.</div>
                        </div>
                      )}
                    </Card>

                    <Card
                      className="tw-rounded-xl tw-border tw-border-slate-200/80"
                      styles={{ body: { padding: 16 } }}
                      title={<Text strong>후속 조치</Text>}
                    >
                      <div className="tw-space-y-3">
                        <div className="tw-text-sm tw-text-slate-500">
                          결과에 이견이 있거나 보완 설명이 필요하면 이의제기를 남길 수 있습니다.
                        </div>
                        <AppButton variant="secondary" onClick={() => setObjectionTarget(result)}>
                          이의제기 등록
                        </AppButton>
                      </div>
                    </Card>
                  </div>
                </div>
              </Card>
            );
          })}
        </Space>
      )}

      <ObjectionModal open={!!objectionTarget} target={objectionTarget} onClose={() => setObjectionTarget(null)} />
    </div>
  );
}

function ObjectionModal({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: EvaluationFlowResponse | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');

  const objectionMut = useMutation({
    mutationFn: () => evaluationRedesignApi.requestObjection(target!.responseId, content),
    onSuccess: () => {
      message.success('이의제기를 등록했습니다.');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['my-received-evals'] });
      onClose();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '이의제기 등록에 실패했습니다.'),
  });

  if (!target) return null;

  return (
    <AppDoubleActionModal
      open={open}
      onClose={onClose}
      onConfirm={() => objectionMut.mutate()}
      title="평가 결과 이의제기"
      confirmText="등록"
      cancelText="취소"
      confirmLoading={objectionMut.isPending}
      confirmDisabled={!content.trim()}
    >
      <div className="tw-px-5 tw-py-4">
      <Card className="tw-mb-3 tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-slate-50/60" styles={{ body: { padding: 14 } }}>
        <div className="tw-flex tw-items-center tw-gap-3">
          <span className="tw-text-xs tw-text-slate-500">최종 등급</span>
          <Tag color={GRADE_COLOR[target.confirmedGrade as keyof typeof GRADE_COLOR] ?? 'default'} className="!tw-m-0 !tw-rounded-full !tw-px-3 !tw-py-0.5 !tw-text-sm !tw-font-bold">
            {target.confirmedGrade ?? '-'}
          </Tag>
          <span className="tw-ml-auto tw-text-xs tw-text-slate-400">점수 {target.finalScoreSnapshot?.toFixed(2) ?? '-'}</span>
        </div>
      </Card>
      <TextArea
        rows={6}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="어떤 부분을 다시 검토해 달라는 것인지 구체적으로 적어 주세요."
        maxLength={5000}
        showCount
      />
      </div>
    </AppDoubleActionModal>
  );
}

const GRADE_COLOR = { S: 'gold', A: 'cyan', B: 'blue', C: 'default' } as const;
