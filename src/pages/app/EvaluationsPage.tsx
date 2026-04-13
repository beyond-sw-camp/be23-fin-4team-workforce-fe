import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
    Button, Card, DatePicker, Drawer, Dropdown, Form, Input, Progress, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message,
    Checkbox, Popconfirm, Row, Col,
} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {
    PlusOutlined, EditOutlined, PlayCircleOutlined, StopOutlined,
    EyeOutlined, SendOutlined, WarningOutlined, CheckCircleOutlined,
    ExclamationCircleOutlined, DeleteOutlined, MinusCircleOutlined,
    ThunderboltOutlined, UserOutlined, TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {useNavigate} from '@tanstack/react-router';
import {EVALUATION_PAGE_KO as L} from '@/app/locale/app-ko';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {
    EvaluationSeason, EvaluationGroup, EvaluationDesign, EvaluationResponse,
    SeasonType, SeasonStatus, EvalType, EvaluationStatus, DesignSection, GradeConfig,
    CreateSeasonPayload, CreateDesignPayload, CreateGroupPayload, EvaluatorMap,
} from '@/features/evaluation/model/types';
import {PERM} from '@/features/permissions/backend-permissions';
import {usePermissions} from '@/features/permissions/usePermissionsHook';
import {useAuth} from '@/features/auth/useAuth';
import {AppButton} from '@/shared/ui/AppButton';
import {AppPageHeader} from '@/shared/ui/AppPageHeader';
import {MemberRemoteSelect} from '@/features/members/ui/MemberRemoteSelect';
import {useMemberDisplayNames} from '@/features/members/hooks/useMemberDisplayNames';

const {Text} = Typography;

// ── 평가 설계 프리셋 ──
type DesignPreset = {
    key: string;
    label: string;
    description: string;
    name: string;
    sections: { title: string; weight: number; questions: { text: string; type: string }[] }[];
    gradeType: 'absolute' | 'relative';
    grades: { grade: string }[];
    targetDist?: { grade: string; pct: number }[];
};

const DESIGN_PRESETS: DesignPreset[] = [
    {
        key: 'performance',
        label: '성과 중심 평가',
        description: '업무 성과와 목표 달성도 중심',
        name: '성과 평가',
        sections: [
            {
                title: '업무 성과', weight: 60,
                questions: [
                    {text: '핵심 목표(KPI) 달성도를 평가해 주세요.', type: 'SCALE'},
                    {text: '업무 품질과 완성도는 어떠했나요?', type: 'SCALE'},
                    {text: '주요 성과와 기여 내용을 서술해 주세요.', type: 'TEXT'},
                ],
            },
            {
                title: '역량 및 태도', weight: 40,
                questions: [
                    {text: '문제 해결 및 의사결정 역량을 평가해 주세요.', type: 'SCALE'},
                    {text: '협업 및 커뮤니케이션 역량을 평가해 주세요.', type: 'SCALE'},
                    {text: '자기 개발 및 성장 노력은 어떠했나요?', type: 'SCALE'},
                ],
            },
        ],
        gradeType: 'relative',
        grades: [{grade: 'S'}, {grade: 'A'}, {grade: 'B'}, {grade: 'C'}, {grade: 'D'}],
        targetDist: [
            {grade: 'S', pct: 10}, {grade: 'A', pct: 20}, {grade: 'B', pct: 40},
            {grade: 'C', pct: 20}, {grade: 'D', pct: 10},
        ],
    },
    {
        key: 'competency',
        label: '역량 평가',
        description: '직무 역량과 리더십 중심',
        name: '역량 평가',
        sections: [
            {
                title: '직무 전문성', weight: 35,
                questions: [
                    {text: '담당 직무에 필요한 전문 지식 수준을 평가해 주세요.', type: 'SCALE'},
                    {text: '업무 프로세스 이해도와 실행력은 어떠한가요?', type: 'SCALE'},
                ],
            },
            {
                title: '리더십·협업', weight: 35,
                questions: [
                    {text: '팀 내 협업과 소통에 얼마나 기여했나요?', type: 'SCALE'},
                    {text: '후배 육성 또는 동료 지원 활동은 어떠했나요?', type: 'SCALE'},
                    {text: '갈등 상황에서 조율 능력을 평가해 주세요.', type: 'SCALE'},
                ],
            },
            {
                title: '성장 가능성', weight: 30,
                questions: [
                    {text: '새로운 역할·도전에 대한 적응력을 평가해 주세요.', type: 'SCALE'},
                    {text: '향후 성장 가능성에 대해 종합적으로 서술해 주세요.', type: 'TEXT'},
                ],
            },
        ],
        gradeType: 'absolute',
        grades: [{grade: '탁월'}, {grade: '우수'}, {grade: '보통'}, {grade: '미흡'}],
    },
    {
        key: 'okr',
        label: 'OKR 달성도 평가',
        description: 'OKR 기반 분기별 성과 리뷰',
        name: 'OKR 리뷰',
        sections: [
            {
                title: 'OKR 달성률', weight: 50,
                questions: [
                    {text: '핵심 결과(KR) 달성률을 종합적으로 평가해 주세요.', type: 'SCALE'},
                    {text: '목표 달성 과정에서의 핵심 성과를 서술해 주세요.', type: 'TEXT'},
                ],
            },
            {
                title: '임팩트·기여도', weight: 30,
                questions: [
                    {text: '팀/조직 목표에 대한 기여 수준을 평가해 주세요.', type: 'SCALE'},
                    {text: '기대 이상의 성과나 추가 기여가 있었나요?', type: 'TEXT'},
                ],
            },
            {
                title: '학습·개선', weight: 20,
                questions: [
                    {text: '분기 중 새롭게 학습하거나 개선한 점은 무엇인가요?', type: 'TEXT'},
                    {text: '다음 분기 개선 계획을 서술해 주세요.', type: 'TEXT'},
                ],
            },
        ],
        gradeType: 'absolute',
        grades: [{grade: '초과 달성'}, {grade: '달성'}, {grade: '부분 달성'}, {grade: '미달성'}],
    },
    {
        key: 'multisource',
        label: '다면(360°) 평가',
        description: '상향·하향·동료 피드백 종합',
        name: '다면 평가',
        sections: [
            {
                title: '업무 수행', weight: 30,
                questions: [
                    {text: '주어진 업무를 기한 내에 완수하는 정도를 평가해 주세요.', type: 'SCALE'},
                    {text: '업무 결과물의 품질은 어떠한가요?', type: 'SCALE'},
                ],
            },
            {
                title: '소통·협력', weight: 30,
                questions: [
                    {text: '의견을 명확하고 정중하게 전달하나요?', type: 'SCALE'},
                    {text: '다른 팀/직군과의 협업 자세는 어떠한가요?', type: 'SCALE'},
                    {text: '건설적인 피드백을 주고 받는 태도를 평가해 주세요.', type: 'SCALE'},
                ],
            },
            {
                title: '조직 기여', weight: 20,
                questions: [
                    {text: '회사 가치(Core Value)에 부합하는 행동을 보여주나요?', type: 'SCALE'},
                    {text: '조직 문화 개선에 기여하는 점이 있었나요?', type: 'TEXT'},
                ],
            },
            {
                title: '종합 의견', weight: 20,
                questions: [
                    {text: '이 분을 한마디로 표현하면 어떤 동료인가요?', type: 'TEXT'},
                    {text: '앞으로 더 발전하면 좋겠다고 느끼는 점이 있나요?', type: 'TEXT'},
                ],
            },
        ],
        gradeType: 'relative',
        grades: [{grade: 'S'}, {grade: 'A'}, {grade: 'B'}, {grade: 'C'}, {grade: 'D'}],
        targetDist: [
            {grade: 'S', pct: 5}, {grade: 'A', pct: 20}, {grade: 'B', pct: 50},
            {grade: 'C', pct: 20}, {grade: 'D', pct: 5},
        ],
    },
];

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

// ── Evaluator Assign Drawer ──
type AssignDrawerState = { open: boolean; group: EvaluationGroup | null };
type DraftMapping = { targetMemberId: string; evaluatorId: string; evaluationType: EvalType; _key: number };

function EvaluatorAssignDrawer({
    state, onClose, seasonId, labelFor, evalTypes, onSaved,
}: {
    state: AssignDrawerState;
    onClose: () => void;
    seasonId: string;
    labelFor: (id: string) => string;
    evalTypes: EvalType[];
    onSaved: () => void;
}) {
    const group = state.group;
    const [mappings, setMappings] = useState<DraftMapping[]>([]);
    const keyRef = useMemo(() => ({current: 0}), []);

    // 그룹이 열릴 때 기존 매핑을 초기화
    useEffect(() => {
        if (!group) return;
        const existing = (group.evaluatorMaps ?? []).map((em) => ({
            targetMemberId: em.targetMemberId,
            evaluatorId: em.evaluatorId,
            evaluationType: em.evaluationType,
            _key: keyRef.current++,
        }));
        setMappings(existing);
    }, [group, keyRef]);

    // 수동 저장
    const updateMapMut = useMutation({
        mutationFn: (maps: EvaluatorMap[]) =>
            evaluationApi.updateEvaluatorMaps(seasonId, group!.groupId, JSON.stringify(maps)),
        onSuccess: () => {
            message.success('평가자 지정이 저장되었습니다.');
            onSaved();
            onClose();
        },
        onError: () => message.error('평가자 지정 저장에 실패했습니다.'),
    });

    // 자동 지정 → 결과를 드래프트 매핑에 반영 (저장은 별도)
    const autoAssignMut = useMutation({
        mutationFn: () =>
            evaluationApi.autoAssignEvaluators(seasonId, group!.groupId, 'ORG_STRUCTURE'),
        onSuccess: (updatedGroup) => {
            const newMaps = (updatedGroup.evaluatorMaps ?? []).map((em) => ({
                targetMemberId: em.targetMemberId,
                evaluatorId: em.evaluatorId,
                evaluationType: em.evaluationType,
                _key: keyRef.current++,
            }));
            setMappings(newMaps);
            message.success('조직 구조 기반으로 평가자가 자동 배정되었습니다. 필요시 수정 후 저장하세요.');
            onSaved(); // 쿼리 무효화하여 테이블도 갱신
        },
        onError: () => message.error('평가자 자동 지정에 실패했습니다.'),
    });

    const handleSave = () => {
        const valid = mappings.filter((m) => m.targetMemberId && m.evaluatorId && m.evaluationType);
        updateMapMut.mutate(valid.map(({targetMemberId, evaluatorId, evaluationType}) => ({
            targetMemberId, evaluatorId, evaluationType,
        })));
    };

    const addRow = (targetMemberId: string) => {
        setMappings((prev) => [...prev, {
            targetMemberId,
            evaluatorId: '',
            evaluationType: evalTypes[0] ?? 'DOWNWARD',
            _key: keyRef.current++,
        }]);
    };

    const removeRow = (key: number) => {
        setMappings((prev) => prev.filter((m) => m._key !== key));
    };

    const updateRow = (key: number, field: keyof DraftMapping, value: string) => {
        setMappings((prev) => prev.map((m) => m._key === key ? {...m, [field]: value} : m));
    };

    if (!group) return null;
    const targets = group.targetMemberIds ?? [];

    return (
        <Drawer
            title={<Space><EditOutlined/><span>평가자 지정 — {group.name}</span></Space>}
            open={state.open}
            onClose={onClose}
            width={720}
            destroyOnClose
            footer={
                <div className="tw-flex tw-justify-end tw-gap-2">
                    <Button onClick={onClose}>취소</Button>
                    <AppButton variant="primary" onClick={handleSave} loading={updateMapMut.isPending}>
                        저장
                    </AppButton>
                </div>
            }
        >
            {/* 상단 안내 + 자동 지정 버튼 */}
            <div className="tw-flex tw-items-center tw-justify-between tw-mb-4 tw-p-3 tw-bg-blue-50 tw-rounded-lg">
                <div>
                    <Text strong>대상 인원 {targets.length}{L.groupPersonCount}</Text>
                    <Text type="secondary" className="tw-ml-2">
                        아래에서 각 대상자별 평가자를 수동으로 추가하거나, 자동 지정을 사용하세요.
                    </Text>
                </div>
                <Tooltip title="조직 구조 기반으로 평가자를 자동 배정합니다. 기존 매핑을 덮어씁니다.">
                    <Popconfirm
                        title="자동 지정 시 현재 매핑이 덮어씌워집니다. 진행할까요?"
                        onConfirm={() => autoAssignMut.mutate()}
                        okText="자동 지정"
                        cancelText="취소"
                    >
                        <Button
                            type="primary"
                            ghost
                            icon={<ThunderboltOutlined/>}
                            loading={autoAssignMut.isPending}
                        >
                            자동 지정
                        </Button>
                    </Popconfirm>
                </Tooltip>
            </div>

            <div className="tw-space-y-5">
                {targets.map((tid) => {
                    const rows = mappings.filter((m) => m.targetMemberId === tid);
                    return (
                        <Card
                            key={tid}
                            size="small"
                            title={
                                <Space>
                                    <UserOutlined/>
                                    <Text strong>{labelFor(tid)}</Text>
                                    <Tag color="blue">{rows.length}{L.groupPersonCount} 평가자</Tag>
                                </Space>
                            }
                        >
                            {rows.map((row) => (
                                <Row key={row._key} gutter={8} className="tw-mb-2" align="middle">
                                    <Col span={8}>
                                        <Select
                                            value={row.evaluationType}
                                            onChange={(v) => updateRow(row._key, 'evaluationType', v)}
                                            style={{width: '100%'}}
                                            options={evalTypes.map((t) => ({value: t, label: evalTypeLabel(t)}))}
                                        />
                                    </Col>
                                    <Col span={13}>
                                        <MemberRemoteSelect
                                            value={row.evaluatorId || undefined}
                                            onChange={(v) => updateRow(row._key, 'evaluatorId', v as string)}
                                            placeholder="평가자 검색"
                                            excludeMemberIds={[tid]}
                                        />
                                    </Col>
                                    <Col span={3}>
                                        <Button
                                            type="text"
                                            danger
                                            icon={<MinusCircleOutlined/>}
                                            onClick={() => removeRow(row._key)}
                                        />
                                    </Col>
                                </Row>
                            ))}
                            <Button
                                type="dashed"
                                size="small"
                                block
                                icon={<PlusOutlined/>}
                                onClick={() => addRow(tid)}
                            >
                                평가자 추가
                            </Button>
                        </Card>
                    );
                })}
                {targets.length === 0 && (
                    <div className="tw-text-center tw-py-8 tw-text-gray-400">
                        대상 인원이 없습니다. 그룹에 대상 인원을 먼저 추가해 주세요.
                    </div>
                )}
            </div>
        </Drawer>
    );
}

// ── GroupsSection Component ──
type GroupsSectionProps = {
    groups: EvaluationGroup[];
    designs: EvaluationDesign[];
    selectedSeasonId: string;
    onAddGroup: () => void;
    onInvalidate: () => void;
};

function GroupsSection({groups, designs, selectedSeasonId, onAddGroup, onInvalidate}: GroupsSectionProps) {
    const [assignDrawer, setAssignDrawer] = useState<AssignDrawerState>({open: false, group: null});

    // 모든 그룹의 멤버 ID 수집하여 이름 해석
    const allMemberIds = useMemo(() => {
        const ids = new Set<string>();
        for (const g of groups) {
            for (const id of g.targetMemberIds ?? []) ids.add(id);
            for (const em of g.evaluatorMaps ?? []) {
                if (em.targetMemberId) ids.add(em.targetMemberId);
                if (em.evaluatorId) ids.add(em.evaluatorId);
            }
        }
        return [...ids];
    }, [groups]);

    const {labelFor} = useMemberDisplayNames(allMemberIds);

    const designMap = useMemo(() => {
        const m = new Map<string, string>();
        for (const d of designs) m.set(d.designId, d.name);
        return m;
    }, [designs]);

    const expandedRowRender = useCallback((group: EvaluationGroup) => {
        const targets = group.targetMemberIds ?? [];
        const evalMaps = group.evaluatorMaps ?? [];

        // 대상 인원별 평가자 매핑 테이블
        const targetRows = targets.map((tid) => {
            const assigned = evalMaps.filter((em) => em.targetMemberId === tid);
            return {key: tid, targetMemberId: tid, evaluators: assigned};
        });

        type TargetRow = typeof targetRows[number];

        const targetCols: ColumnsType<TargetRow> = [
            {
                title: '대상자',
                dataIndex: 'targetMemberId',
                key: 'target',
                width: 200,
                render: (id: string) => (
                    <Space>
                        <UserOutlined/>
                        <Text className="tw-font-medium">{labelFor(id)}</Text>
                    </Space>
                ),
            },
            {
                title: '지정된 평가자',
                key: 'evaluators',
                render: (_: unknown, row: TargetRow) => {
                    if (row.evaluators.length === 0) {
                        return <Text type="secondary">미지정</Text>;
                    }
                    return (
                        <Space wrap size={[4, 4]}>
                            {row.evaluators.map((em, idx) => (
                                <Tag key={idx} color={{SELF: 'cyan', DOWNWARD: 'blue', UPWARD: 'green', PEER: 'purple'}[em.evaluationType] ?? 'default'}>
                                    {evalTypeLabel(em.evaluationType)}: {labelFor(em.evaluatorId)}
                                </Tag>
                            ))}
                        </Space>
                    );
                },
            },
        ];

        return (
            <div className="tw-py-2">
                <Table
                    columns={targetCols}
                    dataSource={targetRows}
                    rowKey="key"
                    size="small"
                    pagination={false}
                    locale={{emptyText: '대상 인원이 없습니다.'}}
                />
            </div>
        );
    }, [labelFor]);

    const groupCols: ColumnsType<EvaluationGroup> = [
        {title: L.groupName, dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text>},
        {
            title: L.groupTargetCount,
            key: 'targetCount',
            width: 100,
            render: (_: unknown, g: EvaluationGroup) => (
                <Tag color="blue">{(g.targetMemberIds ?? []).length}{L.groupPersonCount}</Tag>
            ),
        },
        {
            title: L.groupEvalTypes,
            key: 'evalTypes',
            width: 200,
            render: (_: unknown, g: EvaluationGroup) => (
                <Space wrap size={[4, 4]}>
                    {(g.evaluationTypes ?? []).map((t) => (
                        <Tag key={t}>{evalTypeLabel(t)}</Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: L.groupDesign,
            key: 'design',
            width: 160,
            render: (_: unknown, g: EvaluationGroup) =>
                g.designId ? <Tag>{designMap.get(g.designId) ?? g.designId}</Tag> : <Text type="secondary">—</Text>,
        },
        {
            title: '평가자 현황',
            key: 'evaluatorStatus',
            width: 130,
            render: (_: unknown, g: EvaluationGroup) => {
                const maps = g.evaluatorMaps ?? [];
                const targets = g.targetMemberIds ?? [];
                if (targets.length === 0) return <Text type="secondary">—</Text>;
                if (maps.length === 0) return <Tag color="warning">미지정</Tag>;
                return <Tag color="success">{maps.length}건 지정</Tag>;
            },
        },
        {
            title: '',
            key: 'actions',
            width: 140,
            render: (_: unknown, g: EvaluationGroup) => (
                <Button
                    type="primary"
                    ghost
                    size="small"
                    icon={<EditOutlined/>}
                    onClick={() => setAssignDrawer({open: true, group: g})}
                >
                    평가자 지정
                </Button>
            ),
        },
    ];

    return (
        <>
            <Card
                title={<Space><TeamOutlined/><Text strong>{L.groupsTitle}</Text></Space>}
                extra={<AppButton variant="primary" onClick={onAddGroup}><PlusOutlined/> {L.groupAdd}</AppButton>}
                className="tw-mt-4"
            >
                <Table<EvaluationGroup>
                    columns={groupCols}
                    dataSource={groups}
                    rowKey="groupId"
                    size="middle"
                    pagination={false}
                    expandable={{
                        expandedRowRender,
                        rowExpandable: (g) => (g.targetMemberIds ?? []).length > 0,
                    }}
                    locale={{emptyText: '등록된 그룹이 없습니다. 그룹을 추가해 주세요.'}}
                />
            </Card>
            <EvaluatorAssignDrawer
                state={assignDrawer}
                onClose={() => setAssignDrawer({open: false, group: null})}
                seasonId={selectedSeasonId}
                labelFor={labelFor}
                evalTypes={assignDrawer.group?.evaluationTypes ?? ['SELF', 'DOWNWARD', 'UPWARD', 'PEER']}
                onSaved={onInvalidate}
            />
        </>
    );
}

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
                    {myResponses.length === 0 && (
                        <Typography.Paragraph type="secondary" className="tw-mb-0 tw-text-sm">
                            {L.myEvaluationsEmptyHint}
                        </Typography.Paragraph>
                    )}
                    <Table<EvaluationResponse> columns={myResponseCols} dataSource={myResponses} rowKey="responseId"
                                               size="middle" pagination={{pageSize: 10}}
                                               locale={{emptyText: '할당된 평가가 없습니다.'}}/>
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
                        <GroupsSection
                            groups={groups}
                            designs={designs}
                            selectedSeasonId={selectedSeasonId}
                            onAddGroup={() => setGroupDrawer(true)}
                            onInvalidate={invalidateAll}
                        />
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
            <Drawer title={L.designAdd} open={designDrawer} onClose={() => setDesignDrawer(false)} width={640}
                    destroyOnClose>
                <Form form={designForm} layout="vertical" onFinish={(v) => {
                    const sections = (v.sections ?? []).map((s: any) => ({
                        title: s.title,
                        weight: Number(s.weight) || 0,
                        questions: (s.questions ?? []).map((q: any) => ({
                            text: q.text,
                            type: q.type ?? 'SCALE',
                            required: true,
                        })),
                    }));
                    const gradeConfig: Record<string, unknown> = {
                        type: v.gradeType ?? 'absolute',
                    };
                    if (v.grades?.length) {
                        gradeConfig.grades = v.grades.map((g: any) => g.grade?.trim()).filter(Boolean);
                    }
                    if (v.gradeType === 'relative' && v.targetDist?.length) {
                        const dist: Record<string, number> = {};
                        for (const d of v.targetDist) {
                            if (d.grade?.trim()) dist[d.grade.trim()] = Number(d.pct) || 0;
                        }
                        gradeConfig.targetDistribution = dist;
                    }
                    createDesignMut.mutate({
                        name: v.name,
                        sectionsJson: JSON.stringify(sections),
                        gradeConfigJson: JSON.stringify(gradeConfig),
                    });
                }}>
                    <Form.Item name="name" label={L.designName} rules={[{required: true}]}>
                        <Input placeholder="예: 2026년 상반기 평가"/>
                    </Form.Item>

                    {/* ── 섹션 빌더 ── */}
                    <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
                        <Typography.Text strong>섹션 구성</Typography.Text>
                        <Dropdown
                            menu={{
                                items: DESIGN_PRESETS.map((p) => ({
                                    key: p.key,
                                    label: (
                                        <div>
                                            <div className="tw-font-medium">{p.label}</div>
                                            <div className="tw-text-xs tw-text-gray-400">{p.description}</div>
                                        </div>
                                    ),
                                })),
                                onClick: ({key}) => {
                                    const preset = DESIGN_PRESETS.find((p) => p.key === key);
                                    if (!preset) return;
                                    designForm.setFieldsValue({
                                        name: designForm.getFieldValue('name') || preset.name,
                                        sections: preset.sections.map((s) => ({
                                            title: s.title,
                                            weight: s.weight,
                                            questions: s.questions.map((q) => ({text: q.text, type: q.type})),
                                        })),
                                        gradeType: preset.gradeType,
                                        grades: preset.grades,
                                        targetDist: preset.targetDist ?? [],
                                    });
                                    message.success(`"${preset.label}" 템플릿이 적용되었습니다. 내용을 자유롭게 수정하세요.`);
                                },
                            }}
                            placement="bottomRight"
                        >
                            <Tooltip title="추천 템플릿으로 섹션·등급을 자동으로 채웁니다.">
                                <Button type="primary" ghost size="small" icon={<ThunderboltOutlined/>}>
                                    추천 템플릿
                                </Button>
                            </Tooltip>
                        </Dropdown>
                    </div>
                    <Form.List name="sections">
                        {(fields, {add, remove}) => (
                            <>
                                {fields.map(({key, name, ...restField}) => (
                                    <Card key={key} size="small" className="tw-mb-3"
                                          extra={<Button type="text" danger icon={<DeleteOutlined/>}
                                                         onClick={() => remove(name)}/>}>
                                        <Row gutter={12}>
                                            <Col span={16}>
                                                <Form.Item {...restField} name={[name, 'title']} label="섹션명"
                                                           rules={[{required: true, message: '섹션명 필수'}]}>
                                                    <Input placeholder="예: 업무 성과"/>
                                                </Form.Item>
                                            </Col>
                                            <Col span={8}>
                                                <Form.Item {...restField} name={[name, 'weight']}
                                                           label={L.designWeight}
                                                           rules={[{required: true, message: '가중치 필수'}]}>
                                                    <Input type="number" min={0} max={100} suffix="%"
                                                           placeholder="40"/>
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                        {/* 문항 */}
                                        <Form.List name={[name, 'questions']}>
                                            {(qFields, qOps) => (
                                                <>
                                                    {qFields.map((qf) => (
                                                        <Row key={qf.key} gutter={8} className="tw-mb-2"
                                                             align="middle">
                                                            <Col flex="auto">
                                                                <Form.Item name={[qf.name, 'text']} noStyle
                                                                           rules={[{required: true}]}>
                                                                    <Input placeholder="문항 내용"/>
                                                                </Form.Item>
                                                            </Col>
                                                            <Col flex="120px">
                                                                <Form.Item name={[qf.name, 'type']} noStyle
                                                                           initialValue="SCALE">
                                                                    <Select options={[
                                                                        {value: 'TEXT', label: L.questionTypeText},
                                                                        {value: 'SCALE', label: L.questionTypeScale},
                                                                        {value: 'GRADE', label: L.questionTypeGrade},
                                                                        {value: 'GAP', label: L.questionTypeGap},
                                                                    ]} style={{width: '100%'}}/>
                                                                </Form.Item>
                                                            </Col>
                                                            <Col>
                                                                <Button type="text" danger
                                                                        icon={<MinusCircleOutlined/>}
                                                                        onClick={() => qOps.remove(qf.name)}/>
                                                            </Col>
                                                        </Row>
                                                    ))}
                                                    <Button type="dashed" size="small" block
                                                            icon={<PlusOutlined/>}
                                                            onClick={() => qOps.add()}>
                                                        {L.designQuestionAdd}
                                                    </Button>
                                                </>
                                            )}
                                        </Form.List>
                                    </Card>
                                ))}
                                <Button type="dashed" block icon={<PlusOutlined/>}
                                        className="tw-mb-4"
                                        onClick={() => add()}>
                                    {L.designSectionAdd}
                                </Button>
                            </>
                        )}
                    </Form.List>

                    {/* ── 등급 설정 ── */}
                    <Typography.Text strong className="tw-block tw-mb-2">등급 설정</Typography.Text>
                    <Form.Item name="gradeType" label="평가 방식" initialValue="absolute">
                        <Select options={[
                            {value: 'absolute', label: L.gradeAbsolute},
                            {value: 'relative', label: L.gradeRelative},
                        ]}/>
                    </Form.Item>
                    <Form.List name="grades">
                        {(fields, {add, remove}) => (
                            <>
                                <Typography.Text type="secondary" className="tw-block tw-mb-1">등급 목록</Typography.Text>
                                {fields.map((f) => (
                                    <Row key={f.key} gutter={8} className="tw-mb-2">
                                        <Col flex="auto">
                                            <Form.Item name={[f.name, 'grade']} noStyle>
                                                <Input placeholder="예: S, A, B, C, D"/>
                                            </Form.Item>
                                        </Col>
                                        <Col>
                                            <Button type="text" danger icon={<MinusCircleOutlined/>}
                                                    onClick={() => remove(f.name)}/>
                                        </Col>
                                    </Row>
                                ))}
                                <Button type="dashed" size="small" onClick={() => add()} icon={<PlusOutlined/>}>
                                    등급 추가
                                </Button>
                            </>
                        )}
                    </Form.List>

                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.gradeType !== cur.gradeType}>
                        {({getFieldValue}) =>
                            getFieldValue('gradeType') === 'relative' ? (
                                <div className="tw-mt-3">
                                    <Typography.Text type="secondary" className="tw-block tw-mb-1">{L.gradeTargetDist}</Typography.Text>
                                    <Form.List name="targetDist">
                                        {(fields, {add, remove}) => (
                                            <>
                                                {fields.map((f) => (
                                                    <Row key={f.key} gutter={8} className="tw-mb-2">
                                                        <Col span={10}>
                                                            <Form.Item name={[f.name, 'grade']} noStyle>
                                                                <Input placeholder="등급명"/>
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={10}>
                                                            <Form.Item name={[f.name, 'pct']} noStyle>
                                                                <Input type="number" min={0} max={100}
                                                                       placeholder="비율(%)" suffix="%"/>
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={4}>
                                                            <Button type="text" danger icon={<MinusCircleOutlined/>}
                                                                    onClick={() => remove(f.name)}/>
                                                        </Col>
                                                    </Row>
                                                ))}
                                                <Button type="dashed" size="small" onClick={() => add()}
                                                        icon={<PlusOutlined/>}>
                                                    분포 추가
                                                </Button>
                                            </>
                                        )}
                                    </Form.List>
                                </div>
                            ) : null
                        }
                    </Form.Item>

                    <div className="tw-flex tw-justify-end tw-gap-2 tw-mt-4">
                        <Button onClick={() => setDesignDrawer(false)}>{L.cancel}</Button>
                        <AppButton variant="primary" htmlType="submit"
                                   loading={createDesignMut.isPending}>{L.save}</AppButton>
                    </div>
                </Form>
            </Drawer>

            {/* Group Create Drawer */}
            <Drawer title={L.groupAdd} open={groupDrawer} onClose={() => setGroupDrawer(false)} width={520}
                    destroyOnClose>
                <Form form={groupForm} layout="vertical" onFinish={(v) => {
                    createGroupMut.mutate({
                        name: v.name,
                        evaluationTypes: v.evaluationTypes ?? [],
                        targetMemberIds: v.targetMemberIds ?? [],
                        designId: v.designId,
                    });
                }}>
                    <Form.Item name="name" label={L.groupName} rules={[{required: true}]}>
                        <Input placeholder="예: 개발팀 2026 상반기"/>
                    </Form.Item>
                    <Form.Item name="evaluationTypes" label={L.groupEvalTypes}
                               rules={[{required: true, message: '평가 유형을 1개 이상 선택해 주세요.'}]}>
                        <Checkbox.Group options={[
                            {value: 'SELF', label: L.evalTypeSelf},
                            {value: 'DOWNWARD', label: L.evalTypeDownward},
                            {value: 'UPWARD', label: L.evalTypeUpward},
                            {value: 'PEER', label: L.evalTypePeer},
                        ]}/>
                    </Form.Item>
                    <Form.Item name="targetMemberIds" label={
                        <Space>
                            <span>평가 대상 인원</span>
                            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.targetMemberIds !== cur.targetMemberIds}>
                                {({getFieldValue}) => {
                                    const ids = getFieldValue('targetMemberIds') ?? [];
                                    return ids.length > 0
                                        ? <Tag color="blue">{ids.length}{L.groupPersonCount}</Tag>
                                        : null;
                                }}
                            </Form.Item>
                        </Space>
                    } rules={[{
                        validator: (_: unknown, v: string[]) =>
                            v?.length > 0 ? Promise.resolve() : Promise.reject('대상 인원을 1명 이상 선택해 주세요.'),
                    }]}>
                        <MemberRemoteSelect multiple placeholder="이름·이메일로 검색하여 추가"/>
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
