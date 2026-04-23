import {useMutation} from '@tanstack/react-query';
import {useEffect} from 'react';
import {
    App,
    Button,
    Card,
    Col,
    Dropdown,
    Form,
    Input,
    Modal,
    Row,
    Select,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    DeleteOutlined,
    MinusCircleOutlined,
    PlusOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import {EVALUATION_PAGE_KO as L} from '@/app/locale/app-ko';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {CreateDesignPayload, EvaluationDesign, UpdateDesignPayload} from '@/features/evaluation/model/types';
import {DESIGN_PRESETS} from '@/features/evaluation/lib/designPresets';
import {AppButton} from '@/shared/ui/AppButton';

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    initialDesign?: EvaluationDesign | null;
};

export function DesignCreateModal({open, onClose, onCreated, initialDesign = null}: Props) {
    const {message} = App.useApp();
    const [form] = Form.useForm();
    const isEditMode = !!initialDesign;

    const createMut = useMutation({
        mutationFn: (body: CreateDesignPayload) => evaluationApi.createDesign(body),
        onSuccess: () => {
            message.success(L.designCreated);
            form.resetFields();
            onCreated();
            onClose();
        },
    });
    const updateMut = useMutation({
        mutationFn: ({designId, body}: {designId: string; body: UpdateDesignPayload}) =>
            evaluationApi.updateDesign(designId, body),
        onSuccess: () => {
            message.success('평가 설계를 수정했습니다.');
            form.resetFields();
            onCreated();
            onClose();
        },
    });

    useEffect(() => {
        if (!open) return;
        if (!initialDesign) {
            form.resetFields();
            return;
        }
        const gradeType = initialDesign.gradeConfig?.type === 'RELATIVE' ? 'relative' : 'absolute';
        const gradesRaw = initialDesign.gradeConfig?.grades ?? [];
        const grades = gradesRaw.map((g: any) => ({grade: typeof g === 'string' ? g : g?.label})).filter((g) => !!g.grade);
        const targetDist = initialDesign.gradeConfig?.targetDistribution
            ? Object.entries(initialDesign.gradeConfig.targetDistribution).map(([grade, pct]) => ({
                grade,
                pct: Number(pct) || 0,
            }))
            : [];
        const sections = (initialDesign.sections ?? []).map((s: any) => ({
            title: s.title,
            weight: s.weight,
            // [L-1] 섹션 타입 — 기본 MANUAL. 저장된 값이 있으면 그대로 가져옴.
            type: s.type ?? 'MANUAL',
            kpiFilter: s.kpiFilter ?? 'ALL',
            questions: (s.questions ?? []).map((q: any) => ({
                text: q.text ?? q.title ?? '',
                type: String(q.type ?? 'SCALE').toUpperCase(),
            })),
        }));
        form.setFieldsValue({
            name: initialDesign.name,
            sections,
            gradeType,
            grades,
            targetDist,
        });
    }, [open, initialDesign, form]);

    return (
        <Modal title={isEditMode ? '평가 설계 수정' : L.designAdd} open={open} onCancel={onClose} width={760} destroyOnHidden footer={null}>
            <Form
                form={form}
                layout="vertical"
                onFinish={(v) => {
                    const sections = (v.sections ?? []).map((s: any) => ({
                        title: s.title,
                        weight: Number(s.weight) || 0,
                        // [L-1] 섹션 타입 — 서버 enum 값(MANUAL/KPI_SCORE/PEER_FEEDBACK)으로 전송.
                        type: s.type || 'MANUAL',
                        // KPI_SCORE 섹션만 kpiFilter 사용, 나머지는 생략
                        kpiFilter: s.type === 'KPI_SCORE' ? (s.kpiFilter || 'ALL') : undefined,
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
                    const payload = {
                        name: v.name,
                        sectionsJson: JSON.stringify(sections),
                        gradeConfigJson: JSON.stringify(gradeConfig),
                    };
                    if (isEditMode && initialDesign) {
                        updateMut.mutate({designId: initialDesign.designId, body: payload});
                        return;
                    }
                    createMut.mutate(payload);
                }}
            >
                <Form.Item name="name" label={L.designName} rules={[{required: true}]}>
                    <Input placeholder="예: 2026년 상반기 평가" />
                </Form.Item>

                {/* 섹션 빌더 */}
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
                                form.setFieldsValue({
                                    name: form.getFieldValue('name') || preset.name,
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
                            <Button type="primary" ghost size="small" icon={<ThunderboltOutlined />}>
                                추천 템플릿
                            </Button>
                        </Tooltip>
                    </Dropdown>
                </div>
                <Form.List name="sections">
                    {(fields, {add, remove}) => (
                        <>
                            {fields.map(({key, name, ...restField}) => (
                                <Card
                                    key={key}
                                    size="small"
                                    className="tw-mb-3"
                                    title={
                                        <Form.Item
                                            noStyle
                                            shouldUpdate={(prev, cur) =>
                                                prev?.sections?.[name]?.type !== cur?.sections?.[name]?.type
                                                || prev?.sections?.[name]?.title !== cur?.sections?.[name]?.title
                                            }
                                        >
                                            {({getFieldValue}) => {
                                                const t = (getFieldValue(['sections', name, 'type']) ?? 'MANUAL') as
                                                    'MANUAL' | 'KPI_SCORE' | 'PEER_FEEDBACK';
                                                const title = getFieldValue(['sections', name, 'title']) as string | undefined;
                                                const meta: Record<'MANUAL' | 'KPI_SCORE' | 'PEER_FEEDBACK', {label: string; color: string}> = {
                                                    MANUAL: {label: '수동', color: 'default'},
                                                    KPI_SCORE: {label: 'KPI', color: 'geekblue'},
                                                    PEER_FEEDBACK: {label: '동료', color: 'purple'},
                                                };
                                                const m = meta[t] ?? meta.MANUAL;
                                                return (
                                                    <span className="tw-flex tw-items-center tw-gap-2">
                                                        <Tag color={m.color} className="!tw-m-0">{m.label}</Tag>
                                                        <span className="tw-text-sm tw-font-medium">
                                                            {title?.trim() || '섹션'}
                                                        </span>
                                                    </span>
                                                );
                                            }}
                                        </Form.Item>
                                    }
                                    extra={
                                        <Button
                                            type="text"
                                            danger
                                            icon={<DeleteOutlined />}
                                            onClick={() => remove(name)}
                                        />
                                    }
                                >
                                    <Row gutter={12}>
                                        <Col span={16}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'title']}
                                                label="섹션명"
                                                rules={[{required: true, message: '섹션명 필수'}]}
                                            >
                                                <Input placeholder="예: 업무 성과" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'weight']}
                                                label={L.designWeight}
                                                rules={[{required: true, message: '가중치 필수'}]}
                                            >
                                                <Input type="number" min={0} max={100} suffix="%" placeholder="40" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    {/* [L-1] 섹션 타입 선택 */}
                                    <Row gutter={12}>
                                        <Col span={12}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'type']}
                                                label={
                                                    <span>
                                                        섹션 유형{' '}
                                                        <Tooltip title="MANUAL: 문항 응답 평균 / KPI_SCORE: 목표 달성률 자동 반영 / PEER_FEEDBACK: 동료 응답 평균">
                                                            <span className="tw-text-gray-400 tw-cursor-help">(?)</span>
                                                        </Tooltip>
                                                    </span>
                                                }
                                                initialValue="MANUAL"
                                            >
                                                <Select
                                                    options={[
                                                        {value: 'MANUAL', label: '수동 입력 (문항 응답 기반)'},
                                                        {value: 'KPI_SCORE', label: 'KPI 달성률 (자동 반영)'},
                                                        {value: 'PEER_FEEDBACK', label: '동료 피드백 집계'},
                                                    ]}
                                                />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item
                                                noStyle
                                                shouldUpdate={(prev, cur) =>
                                                    prev?.sections?.[name]?.type !== cur?.sections?.[name]?.type
                                                }
                                            >
                                                {({getFieldValue}) => {
                                                    const t = getFieldValue(['sections', name, 'type']);
                                                    if (t !== 'KPI_SCORE') return null;
                                                    return (
                                                        <Form.Item
                                                            {...restField}
                                                            name={[name, 'kpiFilter']}
                                                            label={
                                                                <span>
                                                                    KPI 필터{' '}
                                                                    <Tooltip title="ALL: 전체 / TEMPLATE_ONLY: 템플릿 기반 KPI만 / UUID: 특정 kpiTemplateId">
                                                                        <span className="tw-text-gray-400 tw-cursor-help">(?)</span>
                                                                    </Tooltip>
                                                                </span>
                                                            }
                                                            initialValue="ALL"
                                                        >
                                                            <Input placeholder="ALL / TEMPLATE_ONLY / kpiTemplateId" />
                                                        </Form.Item>
                                                    );
                                                }}
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    {/* 문항 */}
                                    <Form.List name={[name, 'questions']}>
                                        {(qFields, qOps) => (
                                            <>
                                                {qFields.map((qf) => (
                                                    <Row key={qf.key} gutter={8} className="tw-mb-2" align="middle">
                                                        <Col flex="auto">
                                                            <Form.Item
                                                                name={[qf.name, 'text']}
                                                                noStyle
                                                                rules={[{required: true}]}
                                                            >
                                                                <Input placeholder="문항 내용" />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col flex="120px">
                                                            <Form.Item
                                                                name={[qf.name, 'type']}
                                                                noStyle
                                                                initialValue="SCALE"
                                                            >
                                                                <Select
                                                                    options={[
                                                                        {value: 'TEXT', label: L.questionTypeText},
                                                                        {value: 'SCALE', label: L.questionTypeScale},
                                                                        {value: 'GRADE', label: L.questionTypeGrade},
                                                                        {value: 'GAP', label: L.questionTypeGap},
                                                                    ]}
                                                                    style={{width: '100%'}}
                                                                />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col>
                                                            <Button
                                                                type="text"
                                                                danger
                                                                icon={<MinusCircleOutlined />}
                                                                onClick={() => qOps.remove(qf.name)}
                                                            />
                                                        </Col>
                                                    </Row>
                                                ))}
                                                <Button
                                                    type="dashed"
                                                    size="small"
                                                    block
                                                    icon={<PlusOutlined />}
                                                    onClick={() => qOps.add()}
                                                >
                                                    {L.designQuestionAdd}
                                                </Button>
                                            </>
                                        )}
                                    </Form.List>
                                </Card>
                            ))}
                            <Button
                                type="dashed"
                                block
                                icon={<PlusOutlined />}
                                className="tw-mb-4"
                                onClick={() => add()}
                            >
                                {L.designSectionAdd}
                            </Button>
                        </>
                    )}
                </Form.List>

                {/* 등급 설정 */}
                <Typography.Text strong className="tw-block tw-mb-2">
                    등급 설정
                </Typography.Text>
                <Form.Item name="gradeType" label="평가 방식" initialValue="absolute">
                    <Select
                        options={[
                            {value: 'absolute', label: L.gradeAbsolute},
                            {value: 'relative', label: L.gradeRelative},
                        ]}
                    />
                </Form.Item>
                <Form.List name="grades">
                    {(fields, {add, remove}) => (
                        <>
                            <Typography.Text type="secondary" className="tw-block tw-mb-1">
                                등급 목록
                            </Typography.Text>
                            {fields.map((f) => (
                                <Row key={f.key} gutter={8} className="tw-mb-2">
                                    <Col flex="auto">
                                        <Form.Item name={[f.name, 'grade']} noStyle>
                                            <Input placeholder="예: S, A, B, C, D" />
                                        </Form.Item>
                                    </Col>
                                    <Col>
                                        <Button
                                            type="text"
                                            danger
                                            icon={<MinusCircleOutlined />}
                                            onClick={() => remove(f.name)}
                                        />
                                    </Col>
                                </Row>
                            ))}
                            <Button type="dashed" size="small" onClick={() => add()} icon={<PlusOutlined />}>
                                등급 추가
                            </Button>
                        </>
                    )}
                </Form.List>

                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.gradeType !== cur.gradeType}>
                    {({getFieldValue}) =>
                        getFieldValue('gradeType') === 'relative' ? (
                            <div className="tw-mt-3">
                                <Typography.Text type="secondary" className="tw-block tw-mb-1">
                                    {L.gradeTargetDist}
                                </Typography.Text>
                                <Form.List name="targetDist">
                                    {(fields, {add, remove}) => (
                                        <>
                                            {fields.map((f) => (
                                                <Row key={f.key} gutter={8} className="tw-mb-2">
                                                    <Col span={10}>
                                                        <Form.Item name={[f.name, 'grade']} noStyle>
                                                            <Input placeholder="등급명" />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={10}>
                                                        <Form.Item name={[f.name, 'pct']} noStyle>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={100}
                                                                placeholder="비율(%)"
                                                                suffix="%"
                                                            />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={4}>
                                                        <Button
                                                            type="text"
                                                            danger
                                                            icon={<MinusCircleOutlined />}
                                                            onClick={() => remove(f.name)}
                                                        />
                                                    </Col>
                                                </Row>
                                            ))}
                                            <Button
                                                type="dashed"
                                                size="small"
                                                onClick={() => add()}
                                                icon={<PlusOutlined />}
                                            >
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
                    <Button onClick={onClose}>{L.cancel}</Button>
                    <AppButton
                        variant="primary"
                        htmlType="submit"
                        loading={createMut.isPending || updateMut.isPending}
                    >
                        {isEditMode ? '수정 저장' : L.save}
                    </AppButton>
                </div>
            </Form>
        </Modal>
    );
}
