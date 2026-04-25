import {useMemo, useState} from 'react';
import {Avatar, Button, Empty, Space, Tooltip, Typography} from 'antd';
import {
    EditOutlined,
    FileTextOutlined,
    PlusOutlined,
    TeamOutlined,
    UserAddOutlined,
} from '@ant-design/icons';
import type {EvalType, EvaluationDesign, EvaluationGroup, EvaluatorMap} from '@/features/evaluation/model/types';
import {evalTypeLabel} from '@/features/evaluation/lib/evaluationLabels';
import {useMemberDisplayNames} from '@/features/members/hooks/useMemberDisplayNames';
import {AppExpandToggleButton} from '@/shared/ui/AppExpandToggleButton';
import {
    EvaluatorAssignDrawer,
    type AssignDrawerState,
} from '@/features/evaluation/ui/EvaluatorAssignDrawer';
import {GroupCreateModal} from '@/features/evaluation/ui/GroupCreateModal';

const {Text} = Typography;

type Props = {
    groups: EvaluationGroup[];
    designs: EvaluationDesign[];
    selectedSeasonId: string;
    seasonStatus?: 'DRAFT' | 'ACTIVE' | 'CLOSED';
    onAddGroup: () => void;
    onInvalidate: () => void;
};

export function GroupsSection({groups, designs, selectedSeasonId, seasonStatus, onAddGroup, onInvalidate}: Props) {
    const [assignDrawer, setAssignDrawer] = useState<AssignDrawerState>({
        open: false,
        group: null,
        initialTargetMemberId: null,
    });
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(groups.map((g) => g.groupId)));
    const [editGroup, setEditGroup] = useState<EvaluationGroup | null>(null);

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

    const toggle = (groupId: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    return (
        <>
            {/* 섹션 헤더 */}
            <div className="tw-mb-4 tw-flex tw-items-center tw-justify-end">
                <Button
                    type="primary"
                    icon={<PlusOutlined/>}
                    onClick={onAddGroup}
                    className="!tw-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-5 !tw-font-semibold !tw-text-white hover:!tw-bg-[#152a45]"
                >
                    새 그룹 추가
                </Button>
            </div>

            {/* 그룹 카드 목록 */}
            {groups.length === 0 ? (
                <div className="tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-py-16">
                    <Empty description="등록된 그룹이 없습니다. 그룹을 추가해 주세요."/>
                </div>
            ) : (
                <Space direction="vertical" size={12} className="tw-w-full">
                    {groups.map((g) => (
                        <GroupCard
                            key={g.groupId}
                            group={g}
                            designName={g.designId ? designMap.get(g.designId) : undefined}
                            expanded={expandedIds.has(g.groupId)}
                            onToggle={() => toggle(g.groupId)}
                            onAssign={() => setAssignDrawer({open: true, group: g, initialTargetMemberId: null})}
                            onEdit={() => setEditGroup(g)}
                            canEdit={seasonStatus === 'DRAFT'}
                            onAssignTarget={(targetId) =>
                                setAssignDrawer({
                                    open: true,
                                    group: g,
                                    initialTargetMemberId: targetId,
                                })
                            }
                            labelFor={labelFor}
                        />
                    ))}
                </Space>
            )}

            <EvaluatorAssignDrawer
                state={assignDrawer}
                onClose={() => setAssignDrawer({open: false, group: null, initialTargetMemberId: null})}
                seasonId={selectedSeasonId}
                labelFor={labelFor}
                evalTypes={assignDrawer.group?.evaluationTypes ?? ['SELF', 'DOWNWARD', 'UPWARD', 'PEER']}
                onSaved={onInvalidate}
            />
            <GroupCreateModal
                open={!!editGroup}
                onClose={() => setEditGroup(null)}
                onCreated={onInvalidate}
                seasonId={selectedSeasonId}
                designs={designs}
                editGroup={editGroup}
            />
        </>
    );
}

// ── 내부 컴포넌트 ────────────────────────────────────────────

type GroupCardProps = {
    group: EvaluationGroup;
    designName?: string;
    expanded: boolean;
    onToggle: () => void;
    onAssign: () => void;
    onEdit: () => void;
    canEdit: boolean;
    onAssignTarget: (targetId: string) => void;
    labelFor: (id: string) => string;
};

