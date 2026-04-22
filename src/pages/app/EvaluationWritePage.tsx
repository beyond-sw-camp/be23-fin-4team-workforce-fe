import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App, Button, Card, Collapse, Form, Input, Progress, Radio, Space, Tag, Typography, Spin, Divider, Badge,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, SendOutlined, InfoCircleOutlined, AimOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVALUATION_PAGE_KO as L } from '@/app/locale/app-ko';
import { evaluationApi } from '@/features/evaluation/api/evaluationApi';
import { normalizeEvaluationDesign } from '@/features/evaluation/lib/normalizeEvaluationDesign';
import type {
  Answer, DesignSection, DesignQuestion, EvaluationDesign, GoalSummaryCard,
} from '@/features/evaluation/model/types';
import { AppButton } from '@/shared/ui/AppButton';

const { Text, Title, Paragraph } = Typography;

export function EvaluationWritePage() {
  const { message } = App.useApp();
  const { responseId } = useParams({ strict: false }) as { responseId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data ──
  const { data: response, isLoading: responseLoading } = useQuery({
    queryKey: ['eval-response', responseId],
    queryFn: () => evaluationApi.getResponse(responseId),
  });

  const { data: designRaw, isLoading: designLoading, isError: designError } = useQuery({
    queryKey: ['eval-design', response?.designId],
    queryFn: () => evaluationApi.getDesign(response!.designId!),
    enabled: !!response?.designId,
  });

  // 목표 스냅샷 vs 현재 비교 요약 카드
  const { data: goalSummaries } = useQuery({
    queryKey: ['eval-goal-summaries', responseId],
    queryFn: () => evaluationApi.getGoalSummaries(responseId),
    enabled: !!response,
  });

  const design: EvaluationDesign | undefined = useMemo(
    () => (designRaw ? normalizeEvaluationDesign(designRaw) : undefined),
    [designRaw],
  );
  const sections: DesignSection[] = design?.sections ?? [];
  const editablePhases = new Set(['SELF_EVAL', 'PEER_EVAL', 'UPWARD_EVAL', 'DOWNWARD_EVAL']);

  // ── Local answer state ──
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    setInitialized(false);
    setAnswers({});
  }, [responseId]);

  // Initialize answers from response
  useEffect(() => {
    if (response && !initialized) {
      const map: Record<string, Answer> = {};
      for (const a of response.answers) {
        map[a.questionId] = a;
      }
      setAnswers(map);
      setInitialized(true);
    }
  }, [response, initialized]);
  const allQuestions = useMemo(() => sections.flatMap(s => s.questions), [sections]);
  const requiredQuestions = useMemo(() => allQuestions.filter(q => q.required), [allQuestions]);

  // ── Progress ──
  const answeredRequired = useMemo(() => {
    return requiredQuestions.filter(q => {
      const a = answers[q.id];
      if (!a) return false;
      if (q.type === 'text') return !!a.textValue?.trim();
      if (q.type === 'scale') return a.scaleValue != null;
      if (q.type === 'grade') return !!a.gradeValue;
      if (q.type === 'gap') return a.scaleValue != null;
      return false;
    }).length;
  }, [requiredQuestions, answers]);
  const progressPct = requiredQuestions.length > 0 ? Math.round((answeredRequired / requiredQuestions.length) * 100) : 0;
  const targetMemberLabel = response?.targetMemberName?.trim() || '평가 대상자';

  // ── Update answer ──
  const updateAnswer = useCallback((questionId: string, patch: Partial<Answer>) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], questionId, ...patch },
    }));
  }, []);

  // ── Save mutation ──
  const saveMut = useMutation({
    mutationFn: () => {
      const answerList = Object.values(answers);
      return evaluationApi.saveResponse(responseId, { answersJson: JSON.stringify(answerList) });
    },
    onSuccess: () => message.success(L.writeAutoSaved),
    onError: (e: any) => {
      const serverMessage = e?.message ?? e?.response?.data?.message ?? e?.response?.data?.error;
      message.error(serverMessage || '평가 저장에 실패했습니다.');
    },
  });

  // ── Submit mutation ──
  const submitMut = useMutation({
    mutationFn: async () => {
      // Save first
      const answerList = Object.values(answers);
      await evaluationApi.saveResponse(responseId, { answersJson: JSON.stringify(answerList) });
      return evaluationApi.submitResponse(responseId);
    },
    onSuccess: () => {
      message.success('평가가 제출되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['eval-my-responses'] });
      navigate({ to: '/app/evaluations' });
    },
    onError: (e: any) => {
      const serverMessage = e?.message ?? e?.response?.data?.message ?? e?.response?.data?.error;
      message.error(serverMessage || '평가 제출에 실패했습니다.');
    },
  });

  // ── Auto-save ──
  const isReadOnly = response?.status === 'SUBMITTED';

  useEffect(() => {
    if (isReadOnly) return;
    autoSaveRef.current = setInterval(() => {
      if (Object.keys(answers).length > 0) {
        saveMut.mutate();
      }
    }, 30000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [answers, isReadOnly]);

  // ── Handle submit ──
  const handleSubmit = () => {
    // Check all required questions are answered
    const unanswered = requiredQuestions.filter(q => {
      const a = answers[q.id];
      if (!a) return true;
      if (q.type === 'text') return !a.textValue?.trim();
      if (q.type === 'scale') return a.scaleValue == null;
      if (q.type === 'grade') return !a.gradeValue;
      if (q.type === 'gap') return a.scaleValue == null;
      return false;
    });
    const first = unanswered[0];
    if (first) {
      message.warning(`필수 문항 ${unanswered.length}개가 미작성입니다.`);
      // Scroll to first unanswered
      const el = document.getElementById(`q-${first.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    submitMut.mutate();
  };

  if (responseLoading) return <div className="tw-flex tw-justify-center tw-py-20"><Spin size="large" /></div>;
  if (!response) return <div className="tw-p-6"><Text type="danger">평가 응답을 찾을 수 없습니다.</Text></div>;
  if (response.designId && designLoading) {
    return <div className="tw-flex tw-justify-center tw-py-20"><Spin size="large" /></div>;
  }
  if (response.designId && designError) {
    return (
      <div className="tw-p-6">
        <Text type="danger">평가 설계를 불러오지 못했습니다. 관리자에게 문의하세요.</Text>
      </div>
    );
  }
  if (!response.designId) {
    return (
      <div className="tw-p-6 tw-max-w-screen-xl tw-mx-auto">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate({ to: '/app/evaluations' })} className="tw-mb-4" />
        <Card>
          <div className="tw-text-center tw-py-12 tw-text-gray-500">
            <InfoCircleOutlined className="tw-text-3xl tw-mb-2" />
            <div>이 평가 그룹에 연결된 설계가 없습니다. 관리자가 평가 그룹에 설계를 지정한 뒤 다시 시도해 주세요.</div>
          </div>
        </Card>
      </div>
    );
  }

  // ── Question Renderer ──
  const renderQuestion = (q: DesignQuestion) => {
    const a: Partial<Answer> = answers[q.id] ?? {};
    return (
      <div id={`q-${q.id}`} key={q.id} className="tw-py-4 tw-border-b tw-border-gray-100 last:tw-border-0">
        <div className="tw-flex tw-items-start tw-gap-2 tw-mb-2">
          <Text strong>{q.title}</Text>
          {q.required && <Tag color="red" className="tw-text-xs">{L.writeRequired}</Tag>}
        </div>
        {q.description && <Paragraph type="secondary" className="tw-text-sm tw-mb-3">{q.description}</Paragraph>}

        {q.type === 'text' && (
          <Input.TextArea
            rows={3}
            value={a.textValue ?? ''}
            onChange={e => updateAnswer(q.id, { textValue: e.target.value })}
            disabled={isReadOnly}
            placeholder="답변을 입력해주세요..."
          />
        )}

        {q.type === 'scale' && (
          <Radio.Group
            value={a.scaleValue}
            onChange={e => updateAnswer(q.id, { scaleValue: e.target.value })}
            disabled={isReadOnly}
          >
            <Space>
              {Array.from({ length: (q.options?.scaleMax ?? 5) - (q.options?.scaleMin ?? 1) + 1 }, (_, i) => {
                const val = (q.options?.scaleMin ?? 1) + i;
                return (
                  <Radio.Button key={val} value={val} className="tw-min-w-[48px] tw-text-center">
                    {val}
                  </Radio.Button>
                );
              })}
            </Space>
          </Radio.Group>
        )}

        {q.type === 'grade' && (
          <Radio.Group
            value={a.gradeValue}
            onChange={e => updateAnswer(q.id, { gradeValue: e.target.value })}
            disabled={isReadOnly}
          >
            <Space>
              {(q.options?.gradeLabels ?? ['S', 'A', 'B', 'C', 'D']).map(label => (
                <Radio.Button key={label} value={label} className="tw-min-w-[48px] tw-text-center tw-font-semibold">
                  {label}
                </Radio.Button>
              ))}
            </Space>
          </Radio.Group>
        )}

        {q.type === 'gap' && (
          <Radio.Group
            value={a.scaleValue}
            onChange={e => updateAnswer(q.id, { scaleValue: e.target.value })}
            disabled={isReadOnly}
          >
            <Space>
              {Array.from({ length: 5 }, (_, i) => i + 1).map(val => (
                <Radio.Button key={val} value={val} className="tw-min-w-[48px] tw-text-center">
                  {val}
                </Radio.Button>
              ))}
            </Space>
          </Radio.Group>
        )}
      </div>
    );
  };

  return (
    <div className="tw-mx-auto tw-w-full tw-max-w-[1400px] tw-space-y-6">
      {/* Header */}
      <Card
        className="tw-rounded-2xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
        styles={{ body: { padding: 20 } }}
      >
        <div className="tw-flex tw-items-center tw-gap-4">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate({ to: '/app/evaluations' })} />
          <div className="tw-flex-1">
            <Title level={4} className="!tw-m-0 !tw-text-[24px] !tw-font-bold !tw-leading-tight !tw-tracking-tight !tw-text-[#1e3a5f]">
              {L.writeTitle}
            </Title>
            <Text type="secondary">대상: {targetMemberLabel} · {({
            SELF: L.evalTypeSelf, DOWNWARD: L.evalTypeDownward, UPWARD: L.evalTypeUpward, PEER: L.evalTypePeer,
          }[response.evaluationType] ?? response.evaluationType)} 평가</Text>
          </div>
          <div className="tw-flex tw-items-center tw-gap-2 tw-min-w-[220px]">
            <Text type="secondary" className="tw-text-sm">{L.writeProgress}</Text>
            <Progress
              percent={progressPct}
              size="small"
              strokeColor={progressPct >= 80 ? '#22c55e' : progressPct >= 50 ? '#f59e0b' : '#ef4444'}
              className="tw-flex-1"
            />
          </div>
        </div>
      </Card>

      {/* Main Content */}
      <div className="tw-flex tw-items-start tw-gap-6">
        {/* Left: Questions */}
        <div className="tw-flex-1 tw-space-y-4">
          {sections.length > 0 ? sections.map((section, si) => (
            <Card
              key={si}
              className="tw-rounded-2xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
              styles={{ body: { padding: 20 } }}
              title={
                <div className="tw-flex tw-items-center tw-justify-between">
                  <Text strong>{`${si + 1}. ${section.title}`}</Text>
                  <Tag color="blue">{L.designWeight} {section.weight}%</Tag>
                </div>
              }
            >
              {section.questions.map(renderQuestion)}
            </Card>
          )) : (
            <Card>
              <div className="tw-text-center tw-py-12 tw-text-gray-400">
                <InfoCircleOutlined className="tw-text-3xl tw-mb-2" />
                <div>평가 설계가 아직 연결되지 않았습니다.</div>
              </div>
            </Card>
          )}

          {/* Action Bar */}
          {!isReadOnly && (
            <div className="tw-flex tw-justify-end tw-gap-3 tw-pt-4 tw-border-t tw-border-gray-200">
              <AppButton variant="secondary" onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
                <SaveOutlined /> {L.writeSave}
              </AppButton>
              <AppButton variant="primary" onClick={handleSubmit} loading={submitMut.isPending}>
                <SendOutlined /> {L.writeSubmit}
              </AppButton>
            </div>
          )}
        </div>

        {/* Right: Reference Panel */}
        <div className="tw-w-80 tw-flex-shrink-0 tw-self-start tw-sticky tw-top-6 tw-max-h-[calc(100dvh-110px)] tw-overflow-y-auto">
          <Card
            size="small"
            className="tw-rounded-2xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
            styles={{ body: { padding: 12 } }}
          >
            <Collapse
              accordion
              defaultActiveKey={['reference']}
              ghost
              items={[
                {
                  key: 'reference',
                  label: L.writeReferencePanel,
                  children: (
                    <div className="tw-space-y-4">
                      <div>
                        <Text type="secondary" className="tw-text-xs tw-block tw-mb-1">평가 대상</Text>
                        <Text>{targetMemberLabel}</Text>
                      </div>
                      <Divider className="tw-my-2" />
                      <div>
                        <Text type="secondary" className="tw-text-xs tw-block tw-mb-1">평가 유형</Text>
                        <Tag color="blue">{({
                          SELF: L.evalTypeSelf, DOWNWARD: L.evalTypeDownward, UPWARD: L.evalTypeUpward, PEER: L.evalTypePeer,
                        }[response.evaluationType])}</Tag>
                      </div>
                      <Divider className="tw-my-2" />
                      <div>
                        <Text type="secondary" className="tw-text-xs tw-block tw-mb-1">상태</Text>
                        {response.status === 'SUBMITTED' ? (
                          <Tag color="green">{L.statusSubmitted}</Tag>
                        ) : response.status === 'IN_PROGRESS' ? (
                          <Tag color="gold">{L.statusInProgress}</Tag>
                        ) : (
                          <Tag>{L.statusNotStarted}</Tag>
                        )}
                      </div>
                      {response.submittedAt && (
                        <>
                          <Divider className="tw-my-2" />
                          <div>
                            <Text type="secondary" className="tw-text-xs tw-block tw-mb-1">제출 시각</Text>
                            <Text className="tw-text-sm">{response.submittedAt}</Text>
                          </div>
                        </>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'criteria',
                  label: L.writeCriteriaPanel,
                  children: design ? (
                    <div className="tw-space-y-2">
                      {sections.map((s, i) => (
                        <div key={i} className="tw-flex tw-justify-between tw-text-sm">
                          <Text>{s.title}</Text>
                          <Text type="secondary">{s.weight}%</Text>
                        </div>
                      ))}
                      <Divider className="tw-my-2" />
                      <div className="tw-flex tw-justify-between tw-text-sm tw-font-semibold">
                        <Text>합계</Text>
                        <Text>{sections.reduce((s, sec) => s + sec.weight, 0)}%</Text>
                      </div>
                    </div>
                  ) : (
                    <Text type="secondary">연결된 기준 명세가 없습니다.</Text>
                  ),
                },
                {
                  key: 'goals',
                  label: (
                    <div className="tw-inline-flex tw-items-center tw-gap-2">
                      <AimOutlined />
                      <span>목표 현황</span>
                      <Tag color="blue" className="tw-text-xs">{goalSummaries?.length ?? 0}건</Tag>
                    </div>
                  ),
                  children: goalSummaries && goalSummaries.length > 0 ? (
                    <div className="tw-space-y-3">
                      {goalSummaries.map((card: GoalSummaryCard) => {
                        const snapshotPct = card.snapshot?.achievementPctAtSnapshot ?? null;
                        const currentPct = card.current?.achievementPct ?? null;
                        const delta = snapshotPct != null && currentPct != null ? currentPct - snapshotPct : null;
                        const deltaColor = delta != null ? (delta > 0 ? 'tw-text-emerald-600' : delta < 0 ? 'tw-text-rose-600' : 'tw-text-slate-400') : '';
                        const deltaSign = delta != null ? (delta > 0 ? '+' : '') : '';

                        return (
                          <div
                            key={card.goalId}
                            className={`tw-p-3 tw-rounded-xl tw-border ${
                              card.changedSinceSnapshot ? 'tw-border-orange-200 tw-bg-orange-50/60' : 'tw-border-slate-100 tw-bg-slate-50/60'
                            }`}
                          >
                            <div className="tw-flex tw-items-start tw-justify-between tw-gap-2 tw-mb-2">
                              <Text strong className="tw-text-sm tw-leading-tight">
                                {card.snapshot?.title ?? card.current?.title ?? '(삭제됨)'}
                              </Text>
                              {card.changedSinceSnapshot && (
                                <Badge
                                  count="변경됨"
                                  style={{ backgroundColor: '#fa8c16', fontSize: '10px' }}
                                />
                              )}
                            </div>
                            <div className="tw-flex tw-items-center tw-gap-3 tw-text-xs">
                              <div className="tw-flex tw-flex-col tw-items-center tw-gap-0.5">
                                <span className="tw-text-[10px] tw-text-slate-400">시작 시점</span>
                                <span className="tw-text-lg tw-font-bold tw-tabular-nums tw-text-slate-600">
                                  {snapshotPct != null ? `${Math.round(snapshotPct)}%` : '-'}
                                </span>
                              </div>
                              <div className="tw-flex tw-flex-1 tw-flex-col tw-gap-1">
                                <div className="tw-h-1.5 tw-flex-1 tw-rounded-full tw-bg-slate-200">
                                  <div
                                    className="tw-h-full tw-rounded-full tw-bg-slate-400 tw-transition-[width]"
                                    style={{ width: `${Math.min(100, snapshotPct ?? 0)}%` }}
                                  />
                                </div>
                                <div className="tw-h-1.5 tw-flex-1 tw-rounded-full tw-bg-slate-200">
                                  <div
                                    className="tw-h-full tw-rounded-full tw-bg-blue-500 tw-transition-[width]"
                                    style={{ width: `${Math.min(100, currentPct ?? 0)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="tw-flex tw-flex-col tw-items-center tw-gap-0.5">
                                <span className="tw-text-[10px] tw-text-slate-400">현재</span>
                                <span className="tw-text-lg tw-font-bold tw-tabular-nums tw-text-[#1e3a5f]">
                                  {currentPct != null ? `${Math.round(currentPct)}%` : '-'}
                                </span>
                              </div>
                              {delta != null && (
                                <div className="tw-flex tw-flex-col tw-items-center tw-gap-0.5">
                                  <span className="tw-text-[10px] tw-text-slate-400">변동</span>
                                  <span className={`tw-text-sm tw-font-bold tw-tabular-nums ${deltaColor}`}>
                                    {deltaSign}{Math.round(delta)}%p
                                  </span>
                                </div>
                              )}
                            </div>
                            {card.changeSummary.length > 0 && (
                              <div className="tw-flex tw-flex-wrap tw-gap-1 tw-mt-2">
                                {card.changeSummary.map((c: string) => (
                                  <Tag key={c} color="orange" className="!tw-text-[10px] !tw-m-0 !tw-rounded-md">
                                    {{
                                      TITLE: '제목 변경',
                                      TARGET_VALUE: '목표치 변경',
                                      STATUS: '상태 변경',
                                      PERIOD: '기간 변경',
                                      PROGRESS: '진행률 변동',
                                      DELETED_OR_HIDDEN: '삭제/비공개',
                                    }[c] ?? c}
                                  </Tag>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Text type="secondary">표시할 목표 현황이 없습니다.</Text>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}