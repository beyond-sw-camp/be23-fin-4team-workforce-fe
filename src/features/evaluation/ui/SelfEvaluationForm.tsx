import { useMemo, useState } from 'react';
import { App, Card, Input, Radio, Space, Tag } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { evaluationRedesignApi } from '../api/evaluationRedesignApi';
import type {
  EvaluationFlowResponse,
  GoalSnapshot,
  SelfAnswersPayload,
  SelfGoalAnswer,
} from '../model/workflowTypes';
import type { Grade } from '@/features/goals/model/types';
import { calcFinalScore, gradeScore } from '../lib/scoreCalculator';
import { AppButton } from '@/shared/ui/AppButton';
import { AppEmptyIllustrated } from '@/shared/ui/AppEmptyIllustrated';

const { TextArea } = Input;
const GRADES: Grade[] = ['S', 'A', 'B', 'C'];

const SECTION_CARD =
  'tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5';

const GRADE_BADGE: Record<Grade, string> = {
  S: 'tw-bg-amber-50 tw-text-amber-700 tw-border-amber-200',
  A: 'tw-bg-cyan-50 tw-text-cyan-700 tw-border-cyan-200',
  B: 'tw-bg-blue-50 tw-text-blue-700 tw-border-blue-200',
  C: 'tw-bg-slate-100 tw-text-slate-600 tw-border-slate-200',
};

type Props = {
  response: EvaluationFlowResponse;
  onSubmitted?: (r: EvaluationFlowResponse) => void;
};