function GroupCard({group, designName, expanded, onToggle, onAssign, onEdit, canEdit, onAssignTarget, labelFor}: GroupCardProps) {
    const maps = group.evaluatorMaps ?? [];
    const derivedTargets = Array.from(
        new Set((maps ?? []).map((m) => m.targetMemberId).filter((v): v is string => !!v)),
    );
    const targets = derivedTargets.length > 0 ? derivedTargets : (group.targetMemberIds ?? []);

    // evaluatorMaps 기반으로 실제 평가 유형을 우선 계산한다.
    const derivedTypes = Array.from(
        new Set((maps ?? []).map((m) => m.evaluationType).filter((v): v is EvalType => !!v)),
    );
    const types = derivedTypes.length > 0 ? derivedTypes : (group.evaluationTypes ?? []);
    const typesExcludingSelf = types.filter((t) => t !== 'SELF');
    const expectedPerTarget = typesExcludingSelf.length;
    const totalExpected = targets.length * expectedPerTarget;
    const totalAssigned = maps.filter((m) => m.evaluationType !== 'SELF').length;

    let statusLabel = '-';
    let statusTextClass = 'tw-text-slate-500';
    let statusDotClass = 'tw-bg-slate-400';
    if (totalExpected === 0) {
        // SELF만 있는 경우는 "미설정"이 아니라, 추가 지정이 필요 없는 정상 상태로 본다.
        statusLabel = types.includes('SELF') ? '셀프만 운영' : '유형 미설정';
    } else if (totalAssigned === 0) {
        statusLabel = `0/${totalExpected} 미지정`;
        statusTextClass = 'tw-text-rose-600';
        statusDotClass = 'tw-bg-rose-500';
    } else if (totalAssigned >= totalExpected) {
        statusLabel = `${totalAssigned}/${totalExpected} 지정완료`;
        statusTextClass = 'tw-text-emerald-600';
        statusDotClass = 'tw-bg-emerald-500';
    } else {
        statusLabel = `${totalAssigned}/${totalExpected} 지정중`;
        statusTextClass = 'tw-text-amber-600';
        statusDotClass = 'tw-bg-amber-500';
    }

    const typesText = types.length > 0 ? types.map((t) => evalTypeLabel(t)).join(' + ') : '-';
    const idPreview = group.groupId.slice(0, 8).toUpperCase();

    return (
        <div className="tw-overflow-hidden tw-rounded-2xl tw-border tw-border-slate-200/60 tw-bg-white tw-shadow-sm tw-shadow-slate-900/5">
            {/* 헤더 */}
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-4 tw-px-5 tw-py-4">
                <AppExpandToggleButton expanded={expanded} onToggle={onToggle} />
                <div className="tw-min-w-0 tw-flex-1">
                    <div className="tw-truncate tw-text-[17px] tw-font-bold tw-text-slate-900">
                        {group.name}
                    </div>
                    <div className="tw-truncate tw-text-xs tw-text-slate-500">
                        ID: {idPreview}
                    </div>
                </div>

                <HeaderStat
                    label="대상 인원"
                    icon={<TeamOutlined/>}
                    value={`${targets.length}명`}
                />
                <HeaderStat label="평가 유형" icon={<FileTextOutlined/>} value={typesText} />
                <HeaderStat
                    label="평가자 현황"
                    dotClass={statusDotClass}
                    value={<span className={`tw-font-semibold ${statusTextClass}`}>{statusLabel}</span>}
                />
                <div className="tw-flex tw-items-center tw-gap-2">
                    <Tooltip title={canEdit ? undefined : '시즌 시작 이후에는 그룹을 수정할 수 없습니다.'}>
                        <Button
                            icon={<EditOutlined/>}
                            onClick={onEdit}
                            disabled={!canEdit}
                            className="!tw-h-10 !tw-rounded-xl !tw-border-slate-200 !tw-px-4 !tw-text-sm !tw-font-medium !tw-text-slate-700 hover:!tw-border-slate-300 disabled:!tw-border-slate-200 disabled:!tw-text-slate-400"
                        >
                            그룹 수정
                        </Button>
                    </Tooltip>
                    <Button
                        icon={<UserAddOutlined/>}
                        onClick={onAssign}
                        className="!tw-h-10 !tw-rounded-xl !tw-border-slate-200 !tw-px-4 !tw-text-sm !tw-font-medium !tw-text-slate-700 hover:!tw-border-slate-300"
                    >
                        전체 평가자 지정
                    </Button>
                </div>
            </div>

            {/* 확장 본문 */}
            {expanded && targets.length > 0 && (
                <div className="tw-border-t tw-border-slate-100 tw-px-5 tw-py-4">
                    <div className="tw-grid tw-grid-cols-[minmax(180px,_220px)_1fr] tw-gap-4 tw-px-2 tw-pb-2 tw-text-[11px] tw-font-medium tw-uppercase tw-tracking-wider tw-text-slate-500">
                        <span>대상자</span>
                        <span>지정된 평가자</span>
                    </div>
                    <div className="tw-space-y-2">
                        {targets.map((tid) => (
                            <TargetRow
                                key={tid}
                                targetId={tid}
                                evaluators={maps.filter((m) => m.targetMemberId === tid)}
                                labelFor={labelFor}
                                onAdd={() => onAssignTarget(tid)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* 그룹 설계 정보 (작게) */}
            {expanded && (
                <div className="tw-border-t tw-border-slate-100 tw-bg-slate-50/50 tw-px-5 tw-py-2 tw-text-xs tw-text-slate-500 tw-flex tw-flex-wrap tw-gap-x-4 tw-gap-y-1">
                    {designName ? (
                        <span>
                            설계: <span className="tw-font-medium tw-text-slate-700">{designName}</span>
                        </span>
                    ) : (
                        <span>설계: <span className="tw-font-medium tw-text-slate-700">미지정</span></span>
                    )}
                    <span>
                        매핑 기준 대상자: <span className="tw-font-medium tw-text-slate-700">{targets.length}명</span>
                    </span>
                    <span>
                        매핑 기준 유형: <span className="tw-font-medium tw-text-slate-700">{typesText}</span>
                    </span>
                </div>
            )}
        </div>
    );
}

// ── 대상자 행 ────────────────────────────────────────────

type TargetRowProps = {
    targetId: string;
    evaluators: EvaluatorMap[];
    labelFor: (id: string) => string;
    onAdd: () => void;
};

function TargetRow({targetId, evaluators, labelFor, onAdd}: TargetRowProps) {
    const name = labelFor(targetId);
    const initial = name.trim().charAt(0);
    const targetProfileUrl = evaluators[0]?.targetMemberProfileUrl;

    return (
        <div className="tw-grid tw-grid-cols-[minmax(180px,_220px)_1fr] tw-items-center tw-gap-4 tw-rounded-xl tw-px-2 tw-py-2 hover:tw-bg-slate-50">
            <div className="tw-flex tw-min-w-0 tw-items-center tw-gap-3">
                <Avatar
                    size={36}
                    src={targetProfileUrl}
                    style={{backgroundColor: '#EEF2FF', color: '#6366F1', fontWeight: 600}}
                >
                    {initial}
                </Avatar>
                <div className="tw-min-w-0">
                    <div className="tw-truncate tw-text-sm tw-font-semibold tw-text-slate-900">{name}</div>
                </div>
            </div>

            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                {evaluators.length === 0 ? (
                    <span className="tw-text-sm tw-text-slate-400">지정된 평가자가 없습니다</span>
                ) : (
                    evaluators.map((em, idx) => (
                        <EvaluatorChip key={idx} evaluatorMap={em} labelFor={labelFor}/>
                    ))
                )}
                <button
                    type="button"
                    onClick={onAdd}
                    aria-label="평가자 추가"
                    className="tw-inline-flex tw-size-7 tw-items-center tw-justify-center tw-rounded-full tw-border tw-border-dashed tw-border-slate-300 tw-text-slate-400 tw-transition-colors hover:tw-border-slate-500 hover:tw-text-slate-700"
                >
                    <PlusOutlined/>
                </button>
            </div>
        </div>
    );
}

// ── 평가자 칩 ────────────────────────────────────────────

function evalTypeChipStyle(t: EvalType): {bg: string; text: string; accent: string} {
    switch (t) {
        case 'SELF':
            return {bg: '#F5F3FF', text: '#6D28D9', accent: '#8B5CF6'};
        case 'PEER':
            return {bg: '#EFF6FF', text: '#1D4ED8', accent: '#3B82F6'};
        case 'UPWARD':
            return {bg: '#ECFDF5', text: '#047857', accent: '#10B981'};
        case 'DOWNWARD':
            return {bg: '#FFF7ED', text: '#C2410C', accent: '#F97316'};
        default:
            return {bg: '#F1F5F9', text: '#475569', accent: '#94A3B8'};
    }
}

function EvaluatorChip({evaluatorMap, labelFor}: {evaluatorMap: EvaluatorMap; labelFor: (id: string) => string}) {
    const name = labelFor(evaluatorMap.evaluatorId);
    const initial = name.trim().charAt(0);
    const style = evalTypeChipStyle(evaluatorMap.evaluationType);

    return (
        <span
            className="tw-inline-flex tw-items-center tw-gap-1.5 tw-rounded-full tw-py-0.5 tw-pl-1 tw-pr-2 tw-text-sm"
            style={{background: style.bg, color: style.text}}
            title={`${evalTypeLabel(evaluatorMap.evaluationType)}: ${name}`}
        >
            <Avatar
                size={24}
                src={evaluatorMap.evaluatorProfileUrl}
                className="tw-text-xs tw-font-semibold tw-text-white"
                style={{backgroundColor: style.accent}}
            >
                {initial}
            </Avatar>
            <span className="tw-font-medium">{name}</span>
            <span className="tw-text-[10px] tw-font-semibold tw-uppercase tw-tracking-wide tw-opacity-70">
                {evalTypeLabel(evaluatorMap.evaluationType)}
            </span>
        </span>
    );
}

// ── 헤더 통계 셀 ────────────────────────────────────────────

function HeaderStat({
    label,
    value,
    icon,
    dotClass,
}: {
    label: string;
    value: React.ReactNode;
    icon?: React.ReactNode;
    dotClass?: string;
}) {
    return (
        <div className="tw-min-w-[110px]">
            <div className="tw-text-[11px] tw-font-medium tw-uppercase tw-tracking-wider tw-text-slate-500">
                {label}
            </div>
            <div className="tw-mt-0.5 tw-flex tw-items-center tw-gap-1.5 tw-text-sm tw-text-slate-900">
                {icon && <span className="tw-text-slate-400">{icon}</span>}
                {dotClass && <span className={`tw-size-2 tw-rounded-full ${dotClass}`} aria-hidden/>}
                {value}
            </div>
        </div>
    );
}