import {useMemo, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useNavigate} from '@tanstack/react-router';
import {App, Avatar, Button, Card, Dropdown, Empty, Modal, Space, Table, Tag, Typography} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import type {MenuProps} from 'antd';
import {
    ArrowRightOutlined,
    CalendarOutlined,
    CheckCircleFilled,
    DownOutlined,
    EllipsisOutlined,
    AppstoreOutlined,
    PlusOutlined,
    UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {EVALUATION_PAGE_KO as L} from '@/app/locale/app-ko';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {
    EvalType,
    EvaluationResponse,
    EvaluationSeason,
    EvaluationStatus,
    SeasonStatus,
    SeasonType,
} from '@/features/evaluation/model/types';
import {
    evalTypeLabel,
    resultsPublishedTag,
    seasonStatusTag,
    seasonTypeBadge,
} from '@/features/evaluation/lib/evaluationLabels';
import {SeasonCreateModal} from '@/features/evaluation/ui/SeasonCreateModal';
import {MyEvaluationAssignmentsContent} from '@/features/evaluation/ui/MyEvaluationAssignmentsContent';
import {PERM} from '@/features/permissions/backend-permissions';
import {usePermissions} from '@/features/permissions/usePermissionsHook';
import {AppInlinePillButton} from '@/shared/ui/AppInlinePillButton';
import {AppWorkspacePageTitle} from '@/shared/ui/AppWorkspacePageTitle';

const {Text, Title, Paragraph} = Typography;

const SEASONS_PAGE_SIZE = 3;

function gradeTagColor(grade?: string): string {
    if (!grade) return '#64748B';
    const up = grade.toUpperCase();
    if (up.startsWith('S') || up.startsWith('A+')) return '#F59E0B';
    if (up.startsWith('A')) return '#10B981';
    if (up.startsWith('B')) return '#3B82F6';
    if (up.startsWith('C')) return '#F97316';
    return '#EF4444';
}

/** 응답 상태를 사람-친화적 한 줄 문구로 변환 */
function responseStatusSubtext(r: EvaluationResponse): string {
    const typeLabel = evalTypeLabel(r.evaluationType);
    if (r.status === 'SUBMITTED') return `${typeLabel} · 완료`;
    if (r.status === 'IN_PROGRESS') return `${typeLabel} · 작성 중`;
    return `${typeLabel} · 작성 전`;
}

export function EvaluationsHubPage() {
    const {message} = App.useApp();
    const {hasPermission} = usePermissions();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const canCreate = hasPermission(PERM.EVALUATION_CREATE);
    const canUpdate = hasPermission(PERM.EVALUATION_UPDATE);
    const canRead = hasPermission(PERM.EVALUATION_READ);
    const canManage = canCreate || canUpdate || canRead;

    const [seasonCreateOpen, setSeasonCreateOpen] = useState(false);
    const [assignmentsModalOpen, setAssignmentsModalOpen] = useState(false);
    const [seasonLimit, setSeasonLimit] = useState(SEASONS_PAGE_SIZE);

    const {data: myResponses = []} = useQuery({
        queryKey: ['eval-my-responses'],
        queryFn: () => evaluationApi.listMyResponses(),
    });

    const {data: myReceivedResults = []} = useQuery({
        queryKey: ['eval-my-received'],
        queryFn: () => evaluationApi.listMyReceivedResults(),
    });

    const {data: seasons = []} = useQuery({
        queryKey: ['eval-seasons'],
        queryFn: () => evaluationApi.listSeasons(),
        enabled: canManage,
    });

    const invalidateSeasons = () => {
        queryClient.invalidateQueries({queryKey: ['eval-seasons']});
    };

    // ── 내 평가: 미제출 먼저, 같은 상태면 evalType 순 ──
    const sortedMyResponses = useMemo(() => {
        const order: Record<EvaluationStatus, number> = {
            IN_PROGRESS: 0,
            NOT_STARTED: 1,
            SUBMITTED: 2,
        };
        return [...myResponses].sort((a, b) => order[a.status] - order[b.status]);
    }, [myResponses]);

    // ── 가장 최근 "받은 평가" 결과 (피평가자 관점 히어로 카드용) ──
    const latestResult = useMemo(() => {
        const published = myReceivedResults.filter((r) => !!r.seasonResultsPublishedAt);
        if (published.length === 0) return null;
        const byTime = [...published].sort((a, b) => {
            return (b.seasonResultsPublishedAt ?? '').localeCompare(a.seasonResultsPublishedAt ?? '');
        });
        const top = byTime[0];
        if (!top) return null;
        const grade = top.calibration?.adjustedGrade ?? top.calibration?.originalGrade;
        return {
            seasonId: top.seasonId,
            seasonName: top.seasonName ?? '최근 평가',
            grade: grade && grade.trim() ? grade.trim() : undefined,
            publishedAt: top.seasonResultsPublishedAt,
            totalReceived: myReceivedResults.filter((r) => r.seasonId === top.seasonId).length,
        };
    }, [myReceivedResults]);

    // ── 시즌 관리: 진행 중 우선 정렬 + pagination ──
    const sortedSeasons = useMemo(() => {
        const statusOrder: Record<SeasonStatus, number> = {ACTIVE: 0, DRAFT: 1, CLOSED: 2};
        return [...seasons].sort((a, b) => {
            const s = statusOrder[a.status] - statusOrder[b.status];
            if (s !== 0) return s;
            return (b.startDate ?? '').localeCompare(a.startDate ?? '');
        });
    }, [seasons]);
    const visibleSeasons = sortedSeasons.slice(0, seasonLimit);
    const hasMoreSeasons = sortedSeasons.length > visibleSeasons.length;

    // ── Pending evaluations: 미제출 3건까지 노출 ──
    const pendingPreview = sortedMyResponses.slice(0, 4);

    const seasonRowMenu = (r: EvaluationSeason): MenuProps['items'] => [
        {
            key: 'detail',
            label: '상세 보기',
            onClick: () =>
                navigate({
                    to: '/app/evaluations/seasons/$seasonId',
                    params: {seasonId: r.seasonId},
                }),
        },
        ...(canUpdate && r.status === 'ACTIVE' && !r.resultsPublishedAt
            ? [{
                key: 'publish',
                label: '결과 공개 관리',
                onClick: () =>
                    navigate({
                        to: '/app/evaluations/seasons/$seasonId',
                        params: {seasonId: r.seasonId},
                    }),
            }]
            : []),
    ];

    const seasonCols: ColumnsType<EvaluationSeason> = [
        {
            title: <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-slate-500">시즌 정보</span>,
            dataIndex: 'name',
            key: 'name',
            render: (v: string) => <Text strong className="tw-text-[15px] tw-text-slate-900">{v}</Text>,
        },
        {
            title: <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-slate-500">유형</span>,
            dataIndex: 'type',
            key: 'type',
            width: 90,
            render: (t: SeasonType) => seasonTypeBadge(t),
        },
        {
            title: <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-slate-500">운영 기간</span>,
            key: 'period',
            width: 240,
            render: (_: unknown, r: EvaluationSeason) => (
                <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-sm tw-text-slate-700">
                    <CalendarOutlined className="tw-text-slate-400"/>
                    {r.startDate} ~ {r.endDate}
                </span>
            ),
        },
        {
            title: <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-slate-500">진행 상태</span>,
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (s: SeasonStatus) => seasonStatusTag(s),
        },
        {
            title: <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wide tw-text-slate-500">결과 공개</span>,
            dataIndex: 'resultsPublishedAt',
            key: 'resultsPublishedAt',
            width: 120,
            render: (v?: string) => resultsPublishedTag(v),
        },
        {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, r: EvaluationSeason) => (
                <Dropdown menu={{items: seasonRowMenu(r)}} trigger={['click']} placement="bottomRight">
                    <Button
                        type="text"
                        icon={<EllipsisOutlined/>}
                        onClick={(e) => e.stopPropagation()}
                        className="tw-text-slate-400 hover:tw-text-slate-700"
                    />
                </Dropdown>
            ),
        },
    ];

    return (
        <div className="tw-mx-auto tw-w-full tw-space-y-10">
            {/* 상단 히어로 영역: 2:1 그리드 */}
            <section className="tw-grid tw-grid-cols-1 tw-gap-6 lg:tw-grid-cols-3">
                <AppWorkspacePageTitle
                    className="lg:tw-col-span-3"
                    eyebrow={L.workspaceEyebrow}
                    title={L.pageTitle}
                />

                {/* LEFT 2/3 — 작성 대기중인 평가 */}
                <div className="tw-space-y-5 lg:tw-col-span-2">

                    <PendingEvaluationsCard
                        items={pendingPreview}
                        totalCount={sortedMyResponses.length}
                        onStart={(r) =>
                            navigate({
                                to: '/app/evaluations/$responseId/write',
                                params: {responseId: r.responseId},
                            })
                        }
                        onViewAll={() => setAssignmentsModalOpen(true)}
                    />
                </div>

                {/* RIGHT 1/3 — 최근 결과 hero */}
                <div className="tw-space-y-3">
                    <div className="tw-flex tw-items-baseline tw-justify-between tw-px-1">
                        <Text strong className="tw-text-[15px] tw-text-slate-900">
                            최근 결과
                        </Text>
                        {latestResult && (
                            <AppInlinePillButton
                                className="tw-px-3 tw-py-1 tw-text-xs tw-font-medium"
                                onClick={() => navigate({to: '/app/evaluations/my-results'})}
                            >
                                전체보기
                            </AppInlinePillButton>
                        )}
                    </div>
                    <CurrentStandingCard
                        result={latestResult}
                        onDownload={async () => {
                            if (!latestResult?.seasonId) return;
                            try {
                                const blob = await evaluationApi.downloadMyReport(latestResult.seasonId);
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `평가리포트_${latestResult.seasonName ?? latestResult.seasonId}.pdf`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            } catch (err) {
                                message.error('리포트 다운로드에 실패했습니다.');
                            }
                        }}
                    />
                </div>
            </section>

            {/* 하단 섹션: 전체 시즌 관리 (HR/매니저만) */}
            {canManage && (
                <section className="tw-space-y-4">
                    <div className="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-3">
                        <div className="tw-space-y-1">
                            <div className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
                                <AppstoreOutlined/>
                                Administrative Tools
                            </div>
                            <Title
                                level={3}
                                className="!tw-m-0 !tw-mb-3 !tw-text-[24px] !tw-font-bold !tw-leading-tight !tw-tracking-tight !tw-text-[#1e3a5f] sm:!tw-text-[26px]"
                            >
                                전체 시즌 관리
                            </Title>
                        </div>
                        {canCreate && (
                            <Button
                                icon={<PlusOutlined/>}
                                onClick={() => setSeasonCreateOpen(true)}
                                className="tw-rounded-full tw-border-slate-200 tw-px-4 tw-py-4 tw-text-sm tw-font-medium tw-text-slate-700 tw-shadow-sm hover:\!tw-border-slate-300"
                            >
                                새로운 시즌 개설
                            </Button>
                        )}
                    </div>

                    <Card
                        className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5"
                        styles={{body: {padding: 4}}}
                    >
                        {visibleSeasons.length === 0 ? (
                            <div className="tw-py-16">
                                <Empty description="등록된 시즌이 없습니다." />
                            </div>
                        ) : (
                            <Table<EvaluationSeason>
                                columns={seasonCols}
                                dataSource={visibleSeasons}
                                rowKey="seasonId"
                                size="middle"
                                pagination={false}
                                rowClassName="tw-cursor-pointer"
                                onRow={(r) => ({
                                    onClick: () =>
                                        navigate({
                                            to: '/app/evaluations/seasons/$seasonId',
                                            params: {seasonId: r.seasonId},
                                        }),
                                })}
                            />
                        )}
                        {hasMoreSeasons && (
                            <div className="tw-flex tw-justify-center tw-border-t tw-border-slate-100 tw-py-3">
                                <AppInlinePillButton
                                    onClick={() => setSeasonLimit(seasonLimit + SEASONS_PAGE_SIZE)}
                                    className="tw-px-4 tw-py-1.5 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide"
                                >
                                    Load more seasons <DownOutlined/>
                                </AppInlinePillButton>
                            </div>
                        )}
                    </Card>
                </section>
            )}

            <SeasonCreateModal
                open={seasonCreateOpen}
                onClose={() => setSeasonCreateOpen(false)}
                onCreated={invalidateSeasons}
            />

            <Modal
                title={L.myAssignmentsTitle}
                open={assignmentsModalOpen}
                onCancel={() => setAssignmentsModalOpen(false)}
                footer={null}
                width="min(96vw, 1040px)"
                centered
                destroyOnClose
                maskClosable
                styles={{
                    body: {
                        maxHeight: 'min(78vh, 720px)',
                        overflowY: 'auto',
                        paddingTop: 8,
                    },
                }}
            >
                <MyEvaluationAssignmentsContent onBeforeNavigateWrite={() => setAssignmentsModalOpen(false)} />
            </Modal>
        </div>
    );
}

