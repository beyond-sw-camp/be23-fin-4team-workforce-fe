import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
    Button, Card, DatePicker, Drawer, Form, Input, Progress, Select, Space, Table, Tabs, Tag, Typography, message,
    Checkbox, Popconfirm, Row, Col,
} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {
    PlusOutlined, EditOutlined, PlayCircleOutlined, StopOutlined,
    EyeOutlined, SendOutlined, WarningOutlined, CheckCircleOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {useCallback, useMemo, useState} from 'react';
import {useNavigate} from '@tanstack/react-router';
import {EVALUATION_PAGE_KO as L} from '@/app/locale/app-ko';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {
    EvaluationSeason, EvaluationGroup, EvaluationDesign, EvaluationResponse,
    SeasonType, SeasonStatus, EvalType, EvaluationStatus, DesignSection, GradeConfig,
    CreateSeasonPayload, CreateDesignPayload, CreateGroupPayload,
} from '@/features/evaluation/model/types';
import {PERM} from '@/features/permissions/backend-permissions';
import {usePermissions} from '@/features/permissions/usePermissionsHook';
import {useAuth} from '@/features/auth/useAuth';
import {AppButton} from '@/shared/ui/AppButton';
import {AppPageHeader} from '@/shared/ui/AppPageHeader';

const {Text} = Typography;

// ── Helpers ──
const seasonTypeLabel = (t: SeasonType) => ({
    ANNUAL: L.seasonTypeAnnual,
    HALF_YEAR: L.seasonTypeHalfYear,
    QUARTER: L.seasonTypeQuarter
}[t] ?? t);
const seasonStatusTag = (s: SeasonStatus) => {
    if (s === 'DRAFT') return <Tag color="gold">{L.statusDraft}</Tag>;
    if (s === 'ACTIVE') return <Tag color="blue">{L.statusActive}</Tag>;
    return <Tag color="green">{L.statusClosed}</Tag>;
};
const evalTypeLabel = (t: EvalType) => ({
    SELF: L.evalTypeSelf,
    DOWNWARD: L.evalTypeDownward,
    UPWARD: L.evalTypeUpward,
    PEER: L.evalTypePeer
}[t] ?? t);
const responseStatusTag = (s: EvaluationStatus) => {
    if (s === 'NOT_STARTED') return <Tag color="default">{L.statusNotStarted}</Tag>;
    if (s === 'IN_PROGRESS') return <Tag color="gold">{L.statusInProgress}</Tag>;
    return <Tag color="green">{L.statusSubmitted}</Tag>;
};

function EvaluationsPage() {
    const {user} = useAuth();
    const {hasPermission} = usePermissions();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const canCreate = hasPermission(PERM.EVALUATION_CREATE);
    const canUpdate = hasPermission(PERM.EVALUATION_UPDATE);

    const [tab, setTab] = useState<string>('mine');
    const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

    // ── Queries ──
    const {data: seasons = []} = useQuery({queryKey: ['eval-seasons'], queryFn: () => evaluationApi.listSeasons()});
    const {data: myResponses = []} = useQuery({
        queryKey: ['eval-my-responses'],
        queryFn: () => evaluationApi.listMyResponses()
    });
    const {data: designs = []} = useQuery({queryKey: ['eval-designs'], queryFn: () => evaluationApi.listDesigns()});
    const {data: groups = []} = useQuery({
        queryKey: ['eval-groups', selectedSeasonId],
        queryFn: () => selectedSeasonId ? evaluationApi.listGroups(selectedSeasonId) : Promise.resolve([]),
        enabled: !!selectedSeasonId,
    });
    const {data: progressData = []} = useQuery({
        queryKey: ['eval-progress', selectedSeasonId],
        queryFn: () => selectedSeasonId ? evaluationApi.getProgress(selectedSeasonId) : Promise.resolve([]),
        enabled: !!selectedSeasonId && tab === 'progress',
    });
    const {data: anomalyData = []} = useQuery({
        queryKey: ['eval-anomalies', selectedSeasonId],
        queryFn: () => selectedSeasonId ? evaluationApi.listAnomalies(selectedSeasonId) : Promise.resolve([]),
        enabled: !!selectedSeasonId && tab === 'anomalies',
    });
    const {data: calibrationData = []} = useQuery({
        queryKey: ['eval-calibration', selectedSeasonId],
        queryFn: () => selectedSeasonId ? evaluationApi.getCalibrationOverview(selectedSeasonId) : Promise.resolve([]),
        enabled: !!selectedSeasonId && tab === 'calibration',
    });

    // ── Mutations ──
    const invalidateAll = () => {
        queryClient.invalidateQueries({queryKey: ['eval-seasons']});
        queryClient.invalidateQueries({queryKey: ['eval-groups']});
        queryClient.invalidateQueries({queryKey: ['eval-designs']});
        queryClient.invalidateQueries({queryKey: ['eval-my-responses']});
        queryClient.invalidateQueries({queryKey: ['eval-progress']});
        queryClient.invalidateQueries({queryKey: ['eval-calibration']});
        queryClient.invalidateQueries({queryKey: ['eval-anomalies']});
    };

    // Season mutations
    const [seasonDrawer, setSeasonDrawer] = useState(false);
    const [seasonForm] = Form.useForm();
    const createSeasonMut = useMutation({
        mutationFn: (body: CreateSeasonPayload) => evaluationApi.createSeason(body),
        onSuccess: () => {
            message.success(L.seasonCreated);
            setSeasonDrawer(false);
            seasonForm.resetFields();
            invalidateAll();
        },
    });
    const startSeasonMut = useMutation({
        mutationFn: (id: string) => evaluationApi.startSeason(id),
        onSuccess: () => {
            message.success(L.seasonStarted);
            invalidateAll();
        },
    });
    const closeSeasonMut = useMutation({
        mutationFn: (id: string) => evaluationApi.closeSeason(id),
        onSuccess: () => {
            message.success(L.seasonClosed);
            invalidateAll();
        },
    });

    // Design mutations
    const [designDrawer, setDesignDrawer] = useState(false);
    const [designForm] = Form.useForm();
    const createDesignMut = useMutation({
        mutationFn: (body: CreateDesignPayload) => evaluationApi.createDesign(body),
        onSuccess: () => {
            message.success(L.designCreated);
            setDesignDrawer(false);
            designForm.resetFields();
            invalidateAll();
        },
    });

    // Group mutations
    const [groupDrawer, setGroupDrawer] = useState(false);
    const [groupForm] = Form.useForm();
    const createGroupMut = useMutation({
        mutationFn: (body: CreateGroupPayload) => selectedSeasonId ? evaluationApi.createGroup(selectedSeasonId, body) : Promise.reject(),
        onSuccess: () => {
            message.success(L.groupCreated);
            setGroupDrawer(false);
            groupForm.resetFields();
            invalidateAll();
        },
    });

    // Reminder mutation
    const sendReminderMut = useMutation({
        mutationFn: ({seasonId, memberId}: { seasonId: string; memberId?: string }) =>
            memberId ? evaluationApi.sendReminder(seasonId, memberId) : evaluationApi.sendBulkReminder(seasonId),
        onSuccess: () => {
            message.success(L.reminderSent);
            invalidateAll();
        },
    });

    // Calibration confirm
    const confirmCalibMut = useMutation({
        mutationFn: (seasonId: string) => evaluationApi.confirmCalibration(seasonId),
        onSuccess: () => {
            message.success(L.calibrationConfirmed);
            invalidateAll();
        },
    });

    // Review request
    const requestReviewMut = useMutation({
        mutationFn: ({seasonId, responseId}: {
            seasonId: string;
            responseId: string
        }) => evaluationApi.requestReview(seasonId, responseId),
        onSuccess: () => {
            message.success(L.reviewRequested);
            invalidateAll();
        },
    });

    // auto-select first active season
    const activeSeason = useMemo(() => seasons.find(s => s.status === 'ACTIVE'), [seasons]);
    if (activeSeason && !selectedSeasonId) setSelectedSeasonId(activeSeason.seasonId);

    // ── Season Columns ──
    const seasonCols: ColumnsType<EvaluationSeason> = [
        {title: L.seasonName, dataIndex: 'name', key: 'name'},
        {
            title: L.seasonType,
            dataIndex: 'type',
            key: 'type',
            render: (t: SeasonType) => <Tag>{seasonTypeLabel(t)}</Tag>
        },
        {
            title: L.seasonPeriod,
            key: 'period',
            render: (_: unknown, r: EvaluationSeason) => `${r.startDate} ~ ${r.endDate}`
        },
        {title: L.seasonStatus, dataIndex: 'status', key: 'status', render: (s: SeasonStatus) => seasonStatusTag(s)},
        {
            title: L.seasonActions, key: 'actions', render: (_: unknown, r: EvaluationSeason) => (
                <Space>
                    {r.status === 'DRAFT' && canUpdate && (
                        <Popconfirm title={L.seasonStartConfirm} onConfirm={() => startSeasonMut.mutate(r.seasonId)}>
                            <Button type="link" icon={<PlayCircleOutlined/>} size="small">{L.seasonStart}</Button>
                        </Popconfirm>
                    )}
                    {r.status === 'ACTIVE' && canUpdate && (
                        <>
                            <Button type="link" size="small"
                                    onClick={() => setSelectedSeasonId(r.seasonId)}>{L.seasonView}</Button>
                            <Popconfirm title={L.seasonCloseConfirm}
                                        onConfirm={() => closeSeasonMut.mutate(r.seasonId)}>
                                <Button type="link" danger icon={<StopOutlined/>} size="small">{L.seasonClose}</Button>
                            </Popconfirm>
                        </>
                    )}
                    {r.status === 'CLOSED' && <Button type="link" size="small"
                                                      onClick={() => setSelectedSeasonId(r.seasonId)}>{L.seasonView}</Button>}
                </Space>
            ),
        },
    ];

    // ── My Responses Columns ──
    const myResponseCols: ColumnsType<EvaluationResponse> = [
        {
            title: L.evaluationType,
            dataIndex: 'evaluationType',
            key: 'type',
            render: (t: EvalType) => <Tag color="blue">{evalTypeLabel(t)}</Tag>
        },
        {title: L.evaluationTarget, dataIndex: 'targetMemberId', key: 'target', ellipsis: true},
        {
            title: L.evaluationStatus,
            dataIndex: 'status',
            key: 'status',
            render: (s: EvaluationStatus) => responseStatusTag(s)
        },
        {
            title: L.evaluationAction, key: 'action', render: (_: unknown, r: EvaluationResponse) =>
                r.status !== 'SUBMITTED' ? (
                    <Button type="link" size="small" onClick={() => navigate({
                        to: '/app/evaluations/$responseId/write',
                        params: {responseId: r.responseId}
                    })}>
                        {L.evaluationWrite}
                    </Button>
                ) : <Text type="success">{L.evaluationSubmitted}</Text>,
        },
    ];

    // ── Design Columns ──
    const designCols: ColumnsType<EvaluationDesign> = [
        {title: L.designName, dataIndex: 'name', key: 'name'},
        {
            title: L.designSections,
            key: 'sections',
            render: (_: unknown, r: EvaluationDesign) => `${r.sections.length}${L.designSectionCount}`
        },
        {
            title: L.gradeTargetDist,
            key: 'grade',
            render: (_: unknown, r: EvaluationDesign) => r.gradeConfig ? (r.gradeConfig.type === 'ABSOLUTE' ? L.gradeAbsolute : L.gradeRelative) : '—'
        },
    ];

    // ── Progress Columns ──
    const progressCols: ColumnsType<EvaluationResponse> = [
        {title: L.member, dataIndex: 'evaluatorId', key: 'evaluator', ellipsis: true},
        {title: L.evaluationType, dataIndex: 'evaluationType', key: 'type', render: (t: EvalType) => evalTypeLabel(t)},
        {
            title: L.evaluationStatus,
            dataIndex: 'status',
            key: 'status',
            render: (s: EvaluationStatus) => responseStatusTag(s)
        },
        {
            title: L.progressLastRemind,
            dataIndex: 'lastRemindedAt',
            key: 'remind',
            render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'
        },
        {
            title: L.progressAction, key: 'action', render: (_: unknown, r: EvaluationResponse) =>
                r.status !== 'SUBMITTED' && selectedSeasonId ? (
                    <Button type="link" size="small" icon={<SendOutlined/>}
                            onClick={() => sendReminderMut.mutate({
                                seasonId: selectedSeasonId!,
                                memberId: r.evaluatorId
                            })}>
                        {L.progressRemindOne}
                    </Button>
                ) : null,
        },
    ];

    // ── Anomaly Columns ──
    const anomalyCols: ColumnsType<EvaluationResponse> = [
        {title: L.anomalyEvaluator, dataIndex: 'evaluatorId', key: 'evaluator', ellipsis: true},
        {title: L.evaluationTarget, dataIndex: 'targetMemberId', key: 'target', ellipsis: true},
        {
            title: L.anomalyType, key: 'anomalyType', render: (_: unknown, r: EvaluationResponse) => {
                const flagged = r.answers.filter(a => a.flagged);
                if (flagged.length === 0) return '—';
                return flagged.map(a => {
                    const labels: Record<string, string> = {
                        all_same: L.anomalyAllSame,
                        too_short: L.anomalyTooShort,
                        insincere: L.anomalyInsincere,
                        contradiction: L.anomalyContradiction
                    };
                    return <Tag key={a.questionId}
                                color={a.anomalySeverity === 'critical' ? 'red' : a.anomalySeverity === 'warning' ? 'orange' : 'blue'}>{labels[a.anomalyType ?? ''] ?? a.anomalyType}</Tag>;
                });
            },
        },
        {
            title: L.anomalyAction, key: 'action', render: (_: unknown, r: EvaluationResponse) =>
                selectedSeasonId ? (
                    <Space>
                        <Button type="link" size="small" onClick={() => requestReviewMut.mutate({
                            seasonId: selectedSeasonId!,
                            responseId: r.responseId
                        })}>{L.anomalyRequestReview}</Button>
                        <Button type="text" size="small">{L.anomalyDismiss}</Button>
                    </Space>
                ) : null,
        },
    ];

    // ── Calibration Columns ──
    const calibrationCols: ColumnsType<EvaluationResponse> = [
        {title: L.member, dataIndex: 'targetMemberId', key: 'name', ellipsis: true},
        {
            title: L.calibrationCurrentGrade,
            key: 'currentGrade',
            render: (_: unknown, r: EvaluationResponse) => r.calibration?.originalGrade ?? '—'
        },
        {
            title: L.calibrationAdjustedGrade,
            key: 'adjustedGrade',
            render: (_: unknown, r: EvaluationResponse) => r.calibration?.adjustedGrade ?? '—'
        },
        {
            title: L.calibrationReason,
            key: 'reason',
            render: (_: unknown, r: EvaluationResponse) => r.calibration?.adjustmentReason ?? ''
        },
        {
            title: L.calibrationConfirmStatus,
            key: 'confirmed',
            render: (_: unknown, r: EvaluationResponse) => r.calibration?.confirmedAt ?
                <Tag color="green">{L.calibrationConfirmStatus}</Tag> : <Tag>{L.calibrationUnconfirmed}</Tag>
        },
    ];

    // ── Progress stats ──
    const totalProgress = progressData.length;
    const completedProgress = progressData.filter(r => r.status === 'SUBMITTED').length;
    const progressPct = totalProgress > 0 ? Math.round((completedProgress / totalProgress) * 100) : 0;

    // ── Tab items ──
    const tabItems = [
        {
            key: 'mine',
            label: L.tabMyEvaluations,
            children: (
                <div className="tw-space-y-4">
                    <Table<EvaluationResponse> columns={myResponseCols} dataSource={myResponses} rowKey="responseId"
                                               size="middle" pagination={{pageSize: 10}}/>
                </div>
            ),
        },
        ...(canCreate ? [{
            key: 'seasons',
            label: L.tabSeasons,
            children: (
                <div className="tw-space-y-4">
                    <div className="tw-flex tw-justify-between tw-items-center">
                        <Text strong className="tw-text-base">{L.tabSeasons}</Text>
                        <AppButton variant="primary" onClick={() => setSeasonDrawer(true)}><PlusOutlined/> {L.seasonAdd}
                        </AppButton>
                    </div>
                    <Table<EvaluationSeason> columns={seasonCols} dataSource={seasons} rowKey="seasonId" size="middle"
                                             pagination={false}/>

                    {selectedSeasonId && (
                        <Card title={L.groupsTitle} extra={<AppButton variant="secondary"
                                                                      onClick={() => setGroupDrawer(true)}><PlusOutlined/> {L.groupAdd}
                        </AppButton>} className="tw-mt-4">
                            <Table<EvaluationGroup> columns={[
                                {title: L.groupName, dataIndex: 'name', key: 'name'},
                                {
                                    title: L.groupTargetCount,
                                    key: 'count',
                                    render: (_: unknown, r: EvaluationGroup) => `${r.targetMemberIds.length}${L.groupPersonCount}`
                                },
                                {
                                    title: L.groupEvalTypes,
                                    key: 'types',
                                    render: (_: unknown, r: EvaluationGroup) => r.evaluationTypes.map(t => <Tag key={t}
                                                                                                                color="blue">{evalTypeLabel(t)}</Tag>)
                                },
                                {
                                    title: L.groupDesign,
                                    dataIndex: 'designId',
                                    key: 'design',
                                    render: (id: string) => designs.find(d => d.designId === id)?.name ?? '—'
                                },
                            ]} dataSource={groups} rowKey="groupId" size="middle" pagination={false}/>
                        </Card>
                    )}
                </div>
            ),
        }] : []),
        ...(canCreate ? [{
            key: 'designs',
            label: L.tabDesigns,
            children: (
                <div className="tw-space-y-4">
                    <div className="tw-flex tw-justify-between tw-items-center">
                        <Text strong className="tw-text-base">{L.tabDesigns}</Text>
                        <AppButton variant="primary" onClick={() => setDesignDrawer(true)}><PlusOutlined/> {L.designAdd}
                        </AppButton>
                    </div>
                    <Table<EvaluationDesign> columns={designCols} dataSource={designs} rowKey="designId" size="middle"
                                             pagination={false}/>
                </div>
            ),
        }] : []),
        ...(canUpdate ? [{
            key: 'progress',
            label: L.tabProgress,
            children: (
                <div className="tw-space-y-4">
                    <div className="tw-flex tw-justify-between tw-items-center">
                        <div className="tw-flex tw-items-center tw-gap-4">
                            <Text strong className="tw-text-base">{L.progressTitle}</Text>
                            <Select value={selectedSeasonId} onChange={setSelectedSeasonId} placeholder={L.seasonSelect}
                                    className="tw-w-48"
                                    options={seasons.filter(s => s.status !== 'DRAFT').map(s => ({
                                        value: s.seasonId,
                                        label: s.name
                                    }))}/>
                        </div>
                        {selectedSeasonId && (
                            <Popconfirm
                                title={`${L.progressReminderConfirm} ${totalProgress - completedProgress}${L.groupPersonCount}?`}
                                onConfirm={() => sendReminderMut.mutate({seasonId: selectedSeasonId!})}>
                                <AppButton variant="secondary"><SendOutlined/> {L.progressRemindAll}</AppButton>
                            </Popconfirm>
                        )}
                    </div>
                    <Card>
                        <div className="tw-flex tw-items-center tw-gap-6">
                            <Text>{L.progressOverall}</Text>
                            <Progress percent={progressPct} className="tw-flex-1" strokeColor="#2563EB"/>
                            <Text type="secondary">{L.progressCompleted} {completedProgress}/{totalProgress}</Text>
                        </div>
                    </Card>
                    <Table<EvaluationResponse> columns={progressCols} dataSource={progressData} rowKey="responseId"
                                               size="middle" pagination={{pageSize: 20}}/>
                </div>
            ),
        }] : []),
        ...(canUpdate ? [{
            key: 'calibration',
            label: L.tabCalibration,
            children: (
                <div className="tw-space-y-4">
                    <div className="tw-flex tw-justify-between tw-items-center">
                        <div className="tw-flex tw-items-center tw-gap-4">
                            <Text strong className="tw-text-base">{L.calibrationTitle}</Text>
                            <Select value={selectedSeasonId} onChange={setSelectedSeasonId} placeholder={L.seasonSelect}
                                    className="tw-w-48"
                                    options={seasons.filter(s => s.status !== 'DRAFT').map(s => ({
                                        value: s.seasonId,
                                        label: s.name
                                    }))}/>
                        </div>
                        {selectedSeasonId && (
                            <Popconfirm title={L.calibrationConfirmModal}
                                        onConfirm={() => confirmCalibMut.mutate(selectedSeasonId!)}>
                                <AppButton variant="primary"><CheckCircleOutlined/> {L.calibrationConfirm}</AppButton>
                            </Popconfirm>
                        )}
                    </div>
                    <Table<EvaluationResponse> columns={calibrationCols} dataSource={calibrationData}
                                               rowKey="responseId" size="middle" pagination={{pageSize: 20}}/>
                </div>
            ),
        }] : []),
        ...(canUpdate ? [{
            key: 'anomalies',
            label: L.tabAnomalies,
            children: (
                <div className="tw-space-y-4">
                    <div className="tw-flex tw-justify-between tw-items-center">
                        <div className="tw-flex tw-items-center tw-gap-4">
                            <Text strong className="tw-text-base">{L.anomalyTitle}</Text>
                            <Select value={selectedSeasonId} onChange={setSelectedSeasonId} placeholder={L.seasonSelect}
                                    className="tw-w-48"
                                    options={seasons.filter(s => s.status !== 'DRAFT').map(s => ({
                                        value: s.seasonId,
                                        label: s.name
                                    }))}/>
                        </div>
                        <Tag color="orange"><WarningOutlined/> {L.anomalyCount}: {anomalyData.length}</Tag>
                    </div>
                    <Table<EvaluationResponse> columns={anomalyCols} dataSource={anomalyData} rowKey="responseId"
                                               size="middle" pagination={{pageSize: 20}}/>
                </div>
            ),
        }] : []),
        ...(canUpdate ? [{
            key: 'analytics',
            label: L.tabAnalytics,
            children: (
                <div className="tw-space-y-4">
                    <Text strong className="tw-text-base">{L.analyticsTitle}</Text>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Card title={L.analyticsItemDist}>
                                <div className="tw-flex tw-items-center tw-justify-center tw-h-64 tw-text-gray-400">
                                    {L.analyticsChartPlaceholder}
                                </div>
                            </Card>
                        </Col>
                        <Col span={12}>
                            <Card title={L.analyticsTeamSelf}>
                                <div className="tw-flex tw-items-center tw-justify-center tw-h-64 tw-text-gray-400">
                                    {L.analyticsChartPlaceholder}
                                </div>
                            </Card>
                        </Col>
                    </Row>
                </div>
            ),
        }] : []),
    ];

    return (
        <div className="tw-p-6 tw-max-w-screen-xl tw-mx-auto">
            <AppPageHeader title={L.pageTitle}/>
            <Tabs activeKey={tab} onChange={setTab} items={tabItems} className="tw-mt-4"/>

            {/* Season Create Drawer */}
            <Drawer title={L.seasonAdd} open={seasonDrawer} onClose={() => setSeasonDrawer(false)} width={480}
                    destroyOnClose>
                <Form form={seasonForm} layout="vertical" onFinish={(v) => {
                    const schedule = {
                        self: {startDate: '', endDate: ''},
                        peer: {startDate: '', endDate: ''},
                        downward: {startDate: '', endDate: ''},
                        upward: {startDate: '', endDate: ''}
                    };
                    createSeasonMut.mutate({
                        name: v.name,
                        type: v.type,
                        startDate: v.period[0].format('YYYY-MM-DD'),
                        endDate: v.period[1].format('YYYY-MM-DD'),
                        resultPublishDate: v.resultPublishDate?.format('YYYY-MM-DD'),
                        scheduleJson: JSON.stringify(schedule),
                    });
                }}>
                    <Form.Item name="name" label={L.seasonName} rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name="type" label={L.seasonType} rules={[{required: true}]}>
                        <Select options={[
                            {value: 'ANNUAL', label: L.seasonTypeAnnual},
                            {value: 'HALF_YEAR', label: L.seasonTypeHalfYear},
                            {value: 'QUARTER', label: L.seasonTypeQuarter},
                        ]}/>
                    </Form.Item>
                    <Form.Item name="period" label={L.seasonPeriod} rules={[{required: true}]}>
                        <DatePicker.RangePicker className="tw-w-full"/>
                    </Form.Item>
                    <Form.Item name="resultPublishDate" label={L.seasonResultPublishDate}>
                        <DatePicker className="tw-w-full"/>
                    </Form.Item>
                    <div className="tw-flex tw-justify-end tw-gap-2">
                        <Button onClick={() => setSeasonDrawer(false)}>{L.cancel}</Button>
                        <AppButton variant="primary" htmlType="submit"
                                   loading={createSeasonMut.isPending}>{L.save}</AppButton>
                    </div>
                </Form>
            </Drawer>

            {/* Design Create Drawer */}
            <Drawer title={L.designAdd} open={designDrawer} onClose={() => setDesignDrawer(false)} width={600}
                    destroyOnClose>
                <Form form={designForm} layout="vertical" onFinish={(v) => {
                    createDesignMut.mutate({
                        name: v.name,
                        sectionsJson: v.sectionsJson ?? '[]',
                        gradeConfigJson: v.gradeConfigJson,
                    });
                }}>
                    <Form.Item name="name" label={L.designName} rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name="sectionsJson" label={L.designSectionConfig}>
                        <Input.TextArea rows={8} placeholder='[{"title":"성과 평가","weight":40,"questions":[...]}]'/>
                    </Form.Item>
                    <Form.Item name="gradeConfigJson" label={L.designGradeConfig}>
                        <Input.TextArea rows={4}
                                        placeholder='{"type":"relative","grades":[...],"targetDistribution":{"S":5,"A":25,...}}'/>
                    </Form.Item>
                    <div className="tw-flex tw-justify-end tw-gap-2">
                        <Button onClick={() => setDesignDrawer(false)}>{L.cancel}</Button>
                        <AppButton variant="primary" htmlType="submit"
                                   loading={createDesignMut.isPending}>{L.save}</AppButton>
                    </div>
                </Form>
            </Drawer>

            {/* Group Create Drawer */}
            <Drawer title={L.groupAdd} open={groupDrawer} onClose={() => setGroupDrawer(false)} width={480}
                    destroyOnClose>
                <Form form={groupForm} layout="vertical" onFinish={(v) => {
                    createGroupMut.mutate({
                        name: v.name,
                        evaluationTypes: v.evaluationTypes ?? [],
                        targetMemberIds: [],
                        designId: v.designId,
                    });
                }}>
                    <Form.Item name="name" label={L.groupName} rules={[{required: true}]}>
                        <Input/>
                    </Form.Item>
                    <Form.Item name="evaluationTypes" label={L.groupEvalTypes}>
                        <Checkbox.Group options={[
                            {value: 'SELF', label: L.evalTypeSelf},
                            {value: 'DOWNWARD', label: L.evalTypeDownward},
                            {value: 'UPWARD', label: L.evalTypeUpward},
                            {value: 'PEER', label: L.evalTypePeer},
                        ]}/>
                    </Form.Item>
                    <Form.Item name="designId" label={L.groupDesign}>
                        <Select allowClear placeholder={L.designSelect}
                                options={designs.map(d => ({value: d.designId, label: d.name}))}/>
                    </Form.Item>
                    <div className="tw-flex tw-justify-end tw-gap-2">
                        <Button onClick={() => setGroupDrawer(false)}>{L.cancel}</Button>
                        <AppButton variant="primary" htmlType="submit"
                                   loading={createGroupMut.isPending}>{L.save}</AppButton>
                    </div>
                </Form>
            </Drawer>
        </div>
    );
}

export default EvaluationsPage
