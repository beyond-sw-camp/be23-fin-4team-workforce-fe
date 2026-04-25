import {useMutation, useQuery} from '@tanstack/react-query';
import {App, Avatar, Button, Checkbox, Form, Input, Select, Space, Spin, Tag, Tree, Typography} from 'antd';
import type {DataNode} from 'antd/es/tree';
import {RightOutlined, SearchOutlined, TeamOutlined} from '@ant-design/icons';
import {useEffect, useMemo, useState} from 'react';
import {EVALUATION_PAGE_KO as L} from '@/app/locale/app-ko';
import {evaluationApi} from '@/features/evaluation/api/evaluationApi';
import type {CreateGroupPayload, EvaluationDesign} from '@/features/evaluation/model/types';
import {AppButton} from '@/shared/ui/AppButton';
import {AppDoubleActionModal} from '@/shared/ui/AppDoubleActionModal';
import {MemberRemoteSelect} from '@/features/members/ui/MemberRemoteSelect';
import {
    ORG_CHART_HIDDEN_JOB_GRADE,
    type OrgChartOrgNode,
    organizationApi,
} from '@/features/organization/api/organizationApi';

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    seasonId: string;
    designs: EvaluationDesign[];
};

export function GroupCreateModal({open, onClose, onCreated, seasonId, designs}: Props) {
    const {message} = App.useApp();
    const [form] = Form.useForm();
    const [orgPickerOpen, setOrgPickerOpen] = useState(false);

    const createMut = useMutation({
        mutationFn: (body: CreateGroupPayload) => evaluationApi.createGroup(seasonId, body),
        onSuccess: () => {
            message.success(L.groupCreated);
            form.resetFields();
            onCreated();
            onClose();
        },
    });

    return (
        <AppDoubleActionModal
            title={L.groupAdd}
            open={open}
            onClose={onClose}
            onConfirm={() => form.submit()}
            width={560}
            destroyOnHidden
            cancelText={L.cancel}
            confirmText={L.save}
            confirmLoading={createMut.isPending}
        >
            <Form
                form={form}
                layout="vertical"
                className="tw-px-5 tw-py-4"
                onFinish={(v) =>
                    createMut.mutate({
                        name: v.name,
                        evaluationTypes: v.evaluationTypes ?? [],
                        targetMemberIds: v.targetMemberIds ?? [],
                        designId: v.designId,
                    })
                }
            >
                <Form.Item name="name" label={L.groupName} rules={[{required: true}]}>
                    <Input placeholder="예: 개발팀 2026 상반기" />
                </Form.Item>
                <Form.Item
                    name="evaluationTypes"
                    label={L.groupEvalTypes}
                    rules={[{required: true, message: '평가 유형을 1개 이상 선택해 주세요.'}]}
                >
                    <Checkbox.Group
                        options={[
                            {value: 'SELF', label: L.evalTypeSelf},
                            {value: 'DOWNWARD', label: L.evalTypeDownward},
                            {value: 'UPWARD', label: L.evalTypeUpward},
                            {value: 'PEER', label: L.evalTypePeer},
                        ]}
                    />
                </Form.Item>
                <Form.Item
                    name="targetMemberIds"
                    label={
                        <Space>
                            <span>평가 대상 인원</span>
                            <Form.Item
                                noStyle
                                shouldUpdate={(prev, cur) => prev.targetMemberIds !== cur.targetMemberIds}
                            >
                                {({getFieldValue}) => {
                                    const ids = getFieldValue('targetMemberIds') ?? [];
                                    return ids.length > 0 ? (
                                        <Tag color="blue">
                                            {ids.length}
                                            {L.groupPersonCount}
                                        </Tag>
                                    ) : null;
                                }}
                            </Form.Item>
                        </Space>
                    }
                    rules={[
                        {
                            validator: (_: unknown, v: string[]) =>
                                v?.length > 0 ? Promise.resolve() : Promise.reject('대상 인원을 1명 이상 선택해 주세요.'),
                        },
                    ]}
                >
                    <div className="tw-space-y-2">
                        <MemberRemoteSelect multiple placeholder="이름·이메일로 검색하여 추가" />
                        <div className="tw-flex tw-justify-end">
                            <AppButton
                                variant="secondary"
                                icon={<TeamOutlined/>}
                                className="!tw-h-9 !tw-rounded-full !tw-px-3 !tw-text-xs !tw-font-semibold"
                                onClick={() => setOrgPickerOpen(true)}
                            >
                                조직도에서 선택
                            </AppButton>
                        </div>
                    </div>
                </Form.Item>
                <Form.Item
                    name="designId"
                    label={L.groupDesign}
                    rules={[{required: true, message: '설계를 반드시 선택해 주세요.'}]}
                >
                    <Select
                        allowClear
                        placeholder={L.designSelect}
                        options={designs.map((d) => ({value: d.designId, label: d.name}))}
                    />
                </Form.Item>
            </Form>
            <OrgMemberPickerModal
                open={orgPickerOpen}
                onClose={() => setOrgPickerOpen(false)}
                initialSelectedIds={form.getFieldValue('targetMemberIds') ?? []}
                onApply={(ids) => {
                    const prev = form.getFieldValue('targetMemberIds') ?? [];
                    const merged = Array.from(new Set<string>([...prev, ...ids]));
                    form.setFieldValue('targetMemberIds', merged);
                    void form.validateFields(['targetMemberIds']);
                }}
            />
        </AppDoubleActionModal>
    );
}