// ── 내부 컴포넌트들 ───────────────────────────────────────────

type PendingProps = {
    items: EvaluationResponse[];
    totalCount: number;
    onStart: (r: EvaluationResponse) => void;
    onViewAll: () => void;
};

function PendingEvaluationsCard({items, totalCount, onStart, onViewAll}: PendingProps) {
    return (
        <Card
            className="tw-min-h-[288px] tw-rounded-2xl tw-border tw-border-slate-200/90 tw-shadow-sm tw-shadow-slate-900/5"
            styles={{body: {padding: 20}}}
        >
            <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between">
                <div className="tw-flex tw-items-center">
                    <Text strong className="tw-text-[15px] tw-text-slate-900">
                        작성 대기중인 평가
                    </Text>
                </div>
                {totalCount > 0 && (
                    <AppInlinePillButton
                        onClick={onViewAll}
                        className="tw-px-3 tw-py-1 tw-text-xs tw-font-medium"
                    >
                        전체보기
                    </AppInlinePillButton>
                )}
            </div>
            {items.length === 0 ? (
                <div className="tw-py-10 tw-text-center tw-text-sm tw-text-slate-500">
                    작성해야 할 평가가 없습니다.
                </div>
            ) : (
                <Space direction="vertical" size={10} className="tw-w-full">
                    {items.map((r) => {
                        const isDone = r.status === 'SUBMITTED';
                        const displayName = r.targetMemberName ?? `대상자 #${r.targetMemberId.slice(0, 8)}`;
                        return (
                            <div
                                key={r.responseId}
                                className={
                                    'tw-flex tw-items-center tw-justify-between tw-gap-4 tw-rounded-2xl tw-px-4 tw-py-3 tw-transition-colors ' +
                                    (isDone
                                        ? 'tw-bg-slate-50'
                                        : 'tw-border tw-border-slate-200 hover:tw-border-slate-300')
                                }
                            >
                                <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-3">
                                    <Avatar
                                        size={40}
                                        src={r.targetMemberProfileUrl}
                                        style={{
                                            backgroundColor: isDone ? '#E2E8F0' : '#EEF2FF',
                                            color: isDone ? '#94A3B8' : '#6366F1',
                                        }}
                                        icon={<UserOutlined/>}
                                    />
                                    <div className="tw-min-w-0">
                                        <div
                                            className={
                                                'tw-truncate tw-text-sm tw-font-semibold ' +
                                                (isDone ? 'tw-text-slate-500' : 'tw-text-slate-900')
                                            }
                                        >
                                            {displayName}
                                            {r.targetMemberDepartment && (
                                                <span className="tw-ml-2 tw-text-xs tw-font-normal tw-text-slate-500">
                                                    · {r.targetMemberDepartment}
                                                </span>
                                            )}
                                        </div>
                                        <div className="tw-truncate tw-text-xs tw-text-slate-500">
                                            {responseStatusSubtext(r)}
                                        </div>
                                    </div>
                                </div>
                                {isDone ? (
                                    <CheckCircleFilled className="tw-text-2xl tw-text-emerald-500"/>
                                ) : (
                                    <Button
                                        type="primary"
                                        onClick={() => onStart(r)}
                                        className="\!tw-h-9 \!tw-rounded-full \!tw-bg-slate-900 \!tw-px-4 \!tw-text-sm \!tw-font-medium hover:\!tw-bg-slate-700"
                                    >
                                        작성 시작
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </Space>
            )}
        </Card>
    );
}

type StandingProps = {
    result: {
        seasonId?: string;
        seasonName: string;
        grade?: string;
        publishedAt?: string;
        totalReceived: number;
    } | null;
    onDownload: () => void;
};

function CurrentStandingCard({result, onDownload}: StandingProps) {
    const gradient = 'linear-gradient(135deg, #6366F1 0%, #4F46E5 55%, #4338CA 100%)';
    const empty = !result;
    const noGradeYet = !!result && !result.grade;

    return (
        <div
            className="tw-relative tw-overflow-hidden tw-rounded-3xl tw-p-6 tw-text-white tw-shadow-lg tw-shadow-indigo-500/20"
            style={{background: gradient}}
        >
            <div>
                <div className="tw-text-[11px] tw-font-semibold tw-uppercase tw-tracking-wider tw-text-white/80">
                    Current Standing
                </div>
            </div>

            <div className="tw-mt-10">
                {empty ? (
                    <>
                        <div className="tw-text-[32px] tw-font-bold tw-leading-tight">공개된 결과 없음</div>
                        <Paragraph className="\!tw-mb-0 \!tw-mt-1 \!tw-text-sm \!tw-text-white/80">
                            결과가 공개된 평가 시즌이 아직 없습니다.
                        </Paragraph>
                    </>
                ) : noGradeYet ? (
                    <>
                        <div className="tw-text-[32px] tw-font-bold tw-leading-tight">결과 공개됨</div>
                        <Paragraph className="\!tw-mb-0 \!tw-mt-2 \!tw-text-sm \!tw-text-white/80">
                            {result.seasonName} 기준
                            {result.publishedAt ? ` · ${dayjs(result.publishedAt).format('YYYY-MM-DD')} 공개` : ''}
                            {` · ${result.totalReceived}건`}
                        </Paragraph>
                    </>
                ) : (
                    <>
                        <div className="tw-text-[44px] tw-font-bold tw-leading-none">
                            Grade {result.grade}
                        </div>                        <Paragraph className="\!tw-mb-0 \!tw-mt-2 \!tw-text-sm \!tw-text-white/80">
                            {result.seasonName} 기준
                            {result.publishedAt ? ` · ${dayjs(result.publishedAt).format('YYYY-MM-DD')} 공개` : ''}
                        </Paragraph>
                    </>
                )}
            </div>            <button
                type="button"
                onClick={onDownload}
                disabled={empty}
                className="tw-mt-6 tw-inline-flex tw-w-full tw-items-center tw-justify-center tw-gap-2 tw-rounded-2xl tw-bg-white/95 tw-px-5 tw-py-3 tw-text-sm tw-font-semibold tw-text-slate-900 tw-transition-all hover:tw-bg-white disabled:tw-cursor-not-allowed disabled:tw-opacity-60"
            >
                리포트 다운로드 <ArrowRightOutlined/>
            </button>
        </div>
    );
}

export default EvaluationsHubPage;
