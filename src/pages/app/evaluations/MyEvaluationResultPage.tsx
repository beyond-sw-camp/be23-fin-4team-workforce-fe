import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useNavigate, useParams} from '@tanstack/react-router';
import {
    Alert,
    Button,
    Card,
    Col,
    Divider,
    Empty,
    Row,
    Space,
    Statistic,
    Tag,
    Typography,
} from 'antd';
import {ArrowLeftOutlined, TrophyOutlined} from '@ant-design/icons';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {
    Answer,
    EvalType,
    EvaluationResponse,
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

            {/* 핵심 지표 카드 */}
            <Card>
                <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} md={8}>
                        <div className="tw-flex tw-items-center tw-gap-3">
                            <TrophyOutlined className="tw-text-3xl tw-text-amber-500" />
                            <div>
                                <Text type="secondary" className="tw-text-sm">
                                    최종 등급
                                </Text>
                                <div>
                                    {finalGrade ? (
                                        <Tag color={gradeTagColor(finalGrade)} className="tw-text-lg tw-px-3 tw-py-1">
                                            {finalGrade}
                                        </Tag>
                                    ) : (
                                        <Text type="secondary">미부여</Text>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Col>
                    <Col xs={12} md={8}>
                        <Statistic
                            title="평균 점수 (타인 평가)"
                            value={othersAvgScore ?? 0}
                            precision={1}
                            suffix={othersAvgScore != null ? '점' : ''}
                        />
                    </Col>
                    <Col xs={12} md={8}>
                        <Statistic
                            title="받은 평가 건수"
                            value={othersResponses.length}
                            suffix="건"
                        />
                    </Col>
                </Row>
            </Card>

            {/* 평가 유형별 요약 */}
            {byType.length > 0 && (
                <Card title="평가 유형별 요약">
                    <Row gutter={[16, 16]}>
                        {byType.map((row) => (
                            <Col key={row.type} xs={12} sm={8} md={6}>
                                <Card size="small" variant="outlined">
                                    <Text strong>{evalTypeLabel(row.type)}</Text>
                                    <Divider className="!tw-my-2" />
                                    <Text type="secondary">건수: {row.count}</Text>
                                    <br />
                                    <Text type="secondary">
                                        평균: {row.avg != null ? `${row.avg.toFixed(1)}점` : '—'}
                                    </Text>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </Card>
            )}

            {/* 자기 평가 */}
            {selfResponse && (
                <Card
                    title={
                        <Space>
                            <Tag color="purple">자기 평가</Tag>
                            <Text type="secondary" className="tw-text-sm">
                                내가 제출한 평가
                            </Text>
                        </Space>
                    }
                >
                    <ScoreBreakdownPanel breakdown={selfResponse.scoreBreakdown} />
                    <FeedbackBody response={selfResponse} />
                </Card>
            )}

            {/* 타인 평가 피드백 (코멘트 위주) */}
            <Card title="피드백">
                {othersResponses.length === 0 ? (
                    <Empty description="아직 피드백이 없습니다." />
                ) : (
                    <Space direction="vertical" size={16} className="tw-w-full">
                        {othersResponses.map((r) => (
                            <Card key={r.responseId} type="inner" size="small">
                                <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
                                    <Tag color="blue">{evalTypeLabel(r.evaluationType)}</Tag>
                                    {typeof r.normalizedScore === 'number' && (
                                        <Text type="secondary" className="tw-text-sm">
                                            점수: {r.normalizedScore.toFixed(1)}점
                                        </Text>
                                    )}
                                </div>
                                <ScoreBreakdownPanel breakdown={r.scoreBreakdown} />
                                <FeedbackBody response={r} />
                            </Card>
                        ))}
                    </Space>
                )}
            </Card>
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
function ScoreBreakdownPanel({breakdown}: {breakdown?: ScoreBreakdown}) {
    if (!breakdown || !breakdown.sections || breakdown.sections.length === 0) return null;
    return (
        <div className="tw-mb-3 tw-p-3 tw-bg-gray-50 tw-rounded">
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
        </div>
    );
}

export default MyEvaluationResultPage;
