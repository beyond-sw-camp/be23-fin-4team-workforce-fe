import {useMutation, useQuery} from '@tanstack/react-query';
import {useEffect} from 'react';
import {
    App,
    Button,
    Card,
    Col,
    Dropdown,
    Form,
    Input,
    Radio,
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
import {useAuth} from '@/features/auth/useAuth';
import {goalApi} from '@/features/goals/api/goalApi';
import type {KpiTemplate} from '@/features/goals/model/types';
import {AppDoubleActionModal} from '@/shared/ui/AppDoubleActionModal';

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    initialDesign?: EvaluationDesign | null;
};

/** 서버 `kpiFilter` ↔ 폼 친화 필드 (라벨은 UI 전용) */
type KpiTargetScope = 'ALL' | 'TEMPLATE_ONLY' | 'CUSTOM';

function kpiFilterToFormParts(
    sectionType: string | undefined,
    kpiFilter?: string | null,
): { kpiTargetScope?: KpiTargetScope; kpiTemplateId?: string } {
    if (sectionType !== 'KPI_SCORE') return {};
    const f = String(kpiFilter ?? 'ALL').trim();
    if (f === '' || f.toUpperCase() === 'ALL') return { kpiTargetScope: 'ALL', kpiTemplateId: '' };
    if (f.toUpperCase() === 'TEMPLATE_ONLY') return { kpiTargetScope: 'TEMPLATE_ONLY', kpiTemplateId: '' };
    return { kpiTargetScope: 'CUSTOM', kpiTemplateId: f };
}

function formPartsToKpiFilter(
    sectionType: string,
    scope?: KpiTargetScope,
    templateId?: string,
): string | undefined {
    if (sectionType !== 'KPI_SCORE') return undefined;
    const s = scope ?? 'ALL';
    const tid = String(templateId ?? '').trim();
    if (s === 'CUSTOM' && tid) return tid;
    if (s === 'TEMPLATE_ONLY') return 'TEMPLATE_ONLY';
    return 'ALL';
}

function kpiTemplateSelectOptions(
    templates: KpiTemplate[] | undefined,
    selectedId?: string | null,
): { value: string; label: string }[] {
    const list = templates ?? [];
    const base = list
        .filter((t) => t.isActive !== false)
        .map((t) => ({ value: t.id, label: t.name }));
    const tid = String(selectedId ?? '').trim();
    if (tid && !base.some((o) => o.value === tid)) {
        return [
            {
                value: tid,
                label: `${tid.slice(0, 8)}… (목록에 없거나 비활성 템플릿)`,
            },
            ...base,
        ];
    }
    return base;
}

