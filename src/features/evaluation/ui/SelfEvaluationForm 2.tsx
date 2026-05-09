import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Input, Radio, Space, Tag, Upload } from 'antd';
import { LinkOutlined, UploadOutlined } from '@ant-design/icons';
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
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
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

  const initial = useMemo(() => parseInitialAnswers(response.answersJson, snapshot), [response.answersJson, snapshot]);
  const [grades, setGrades] = useState<Record<string, Grade>>(initial.gradeMap);
  const [comments, setComments] = useState<Record<string, string>>(initial.commentMap);
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>(initial.evidenceUrlMap);
  const [overallComment, setOverallComment] = useState<string>(initial.overallComment);
  const [uploadingGoalId, setUploadingGoalId] = useState<string | null>(null);
  const editable = response.stage === 'SELF_PENDING';

  const allAnswered = useMemo(() => {
    if (!snapshot) return false;
    for (const g of snapshot.goals) if (!grades[g.goalId]) return false;
    return true;
  }, [snapshot, grades]);

  const previewScore = useMemo(() => calcFinalScore(snapshot, grades), [snapshot, grades]);
  const scoreLabel = editable ? '예상 점수' : '자기평가 점수';

  useEffect(() => {
    setGrades(initial.gradeMap);
    setComments(initial.commentMap);
    setEvidenceUrls(initial.evidenceUrlMap);
    setOverallComment(initial.overallComment);
  }, [initial]);

  const buildPayload = (): SelfAnswersPayload => {
    const items: SelfGoalAnswer[] = [];
    if (snapshot) {
      for (const g of snapshot.goals) {
        const grade = grades[g.goalId];
        if (grade) {
          const evidenceUrl = evidenceUrls[g.goalId]?.trim();
          items.push({
            goalId: g.goalId,
            criteriaId: g.goalId,
            grade,
            comment: comments[g.goalId],
            evidenceUrl: evidenceUrl || undefined,
          });
        }
      }
    }
    return { items, overallComment };
  };

  const uploadEvidence = async (goalId: string, file: File) => {
    setUploadingGoalId(goalId);
    try {
      const uploaded = await memberChatApi.uploadFile(file);
      const url = uploaded.url?.trim() || memberChatApi.buildDownloadUrl(uploaded.key);
      setEvidenceUrls((prev) => ({ ...prev, [goalId]: url }));
      message.success('증적 파일을 첨부했습니다.');
    } catch (e: any) {
      message.error(e?.response?.data?.message ?? '증적 업로드에 실패했어요.');
    } finally {
      setUploadingGoalId(null);
    }
  };

  const saveMut = useMutation({
    mutationFn: () => evaluationRedesignApi.saveSelf(response.responseId, buildPayload()),
    onSuccess: () => {
      message.success('임시 저장을 완료했어요.');
      queryClient.invalidateQueries({ queryKey: ['my-self-evals'] });
      queryClient.invalidateQueries({ queryKey: ['my-evaluator-assignments'] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '임시 저장에 실패했어요.'),
  });

  const submitMut = useMutation({
    mutationFn: () => evaluationRedesignApi.submitSelf(response.responseId, buildPayload()),
    onSuccess: (r) => {
      message.success('자기평가 제출을 완료했어요.');
      queryClient.invalidateQueries({ queryKey: ['my-self-evals'] });
      queryClient.invalidateQueries({ queryKey: ['my-evaluator-assignments'] });
      onSubmitted?.(r);
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '제출에 실패했어요.'),
  });

  if (!snapshot) {
    return <AppEmptyIllustrated description="평가 대상 개인 목표 스냅샷이 없어요." />;
  }

  return (
    <div className="tw-flex tw-flex-col tw-gap-4">
      <Card
        className={SECTION_CARD}
        styles={{ body: { padding: 16 } }}
      >
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-4">
          <div className="tw-min-w-0">
            <div className="tw-text-[18px] tw-font-bold tw-text-slate-900">{editable ? '자기평가 작성' : '제출한 자기평가'}</div>
            {!editable && <div className="tw-mt-1 tw-text-xs tw-text-slate-500">제출 후에는 수정할 수 없고 내용만 확인할 수 있습니다.</div>}
          </div>
          <div className="tw-shrink-0 tw-rounded-full tw-bg-slate-100 tw-px-3 tw-py-1 tw-text-xs tw-font-semibold tw-text-slate-600">
            {scoreLabel} {previewScore}
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
                  <Tag bordered={false} className="!tw-m-0 !tw-rounded-full !tw-bg-slate-100 !tw-px-2.5 !tw-text-[11px] !tw-font-medium !tw-text-slate-700">
                    가중치 {goal.weightPct}%
                  </Tag>
                  <Tag bordered={false} className="!tw-m-0 !tw-rounded-full !tw-bg-blue-50 !tw-px-2.5 !tw-text-[11px] !tw-font-bold !tw-text-blue-700">
                    목표 점수 {gScore}
                  </Tag>
                </Space>
              </div>
            }
          >
            <div className="tw-mb-4 tw-text-sm tw-text-slate-500">{goal.description}</div>

            <div className="tw-mb-4 tw-rounded-xl tw-border tw-border-blue-100 tw-bg-blue-50/50 tw-p-4">
              <div className="tw-mb-2 tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-blue-600">
                조직 목표 평가 기준
              </div>
              <div className="tw-mb-3 tw-text-sm tw-font-semibold tw-text-slate-900">{goal.objectiveTitle ?? '상위 조직 목표'}</div>
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
              placeholder="개인 목표 코멘트 (선택)"
              value={comments[goal.goalId] ?? ''}
              onChange={(e) => setComments((p) => ({ ...p, [goal.goalId]: e.target.value }))}
              disabled={!editable}
              size="small"
            />

            <div className="tw-mt-3 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3">
              <div className="tw-mb-2 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
                <span className="tw-text-xs tw-font-semibold tw-text-slate-700">증적 첨부</span>
                <Upload
                  showUploadList={false}
                  disabled={!editable || uploadingGoalId === goal.goalId}
                  beforeUpload={(file) => {
                    void uploadEvidence(goal.goalId, file as File);
                    return Upload.LIST_IGNORE;
                  }}
                >
                  <Button size="small" icon={<UploadOutlined />} loading={uploadingGoalId === goal.goalId} disabled={!editable}>
                    파일 업로드
                  </Button>
                </Upload>
              </div>
              <Input
                prefix={<LinkOutlined className="tw-text-slate-400" />}
                placeholder="증적 URL을 붙여넣거나 파일을 업로드하세요."
                value={evidenceUrls[goal.goalId] ?? ''}
                onChange={(e) => setEvidenceUrls((p) => ({ ...p, [goal.goalId]: e.target.value }))}
                disabled={!editable}
                size="small"
              />
              {evidenceUrls[goal.goalId] ? (
                <a
                  href={evidenceUrls[goal.goalId]}
                  target="_blank"
                  rel="noreferrer"
                  className="tw-mt-2 tw-inline-flex tw-text-xs tw-font-medium tw-text-blue-600"
                >
                  첨부 증적 열기
                </a>
              ) : (
                <div className="tw-mt-2 tw-text-xs tw-text-slate-400">PDF, 문서, 이미지 등 성과 근거를 첨부할 수 있습니다.</div>
              )}
            </div>
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
          placeholder="이번 목표 기간 전반에 대한 의견을 남겨 주세요. (선택)"
        />
      </Card>

      {editable && (
        <Card className={SECTION_CARD} styles={{ body: { padding: 16 } }}>
          <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
            {!allAnswered ? (
              <span className="tw-text-xs tw-text-rose-500">모든 개인 목표의 등급을 선택해야 제출할 수 있어요.</span>
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

function parseInitialAnswers(answersJson?: string | null, snapshot?: GoalSnapshot | null) {
  const empty = {
    gradeMap: {} as Record<string, Grade>,
    commentMap: {} as Record<string, string>,
    evidenceUrlMap: {} as Record<string, string>,
    overallComment: '',
  };
  if (!answersJson) return empty;
  try {
    const parsed = JSON.parse(answersJson);
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.items)
        ? parsed.items
        : Array.isArray(parsed.answers)
          ? parsed.answers
          : [];
    const gradeMap: Record<string, Grade> = {};
    const commentMap: Record<string, string> = {};
    const evidenceUrlMap: Record<string, string> = {};
    for (const [index, it] of items.entries()) {
      const key = it.goalId ?? it.criteriaId ?? it.id ?? snapshot?.goals?.[index]?.goalId;
      if (!key) continue;
      const grade = it.grade ?? it.selectedGrade;
      if (grade) gradeMap[key] = grade;
      const comment = it.comment ?? it.description;
      if (comment) commentMap[key] = comment;
      const evidenceUrl = it.evidenceUrl ?? it.evidenceURL;
      if (evidenceUrl) evidenceUrlMap[key] = evidenceUrl;
    }
    return { gradeMap, commentMap, evidenceUrlMap, overallComment: parsed.overallComment ?? '' };
  } catch {
    return empty;
  }
}
