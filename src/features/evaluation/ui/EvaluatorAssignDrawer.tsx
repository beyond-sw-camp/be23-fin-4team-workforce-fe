import {useEffect, useMemo, useRef, useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {App, Avatar, Button, Popconfirm, Select, Space, Tag, Tooltip, Typography} from 'antd';
import {
    EditOutlined,
    MinusCircleOutlined,
    PlusOutlined,
    ThunderboltOutlined,
    UserOutlined,
} from '@ant-design/icons';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {EvaluationGroup, EvaluatorMap, EvalType} from '@/features/evaluation/model/types';
import {evalTypeLabel} from '@/features/evaluation/lib/evaluationLabels';
import {parseApiError} from '@/shared/api/error-parser';
import {MemberRemoteSelect} from '@/features/members/ui/MemberRemoteSelect';
import {AppDoubleActionModal} from '@/shared/ui/AppDoubleActionModal';

const {Text} = Typography;

export type AssignDrawerState = {
    open: boolean;
    group: EvaluationGroup | null;
    initialTargetMemberId?: string | null;
};
type DraftMapping = { targetMemberId: string; evaluatorId: string; evaluationType: EvalType; _key: number };

type Props = {
    state: AssignDrawerState;
    onClose: () => void;
    seasonId: string;
    labelFor: (id: string) => string;
    evalTypes: EvalType[];
    onSaved: () => void;
};

/** 평가 유형별 기본 대상 설명. 셀프는 "본인" 으로 고정 */
function describeType(t: EvalType): string {
    switch (t) {
        case 'SELF': return '본인';
        case 'DOWNWARD': return '상급자';
        case 'UPWARD': return '하급자';
        case 'PEER': return '동료';
        default: return t;
    }
}

export function EvaluatorAssignDrawer({state, onClose, seasonId, labelFor, evalTypes, onSaved}: Props) {
    const {message} = App.useApp();
    const group = state.group;
    const [mappings, setMappings] = useState<DraftMapping[]>([]);
    const [showAllTargets, setShowAllTargets] = useState(false);
    const keyRef = useRef(0);

    useEffect(() => {
        if (!state.open) {
            setShowAllTargets(false);
        }
    }, [state.open]);

    const effectiveEvalTypes = useMemo<EvalType[]>(() => {
        // 그룹에 지정된 평가 유형만 사용. 없으면 4종 전부 허용
        if (evalTypes && evalTypes.length > 0) return evalTypes;
        return ['SELF', 'DOWNWARD', 'UPWARD', 'PEER'];
    }, [evalTypes]);
    const targetProfileById = useMemo(() => {
        const map = new Map<string, string>();
        for (const em of group?.evaluatorMaps ?? []) {
            if (em?.targetMemberId && em.targetMemberProfileUrl && !map.has(em.targetMemberId)) {
                map.set(em.targetMemberId, em.targetMemberProfileUrl);
            }
        }
        return map;
    }, [group?.evaluatorMaps]);

    /**
     * 드로어 오픈 시 드래프트 초기화.
     *  - 기존 evaluatorMaps 를 그대로 로드
     *  - SELF 유형이 그룹에 있고 target 중 누락된 경우 자동으로 (target→target, SELF) 로우 추가
     *  - 기타 유형은 비어있어도 새 로우를 미리 만들지 않음 (사용자가 "평가자 추가" 로 추가)
     */
    useEffect(() => {
        if (!group) return;
        keyRef.current = 0;
        const targets = group.targetMemberIds ?? [];
        const existing: DraftMapping[] = (group.evaluatorMaps ?? []).map((em) => ({
            targetMemberId: em.targetMemberId,
            evaluatorId: em.evaluatorId,
            evaluationType: em.evaluationType,
            _key: ++keyRef.current,
        }));

        const includesSelf = effectiveEvalTypes.includes('SELF');
        const selfSeen = new Set(existing.filter((e) => e.evaluationType === 'SELF').map((e) => e.targetMemberId));
        const autoSelfRows: DraftMapping[] = includesSelf
            ? targets.filter((t) => !selfSeen.has(t)).map((t) => ({
                targetMemberId: t,
                evaluatorId: t, // 본인
                evaluationType: 'SELF' as EvalType,
                _key: ++keyRef.current,
            }))
            : [];
        setMappings([...existing, ...autoSelfRows]);
    }, [group, effectiveEvalTypes]);

    const updateMapMut = useMutation({
        mutationFn: (maps: EvaluatorMap[]) =>
            evaluationApi.updateEvaluatorMaps(seasonId, group!.groupId, JSON.stringify(maps)),
        onSuccess: () => {
            message.success('평가자 지정이 저장되었습니다.');
            onSaved();
            onClose();
        },
        onError: (err) => message.error(parseApiError(err).message),
    });

    const autoAssignMut = useMutation({
        /** 백엔드 `EvaluatorMapAutoReqDto.basis` 명세: direct_leader | team_leader | job_grade */
        mutationFn: () => evaluationApi.autoAssignEvaluators(seasonId, group!.groupId, 'direct_leader'),
        onSuccess: (updatedGroup) => {
            keyRef.current = 0;
            const newMaps = (updatedGroup.evaluatorMaps ?? []).map((em) => ({
                targetMemberId: em.targetMemberId,
                evaluatorId: em.evaluatorId,
                evaluationType: em.evaluationType,
                _key: ++keyRef.current,
            }));
            setMappings(newMaps);
            const byType = new Map<string, number>();
            for (const m of newMaps) byType.set(m.evaluationType, (byType.get(m.evaluationType) ?? 0) + 1);
            const summary = [...byType.entries()]
                .map(([t, n]) => `${evalTypeLabel(t as EvalType)} ${n}건`)
                .join(' · ') || '자동 배정 가능한 후보가 없습니다';
            message.success(`조직/직급 기반 자동 배정 완료 — ${summary}. 필요시 수정 후 저장하세요.`);
            onSaved();
        },
        onError: (err) => message.error(parseApiError(err).message),
    });

    const handleSave = () => {
        // SELF 유효성: target == evaluator 인 행만 허용
        const invalidSelf = mappings.find(
            (m) => m.evaluationType === 'SELF' && m.evaluatorId && m.evaluatorId !== m.targetMemberId,
        );
        if (invalidSelf) {
            message.error('셀프 평가의 평가자는 본인이어야 합니다.');
            return;
        }
        const valid = mappings.filter((m) => m.targetMemberId && m.evaluatorId && m.evaluationType);
        updateMapMut.mutate(
            valid.map(({targetMemberId, evaluatorId, evaluationType}) => ({
                targetMemberId,
                evaluatorId,
                evaluationType,
            })),
        );
    };

    /** 사용자가 "평가자 추가" 클릭 시 추가할 기본 유형 결정.
     *  그룹의 SELF 를 제외한 유형 중, 현재 해당 대상자에 아직 없는 유형을 우선 선택.
     *  모든 유형이 이미 있다면 SELF 아닌 첫 번째 유형으로 fallback.
     */
    function pickDefaultType(targetId: string): EvalType {
        const existingTypes = new Set(
            mappings.filter((m) => m.targetMemberId === targetId).map((m) => m.evaluationType),
        );
        const nonSelf = effectiveEvalTypes.filter((t) => t !== 'SELF');
        const unused = nonSelf.find((t) => !existingTypes.has(t));
        if (unused) return unused;
        return nonSelf[0] ?? effectiveEvalTypes[0] ?? 'DOWNWARD';
    }

    const addRow = (targetMemberId: string) => {
        const type = pickDefaultType(targetMemberId);
        setMappings((prev) => [
            ...prev,
            {
                targetMemberId,
                evaluatorId: type === 'SELF' ? targetMemberId : '',
                evaluationType: type,
                _key: ++keyRef.current,
            },
        ]);
    };

    const removeRow = (key: number) => {
        setMappings((prev) => prev.filter((m) => m._key !== key));
    };

    const updateRow = (key: number, patch: Partial<DraftMapping>) => {
        setMappings((prev) =>
            prev.map((m) => {
                if (m._key !== key) return m;
                const next = {...m, ...patch};
                // 유형을 SELF 로 바꾸면 evaluator 를 자동으로 target 으로 고정
                if (patch.evaluationType === 'SELF') {
                    next.evaluatorId = m.targetMemberId;
                }
                // 유형이 SELF 에서 다른 걸로 변경되면 evaluator 초기화 (잘못 남지 않게)
                if (patch.evaluationType && patch.evaluationType !== 'SELF' && m.evaluationType === 'SELF') {
                    next.evaluatorId = '';
                }
                return next;
            }),
        );
    };

    if (!group) return null;
    const targets = group.targetMemberIds ?? [];
    const focusedTargetId = String(state.initialTargetMemberId ?? '').trim();
    const isFocusedMode = focusedTargetId.length > 0 && !showAllTargets;
    const visibleTargets = focusedTargetId
        ? (showAllTargets ? targets : targets.filter((t) => t === focusedTargetId))
        : targets;
    const focusLabel = focusedTargetId ? labelFor(focusedTargetId) : '';

    return (
        <AppDoubleActionModal
            title={
                <Space>
                    <EditOutlined />
                    <span>평가자 지정 — {group.name}</span>
                </Space>
            }
            open={state.open}
            onClose={onClose}
            width={880}
            destroyOnHidden
            onConfirm={handleSave}
            confirmText="저장"
            confirmLoading={updateMapMut.isPending}
        >
            <div className="tw-px-5 tw-py-4">
            {isFocusedMode ? (
                <div className="tw-mb-3 tw-flex tw-items-center tw-gap-2">
                    <Tag color="blue" className="!tw-m-0 !tw-rounded-full">
                        대상자 기준 열기: {focusLabel}
                    </Tag>
                    <Button
                        size="small"
                        className="!tw-rounded-[50px]"
                        onClick={() => setShowAllTargets(true)}
                    >
                        전체 보기로 다시 열기
                    </Button>
                </div>
            ) : null}
            <Text type="secondary" className="tw-text-xs">
                그룹 유형: {effectiveEvalTypes.map((t) => evalTypeLabel(t)).join(' · ')}
            </Text>
            {/* 안내 배너 + 자동 지정 (전체 지정 모드에서만 노출) */}
            {!isFocusedMode ? (
            <div className="tw-mb-4 tw-flex tw-items-center tw-justify-between tw-gap-3 tw-rounded-2xl tw-bg-indigo-50 tw-px-4 tw-py-3">
                <div>
                    <Text strong className="tw-text-slate-900">
                        대상 인원 {targets.length}명
                    </Text>
                    <div className="tw-text-xs tw-text-slate-600">
                        셀프 평가는 본인으로 자동 배정됩니다. 나머지 유형은 수동 또는 "자동 지정" 으로 채워주세요.
                    </div>
                </div>
                <Tooltip title="조직 + 직급(JobGrade) 기반으로 평가자를 자동 배정합니다. 기존 매핑은 덮어씁니다.">
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
                            className="\!tw-border-[#6366F1] \!tw-text-[#6366F1] hover:\!tw-bg-white/60"
                        >
                            자동 지정
                        </Button>
                    </Popconfirm>
                </Tooltip>
            </div>
            ) : null}

            <div className="tw-space-y-4">
                {visibleTargets.length === 0 && (
                    <div className="tw-rounded-2xl tw-border tw-border-dashed tw-border-slate-200 tw-py-10 tw-text-center tw-text-sm tw-text-slate-400">
                        대상 인원이 없습니다. 그룹에 대상 인원을 먼저 추가해 주세요.
                    </div>
                )}
                {visibleTargets.map((tid) => {
                    const rows = mappings.filter((m) => m.targetMemberId === tid);
                    const targetName = labelFor(tid);
                    const initial = targetName.trim().charAt(0);
                    return (
                        <div key={tid} className="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-p-4">
                            <div className="tw-mb-3 tw-flex tw-items-center tw-gap-3">
                                <Avatar
                                    size={36}
                                    src={targetProfileById.get(tid)}
                                    style={{backgroundColor: '#E6F0FF', color: '#1e3a5f', fontWeight: 600}}
                                >
                                    {initial}
                                </Avatar>
                                <div className="tw-flex-1">
                                    <div className="tw-text-sm tw-font-semibold tw-text-slate-900">{targetName}</div>
                                    <div className="tw-text-xs tw-text-slate-500">배정된 평가자 {rows.length}건</div>
                                </div>
                                <Tag color="blue" className="\!tw-rounded-full \!tw-px-2.5">{rows.length}건</Tag>
                            </div>

                            <div className="tw-space-y-2">
                                {rows.map((row) => {
                                    const isSelf = row.evaluationType === 'SELF';
                                    return (
                                        <div key={row._key} className="tw-flex tw-items-center tw-gap-2">
                                            <Select
                                                value={row.evaluationType}
                                                onChange={(v) => updateRow(row._key, {evaluationType: v as EvalType})}
                                                options={effectiveEvalTypes.map((t) => ({
                                                    value: t,
                                                    label: `${evalTypeLabel(t)} · ${describeType(t)}`,
                                                }))}
                                                className="\!tw-w-40"
                                            />
                                            {isSelf ? (
                                                <div className="tw-flex tw-h-9 tw-flex-1 tw-items-center tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50 tw-px-3">
                                                    <UserOutlined className="tw-text-slate-400"/>
                                                    <Text className="tw-text-sm tw-text-slate-700">본인 ({targetName})</Text>
                                                    <Text type="secondary" className="tw-ml-auto tw-text-xs">자동 배정</Text>
                                                </div>
                                            ) : (
                                                <div className="tw-flex-1">
                                                    <MemberRemoteSelect
                                                        value={row.evaluatorId || undefined}
                                                        onChange={(v) => updateRow(row._key, {evaluatorId: v as string})}
                                                        placeholder={`${describeType(row.evaluationType)} 검색`}
                                                        excludeMemberIds={[tid]}
                                                    />
                                                </div>
                                            )}
                                            <Button
                                                type="text"
                                                danger
                                                icon={<MinusCircleOutlined/>}
                                                onClick={() => removeRow(row._key)}
                                                disabled={isSelf}
                                                title={isSelf ? '셀프 평가는 삭제할 수 없습니다.' : '삭제'}
                                            />
                                        </div>
                                    );
                                })}
                                <Button
                                    type="dashed"
                                    size="small"
                                    block
                                    icon={<PlusOutlined/>}
                                    onClick={() => addRow(tid)}
                                    className="\!tw-mt-2"
                                >
                                    평가자 추가
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
            </div>
        </AppDoubleActionModal>
    );
}