const {Text} = Typography;
const KS = '\x1f';

function orgSubtreeMatchesQuery(node: OrgChartOrgNode, keyword: string): boolean {
    if (!keyword) return true;
    const q = keyword.toLowerCase();
    if (node.name.toLowerCase().includes(q)) return true;
    for (const m of node.members) {
        if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
        if (m.name.toLowerCase().includes(q) || m.jobGradeName.toLowerCase().includes(q)) return true;
    }
    return node.children.some((c) => orgSubtreeMatchesQuery(c, keyword));
}

function filterOrganizationsByKeyword(nodes: OrgChartOrgNode[], keyword: string): OrgChartOrgNode[] {
    if (!keyword.trim()) return nodes;
    return nodes
        .filter((n) => orgSubtreeMatchesQuery(n, keyword.trim()))
        .map((n) => ({
            ...n,
            children: filterOrganizationsByKeyword(n.children, keyword),
        }));
}

function collectMemberIdsFromOrg(org: OrgChartOrgNode): string[] {
    const out: string[] = [];
    const walk = (node: OrgChartOrgNode) => {
        for (const m of node.members) {
            if (m.jobGradeName.trim() === ORG_CHART_HIDDEN_JOB_GRADE) continue;
            if ((m.memberStatus ?? 'ACTIVE') === 'ACTIVE') out.push(m.memberId);
        }
        for (const c of node.children) walk(c);
    };
    walk(org);
    return out;
}

function collectMemberIdsFromRoots(orgs: OrgChartOrgNode[]): string[] {
    const ids: string[] = [];
    for (const org of orgs) ids.push(...collectMemberIdsFromOrg(org));
    return ids;
}

function collectOrgNodeKeys(orgs: OrgChartOrgNode[]): string[] {
    const keys: string[] = [];
    const walk = (node: OrgChartOrgNode) => {
        keys.push(`o${KS}${node.organizationId}`);
        for (const c of node.children) walk(c);
    };
    for (const org of orgs) walk(org);
    return keys;
}

type OrgMemberPickerModalProps = {
    open: boolean;
    onClose: () => void;
    initialSelectedIds: string[];
    onApply: (memberIds: string[]) => void;
};