export function DesignCreateModal({open, onClose, onCreated, initialDesign = null}: Props) {
    const {message} = App.useApp();
    const { user } = useAuth();
    const companyId = user?.companyId?.trim();
    const [form] = Form.useForm();
    const isEditMode = !!initialDesign;

    const templatesQuery = useQuery({
        queryKey: ['goals', 'kpi-templates', companyId],
        queryFn: () => goalApi.listKpiTemplates(),
        enabled: open && Boolean(companyId),
    });

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
        const sections = (initialDesign.sections ?? []).map((s: any) => {
            const type = s.type ?? 'MANUAL';
            return {
                title: s.title,
                weight: s.weight,
                type,
                ...kpiFilterToFormParts(type, s.kpiFilter),
                questions: (s.questions ?? []).map((q: any) => ({
                    text: q.text ?? q.title ?? '',
                    type: String(q.type ?? 'SCALE').toUpperCase(),
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
                    for (const s of v.sections ?? []) {
                        if (
                            s.type === 'KPI_SCORE' &&
                            s.kpiTargetScope === 'CUSTOM' &&
                            !String(s.kpiTemplateId ?? '').trim()
                        ) {
                            message.warning(
                                '「특정 KPI 템플릿 하나만」을 쓰는 섹션에서는 목록에서 KPI 템플릿을 선택해 주세요.',
                            );
                            return;
                        }
                    }
                    const sections = (v.sections ?? []).map((s: any) => ({
                        title: s.title,
                        weight: Number(s.weight) || 0,
                        // [L-1] 섹션 타입 — 서버 enum 값(MANUAL/KPI_SCORE/PEER_FEEDBACK)으로 전송.
                        type: s.type || 'MANUAL',
                        kpiFilter: formPartsToKpiFilter(
                            s.type || 'MANUAL',
                            s.kpiTargetScope as KpiTargetScope | undefined,
                            s.kpiTemplateId,
                        ),
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
                                    sections: preset.sections.map((s) => {
                                        const type = s.type ?? 'MANUAL';
                                        return {
                                            title: s.title,
                                            weight: s.weight,
                                            type,
                                            ...kpiFilterToFormParts(type, s.kpiFilter?.trim() || 'ALL'),
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
                                        <Col span={24} md={14}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'type']}
                                                label={
                                                    <span>
                                                        섹션 유형{' '}
                                                        <Tooltip title="수동: 문항 점수 / KPI 달성률: 목표 스냅샷으로 자동 계산 / 동료: 다른 평가자 응답 평균">
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
                                    </Row>
                                    <Form.Item
                                        noStyle
                                        shouldUpdate={(prev, cur) =>
                                            prev?.sections?.[name]?.type !== cur?.sections?.[name]?.type
                                        }
                                    >
                                        {({getFieldValue}) => {
                                            if (getFieldValue(['sections', name, 'type']) !== 'KPI_SCORE') {
                                                return null;
                                            }
                                            return (
                                                <div className="tw-mb-3 tw-rounded-lg tw-border tw-border-slate-200/90 tw-bg-slate-50/90 tw-px-3 tw-py-3">
                                                    <Form.Item
                                                        {...restField}
                                                        name={[name, 'kpiTargetScope']}
                                                        label="어떤 목표를 이 섹션 점수에 넣을까요?"
                                                        initialValue="ALL"
                                                        className="!tw-mb-2"
                                                    >
                                                        <Radio.Group className="tw-flex tw-flex-col tw-gap-2">
                                                            <Radio value="ALL">
                                                                <span className="tw-font-medium">평가 대상 목표 전체</span>
                                                                <Typography.Text
                                                                    type="secondary"
                                                                    className="tw-ml-1 tw-text-xs tw-block tw-pl-6 tw-font-normal max-md:tw-pl-0"
                                                                >
                                                                    시즌에 캡처된 달성률을 목표별 가중치로 합산합니다.
                                                                </Typography.Text>
                                                            </Radio>
                                                            <Radio value="TEMPLATE_ONLY">
                                                                <span className="tw-font-medium">KPI 템플릿으로 만든 목표만</span>
                                                                <Typography.Text
                                                                    type="secondary"
                                                                    className="tw-ml-1 tw-text-xs tw-block tw-pl-6 tw-font-normal max-md:tw-pl-0"
                                                                >
                                                                    템플릿 없이 직접 만든 일회성 목표는 점수에서 뺍니다.
                                                                </Typography.Text>
                                                            </Radio>
                                                            <Radio value="CUSTOM">
                                                                <span className="tw-font-medium">특정 KPI 템플릿 하나만</span>
                                                                <Typography.Text
                                                                    type="secondary"
                                                                    className="tw-ml-1 tw-text-xs tw-block tw-pl-6 tw-font-normal max-md:tw-pl-0"
                                                                >
                                                                    여러 템플릿 중 하나만 반영할 때 사용합니다.
                                                                </Typography.Text>
                                                            </Radio>
                                                        </Radio.Group>
                                                    </Form.Item>
                                                    <Form.Item
                                                        noStyle
                                                        shouldUpdate={(prev, cur) =>
                                                            prev?.sections?.[name]?.kpiTargetScope !==
                                                            cur?.sections?.[name]?.kpiTargetScope
                                                        }
                                                    >
                                                        {({getFieldValue: gf2}) =>
                                                            gf2(['sections', name, 'kpiTargetScope']) === 'CUSTOM' ? (
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'kpiTemplateId']}
                                                                    label="KPI 템플릿"
                                                                    extra="성과 메뉴에 등록된 템플릿 중 하나를 선택합니다. 목표는 해당 템플릿으로 생성된 것만 점수에 반영됩니다."
                                                                >
                                                                    {!companyId ? (
                                                                        <Typography.Text type="warning" className="tw-text-sm">
                                                                            회사 정보를 확인할 수 없어 템플릿 목록을 불러올 수 없습니다.
                                                                        </Typography.Text>
                                                                    ) : (
                                                                        <Select
                                                                            showSearch
                                                                            optionFilterProp="label"
                                                                            placeholder="KPI 템플릿을 선택하세요"
                                                                            loading={templatesQuery.isPending}
                                                                            allowClear
                                                                            className="tw-w-full"
                                                                            options={kpiTemplateSelectOptions(
                                                                                templatesQuery.data,
                                                                                gf2(['sections', name, 'kpiTemplateId']),
                                                                            )}
                                                                            notFoundContent={
                                                                                templatesQuery.isError
                                                                                    ? '목록을 불러오지 못했습니다.'
                                                                                    : '등록된 KPI 템플릿이 없습니다. 성과 메뉴에서 템플릿을 먼저 만드세요.'
                                                                            }
                                                                        />
                                                                    )}
                                                                </Form.Item>
                                                            ) : null
                                                        }
                                                    </Form.Item>
                                                    <Typography.Text type="secondary" className="tw-text-xs">
                                                        ※ 점수에 쓰이는 달성률은 평가 시즌 시작 시점에 한 번 저장된 값입니다. 그 이후 목표를
                                                        많이 바꿔도 이 섹션 점수는 자동으로 따라가지 않습니다.
                                                    </Typography.Text>
                                                </div>
                                            );
                                        }}
                                    </Form.Item>
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

            </Form>
        </AppDoubleActionModal>
    );
}