export function SelfEvaluationForm({ response, onSubmitted }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const snapshot: GoalSnapshot | null = response.goalSnapshot ?? null;

  const initial = parseInitialAnswers(response.answersJson);
  const [grades, setGrades] = useState<Record<string, Grade>>(initial.gradeMap);
  const [comments, setComments] = useState<Record<string, string>>(initial.commentMap);
  const [overallComment, setOverallComment] = useState<string>(initial.overallComment);

  const allAnswered = useMemo(() => {
    if (!snapshot) return false;
    for (const g of snapshot.goals) if (!grades[g.goalId]) return false;
    return true;
  }, [snapshot, grades]);

  const previewScore = useMemo(() => calcFinalScore(snapshot, grades), [snapshot, grades]);

  const buildPayload = (): SelfAnswersPayload => {
    const items: SelfGoalAnswer[] = [];
    if (snapshot) {
      for (const g of snapshot.goals) {
        const grade = grades[g.goalId];
        if (grade) items.push({ goalId: g.goalId, grade, comment: comments[g.goalId] });
      }
    }
    return { items, overallComment };
  };

  const saveMut = useMutation({
    mutationFn: () => evaluationRedesignApi.saveSelf(response.responseId, buildPayload()),
    onSuccess: () => {
      message.success('임시 저장 완료');
      queryClient.invalidateQueries({ queryKey: ['my-self-evals'] });
      queryClient.invalidateQueries({ queryKey: ['my-evaluator-assignments'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '임시 저장 실패'),
  });

  const submitMut = useMutation({
    mutationFn: () => evaluationRedesignApi.submitSelf(response.responseId, buildPayload()),
    onSuccess: (r) => {
      message.success('자기평가 제출 완료');
      queryClient.invalidateQueries({ queryKey: ['my-self-evals'] });
      queryClient.invalidateQueries({ queryKey: ['my-evaluator-assignments'] });
      onSubmitted?.(r);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '제출 실패'),
  });

  const editable = response.stage === 'SELF_PENDING';

  if (!snapshot) {
    return <AppEmptyIllustrated description="평가 대상 목표 스냅샷이 없습니다." />;
  }

  return (
    <div className="tw-flex tw-flex-col tw-gap-5">
      <Card
        className="tw-rounded-2xl tw-border tw-border-indigo-200 tw-bg-indigo-50/40"
        styles={{ body: { padding: 20 } }}
      >
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-4">
          <div>
            <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-indigo-500">
              SELF EVALUATION
            </div>
            <div className="tw-mt-0.5 tw-text-[18px] tw-font-bold tw-text-[#1e3a5f]">
              자기평가 입력
            </div>
            <div className="tw-mt-1 tw-text-xs tw-text-slate-500">
              KR별 등급만 선택하면 되고, 기준 텍스트는 상위 Objective rubric을 참고합니다.
            </div>
          </div>
          <div className="tw-shrink-0 tw-text-right">
            <div className="tw-text-[10px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
              예상 최종 점수
            </div>
            <div className="tw-text-[36px] tw-font-bold tw-leading-none tw-text-[#1e3a5f]">
              {previewScore}
            </div>
          </div>
        </div>
      </Card>

      {snapshot.goals.map((goal) => {
        const myGrade = grades[goal.goalId];
        const gScore = gradeScore(myGrade);
        return (
          <Card
            key={goal.goalId}
            className={SECTION_CARD}
            styles={{ body: { padding: 20 } }}
            title={
              <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                <span className="tw-text-[15px] tw-font-semibold tw-text-slate-900">{goal.title}</span>
                <Space size={6}>
                  <Tag
                    bordered={false}
                    className="!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-px-2.5 !tw-text-[11px] !tw-font-medium !tw-text-slate-700"
                  >
                    가중치 {goal.weightPct}%
                  </Tag>
                  <Tag
                    bordered={false}
                    className="!tw-m-0 !tw-rounded-full !tw-bg-blue-50 !tw-px-2.5 !tw-text-[11px] !tw-font-bold !tw-text-blue-700"
                  >
                    목표 점수 {gScore}
                  </Tag>
                </Space>
              </div>
            }
          >
            <div className="tw-mb-4 tw-text-sm tw-text-slate-500">{goal.description}</div>

            <div className="tw-mb-4 tw-rounded-xl tw-border tw-border-blue-100 tw-bg-blue-50/50 tw-p-4">
              <div className="tw-mb-2 tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-blue-600">
                Objective Rubric
              </div>
              <div className="tw-mb-3 tw-text-sm tw-font-semibold tw-text-slate-900">
                {goal.objectiveTitle ?? '상위 Objective'}
              </div>
              <div className="tw-grid tw-grid-cols-4 tw-gap-2">
                {GRADES.map((g) => (
                  <div key={g} className="tw-rounded-lg tw-border tw-border-blue-100 tw-bg-white tw-p-3">
                    <div
                      className={
                        'tw-mb-2 tw-inline-flex tw-h-7 tw-w-10 tw-items-center tw-justify-center tw-rounded-full tw-border tw-text-xs tw-font-bold ' +
                        GRADE_BADGE[g]
                      }
                    >
                      {g}
                    </div>
                    <div className="tw-text-[12px] tw-leading-snug tw-text-slate-600">
                      {g === 'S' ? goal.gradeS : g === 'A' ? goal.gradeA : g === 'B' ? goal.gradeB : goal.gradeC}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="tw-mb-3 tw-flex tw-items-center tw-gap-3">
              <span className="tw-w-16 tw-text-xs tw-font-semibold tw-text-slate-600">등급 선택</span>
              <Radio.Group
                value={myGrade}
                onChange={(e) => setGrades((p) => ({ ...p, [goal.goalId]: e.target.value }))}
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

            <Input
              placeholder="목표 코멘트 (선택)"
              value={comments[goal.goalId] ?? ''}
              onChange={(e) => setComments((p) => ({ ...p, [goal.goalId]: e.target.value }))}
              disabled={!editable}
              size="small"
            />
          </Card>
        );
      })}

      <Card
        className={SECTION_CARD}
        styles={{ body: { padding: 20 } }}
        title={<span className="tw-text-[15px] tw-font-semibold tw-text-slate-900">종합 코멘트</span>}
      >
        <TextArea
          rows={3}
          value={overallComment}
          onChange={(e) => setOverallComment(e.target.value)}
          disabled={!editable}
          placeholder="이번 주기 전반에 대한 의견 (선택)"
        />
      </Card>

      {editable && (
        <Card className={SECTION_CARD} styles={{ body: { padding: 16 } }}>
          <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
            {!allAnswered ? (
              <span className="tw-text-xs tw-text-rose-500">모든 KR에 등급을 선택해야 제출할 수 있습니다.</span>
            ) : (
              <span className="tw-text-xs tw-text-emerald-600">제출 준비 완료</span>
            )}
            <Space>
              <AppButton variant="secondary" onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
                임시 저장
              </AppButton>
              <AppButton
                variant="primary"
                onClick={() => submitMut.mutate()}
                loading={submitMut.isPending}
                disabled={!allAnswered}
              >
                제출
              </AppButton>
            </Space>
          </div>
        </Card>
      )}
    </div>
  );
}

function parseInitialAnswers(answersJson?: string | null) {
  const empty = {
    gradeMap: {} as Record<string, Grade>,
    commentMap: {} as Record<string, string>,
    overallComment: '',
  };
  if (!answersJson) return empty;
  try {
    const parsed = JSON.parse(answersJson);
    const gradeMap: Record<string, Grade> = {};
    const commentMap: Record<string, string> = {};
    for (const it of parsed.items ?? []) {
      const key = it.goalId ?? it.criteriaId;
      if (!key) continue;
      gradeMap[key] = it.grade;
      if (it.comment) commentMap[key] = it.comment;
    }
    return { gradeMap, commentMap, overallComment: parsed.overallComment ?? '' };
  } catch {
    return empty;
  }
}