function OrgMemberPickerModal({open, onClose, initialSelectedIds, onApply}: OrgMemberPickerModalProps) {
    const [keyword, setKeyword] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [expandedOrgKeys, setExpandedOrgKeys] = useState<string[]>([]);

    const {data, isLoading, isError} = useQuery({
        queryKey: ['organization', 'org-chart', 'group-create-member-picker'],
        queryFn: () => organizationApi.getOrgChart(),
        enabled: open,
        staleTime: 60_000,
    });

    const filteredRoots = useMemo(() => {
        if (!data?.organizations) return [];
        return filterOrganizationsByKeyword(data.organizations, keyword);
    }, [data?.organizations, keyword]);

    const allVisibleMemberIds = useMemo(() => collectMemberIdsFromRoots(filteredRoots), [filteredRoots]);
    const allVisibleOrgKeys = useMemo(() => collectOrgNodeKeys(filteredRoots), [filteredRoots]);

    useEffect(() => {
        if (!open) return;
        setKeyword('');
        setSelected(new Set(initialSelectedIds));
        // 조직도에서 대상 선택 시 항상 펼쳐진 상태로 시작/유지
        setExpandedOrgKeys(allVisibleOrgKeys);
    }, [open, allVisibleOrgKeys, initialSelectedIds]);

    const treeData: DataNode[] = useMemo(() => {
        if (!data) return [];

        const toggle = (id: string, checked: boolean) => {
            setSelected((prev) => {
                const next = new Set(prev);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
            });
        };

        const memberRow = (memberId: string, name: string, jobGradeName: string) => {
            const checked = selected.has(memberId);
            return (
                <div className="tw-flex tw-w-full tw-items-center tw-justify-between tw-gap-2 tw-rounded-md tw-pr-1 hover:tw-bg-slate-50">
                    <span className="tw-flex tw-min-w-0 tw-items-center tw-gap-2">
                        <Avatar size={26} className="tw-bg-slate-200 tw-text-xs tw-text-slate-700">
                            {(name || '?').slice(0, 1)}
                        </Avatar>
                        <span className="tw-truncate tw-text-sm tw-text-slate-800">
                            <span className="tw-font-medium">{name}</span>
                            <span className="tw-ml-1 tw-text-xs tw-text-slate-500">{jobGradeName}</span>
                        </span>
                    </span>
                    <Checkbox checked={checked} onChange={(e) => toggle(memberId, e.target.checked)} />
                </div>
            );
        };

        const buildOrgNodes = (orgs: OrgChartOrgNode[]): DataNode[] =>
            orgs.map((org) => {
                const activeMembers = org.members.filter(
                    (m) => m.jobGradeName.trim() !== ORG_CHART_HIDDEN_JOB_GRADE && (m.memberStatus ?? 'ACTIVE') === 'ACTIVE',
                );
                const memberNodes: DataNode[] = activeMembers.map((m) => ({
                    key: `m${KS}${org.organizationId}${KS}${m.memberId}`,
                    title: memberRow(m.memberId, m.name, m.jobGradeName),
                    isLeaf: true,
                }));
                const childNodes = buildOrgNodes(org.children);
                const subtreeIds = collectMemberIdsFromOrg(org);
                const selectedInSubtree = subtreeIds.filter((id) => selected.has(id)).length;
                const allChecked = subtreeIds.length > 0 && selectedInSubtree === subtreeIds.length;
                const indeterminate = selectedInSubtree > 0 && selectedInSubtree < subtreeIds.length;
                const toggleOrg = (checked: boolean) => {
                    setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) {
                            for (const id of subtreeIds) next.add(id);
                        } else {
                            for (const id of subtreeIds) next.delete(id);
                        }
                        return next;
                    });
                };
                return {
                    key: `o${KS}${org.organizationId}`,
                    selectable: false,
                    title: (
                        <div className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-pr-1">
                            <span className="tw-text-sm tw-font-semibold tw-text-slate-800">
                                {org.name}
                                <span className="tw-ml-1 tw-font-normal tw-text-slate-400">{subtreeIds.length}</span>
                            </span>
                            <Checkbox
                                checked={allChecked}
                                indeterminate={indeterminate}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => toggleOrg(e.target.checked)}
                            />
                        </div>
                    ),
                    children: [...memberNodes, ...childNodes],
                };
            });

        return buildOrgNodes(filteredRoots);
    }, [data, filteredRoots, selected]);

    const selectedCount = selected.size;

    return (
        <AppDoubleActionModal
            open={open}
            onClose={onClose}
            width={760}
            title="조직도에서 평가 대상 선택"
            destroyOnHidden
            onConfirm={() => {
                onApply(Array.from(selected));
                onClose();
            }}
            confirmText="선택 적용"
            confirmDisabled={selectedCount === 0}
        >
            <div className="tw-space-y-3 tw-px-5 tw-py-4">
                <Input
                    allowClear
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="이름, 직급, 부서명으로 검색"
                    prefix={<SearchOutlined className="tw-text-slate-400" />}
                />
                <div className="tw-flex tw-items-center tw-justify-between tw-px-1">
                    <span className="tw-text-sm tw-font-semibold tw-text-[#1e3a5f]">{data?.companyName ?? '회사'}</span>
                    <Space size={8}>
                        <Text type="secondary" className="tw-text-xs">
                            선택 {selectedCount}명
                        </Text>
                        <Button
                            onClick={() => setSelected(new Set(allVisibleMemberIds))}
                            disabled={allVisibleMemberIds.length === 0}
                        >
                            전체 선택
                        </Button>
                        <Button onClick={() => setSelected(new Set())} disabled={selectedCount === 0}>
                            전체 해제
                        </Button>
                    </Space>
                </div>
                <Spin spinning={isLoading}>
                    {isError ? (
                        <Text type="danger">조직도를 불러오지 못했습니다.</Text>
                    ) : (
                        <div className="tw-max-h-[52vh] tw-overflow-auto tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-2">
                            <Tree
                                blockNode
                                expandedKeys={expandedOrgKeys}
                                autoExpandParent
                                onExpand={(keys) => setExpandedOrgKeys(keys.map(String))}
                                selectable={false}
                                showLine={{showLeafIcon: false}}
                                treeData={treeData}
                                switcherIcon={({expanded}) => (
                                    <RightOutlined
                                        className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform ${expanded ? 'tw-rotate-90' : ''}`}
                                    />
                                )}
                            />
                        </div>
                    )}
                </Spin>
            </div>
        </AppDoubleActionModal>
    );
}
