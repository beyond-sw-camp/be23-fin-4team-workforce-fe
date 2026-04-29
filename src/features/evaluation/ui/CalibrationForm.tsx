import { useEffect, useMemo, useState } from 'react';
import { App, Card, Input, Radio, Space, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { evaluationRedesignApi } from '../api/evaluationRedesignApi';
import type { EvaluationFlowResponse, GoalSnapshot } from '../model/workflowTypes';
import type { Grade } from '@/features/goals/model/types';
import { calcFinalScore, gradeScore } from '../lib/scoreCalculator';
import { AppButton } from '@/shared/ui/AppButton';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';

const { TextArea } = Input;
const GRADES: Grade[] = ['S', 'A', 'B', 'C'];

const SECTION_CARD =
  'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

type Props = {
  response: EvaluationFlowResponse;
  currentUserId: string;
};

export function CalibrationForm({ response, currentUserId }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const snapshot: GoalSnapshot | null = response.goalSnapshot ?? null;

  const { data: calibrations = [] } = useQuery({
    queryKey: ['calibrations', response.responseId],
    queryFn: () => evaluationRedesignApi.listCalibrations(response.responseId),
  });

  const myCal = calibrations.find((c) => c.evaluatorId === currentUserId);
  const role = myCal?.role;
  const isLead = role === 'LEAD';
  const selfAnswers = useMemo(() => parseSelfAnswers(response.answersJson), [response.answersJson]);

  const [suggested, setSuggested] = useState<Record<string, Grade>>({});
  const [finalG, setFinalG] = useState<Record<string, Grade>>({});
  const [comment, setComment] = useState<string>('');

  useEffect(() => {
    if (myCal) {
      setSuggested(myCal.suggestedGrades ?? {});
      setFinalG(myCal.finalGrades ?? {});
      setComment(myCal.comment ?? '');
    }
  }, [myCal]);

  const upsertMut = useMutation({
    mutationFn: (submit: boolean) =>
      evaluationRedesignApi.upsertCalibration(response.responseId, {
        suggestedGrades: suggested,
        finalGrades: isLead ? finalG : undefined,
        comment,
        submit,
      }),
    onSuccess: () => {
      message.success('저장되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['calibrations', response.responseId] });
      queryClient.invalidateQueries({ queryKey: ['my-evaluator-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['my-self-evals'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '저장에 실패했습니다.'),
  });

  if (!snapshot) {
    return <AppEmptyIllustrated description="평가 스냅샷이 없습니다." />;
  }
  if (!myCal) {
    return <AppEmptyIllustrated description="이 응답을 검토할 권한이 없습니다." />;
  }

  const editable =
    response.stage === 'SELF_SUBMITTED' ||
    response.stage === 'CALIBRATION_OPEN' ||
    response.stage === 'PEER_OPEN' ||
    response.stage === 'UPWARD_OPEN' ||
    response.stage === 'DOWNWARD_OPEN';

  const previewBase = isLead ? finalG : suggested;

  return (
    <div className="tw-flex tw-flex-col tw-gap-5">
      <Card
        className={
          isLead
            ? 'tw-rounded-2xl tw-border tw-border-amber-200 tw-bg-amber-50/40'
            : 'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-slate-50/50'
        }
        styles={{ body: { padding: 20 } }}
      >
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-4">
          <div>
            <div
              className={
                'tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide ' +
                (isLead ? 'tw-text-amber-600' : 'tw-text-slate-500')
              }
            >
              CALIBRATION · {role}
            </div>
            <div className="tw-mt-0.5 tw-text-[18px] tw-font-bold tw-text-[#1e3a5f]">등급 조정</div>
            <div className="tw-mt-1 tw-text-xs tw-text-slate-500">
              {isLead
                ? 'Lead는 개인 목표별 최종 등급을 정리하고, Assistant는 제안 등급과 코멘트를 남깁니다. 기준 문구는 상위 조직 목표의 평가 기준을 참고합니다.'
                : '제안 등급과 코멘트를 남기면 Lead가 최종 확정 시 참고합니다.'}
            </div>
          </div>
          <div className="tw-shrink-0 tw-text-right">
            <div className="tw-text-[10px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
              {isLead ? '최종 점수 미리보기' : '제안 점수 미리보기'}
            </div>
            <div className="tw-text-[36px] tw-font-bold tw-leading-none tw-text-[#1e3a5f]">
              {calcFinalScore(snapshot, previewBase)}
            </div>
          </div>
        </div>
      </Card>

      {snapshot.goals.map((goal) => {
        const baseGrade = previewBase[goal.goalId];
        const gScore = gradeScore(baseGrade);
        const selfGrade = selfAnswers[goal.goalId];
        const otherGrades = calibrations
          .filter((cal) => cal.evaluatorId !== currentUserId)
          .map((cal) => ({ role: cal.role, grade: cal.suggestedGrades?.[goal.goalId] }))
          .filter((x) => x.grade);

        return (
          <Card
            key={goal.goalId}
            className={SECTION_CARD}
            styles={{ body: { padding: 20 } }}
            title={
              <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                <span className="tw-text-[15px] tw-font-semibold tw-text-slate-900">{goal.title}</span>
                <Space size={6}>
                  <Tag bordered={false} className="!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-px-2.5 !tw-text-[11px] !tw-font-medium !tw-text-slate-700">
                    가중치 {goal.weightPct}%
                  </Tag>
                  <Tag bordered={false} className="!tw-m-0 !tw-rounded-full !tw-bg-blue-50 !tw-px-2.5 !tw-text-[11px] !tw-font-bold !tw-text-blue-700">
                    {gScore}
                  </Tag>
                </Space>
              </div>
            }
          >
            <div className="tw-mb-3 tw-text-sm tw-text-slate-500">{goal.description}</div>

            <div className="tw-mb-4 tw-rounded-xl tw-border tw-border-blue-100 tw-bg-blue-50/50 tw-p-4">
              <div className="tw-mb-2 tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-blue-600">
                조직 목표 평가 기준
              </div>
              <div className="tw-mb-3 tw-text-sm tw-font-semibold tw-text-slate-900">{goal.objectiveTitle ?? '상위 조직 목표'}</div>
              <div className="tw-grid tw-grid-cols-4 tw-gap-2">
                {GRADES.map((g) => (
                  <div key={g} className="tw-rounded-lg tw-border tw-border-blue-100 tw-bg-white tw-p-3">
                    <div className="tw-mb-1 tw-text-[10px] tw-font-bold tw-text-slate-500">{g}</div>
                    <div className="tw-text-[12px] tw-leading-snug tw-text-slate-600">
                      {g === 'S' ? goal.gradeS : g === 'A' ? goal.gradeA : g === 'B' ? goal.gradeB : goal.gradeC}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
              <span className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
                다른 평가
              </span>
              <Tag bordered={false} className="!tw-m-0 !tw-rounded-full !tw-bg-emerald-50 !tw-px-2.5 !tw-text-[11px] !tw-font-medium !tw-text-emerald-700">
                자기평가 {selfGrade ?? '-'}
              </Tag>
              {otherGrades.map((og, i) => (
                <Tag
                  key={`${goal.goalId}-${i}`}
                  bordered={false}
                  className={
                    og.role === 'LEAD'
                      ? '!tw-m-0 !tw-rounded-full !tw-bg-amber-50 !tw-px-2.5 !tw-text-[11px] !tw-font-medium !tw-text-amber-700'
                      : '!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-px-2.5 !tw-text-[11px] !tw-font-medium !tw-text-slate-600'
                  }
                >
                  {og.role} {og.grade}
                </Tag>
              ))}
              {otherGrades.length === 0 && <span className="tw-text-xs tw-text-slate-400">아직 없음</span>}
            </div>

            <div className="tw-flex tw-flex-col tw-gap-2 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3">
              <div className="tw-flex tw-items-center tw-gap-3">
                <span className="tw-w-20 tw-text-xs tw-font-semibold tw-text-slate-600">제안 등급</span>
                <Radio.Group
                  value={suggested[goal.goalId]}
                  onChange={(e) => setSuggested((p) => ({ ...p, [goal.goalId]: e.target.value }))}
                  disabled={!editable}
                >
                  {GRADES.map((g) => (
                    <Radio.Button key={g} value={g}>
                      {g}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </div>

              {isLead && (
                <div className="tw-flex tw-items-center tw-gap-3 tw-border-t tw-border-slate-200 tw-pt-2">
                  <span className="tw-w-20 tw-text-xs tw-font-bold tw-text-amber-600">최종 등급</span>
                  <Radio.Group
                    value={finalG[goal.goalId]}
                    onChange={(e) => setFinalG((p) => ({ ...p, [goal.goalId]: e.target.value }))}
                    disabled={!editable}
                    buttonStyle="solid"
                  >
                    {GRADES.map((g) => (
                      <Radio.Button key={g} value={g}>
                        {g}
                      </Radio.Button>
                    ))}
                  </Radio.Group>
                </div>
              )}
            </div>
          </Card>
        );
      })}

      <Card
        className={SECTION_CARD}
        styles={{ body: { padding: 20 } }}
        title={<span className="tw-text-[15px] tw-font-semibold tw-text-slate-900">평가 코멘트</span>}
      >
        <TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} disabled={!editable} />
      </Card>

      {editable && (
        <Card className={SECTION_CARD} styles={{ body: { padding: 16 } }}>
          <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
            {isLead && (
              <span className="tw-text-xs tw-text-slate-500">
                Lead의 최종 확정은 별도 [최종 확정] 단계에서 진행됩니다.
              </span>
            )}
            <Space>
              <AppButton variant="secondary" onClick={() => upsertMut.mutate(false)} loading={upsertMut.isPending}>
                임시 저장
              </AppButton>
              <AppButton variant="primary" onClick={() => upsertMut.mutate(true)} loading={upsertMut.isPending}>
                제안 내용 제출
              </AppButton>
            </Space>
          </div>
        </Card>
      )}
    </div>
  );
}

function parseSelfAnswers(json?: string | null): Record<string, Grade> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    const m: Record<string, Grade> = {};
    for (const it of parsed.items ?? []) {
      const key = it.goalId ?? it.criteriaId;
      if (key) m[key] = it.grade;
    }
    return m;
  } catch {
    return {};
  }
}
