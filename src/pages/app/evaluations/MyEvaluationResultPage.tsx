import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useNavigate, useParams} from '@tanstack/react-router';
import {
    Alert,
    Avatar,
    Button,
    Card,
    Empty,
    Space,
    Tag,
    Typography,
} from 'antd';
import {
    ArrowLeftOutlined,
    BarChartOutlined,
    MessageOutlined,
    TeamOutlined,
    UserOutlined,
} from '@ant-design/icons';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {
    Answer,
    EvalType,
    EvaluationResponse,
    KpiContribution,
    ScoreBreakdown,
    SectionScore,
} from '@/features/evaluation/model/types';
import {evalTypeLabel} from '@/features/evaluation/lib/evaluationLabels';
import {parseApiError} from '@/shared/api/error-parser';

const {Text, Title, Paragraph} = Typography;

/** 결재 등급 태그 색상 */
function gradeTagColor(grade?: string): string {
    if (!grade) return 'default';
    const upper = grade.toUpperCase();
    if (upper.startsWith('S') || upper.startsWith('A+')) return 'gold';
    if (upper.startsWith('A')) return 'green';
    if (upper.startsWith('B')) return 'blue';
    if (upper.startsWith('C')) return 'orange';
    if (upper.startsWith('D') || upper.startsWith('F')) return 'red';
    return 'default';
}

/** 한 응답의 주관식(코멘트) 답변만 추출 */
function extractComments(answers: Answer[]): Array<{questionId: string; text: string}> {
    return answers
        .filter((a) => typeof a.textValue === 'string' && a.textValue.trim().length > 0)
        .map((a) => ({questionId: a.questionId, text: a.textValue!.trim()}));
}

