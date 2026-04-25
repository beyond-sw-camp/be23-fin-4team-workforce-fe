import {useMemo, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useNavigate, useParams, useSearch} from '@tanstack/react-router';
import {
    Alert,
    App,
    Avatar,
    Button,
    Card,
    Col,
    Empty,
    Popconfirm,
    Progress,
    Row,
    Space,
    Statistic,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {
    BarChartOutlined,
    CalendarOutlined,
    CheckCircleOutlined,
    FileDoneOutlined,
    NotificationOutlined,
    PlayCircleOutlined,
    SendOutlined,
    SoundOutlined,
    StopOutlined,
    TeamOutlined,
    UsergroupAddOutlined,
} from '@ant-design/icons';
import {EVALUATION_PAGE_KO as L} from '@/app/locale/app-ko';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {
    CalibrationDistributionOverview,
    EvalType,
    EvaluationDesign,
    EvaluationResponse,
    RelativeDistributionPreview,
    EvaluationSeason,
    EvaluationStatus,
} from '@/features/evaluation/model/types';
import {
    evalTypeLabel,
    resultsPublishedTag,
    seasonStatusTag,
    seasonTypeLabel,
} from '@/features/evaluation/lib/evaluationLabels';
import {GroupsSection} from '@/features/evaluation/ui/GroupsSection';
import {GroupCreateModal} from '@/features/evaluation/ui/GroupCreateModal';
import {PERM} from '@/features/permissions/backend-permissions';
import {usePermissions} from '@/features/permissions/usePermissionsHook';
import {AppButton} from '@/shared/ui/AppButton';
import {AppSearchField} from '@/shared/ui/AppSearchField';
import {AppInlinePillButton} from '@/shared/ui/AppInlinePillButton';
import {DetailPageHeader} from '@/shared/ui/DetailPageHeader';
import {parseApiError} from '@/shared/api/error-parser';
import dayjs from 'dayjs';

const {Text, Title} = Typography;

type TabKey = 'progress' | 'groups' | 'calibration' | 'results';

/** 진행도 테이블용 상태 pill (완료=green, 진행 중=blue, 미시작=gray) */
function progressStatusPill(s: EvaluationStatus) {
    if (s === 'SUBMITTED') {
        return (
            <span className="tw-inline-flex tw-items-center tw-rounded-full tw-bg-emerald-50 tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-emerald-700">
                완료
            </span>
        );
    }
    if (s === 'IN_PROGRESS') {
        return (
            <span className="tw-inline-flex tw-items-center tw-rounded-full tw-bg-blue-50 tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-[#1e3a5f]">
                진행 중
            </span>
        );
    }
    return (
        <span className="tw-inline-flex tw-items-center tw-rounded-full tw-bg-slate-100 tw-px-2.5 tw-py-0.5 tw-text-xs tw-font-medium tw-text-slate-500">
            미시작
        </span>
    );
}

export function EvaluationSeasonDetailPage() {
    const {message} = App.useApp();
    const {hasPermission} = usePermissions();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const {seasonId} = useParams({strict: false}) as {seasonId: string};
    const search = useSearch({strict: false}) as {tab?: TabKey};

    const canCreate = hasPermission(PERM.EVALUATION_CREATE);
    const canUpdate = hasPermission(PERM.EVALUATION_UPDATE);

    // 검색·모달 상태 (queries 앞에서 선언되어야 progressData query 가 참조 가능)
    const [groupCreateOpen, setGroupCreateOpen] = useState(false);
    const [progressSearch, setProgressSearch] = useState('');

    const activeTab: TabKey = search.tab ?? 'progress';
    const setTab = (next: TabKey) => {
        navigate({
            to: '/app/evaluations/seasons/$seasonId',
            params: {seasonId},
            search: {tab: next},
            replace: true,
        });
    };

    // ── Queries ──
    const {data: seasons = []} = useQuery({
        queryKey: ['eval-seasons'],
        queryFn: () => evaluationApi.listSeasons(),
    });
    const season = useMemo<EvaluationSeason | undefined>(
        () => seasons.find((s) => s.seasonId === seasonId),
        [seasons, seasonId],
    );

    const {data: designs = []} = useQuery<EvaluationDesign[]>({
        queryKey: ['eval-designs'],
        queryFn: () => evaluationApi.listDesigns(),
    });

    const {data: groups = []} = useQuery({
        queryKey: ['eval-groups', seasonId],
        queryFn: () => evaluationApi.listGroups(seasonId),
        enabled: !!seasonId,
    });
    const startReadiness = useMemo(() => {
        if (!groups.length) {
            return {ready: false, reason: '그룹이 없어 시즌을 시작할 수 없습니다. 최소 1개 그룹을 생성해 주세요.'};
        }
        for (const g of groups) {
            const targets = g.targetMemberIds ?? [];
            const evalTypes = g.evaluationTypes ?? [];
            const maps = g.evaluatorMaps ?? [];
            if (!targets.length) {
                return {ready: false, reason: `그룹 '${g.name}'에 대상 인원이 없어 시즌을 시작할 수 없습니다.`};
            }
            if (!evalTypes.length) {
                return {ready: false, reason: `그룹 '${g.name}'에 평가 유형이 없어 시즌을 시작할 수 없습니다.`};
            }
            const missing = targets.some((tid) =>
                evalTypes.some((et) =>
                    !maps.some((m) =>
                        m.targetMemberId === tid &&
                        m.evaluationType === et &&
                        m.evaluatorId &&
                        (et === 'SELF' ? m.evaluatorId === tid : m.evaluatorId !== tid),
                    ),
                ),
            );
            if (missing) {
                return {ready: false, reason: `그룹 '${g.name}'의 평가자 지정이 완료되지 않았습니다.`};
            }
        }
        return {ready: true, reason: ''};
    }, [groups]);

    // 진행도 쿼리는 검색어까지 key 에 포함해 서버사이드 필터링을 받음
    // 요약(진행률)은 q가 빈 상태의 전체 집계로 계산하므로 별도 query key 사용
    const {data: progressAllData = []} = useQuery({
        queryKey: ['eval-progress', seasonId],
        queryFn: () => evaluationApi.getProgress(seasonId),
        enabled: !!seasonId && (activeTab === 'progress' || activeTab === 'results'),
    });
    const {data: progressData = []} = useQuery({
        queryKey: ['eval-progress', seasonId, progressSearch.trim()],
        queryFn: () => evaluationApi.getProgress(seasonId, progressSearch.trim() || undefined),
        enabled: !!seasonId && (activeTab === 'progress' || activeTab === 'results'),
        placeholderData: (prev) => prev,
    });

    const {data: calibrationData = []} = useQuery({
        queryKey: ['eval-calibration', seasonId],
        queryFn: () => evaluationApi.getCalibrationOverview(seasonId),
        enabled: !!seasonId && activeTab === 'calibration',
    });
    const {data: calibrationOverview} = useQuery<CalibrationDistributionOverview>({
        queryKey: ['eval-calibration-overview', seasonId],
        queryFn: () => evaluationApi.getCalibrationDistributionOverview(seasonId),
        enabled: !!seasonId && activeTab === 'calibration',
    });
    const {data: relativePreview} = useQuery<RelativeDistributionPreview>({
        queryKey: ['eval-calibration-preview-relative', seasonId],
        queryFn: () => evaluationApi.previewRelativeDistribution(seasonId),
        enabled: !!seasonId && activeTab === 'calibration',
    });

    // ── Mutations ──
    const invalidate = () => {
        queryClient.invalidateQueries({queryKey: ['eval-seasons']});
        queryClient.invalidateQueries({queryKey: ['eval-groups', seasonId]});
        queryClient.invalidateQueries({queryKey: ['eval-designs']});
        queryClient.invalidateQueries({queryKey: ['eval-progress', seasonId]});
        queryClient.invalidateQueries({queryKey: ['eval-calibration', seasonId]});
        queryClient.invalidateQueries({queryKey: ['eval-calibration-overview', seasonId]});
        queryClient.invalidateQueries({queryKey: ['eval-calibration-preview-relative', seasonId]});
    };

    const startSeasonMut = useMutation({
        mutationFn: () => evaluationApi.startSeason(seasonId),
        onSuccess: () => {
            message.success(L.seasonStarted);
            invalidate();
        },
    });
    const closeSeasonMut = useMutation({
        mutationFn: (opts?: {publishResults?: boolean}) => evaluationApi.closeSeason(seasonId, opts),
        onSuccess: () => {
            message.success(L.seasonClosed);
            invalidate();
        },
        onError: (err) => {
            const parsed = parseApiError(err);
            message.error(parsed.message);
        },
    });
    const sendBulkReminderMut = useMutation({
        mutationFn: () => evaluationApi.sendBulkReminder(seasonId),
        onSuccess: () => {
            message.success(L.reminderSent);
            invalidate();
        },
    });
    const sendOneReminderMut = useMutation({
        mutationFn: (memberId: string) => evaluationApi.sendReminder(seasonId, memberId),
        onSuccess: () => {
            message.success(L.reminderSent);
            invalidate();
        },
    });
    const confirmCalibMut = useMutation({
        mutationFn: () => evaluationApi.confirmCalibration(seasonId),
        onSuccess: () => {
            message.success(L.calibrationConfirmed);
            invalidate();
        },
    });
    const publishResultsMut = useMutation({
        mutationFn: () => evaluationApi.publishResults(seasonId),
        onSuccess: () => {
            message.success('결과가 공개되었습니다.');
            invalidate();
        },
        onError: (err) => {
            const parsed = parseApiError(err);
            message.error(parsed.message);
        },
    });
    // ── [진행도 관리] 평가자별 집계 뷰 ──
    // 한 평가자가 여러 응답(대상자 × 유형) 을 가질 수 있고 리마인드는 평가자 단위로 1회 발송되므로
    // 행 주체를 "평가자" 로 집계. 하위 응답은 expandable 로 드릴다운.
    type EvaluatorGroup = {
        evaluatorId: string;
        evaluatorName?: string;
        evaluatorDepartment?: string;
        evaluatorProfileUrl?: string;
        responses: EvaluationResponse[];
        total: number;
        submitted: number;
        pending: number;
        lastReminderAt?: string;
    };

    const evaluatorGroups: EvaluatorGroup[] = useMemo(() => {
        const map = new Map<string, EvaluatorGroup>();
        for (const r of progressData) {
            const id = r.evaluatorId;
            const g = map.get(id) ?? {
                evaluatorId: id,
                evaluatorName: r.evaluatorName,
                evaluatorDepartment: r.evaluatorDepartment,
                evaluatorProfileUrl: r.evaluatorProfileUrl,
                responses: [],
                total: 0,
                submitted: 0,
                pending: 0,
                lastReminderAt: undefined,
            };
            g.responses.push(r);
            g.total += 1;
            if (r.status === 'SUBMITTED') g.submitted += 1;
            else g.pending += 1;
            if (r.lastRemindedAt) {
                if (!g.lastReminderAt || dayjs(r.lastRemindedAt).isAfter(g.lastReminderAt)) {
                    g.lastReminderAt = r.lastRemindedAt;
                }
            }
            map.set(id, g);
        }
        return Array.from(map.values()).sort((a, b) => {
            // 미제출 많은 평가자가 먼저 (관리자 주의 유도)
            if (a.pending !== b.pending) return b.pending - a.pending;
            return (a.evaluatorName ?? '').localeCompare(b.evaluatorName ?? '');
        });
    }, [progressData]);

    const progressCols: ColumnsType<EvaluatorGroup> = [
        {
            title: <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wider tw-text-slate-500">평가자</span>,
            key: 'evaluator',
            render: (_: unknown, g: EvaluatorGroup) => {
                const name = g.evaluatorName ?? `#${g.evaluatorId.slice(0, 8)}`;
                const initial = name.trim().charAt(0);
                return (
                    <div className="tw-flex tw-items-center tw-gap-3">
                        <Avatar
                            size={36}
                            src={g.evaluatorProfileUrl}
                            style={{backgroundColor: '#E6F0FF', color: '#1e3a5f', fontWeight: 600}}
                        >
                            {initial}
                        </Avatar>
                        <div className="tw-min-w-0">
                            <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">{name}</div>
                            {g.evaluatorDepartment && (
                                <div className="tw-truncate tw-text-xs tw-text-slate-500">
                                    {g.evaluatorDepartment}
                                </div>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            title: <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wider tw-text-slate-500">진행률</span>,
            key: 'progress',
            width: 220,
            render: (_: unknown, g: EvaluatorGroup) => {
                const pct = g.total > 0 ? Math.round((g.submitted / g.total) * 100) : 0;
                return (
                    <div>
                        <div className="tw-text-sm tw-text-slate-700 tw-mb-1">
                            {g.submitted} / {g.total} 제출 · {pct}%
                        </div>
                        <Progress
                            percent={pct}
                            size="small"
                            showInfo={false}
                            strokeColor={pct === 100 ? '#10B981' : '#1e3a5f'}
                        />
                    </div>
                );
            },
        },
        {
            title: <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wider tw-text-slate-500">상태</span>,
            key: 'status',
            width: 120,
            render: (_: unknown, g: EvaluatorGroup) =>
                g.pending === 0 ? (
                    <Tag color="green">전체 완료</Tag>
                ) : (
                    <Tag color="blue">{g.pending}건 미제출</Tag>
                ),
        },
        {
            title: <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wider tw-text-slate-500">마지막 리마인드</span>,
            dataIndex: 'lastReminderAt',
            key: 'remind',
            width: 180,
            render: (v?: string) => (
                <span className="tw-text-sm tw-text-slate-500">
                    {v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'}
                </span>
            ),
        },
        {
            title: '',
            key: 'action',
            width: 150,
            render: (_: unknown, g: EvaluatorGroup) =>
                g.pending > 0 ? (
                    <AppInlinePillButton
                        onClick={() => sendOneReminderMut.mutate(g.evaluatorId)}
                        className="tw-px-3 tw-py-1 tw-text-sm tw-font-medium tw-text-[#1e3a5f] hover:tw-bg-blue-50"
                    >
                        <SendOutlined/> 리마인드 발송
                    </AppInlinePillButton>
                ) : null,
        },
    ];

    // 검색은 서버사이드(q 파라미터)에서 처리됨

    // ── Calibration columns ──
    const calibrationCols: ColumnsType<EvaluationResponse> = [
        {title: L.member, dataIndex: 'targetMemberId', key: 'name', ellipsis: true},
        {
            title: L.calibrationCurrentGrade,
            key: 'currentGrade',
            render: (_: unknown, r: EvaluationResponse) => r.calibration?.originalGrade ?? '—',
        },
        {
            title: L.calibrationAdjustedGrade,
            key: 'adjustedGrade',
            render: (_: unknown, r: EvaluationResponse) => r.calibration?.adjustedGrade ?? '—',
        },
        {
            title: L.calibrationReason,
            key: 'reason',
            render: (_: unknown, r: EvaluationResponse) => r.calibration?.adjustmentReason ?? '',
        },
        {
            title: L.calibrationConfirmStatus,
            key: 'confirmed',
            width: 110,
            render: (_: unknown, r: EvaluationResponse) =>
                r.calibration?.confirmedAt ? (
                    <Tag color="green">{L.calibrationConfirmStatus}</Tag>
                ) : (
                    <Tag>{L.calibrationUnconfirmed}</Tag>
                ),
        },
    ];
    const relativePreviewCols: ColumnsType<RelativeDistributionPreview['adjustments'][number]> = [
        {
            title: '응답 ID',
            dataIndex: 'responseId',
            key: 'responseId',
            render: (v: string) => <span className="tw-text-xs tw-font-mono tw-text-slate-600">{v.slice(0, 8)}</span>,
        },
        {
            title: '점수',
            dataIndex: 'normalizedScore',
            key: 'normalizedScore',
            width: 100,
            render: (v?: number) => (typeof v === 'number' ? v.toFixed(1) : '-'),
        },
        {
            title: '현재',
            dataIndex: 'currentGrade',
            key: 'currentGrade',
            width: 100,
            render: (v?: string) => v ?? '미부여',
        },
        {
            title: '예상(강제 후)',
            dataIndex: 'predictedGrade',
            key: 'predictedGrade',
            width: 130,
            render: (v?: string) => <Tag color="blue">{v ?? '-'}</Tag>,
        },
    ];
    const relativePreviewSummary = useMemo(() => {
        const rows = relativePreview?.adjustments ?? [];
        const changed = rows.filter((r) => (r.currentGrade ?? '') !== (r.predictedGrade ?? ''));
        const deltaByGrade = new Map<string, number>();
        for (const r of rows) {
            const cur = r.currentGrade ?? '미부여';
            const next = r.predictedGrade ?? '미부여';
            if (cur === next) continue;
            deltaByGrade.set(cur, (deltaByGrade.get(cur) ?? 0) - 1);
            deltaByGrade.set(next, (deltaByGrade.get(next) ?? 0) + 1);
        }
        const deltas = Array.from(deltaByGrade.entries())
            .filter(([, v]) => v !== 0)
            .sort((a, b) => b[1] - a[1]);
        return {
            total: rows.length,
            changedCount: changed.length,
            unchangedCount: rows.length - changed.length,
            deltas,
        };
    }, [relativePreview]);

    // ── Progress stats ──
    // 전체 집계는 검색어와 무관하게 전체 데이터 기준
    const totalProgress = progressAllData.length;
    const completedProgress = progressAllData.filter((r) => r.status === 'SUBMITTED').length;
    const progressPct = totalProgress > 0 ? Math.round((completedProgress / totalProgress) * 100) : 0;

    // ── Tab availability ──
    // phase 기반 워크플로가 제거됨. 이제 시즌은 status + resultsPublishedAt 으로만 관리.
    // - 캘리브레이션 탭: ACTIVE 시즌에서 응답이 하나라도 SUBMITTED 인 경우 활성화
    // - 결과 분석 탭: 결과가 공개된 (resultsPublishedAt != null) 경우 활성화
    const canCalibrate = season?.status === 'ACTIVE' && !season?.resultsPublishedAt;
    const calibrationEnabled = (progressAllData ?? []).some((r) => r.status === 'SUBMITTED');
    const resultsEnabled = !!season?.resultsPublishedAt;

    // ── Results analytics aggregates ──
    const resultsAggregate = useMemo(() => {
        const submitted = progressAllData.filter((r) => r.status === 'SUBMITTED');

        // 등급 분포: adjustedGrade(캘리브레이션 조정 후) 우선, 없으면 originalGrade
        const gradeCount: Record<string, number> = {};
        for (const r of submitted) {
            const g = r.calibration?.adjustedGrade ?? r.calibration?.originalGrade;
            const key = g && g.trim() ? g : L.analyticsNoGrade;
            gradeCount[key] = (gradeCount[key] ?? 0) + 1;
        }
        const gradeRows = Object.entries(gradeCount)
            .map(([grade, count]) => ({
                grade,
                count,
                pct: submitted.length > 0 ? Math.round((count / submitted.length) * 1000) / 10 : 0,
            }))
            .sort((a, b) => b.count - a.count);

        // 점수 요약: normalizedScore 기반
        const scores = submitted
            .map((r) => r.normalizedScore)
            .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
        const sum = scores.reduce((acc, v) => acc + v, 0);
        const avg = scores.length > 0 ? sum / scores.length : 0;
        const max = scores.length > 0 ? Math.max(...scores) : 0;
        const min = scores.length > 0 ? Math.min(...scores) : 0;

        // 평가 유형별 평균 점수
        const byTypeTotals: Record<string, {sum: number; count: number}> = {};
        for (const r of submitted) {
            const s = r.normalizedScore;
            if (typeof s !== 'number' || Number.isNaN(s)) continue;
            const bucket = byTypeTotals[r.evaluationType] ?? {sum: 0, count: 0};
            bucket.sum += s;
            bucket.count += 1;
            byTypeTotals[r.evaluationType] = bucket;
        }
        const byType = Object.entries(byTypeTotals).map(([type, {sum: s, count}]) => ({
            type: type as EvalType,
            avg: count > 0 ? s / count : 0,
            count,
        }));

        return {gradeRows, avg, max, min, sampleCount: scores.length, byType};
    }, [progressAllData]);

    if (!season) {
        return (
            <div className="tw-mx-auto tw-w-full tw-space-y-4">
                <DetailPageHeader
                    backTo="/app/evaluations"
                    backLabel="평가 허브"
                    title="시즌 상세"
                    subtitle="시즌 정보를 불러오는 중이거나 접근 권한이 없습니다."
                    showShare={false}
                />
                <Card>
                    <Text type="secondary">시즌 정보를 불러오는 중이거나 접근 권한이 없습니다.</Text>
                </Card>
            </div>
        );
    }

    return (
        <div className="tw-mx-auto tw-w-full tw-space-y-5">
            <DetailPageHeader
                backTo="/app/evaluations"
                backLabel="평가 허브"
                title="시즌 상세"
                subtitle="시즌 설정과 진행 현황, 결과를 한곳에서 관리합니다."
                showShare={true}
            />

            {/* 히어로 카드: 레퍼런스와 유사한 좌(배지·제목·메타·액션) / 우(진행률) */}
            <Card
                className="tw-rounded-3xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
                styles={{body: {padding: '28px 0 26px'}}}
            >
                <div className="tw-flex tw-flex-col tw-gap-8 lg:tw-flex-row lg:tw-items-stretch lg:tw-gap-0">
                    <div className="tw-flex tw-min-h-0 tw-min-w-0 tw-flex-1 tw-flex-col tw-gap-4 tw-px-6 lg:tw-pr-10 lg:tw-pl-6">
                        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                            {seasonStatusTag(season.status)}
                            {resultsPublishedTag(season.resultsPublishedAt)}
                        </div>

                        <Title
                            level={2}
                            className="!tw-m-0 !tw-text-[26px] !tw-font-bold !tw-leading-tight !tw-tracking-tight !tw-text-slate-900 sm:!tw-text-[28px]"
                        >
                            {season.name}
                        </Title>

                        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-x-6 tw-gap-y-2 tw-text-sm tw-text-slate-500">
                            <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                                <CalendarOutlined className="tw-text-base tw-text-slate-400" aria-hidden />
                                기간 {season.startDate} ~ {season.endDate}
                            </span>
                            <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-slate-500">
                                <span className="tw-rounded-md tw-bg-slate-100 tw-px-2 tw-py-0.5 tw-text-xs tw-font-medium tw-text-slate-600">
                                    {seasonTypeLabel(season.type)}
                                </span>
                            </span>
                            {season.resultPublishDate ? (
                                <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                                    <SoundOutlined className="tw-text-base tw-text-slate-400" aria-hidden />
                                    결과 공개 예정 {season.resultPublishDate}
                                </span>
                            ) : null}
                        </div>

                        {canUpdate && (
                            <div className="tw-mt-auto tw-flex tw-flex-wrap tw-gap-2 tw-pt-4">
                                {season.status === 'DRAFT' && (() => {
                                    const startButton = (
                                        <Button
                                            type="primary"
                                            icon={<PlayCircleOutlined />}
                                            disabled={!startReadiness.ready}
                                            className="!tw-h-9 !tw-rounded-full !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-4 !tw-text-sm !tw-font-semibold hover:!tw-bg-[#152a45] disabled:!tw-bg-slate-200 disabled:!tw-text-slate-500"
                                        >
                                            {L.seasonStart}
                                        </Button>
                                    );
                                    if (!startReadiness.ready) {
                                        return <Tooltip title={startReadiness.reason}>{startButton}</Tooltip>;
                                    }
                                    return (
                                        <Popconfirm
                                            title={L.seasonStartConfirm}
                                            onConfirm={() => startSeasonMut.mutate()}
                                        >
                                            {startButton}
                                        </Popconfirm>
                                    );
                                })()}

                        {/* 결과 공개 (ACTIVE + 미공개 상태 + 모든 응답 SUBMITTED 시 활성) */}
                        {season.status === 'ACTIVE' && !season.resultsPublishedAt && (() => {
                            const notSubmittedCount = totalProgress - completedProgress;
                            const allSubmitted = totalProgress === 0 || notSubmittedCount === 0;
                            const button = (
                                <Button
                                    type="primary"
                                    icon={<SoundOutlined />}
                                    loading={publishResultsMut.isPending}
                                    disabled={!allSubmitted}
                                    className="!tw-h-9 !tw-rounded-full !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-4 !tw-text-sm !tw-font-semibold hover:!tw-bg-[#152a45] disabled:!tw-bg-slate-200 disabled:!tw-text-slate-500"
                                >
                                    결과 공개
                                </Button>
                            );
                            if (!allSubmitted) {
                                return (
                                    <Tooltip title={`미제출 평가 응답이 ${notSubmittedCount}건 있어 공개할 수 없습니다.`}>
                                        {button}
                                    </Tooltip>
                                );
                            }
                            return (
                                <Popconfirm
                                    title="결과를 지금 공개할까요? 피평가자에게 즉시 노출됩니다."
                                    onConfirm={() => publishResultsMut.mutate()}
                                >
                                    {button}
                                </Popconfirm>
                            );
                        })()}

                        {/* 종료 — ACTIVE 시즌에서 미제출이 없을 때 활성.
                            결과가 아직 미공개이면 "종료와 동시에 결과 공개" 옵션을 별도 버튼으로 제공. */}
                        {season.status === 'ACTIVE' && (() => {
                            const notSubmittedCount = totalProgress - completedProgress;
                            const allSubmitted = totalProgress === 0 || notSubmittedCount === 0;
                            const needsPublish = !season.resultsPublishedAt;

                            if (!allSubmitted) {
                                return (
                                    <Tooltip title={`미제출 평가 응답이 ${notSubmittedCount}건 있어 종료할 수 없습니다.`}>
                                        <Button
                                            danger
                                            icon={<StopOutlined />}
                                            disabled
                                            className="!tw-h-9 !tw-rounded-full !tw-px-4 !tw-text-sm !tw-font-semibold disabled:!tw-border-slate-200 disabled:!tw-bg-slate-100 disabled:!tw-text-slate-400"
                                        >
                                            {L.seasonClose}
                                        </Button>
                                    </Tooltip>
                                );
                            }
                            return (
                                <>
                                    <Popconfirm
                                        title={needsPublish
                                            ? '결과는 비공개 상태로 두고 시즌만 종료할까요?'
                                            : L.seasonCloseConfirm}
                                        onConfirm={() => closeSeasonMut.mutate(undefined)}
                                    >
                                        <Button
                                            danger
                                            icon={<StopOutlined />}
                                            loading={closeSeasonMut.isPending}
                                            className="!tw-h-9 !tw-rounded-full !tw-px-4 !tw-text-sm !tw-font-semibold"
                                        >
                                            {L.seasonClose}
                                        </Button>
                                    </Popconfirm>
                                    {needsPublish && (
                                        <Popconfirm
                                            title="결과를 공개한 뒤 시즌을 종료할까요?"
                                            onConfirm={() => closeSeasonMut.mutate({publishResults: true})}
                                        >
                                            <Button
                                                danger
                                                icon={<StopOutlined />}
                                                loading={closeSeasonMut.isPending}
                                                className="!tw-h-9 !tw-rounded-full !tw-px-4 !tw-text-sm !tw-font-semibold"
                                            >
                                                결과 공개 + 종료
                                            </Button>
                                        </Popconfirm>
                                    )}
                                </>
                            );
                        })()}
                            </div>
                        )}
                    </div>

                    <div
                        className="tw-h-px tw-w-full tw-shrink-0 tw-bg-slate-200 lg:tw-mx-0 lg:tw-h-auto lg:tw-w-px lg:tw-self-stretch"
                        aria-hidden
                    />

                    {/* 우측 진행률 (레퍼런스: 큰 %, 바, 완료/전체) */}
                    <div className="tw-flex tw-w-full tw-shrink-0 tw-flex-col tw-justify-center tw-px-6 lg:tw-w-[min(100%,300px)] lg:tw-min-w-[260px] lg:tw-pl-10 lg:tw-pr-6">
                        <div className="tw-rounded-2xl tw-border tw-border-slate-100 tw-bg-slate-50/80 tw-p-6 lg:tw-border-0 lg:tw-bg-transparent lg:tw-p-0">
                            <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-[0.14em] tw-text-slate-400">
                                Progress
                            </div>
                            <div className="tw-mt-2 tw-flex tw-items-end tw-gap-1">
                                <span className="tw-text-[48px] tw-font-bold tw-leading-none tw-tracking-tight tw-text-[#1e3a5f] sm:tw-text-[52px]">
                                    {progressPct}
                                </span>
                                <span className="tw-mb-2 tw-text-2xl tw-font-bold tw-text-[#1e3a5f]">%</span>
                            </div>
                            <Progress
                                percent={progressPct}
                                showInfo={false}
                                strokeColor={{from: '#4A78B8', to: '#1e3a5f'}}
                                trailColor="#E2E8F0"
                                strokeLinecap="round"
                                className="!tw-m-0 tw-mt-5 [&_.ant-progress-inner]:!tw-rounded-full [&_.ant-progress-bg]:!tw-rounded-full"
                                size={['100%', 10]}
                            />
                            <div className="tw-mt-4 tw-inline-flex tw-items-center tw-gap-2 tw-text-sm tw-font-medium tw-text-slate-600">
                                <CheckCircleOutlined className="tw-text-lg tw-text-emerald-500" aria-hidden />
                                <span>
                                    완료 <span className="tw-text-slate-900">{completedProgress}</span>
                                    <span className="tw-text-slate-400"> / </span>
                                    전체 <span className="tw-text-slate-900">{totalProgress}</span>명
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* 탭 */}
            <Tabs
                className="evaluation-pill-tabs [&_.ant-tabs-tab]:!tw-px-0"
                type="line"
                activeKey={activeTab}
                onChange={(k) => setTab(k as TabKey)}
                items={[
                    {
                        key: 'progress',
                        label: (
                            <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                                <TeamOutlined/> 진행도 관리
                            </span>
                        ),
                        children: (
                            <div className="tw-space-y-3">
                                <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
                                    <AppSearchField
                                        className="sm:!tw-max-w-md"
                                        placeholder="구성원 이름 또는 부서 검색..."
                                        value={progressSearch}
                                        onChange={(e) => setProgressSearch(e.target.value)}
                                    />
                                    {canUpdate && (
                                        <Popconfirm
                                            title={`${L.progressReminderConfirm} ${totalProgress - completedProgress}${L.groupPersonCount}?`}
                                            onConfirm={() => sendBulkReminderMut.mutate()}
                                        >
                                            <Button
                                                type="primary"
                                                icon={<NotificationOutlined/>}
                                                className="!tw-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-5 !tw-font-semibold hover:!tw-bg-[#152a45]"
                                            >
                                                미제출자 리마인드 일괄 발송
                                            </Button>
                                        </Popconfirm>
                                    )}
                                </div>
                                <Card
                                    className="tw-rounded-2xl tw-border tw-border-slate-200/80 tw-shadow-sm tw-shadow-slate-900/5"
                                    styles={{body: {padding: 20}}}
                                >
                                    <Table<EvaluatorGroup>
                                        columns={progressCols}
                                        dataSource={evaluatorGroups}
                                        rowKey="evaluatorId"
                                        size="middle"
                                        pagination={{
                                            pageSize: 10,
                                            showTotal: (total, range) =>
                                                `PAGE ${Math.ceil(range[0] / 10)} OF ${Math.max(1, Math.ceil(total / 10))}`,
                                            showSizeChanger: false,
                                        }}
                                        expandable={{
                                            // 평가자의 하위 응답(대상자 × 유형) 드릴다운.
                                            // 디자인 기준: AntD Table 의 기본 +/- expand 아이콘 (별도 오버라이드 없음).
                                            rowExpandable: (g) => g.responses.length > 0,
                                            expandedRowRender: (g) => (
                                                <div className="tw-px-6 tw-py-2 tw-bg-slate-50/60 tw-space-y-2 tw-rounded">
                                                    {g.responses.map((r) => {
                                                        const isSelf = r.evaluatorId === r.targetMemberId;
                                                        const targetName = r.targetMemberName ?? `#${r.targetMemberId.slice(0, 8)}`;
                                                        return (
                                                            <div
                                                                key={r.responseId}
                                                                className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-py-1.5 tw-px-3 tw-rounded-md tw-bg-white tw-border tw-border-slate-100"
                                                            >
                                                                <div className="tw-flex tw-items-center tw-gap-3 tw-min-w-0">
                                                                    <Tag color="blue" className="!tw-m-0">
                                                                        {evalTypeLabel(r.evaluationType)}
                                                                    </Tag>
                                                                    <span className="tw-text-sm tw-text-slate-700 tw-truncate">
                                                                        {isSelf ? '자기 평가' : `→ ${targetName} 평가`}
                                                                    </span>
                                                                </div>
                                                                <div className="tw-flex tw-items-center tw-gap-4 tw-flex-shrink-0">
                                                                    <span className="tw-text-xs tw-text-slate-400">
                                                                        {r.lastRemindedAt
                                                                            ? `리마인드 ${dayjs(r.lastRemindedAt).format('MM-DD HH:mm')}`
                                                                            : ''}
                                                                    </span>
                                                                    {progressStatusPill(r.status)}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ),
                                        }}
                                    />
                                </Card>
                            </div>
                        ),
                    },
                    {
                        key: 'groups',
                        label: (
                            <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                                <UsergroupAddOutlined/> 그룹 & 평가자
                            </span>
                        ),
                        children: (
                            <GroupsSection
                                groups={groups}
                                designs={designs}
                                selectedSeasonId={seasonId}
                                seasonStatus={season.status}
                                onAddGroup={() => setGroupCreateOpen(true)}
                                onInvalidate={invalidate}
                            />
                        ),
                    },
                    {
                        key: 'calibration',
                        label: (
                            <Tooltip
                                title={
                                    calibrationEnabled
                                        ? undefined
                                        : '제출된 평가 응답이 1건 이상 있어야 활성화됩니다.'
                                }
                            >
                                <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                                    <FileDoneOutlined/> {L.tabCalibration}
                                </span>
                            </Tooltip>
                        ),
                        disabled: !calibrationEnabled,
                        children: (
                            <div className="tw-space-y-4">
                                <Alert type="info" showIcon message={L.calibrationPublishAutoNote} />
                                <Row gutter={16}>
                                    <Col xs={24} lg={8}>
                                        <Card title="목표 분포">
                                            {Object.keys(calibrationOverview?.targetDistribution ?? {}).length === 0 ? (
                                                <Empty description="설계의 목표 분포가 없습니다." />
                                            ) : (
                                                <Space direction="vertical" size={10} className="tw-w-full">
                                                    {Object.entries(calibrationOverview?.targetDistribution ?? {}).map(([grade, ratio]) => {
                                                        const pct = Math.round((ratio ?? 0) * 1000) / 10;
                                                        return (
                                                            <div key={`target-${grade}`}>
                                                                <div className="tw-flex tw-justify-between tw-text-sm tw-mb-1">
                                                                    <span>{grade}</span>
                                                                    <span>{pct}%</span>
                                                                </div>
                                                                <Progress percent={pct} showInfo={false} strokeColor="#1e3a5f" />
                                                            </div>
                                                        );
                                                    })}
                                                </Space>
                                            )}
                                        </Card>
                                    </Col>
                                    <Col xs={24} lg={8}>
                                        <Card title="현재 분포">
                                            {Object.keys(calibrationOverview?.currentDistribution ?? {}).length === 0 ? (
                                                <Empty description="현재 분포 데이터가 없습니다." />
                                            ) : (
                                                <Space direction="vertical" size={10} className="tw-w-full">
                                                    {Object.entries(calibrationOverview?.currentDistribution ?? {}).map(([grade, ratio]) => {
                                                        const pct = Math.round((ratio ?? 0) * 1000) / 10;
                                                        return (
                                                            <div key={`current-${grade}`}>
                                                                <div className="tw-flex tw-justify-between tw-text-sm tw-mb-1">
                                                                    <span>{grade}</span>
                                                                    <span>{pct}%</span>
                                                                </div>
                                                                <Progress percent={pct} showInfo={false} strokeColor="#10B981" />
                                                            </div>
                                                        );
                                                    })}
                                                </Space>
                                            )}
                                        </Card>
                                    </Col>
                                    <Col xs={24} lg={8}>
                                        <Card title="상대등급 강제 프리뷰">
                                            {Object.keys(relativePreview?.predictedDistribution ?? {}).length === 0 ? (
                                                <Empty description="RELATIVE 분포 프리뷰가 없습니다." />
                                            ) : (
                                                <Space direction="vertical" size={10} className="tw-w-full">
                                                    {Object.entries(relativePreview?.predictedDistribution ?? {}).map(([grade, ratio]) => {
                                                        const pct = Math.round((ratio ?? 0) * 1000) / 10;
                                                        return (
                                                            <div key={`pred-${grade}`}>
                                                                <div className="tw-flex tw-justify-between tw-text-sm tw-mb-1">
                                                                    <span>{grade}</span>
                                                                    <span>{pct}%</span>
                                                                </div>
                                                                <Progress percent={pct} showInfo={false} strokeColor="#F59E0B" />
                                                            </div>
                                                        );
                                                    })}
                                                </Space>
                                            )}
                                        </Card>
                                    </Col>
                                </Row>
                                <div className="tw-flex tw-justify-between tw-items-center">
                                    <Text strong className="tw-text-base">
                                        {L.calibrationTitle}
                                    </Text>
                                    {canUpdate && canCalibrate && (
                                        <Popconfirm
                                            title={
                                                relativePreviewSummary.changedCount > 0
                                                    ? `프리뷰 기준 ${relativePreviewSummary.changedCount}건의 등급이 변경됩니다. 확정할까요?`
                                                    : L.calibrationConfirmModal
                                            }
                                            description={
                                                relativePreviewSummary.changedCount > 0
                                                    ? '확정 후에는 상대등급 분포 강제 결과가 최종 반영되며, 되돌릴 수 없습니다.'
                                                    : undefined
                                            }
                                            onConfirm={() => confirmCalibMut.mutate()}
                                        >
                                            <AppButton variant="primary">
                                                <CheckCircleOutlined /> {L.calibrationConfirm}
                                            </AppButton>
                                        </Popconfirm>
                                    )}
                                </div>
                                <Table<EvaluationResponse>
                                    columns={calibrationCols}
                                    dataSource={calibrationData}
                                    rowKey="responseId"
                                    size="middle"
                                    pagination={{pageSize: 20}}
                                />
                                <Card title="상대 등급 강제 프리뷰 상세">
                                    <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                                        <Tag color="blue">전체 {relativePreviewSummary.total}건</Tag>
                                        <Tag color="orange">변경 예상 {relativePreviewSummary.changedCount}건</Tag>
                                        <Tag>유지 {relativePreviewSummary.unchangedCount}건</Tag>
                                        {relativePreviewSummary.deltas.map(([grade, diff]) => (
                                            <Tag
                                                key={`delta-${grade}`}
                                                color={diff > 0 ? 'green' : 'red'}
                                            >
                                                {grade} {diff > 0 ? `+${diff}` : diff}
                                            </Tag>
                                        ))}
                                    </div>
                                    <Table
                                        columns={relativePreviewCols}
                                        dataSource={relativePreview?.adjustments ?? []}
                                        rowKey="responseId"
                                        size="small"
                                        pagination={{pageSize: 10}}
                                    />
                                </Card>
                            </div>
                        ),
                    },
                    {
                        key: 'results',
                        label: (
                            <Tooltip title={resultsEnabled ? undefined : '결과가 공개된 시즌에서만 볼 수 있습니다.'}>
                                <span className="tw-inline-flex tw-items-center tw-gap-1.5">
                                    <BarChartOutlined/> 결과 분석
                                </span>
                            </Tooltip>
                        ),
                        disabled: !resultsEnabled,
                        children: (
                            <div className="tw-space-y-4">
                                <Text strong className="tw-text-base">
                                    {L.analyticsTitle}
                                </Text>
                                {resultsAggregate.sampleCount === 0 && resultsAggregate.gradeRows.length === 0 ? (
                                    <Card>
                                        <Empty description={L.analyticsEmpty} />
                                    </Card>
                                ) : (
                                    <Row gutter={16}>
                                        <Col xs={24} lg={12}>
                                            <Card title={L.analyticsGradeDist}>
                                                {resultsAggregate.gradeRows.length === 0 ? (
                                                    <Empty description={L.analyticsEmpty} />
                                                ) : (
                                                    <Space direction="vertical" size={12} className="tw-w-full">
                                                        {resultsAggregate.gradeRows.map((row) => (
                                                            <div key={row.grade}>
                                                                <div className="tw-flex tw-items-center tw-justify-between tw-mb-1">
                                                                    <Text strong>{row.grade}</Text>
                                                                    <Text type="secondary">
                                                                        {row.count}명 · {row.pct}%
                                                                    </Text>
                                                                </div>
                                                                <Progress
                                                                    percent={row.pct}
                                                                    showInfo={false}
                                                                    strokeColor="#1e3a5f"
                                                                />
                                                            </div>
                                                        ))}
                                                    </Space>
                                                )}
                                            </Card>
                                        </Col>
                                        <Col xs={24} lg={12}>
                                            <Card title={L.analyticsScoreSummary}>
                                                <Row gutter={[16, 16]}>
                                                    <Col span={12}>
                                                        <Statistic
                                                            title={L.analyticsAvgScore}
                                                            value={resultsAggregate.avg}
                                                            precision={1}
                                                            suffix="점"
                                                        />
                                                    </Col>
                                                    <Col span={12}>
                                                        <Statistic
                                                            title={L.analyticsSampleCount}
                                                            value={resultsAggregate.sampleCount}
                                                            suffix="건"
                                                        />
                                                    </Col>
                                                    <Col span={12}>
                                                        <Statistic
                                                            title={L.analyticsMaxScore}
                                                            value={resultsAggregate.max}
                                                            precision={1}
                                                            suffix="점"
                                                            valueStyle={{color: '#16a34a'}}
                                                        />
                                                    </Col>
                                                    <Col span={12}>
                                                        <Statistic
                                                            title={L.analyticsMinScore}
                                                            value={resultsAggregate.min}
                                                            precision={1}
                                                            suffix="점"
                                                            valueStyle={{color: '#dc2626'}}
                                                        />
                                                    </Col>
                                                </Row>
                                            </Card>
                                        </Col>
                                    </Row>
                                )}
                            </div>
                        ),
                    },
                ]}
            />

            <GroupCreateModal
                open={groupCreateOpen}
                onClose={() => setGroupCreateOpen(false)}
                seasonId={seasonId}
                designs={designs}
                onCreated={invalidate}
            />
        </div>
    );
}

export default EvaluationSeasonDetailPage;
