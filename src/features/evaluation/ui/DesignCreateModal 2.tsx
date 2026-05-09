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
import {evaluationRedesignApi} from '@/features/evaluation/api/evaluationRedesignApi';
import type {CreateDesignPayload, EvaluationDesign, UpdateDesignPayload} from '@/features/evaluation/model/types';
import {DESIGN_PRESETS} from '@/features/evaluation/lib/designPresets';
import {
    assignDefaultQuestionWeights,
    validateEvaluationDesignWeights,
    validateRelativeTargetDistributionPct,
    type DesignSectionDraft,
} from '@/features/evaluation/lib/designWeightRules';
import {useAuth} from '@/features/auth/useAuth';
import {AppDoubleActionModal} from '@/shared/ui/AppDoubleActionModal';

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    initialDesign?: EvaluationDesign | null;
};

export function DesignCreateModal({open, onClose, onCreated, initialDesign = null}: Props) {
    const {message} = App.useApp();
    useAuth();
    const [form] = Form.useForm();
    const isEditMode = !!initialDesign;

    const createMut = useMutation({
        mutationFn: (body: CreateDesignPayload) => evaluationRedesignApi.createDesign(body),
        onSuccess: () => {
            message.success(L.designCreated);
            form.resetFields();
            onCreated();
            onClose();
        },
    });
    const updateMut = useMutation({
        mutationFn: ({designId, body}: {designId: string; body: UpdateDesignPayload}) =>
            evaluationRedesignApi.updateDesign(designId, body),
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
        const sections = (initialDesign.sections ?? []).map((s: any) => {
            const type = s.type ?? 'MANUAL';
                            return {
                title: s.title,
                weight: s.weight,
                type,
                questions: (s.questions ?? []).map((q: any) => ({
                    text: q.text ?? q.title ?? '',
                    type: String(q.type ?? 'SCALE').toUpperCase(),
                    weight: q.weight != null && q.weight !== '' ? Number(q.weight) : undefined,
                })),
            };
        });
        form.setFieldsValue({
            name: initialDesign.name,
            sections,
            gradeType,
            grades,
            targetDist,
        });
    }, [open, initialDesign, form]);

    return (
        <AppDoubleActionModal
            title={isEditMode ? '평가 설계 수정' : L.designAdd}
            open={open}
            onClose={onClose}
            onConfirm={() => form.submit()}
            width={760}
            destroyOnHidden
            cancelText={L.cancel}
            confirmText={isEditMode ? '수정 저장' : L.save}
            confirmLoading={createMut.isPending || updateMut.isPending}
        >
            <Form
                form={form}
                layout="vertical"
                className="tw-px-5 tw-py-4"
                onFinish={(v) => {
                    if (v.gradeType === 'relative') {
                        const distErr = validateRelativeTargetDistributionPct(v.targetDist);
                        if (distErr) {
                            message.error(distErr);
                            return;
                        }
                    }
                    const sectionsRaw: DesignSectionDraft[] = (v.sections ?? [])
                        .map((s: any) => ({
                            title: String(s.title ?? '').trim(),
                            weight: Number(s.weight) || 0,
                            type: s.type || 'MANUAL',
                            questions: (s.questions ?? [])
                                .map((q: any) => ({
                                    text: String(q.text ?? '').trim(),
                                    type: String(q.type ?? 'SCALE').toUpperCase(),
                                    required: true,
                                    weight:
                                        q.weight != null && q.weight !== ''
                                            ? Number(q.weight)
                                            : undefined,
                                }))
                                .filter((q: any) => q.text),
                        }))
                        .filter((s: any) => s.title);
                    const preErr = validateEvaluationDesignWeights(sectionsRaw);
                    if (preErr) {
                        message.error(preErr);
                        return;
                    }
                    const sections = assignDefaultQuestionWeights(sectionsRaw);
                    const postErr = validateEvaluationDesignWeights(sections);
                    if (postErr) {
                        message.error(postErr);
                        return;
                    }
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
                        if (Object.keys(dist).length) {
                            gradeConfig.targetDistribution = dist;
                        }
                    }
                    const payload = {
                        name: String(v.name ?? '').trim(),
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
                    <div>
                        <Typography.Text strong>섹션 구성</Typography.Text>
                        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-xs">
                            섹션 가중치 합계 100%. 각 섹션에서 scale/grade/gap 문항 가중치 합계 100%(비우면 채점 문항에만 균등 배분). 서술형(text)은 점수 미반영·가중치 0.
                        </Typography.Paragraph>
                    </div>
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
                                    sections: preset.sections.map((s) => {
                                        const type = s.type ?? 'MANUAL';
                                        return {
                                            title: s.title,
                                            weight: s.weight,
                                            type,
                                            questions: (s.questions ?? []).map((q) => ({
                                                text: q.text,
                                                type: q.type,
                                            })),
                                        };
                                    }),
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
                                                    'MANUAL' | 'PEER_FEEDBACK';
                                                const title = getFieldValue(['sections', name, 'title']) as string | undefined;
                                                const meta: Record<'MANUAL' | 'PEER_FEEDBACK', {label: string; color: string}> = {
                                                    MANUAL: {label: '수동', color: 'default'},
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
                                    {/* 섹션 타입 선택 */}
                                    <Row gutter={12}>
                                        <Col span={24} md={14}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'type']}
                                                label={
                                                    <span>
                                                        섹션 유형{' '}
                                                        <Tooltip title="수동: 문항 점수 / 동료: 다른 평가자 응답 평균">
                                                            <span className="tw-text-gray-400 tw-cursor-help">(?)</span>
                                                        </Tooltip>
                                                    </span>
                                                }
                                                initialValue="MANUAL"
                                            >
                                                <Select
                                                    options={[
                                                        {value: 'MANUAL', label: '수동 입력 (문항 응답 기반)'},
                                                        {value: 'PEER_FEEDBACK', label: '동료 피드백 집계'},
                                                    ]}
                                                />
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
                                                        <Col flex="88px">
                                                            <Form.Item
                                                                name={[qf.name, 'weight']}
                                                                noStyle
                                                                tooltip="채점 문항만 합산. 비우면 해당 섹션 채점 문항에 균등 배분(합 100%)."
                                                            >
                                                                <Input
                                                                    type="number"
                                                                    min={0}
                                                                    max={100}
                                                                    placeholder="가중치"
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

            </Form>
        </AppDoubleActionModal>
    );
}