export function MyEvaluationResultPage() {
    const navigate = useNavigate();
    const {seasonId} = useParams({strict: false}) as {seasonId: string};

    const {
        data: responses = [],
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['eval-my-season-result', seasonId],
        queryFn: () => evaluationApi.listMySeasonResult(seasonId),
        enabled: !!seasonId,
        retry: false,
    });

    const seasonName = useMemo(() => {
        return responses.find((r) => r.seasonName)?.seasonName ?? `시즌 #${seasonId.slice(0, 8)}`;
    }, [responses, seasonId]);

    // 자기평가 vs 타인 평가 분리
    const {selfResponse, othersResponses} = useMemo(() => {
        const self = responses.find((r) => r.evaluationType === 'SELF');
        const others = responses.filter((r) => r.evaluationType !== 'SELF');
        return {selfResponse: self, othersResponses: others};
    }, [responses]);

    // 최종 등급 (캘리브레이션 결과) — 어떤 응답이든 동일 대상자에 대한 값이 동일해야 함
    const finalGrade = useMemo(() => {
        for (const r of responses) {
            const g = r.calibration?.adjustedGrade ?? r.calibration?.originalGrade;
            if (g && g.trim()) return g.trim();
        }
        return undefined;
    }, [responses]);

    // 평균 점수 (타인 평가만)
    const othersAvgScore = useMemo(() => {
        const scores = othersResponses
            .map((r) => r.normalizedScore)
            .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
        if (scores.length === 0) return undefined;
        return scores.reduce((a, b) => a + b, 0) / scores.length;
    }, [othersResponses]);

    // 평가 유형별 집계
    const byType = useMemo(() => {
        const map: Record<string, {count: number; avg?: number; sum: number; hit: number}> = {};
        for (const r of othersResponses) {
            const bucket = map[r.evaluationType] ?? {count: 0, sum: 0, hit: 0};
            bucket.count += 1;
            if (typeof r.normalizedScore === 'number' && !Number.isNaN(r.normalizedScore)) {
                bucket.sum += r.normalizedScore;
                bucket.hit += 1;
            }
            map[r.evaluationType] = bucket;
        }
        return Object.entries(map).map(([type, v]) => ({
            type: type as EvalType,
            count: v.count,
            avg: v.hit > 0 ? v.sum / v.hit : undefined,
        }));
    }, [othersResponses]);

    const goBack = () => navigate({to: '/app/evaluations'});

    if (isError) {
        const parsed = parseApiError(error);
        return (
            <div className="tw-mx-auto tw-w-full tw-space-y-4">
                <Button icon={<ArrowLeftOutlined />} type="link" onClick={goBack} className="!tw-p-0">
                    평가 목록으로
                </Button>
                <Alert
                    type="warning"
                    showIcon
                    message="결과를 확인할 수 없습니다."
                    description={parsed.message}
                />
            </div>
        );
    }

    if (!isLoading && responses.length === 0) {
        return (
            <div className="tw-mx-auto tw-w-full tw-space-y-4">
                <Button icon={<ArrowLeftOutlined />} type="link" onClick={goBack} className="!tw-p-0">
                    평가 목록으로
                </Button>
                <Card>
                    <Empty description="이 시즌에는 회원님에 대한 평가 결과가 없습니다." />
                </Card>
            </div>
        );
    }

    return (
        <div className="tw-mx-auto tw-w-full tw-space-y-4">
            <Button icon={<ArrowLeftOutlined />} type="link" onClick={goBack} className="!tw-p-0 !tw-mb-1">
                평가 목록으로
            </Button>

            <div>
                <Title
                    level={3}
                    className="!tw-m-0 !tw-text-[22px] !tw-font-bold !tw-tracking-tight !tw-text-[#1e3a5f] sm:!tw-text-[24px]"
                >
                    내 평가 결과 — {seasonName}
                </Title>
                <Paragraph className="!tw-mb-0 !tw-text-[14px] !tw-text-slate-600">
                    나를 대상으로 진행된 평가의 최종 결과입니다.
                </Paragraph>
            </div>

            <section className="tw-grid tw-grid-cols-1 tw-gap-5 lg:tw-grid-cols-[minmax(0,1fr)_280px]">
                <div
                    className="tw-relative tw-overflow-hidden tw-rounded-3xl tw-p-6 tw-text-white tw-shadow-lg tw-shadow-indigo-500/20"
                    style={{background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 55%, #8B5CF6 100%)'}}
                >
                    <div className="tw-flex tw-items-start tw-justify-between tw-gap-4">
                        <div className="tw-space-y-2">
                            <Text className="!tw-text-white/85 !tw-text-[18px] !tw-font-semibold">나의 종합 평균 점수</Text>
                            <div className="tw-leading-none">
                                <span className="tw-text-[62px] tw-font-bold">
                                    {othersAvgScore != null ? othersAvgScore.toFixed(1) : '0.0'}
                                </span>
                                <span className="tw-ml-2 tw-text-[40px] tw-font-semibold tw-text-white/90">점</span>
                            </div>
                            <div className="tw-flex tw-flex-wrap tw-gap-2 tw-pt-2">
                                <div className="tw-rounded-2xl tw-border tw-border-white/30 tw-bg-white/15 tw-px-3 tw-py-2 tw-backdrop-blur">
                                    <div className="tw-text-xs tw-font-medium tw-text-white/75">최종 등급</div>
                                    <div className="tw-text-lg tw-font-semibold">{finalGrade ?? '미부여'}</div>
                                </div>
                                <div className="tw-rounded-2xl tw-border tw-border-white/30 tw-bg-white/15 tw-px-3 tw-py-2 tw-backdrop-blur">
                                    <div className="tw-text-xs tw-font-medium tw-text-white/75">평가 참여</div>
                                    <div className="tw-text-lg tw-font-semibold">
                                        {othersResponses.length}건 (동료)
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="tw-hidden tw-self-center tw-rounded-2xl tw-bg-white/10 tw-p-3 sm:tw-block">
                            <BarChartOutlined className="tw-text-[42px] tw-text-white/80" />
                        </div>
                    </div>
                </div>

                <div className="tw-rounded-3xl tw-border tw-border-slate-200/80 tw-bg-white tw-p-5 tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                    <Text className="!tw-text-slate-500 !tw-text-sm !tw-font-semibold">평가 유형 요약</Text>
                    <div className="tw-mt-4 tw-space-y-3">
                        {byType.length > 0 ? byType.map((row) => (
                            <div
                                key={row.type}
                                className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-rounded-2xl tw-bg-slate-50 tw-px-3 tw-py-2.5"
                            >
                                <div className="tw-flex tw-items-center tw-gap-2">
                                    <span className="tw-flex tw-size-8 tw-items-center tw-justify-center tw-rounded-xl tw-bg-indigo-100 tw-text-indigo-600">
                                        {row.type === 'PEER' ? <TeamOutlined /> : <UserOutlined />}
                                    </span>
                                    <div>
                                        <div className="tw-text-sm tw-font-semibold tw-text-slate-800">
                                            {evalTypeLabel(row.type)}
                                        </div>
                                        <div className="tw-text-xs tw-text-slate-500">참여 {row.count}건</div>
                                    </div>
                                </div>
                                <div className="tw-text-sm tw-font-semibold tw-text-indigo-600">
                                    {row.avg != null ? `${row.avg.toFixed(1)}점` : '-'}
                                </div>
                            </div>
                        )) : (
                            <Empty description="유형 요약이 없습니다." image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                    </div>
                </div>
            </section>

            <section className="tw-grid tw-grid-cols-1 tw-gap-5 lg:tw-grid-cols-[360px_minmax(0,1fr)]">
                {selfResponse ? (
                    <div className="tw-rounded-3xl tw-border tw-border-indigo-400/80 tw-bg-white tw-p-5 tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                        <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between">
                            <Tag className="!tw-m-0 !tw-rounded-md !tw-border-0 !tw-bg-indigo-100 !tw-text-indigo-700 !tw-font-semibold">
                                SELF-REVIEW
                            </Tag>
                            <div className="tw-text-right">
                                <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">Total score</div>
                                <div className="tw-text-[38px] tw-font-bold tw-leading-none tw-text-slate-900">
                                    {typeof selfResponse.normalizedScore === 'number' ? selfResponse.normalizedScore.toFixed(1) : '0.0'}
                                </div>
                            </div>
                        </div>
                        <ScoreBreakdownPanel breakdown={selfResponse.scoreBreakdown} tone="indigo" />
                        <div className="tw-mt-5 tw-rounded-2xl tw-border tw-border-slate-200/80 tw-bg-slate-50/80 tw-p-4">
                            <div className="tw-text-xs tw-font-semibold tw-text-slate-500">작성 내용</div>
                            <div className="tw-mt-2">
                                <FeedbackBody response={selfResponse} />
                            </div>
                        </div>
                    </div>
                ) : (
                    <Card className="!tw-rounded-3xl !tw-border-slate-200/80">
                        <Empty description="자기 평가가 없습니다." />
                    </Card>
                )}

                <div className="tw-space-y-4">
                    <div className="tw-flex tw-items-center tw-gap-2">
                        <MessageOutlined className="tw-text-emerald-500" />
                        <Title level={4} className="!tw-m-0 !tw-text-[28px] !tw-font-bold !tw-text-slate-900">
                            동료 피드백 분석
                        </Title>
                    </div>

                    {othersResponses.length === 0 ? (
                        <Card className="!tw-rounded-3xl !tw-border-slate-200/80">
                            <Empty description="아직 피드백이 없습니다." />
                        </Card>
                    ) : (
                        <Space direction="vertical" size={12} className="tw-w-full">
                            {othersResponses.map((r, idx) => (
                                <div
                                    key={r.responseId}
                                    className="tw-rounded-3xl tw-border tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                                >
                                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-border-b tw-border-slate-100 tw-p-4">
                                        <div className="tw-flex tw-items-center tw-gap-3">
                                            <Avatar
                                                icon={<UserOutlined />}
                                                className="!tw-bg-emerald-100 !tw-text-emerald-600"
                                            />
                                            <div>
                                                <div className="tw-text-base tw-font-semibold tw-text-slate-900">
                                                    Anonymous Peer #{idx + 1}
                                                </div>
                                                <div className="tw-text-xs tw-text-slate-500">
                                                    {evalTypeLabel(r.evaluationType)} 수신 완료
                                                </div>
                                            </div>
                                        </div>
                                        <Tag className="!tw-m-0 !tw-rounded-full !tw-border-0 !tw-bg-emerald-100 !tw-text-emerald-700 !tw-font-semibold">
                                            Score {typeof r.normalizedScore === 'number' ? r.normalizedScore.toFixed(1) : '0.0'}
                                        </Tag>
                                    </div>
                                    <div className="tw-p-4">
                                        <ScoreBreakdownPanel breakdown={r.scoreBreakdown} tone="emerald" />
                                        <div className="tw-mt-4 tw-rounded-2xl tw-border tw-border-emerald-200/80 tw-bg-emerald-50/60 tw-p-4">
                                            <FeedbackBody response={r} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </Space>
                    )}
                </div>
            </section>
        </div>
    );
}

function FeedbackBody({response}: {response: EvaluationResponse}) {
    const comments = extractComments(response.answers ?? []);
    if (comments.length === 0) {
        return <Text type="secondary">서술형 피드백이 없습니다.</Text>;
    }
    return (
        <Space direction="vertical" size={8} className="tw-w-full">
            {comments.map((c, idx) => (
                <div key={`${c.questionId}-${idx}`}>
                    <Text className="tw-whitespace-pre-wrap">{c.text}</Text>
                </div>
            ))}
        </Space>
    );
}

/** [L-1 Phase D] 섹션 타입별 기여도를 바 차트 형태로 표시. */
function ScoreBreakdownPanel({breakdown, tone = 'indigo'}: {breakdown?: ScoreBreakdown; tone?: 'indigo' | 'emerald'}) {
    if (!breakdown || !breakdown.sections || breakdown.sections.length === 0) return null;
    const isEmerald = tone === 'emerald';
    return (
        <div className={`tw-mb-3 tw-rounded-2xl tw-p-3 ${isEmerald ? 'tw-bg-emerald-50/40' : 'tw-bg-indigo-50/40'}`}>
            <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
                <Text strong className="tw-text-xs">점수 구성</Text>
                {typeof breakdown.totalScore === 'number' && (
                    <Text className="tw-text-xs tw-text-gray-500">
                        총점 {breakdown.totalScore.toFixed(1)}
                    </Text>
                )}
            </div>
            <Space direction="vertical" size={6} className="tw-w-full">
                {breakdown.sections.map((s, idx) => (
                    <SectionScoreRow key={s.sectionId ?? idx} section={s} />
                ))}
            </Space>
        </div>
    );
}

function sectionTypeLabel(t?: string) {
    switch (t) {
        case 'KPI_SCORE':
            return 'KPI';
        case 'PEER_FEEDBACK':
            return '동료';
        case 'MANUAL':
        default:
            return '수동';
    }
}

function sectionTypeColor(t?: string): string {
    switch (t) {
        case 'KPI_SCORE':
            return 'geekblue';
        case 'PEER_FEEDBACK':
            return 'purple';
        case 'MANUAL':
        default:
            return 'default';
    }
}

function SectionScoreRow({section: s}: {section: SectionScore}) {
    const pct = typeof s.score === 'number' ? Math.max(0, Math.min(100, s.score)) : 0;
    const barColor =
        s.type === 'KPI_SCORE' ? '#3b82f6' : s.type === 'PEER_FEEDBACK' ? '#a855f7' : '#6b7280';
    const hasKpi = Array.isArray(s.kpiContributions) && s.kpiContributions.length > 0;
    return (
        <div>
            <div className="tw-flex tw-items-center tw-justify-between tw-mb-1">
                <span className="tw-flex tw-items-center tw-gap-2">
                    <Tag color={sectionTypeColor(s.type)}>{sectionTypeLabel(s.type)}</Tag>
                    <Text className="tw-text-xs">{s.title ?? '섹션'}</Text>
                    {typeof s.weight === 'number' && (
                        <Text type="secondary" className="tw-text-xs">
                            가중 {s.weight}%
                        </Text>
                    )}
                    {typeof s.sampleSize === 'number' && s.sampleSize > 0 && (
                        <Text type="secondary" className="tw-text-[10px]">
                            · {s.type === 'KPI_SCORE' ? `${s.sampleSize}개 목표` : `${s.sampleSize}건 응답`}
                        </Text>
                    )}
                </span>
                <Text className="tw-text-xs">
                    {s.skipped ? (
                        <Text type="secondary">스킵{s.reason ? ` (${s.reason})` : ''}</Text>
                    ) : (
                        `${(s.score ?? 0).toFixed(1)}점`
                    )}
                </Text>
            </div>
            {!s.skipped && (
                <div className="tw-h-2 tw-bg-gray-200 tw-rounded tw-overflow-hidden">
                    <div
                        style={{width: `${pct}%`, backgroundColor: barColor}}
                        className="tw-h-full tw-rounded"
                    />
                </div>
            )}
            {/* [KPI 드릴다운] 개별 목표 기여도 표시 — type === 'KPI_SCORE' 에서만 의미 있음 */}
            {!s.skipped && s.type === 'KPI_SCORE' && hasKpi && (
                <div className="tw-mt-2 tw-pl-3 tw-border-l-2 tw-border-blue-200 tw-space-y-1">
                    {s.kpiContributions!.map((c, idx) => (
                        <KpiContributionRow key={c.goalId ?? idx} c={c} />
                    ))}
                </div>
            )}
        </div>
    );
}

function KpiContributionRow({c}: {c: KpiContribution}) {
    const ach = typeof c.achievement === 'number' ? c.achievement : 0;
    const contrib = typeof c.contributionPct === 'number' ? c.contributionPct : 0;
    return (
        <div className="tw-text-[11px] tw-flex tw-items-center tw-justify-between tw-gap-2">
            <span className="tw-truncate tw-flex-1">
                <Text className="tw-text-[11px]">{c.title ?? '목표'}</Text>
                <Text type="secondary" className="tw-ml-1 tw-text-[10px]">
                    달성 {ach.toFixed(1)}%
                    {typeof c.weight === 'number' && c.weight > 0 ? ` · 가중 ${c.weight}%` : ''}
                </Text>
            </span>
            <Text type="secondary" className="tw-text-[10px]">
                기여 {contrib.toFixed(0)}%
            </Text>
        </div>
    );
}

export default MyEvaluationResultPage;
