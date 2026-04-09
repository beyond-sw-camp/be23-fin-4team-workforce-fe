import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { App, Button, Card, Checkbox, Collapse, Form, Input, Modal, Popconfirm, Space, Spin, Table, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMemo, useState, type Key } from 'react';
import {
  type OrgChartData,
  type OrgChartOrgNode,
  type OrganizationTreeNode,
  organizationApi,
} from '@/features/organization/api/organizationApi';
import { AppButton } from '@/shared/ui/AppButton';

function collectOrgChartNodeIds(nodes: OrgChartOrgNode[]): string[] {
  const out: string[] = [];
  const walk = (n: OrgChartOrgNode) => {
    out.push(n.organizationId);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/** 조직 ID + 직급명으로 직급 블록 접기 상태 키 (직급명에 구분자가 있어도 안전) */
function orgChartGradeKey(organizationId: string, jobGradeName: string): string {
  return `${organizationId}\x1f${jobGradeName}`;
}

function collectOrgChartGradeKeys(nodes: OrgChartOrgNode[]): string[] {
  const out: string[] = [];
  const walk = (n: OrgChartOrgNode) => {
    n.jobGrades.forEach((g) => {
      out.push(orgChartGradeKey(n.organizationId, g.jobGradeName));
    });
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function filterOrgChartByActiveMembers(node: OrgChartOrgNode): OrgChartOrgNode {
  const jobGrades = node.jobGrades
    .map((g) => ({
      ...g,
      members: g.members.filter((m) => !m.memberStatus || m.memberStatus === 'ACTIVE'),
    }))
    .filter((g) => g.members.length > 0);
  return {
    ...node,
    jobGrades,
    children: node.children.map((c) => filterOrgChartByActiveMembers(c)),
  };
}

function OrgChartOrgBlock({
  node,
  depth = 0,
  collapsedIds,
  onToggle,
  foldedGradeKeys,
  onToggleGrade,
}: {
  node: OrgChartOrgNode;
  depth?: number;
  collapsedIds: Set<string>;
  onToggle: (organizationId: string) => void;
  foldedGradeKeys: Set<string>;
  onToggleGrade: (gradeKey: string) => void;
}) {
  const hasChildOrgs = node.children.length > 0;
  const hasGradeRows = node.jobGrades.length > 0;
  const canFold = hasGradeRows || hasChildOrgs;
  const folded = collapsedIds.has(node.organizationId);

  return (
    <li className="tw-list-none">
      <div
        className={
          depth > 0
            ? 'tw-rounded-lg tw-border tw-border-slate-200 tw-border-l-[3px] tw-border-l-blue-400 tw-bg-white tw-p-3 tw-shadow-sm'
            : 'tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-3 tw-shadow-sm'
        }
      >
        <div className="tw-flex tw-items-start tw-gap-1">
          {canFold ? (
            <Button
              type="text"
              size="small"
              className="!tw-mt-0.5 !tw-h-6 !tw-min-w-6 !tw-shrink-0 !tw-p-0"
              aria-expanded={!folded}
              aria-label={folded ? '펼치기' : '접기'}
              icon={folded ? <RightOutlined className="tw-text-xs" /> : <DownOutlined className="tw-text-xs" />}
              onClick={() => onToggle(node.organizationId)}
            />
          ) : (
            <span className="tw-inline-block tw-w-6 tw-shrink-0" aria-hidden />
          )}
          <div className="tw-min-w-0 tw-flex-1">
            <div className="tw-text-sm tw-font-semibold tw-text-slate-900">{node.name}</div>

            {!folded && (
              <>
                {!hasGradeRows ? (
                  <Typography.Text type="secondary" className="tw-mt-1 tw-block tw-text-xs">
                    (직원 없음)
                  </Typography.Text>
                ) : (
                  <div className="tw-mt-2 tw-space-y-3">
                    {node.jobGrades.map((g) => {
                      const gKey = orgChartGradeKey(node.organizationId, g.jobGradeName);
                      const gradeFolded = foldedGradeKeys.has(gKey);
                      return (
                        <div key={gKey}>
                          <div className="tw-flex tw-items-start tw-gap-0.5">
                            <Button
                              type="text"
                              size="small"
                              className="!tw-mt-0 !tw-h-5 !tw-min-w-5 !tw-shrink-0 !tw-p-0"
                              aria-expanded={!gradeFolded}
                              aria-label={gradeFolded ? '직급 펼치기' : '직급 접기'}
                              icon={
                                gradeFolded ? (
                                  <RightOutlined className="tw-text-[10px]" />
                                ) : (
                                  <DownOutlined className="tw-text-[10px]" />
                                )
                              }
                              onClick={() => onToggleGrade(gKey)}
                            />
                            <div className="tw-min-w-0 tw-flex-1">
                              <div className="tw-mb-1 tw-text-xs tw-font-medium tw-text-slate-600">[{g.jobGradeName}]</div>
                              {!gradeFolded &&
                                (g.members.length === 0 ? (
                                  <Typography.Text type="secondary" className="tw-text-xs">
                                    (해당 직급 인원 없음)
                                  </Typography.Text>
                                ) : (
                                  <ul className="tw-m-0 tw-list-none tw-space-y-1 tw-pl-0">
                                    {g.members.map((m) => (
                                      <li key={m.memberId} className="tw-text-sm">
                                        <Link
                                          to="/app/members/$memberId"
                                          params={{ memberId: m.memberId }}
                                          className="tw-font-medium tw-text-blue-700 hover:tw-underline"
                                        >
                                          {m.name}
                                        </Link>
                                        <span className="tw-text-[13px] tw-text-slate-600"> ({m.jobTitleName})</span>
                                      </li>
                                    ))}
                                  </ul>
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {hasChildOrgs && (
                  <ul className="tw-m-0 tw-mt-3 tw-list-none tw-space-y-3 tw-border-t tw-border-slate-100 tw-bg-slate-50/60 tw-p-3">
                    {node.children.map((child) => (
                      <OrgChartOrgBlock
                        key={child.organizationId}
                        node={child}
                        depth={depth + 1}
                        collapsedIds={collapsedIds}
                        onToggle={onToggle}
                        foldedGradeKeys={foldedGradeKeys}
                        onToggleGrade={onToggleGrade}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function OrgChartPanel({
  data,
  loading,
  fetchError,
  activeOnly,
  onActiveOnlyChange,
  onRefresh,
}: {
  data: OrgChartData | undefined;
  loading: boolean;
  fetchError: boolean;
  activeOnly: boolean;
  onActiveOnlyChange: (v: boolean) => void;
  onRefresh: () => void;
}) {
  const [orgFoldedIds, setOrgFoldedIds] = useState<Set<string>>(() => new Set());
  const [foldedGradeKeys, setFoldedGradeKeys] = useState<Set<string>>(() => new Set());

  const display = useMemo(() => {
    if (!data) return null;
    if (!activeOnly) return data;
    return {
      ...data,
      organizations: data.organizations.map((n) => filterOrgChartByActiveMembers(n)),
    };
  }, [data, activeOnly]);

  const allOrgIds = useMemo(
    () => (display ? collectOrgChartNodeIds(display.organizations) : []),
    [display],
  );

  const allGradeKeys = useMemo(
    () => (display ? collectOrgChartGradeKeys(display.organizations) : []),
    [display],
  );

  const toggleOrgFold = (organizationId: string) => {
    setOrgFoldedIds((prev) => {
      const next = new Set(prev);
      if (next.has(organizationId)) next.delete(organizationId);
      else next.add(organizationId);
      return next;
    });
  };

  const expandAllOrgs = () => setOrgFoldedIds(new Set());
  const collapseAllOrgs = () => setOrgFoldedIds(new Set(allOrgIds));

  const toggleGradeFold = (gradeKey: string) => {
    setFoldedGradeKeys((prev) => {
      const next = new Set(prev);
      if (next.has(gradeKey)) next.delete(gradeKey);
      else next.add(gradeKey);
      return next;
    });
  };

  const expandAllGrades = () => setFoldedGradeKeys(new Set());
  const collapseAllGrades = () => setFoldedGradeKeys(new Set(allGradeKeys));

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" className="tw-w-full" size={12}>
        <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
          <Typography.Text type="secondary" className="tw-text-xs">
            직급은 서버 <code className="tw-rounded tw-bg-slate-100 tw-px-1">displayOrder</code> 순입니다. 퇴직·삭제 인원은
            응답에 포함되지 않습니다.
          </Typography.Text>
          <Space size="small" wrap>
            <Checkbox checked={activeOnly} onChange={(e) => onActiveOnlyChange(e.target.checked)}>
              재직(ACTIVE)만 표시
            </Checkbox>
            <AppButton size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
              새로고침
            </AppButton>
          </Space>
        </div>

        {fetchError && !loading ? (
          <Typography.Text type="danger">조직도를 불러오지 못했습니다.</Typography.Text>
        ) : !display ? (
          <Typography.Text type="secondary">{loading ? '' : '조직도 데이터가 없습니다.'}</Typography.Text>
        ) : (
          <Collapse
            bordered={false}
            defaultActiveKey={['org-tree']}
            className="tw-rounded-lg tw-bg-slate-50/50 [&_.ant-collapse-content-box]:tw-pt-2"
            items={[
              {
                key: 'org-tree',
                label: (
                  <span className="tw-text-sm tw-font-medium tw-text-slate-800">
                    회사·조직 트리{' '}
                    {(allOrgIds.length > 0 || allGradeKeys.length > 0) && (
                      <Typography.Text type="secondary" className="tw-text-xs tw-font-normal">
                        (조직 {allOrgIds.length}·직급 블록 {allGradeKeys.length})
                      </Typography.Text>
                    )}
                  </span>
                ),
                extra: (
                  <div className="tw-flex tw-max-w-[min(100%,420px)] tw-flex-wrap tw-items-center tw-justify-end tw-gap-x-3 tw-gap-y-1" onClick={(e) => e.stopPropagation()}>
                    <Space size={4} wrap className="tw-text-xs">
                      <span className="tw-text-slate-500">조직</span>
                      <Button type="link" size="small" className="tw-h-auto tw-p-0" onClick={expandAllOrgs}>
                        펼치기
                      </Button>
                      <span className="tw-text-slate-300">|</span>
                      <Button type="link" size="small" className="tw-h-auto tw-p-0" onClick={collapseAllOrgs} disabled={allOrgIds.length === 0}>
                        접기
                      </Button>
                    </Space>
                    <Space size={4} wrap className="tw-text-xs">
                      <span className="tw-text-slate-500">직급</span>
                      <Button type="link" size="small" className="tw-h-auto tw-p-0" onClick={expandAllGrades}>
                        펼치기
                      </Button>
                      <span className="tw-text-slate-300">|</span>
                      <Button type="link" size="small" className="tw-h-auto tw-p-0" onClick={collapseAllGrades} disabled={allGradeKeys.length === 0}>
                        접기
                      </Button>
                    </Space>
                  </div>
                ),
                children: (
                  <div className="tw-space-y-4">
                    <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/80 tw-px-4 tw-py-3">
                      <Typography.Text strong className="tw-text-base tw-text-slate-900">
                        {display.companyName}
                      </Typography.Text>
                    </div>
                    {display.organizations.length === 0 ? (
                      <Typography.Text type="secondary">등록된 최상위 조직이 없습니다.</Typography.Text>
                    ) : (
                      <ul className="tw-m-0 tw-list-none tw-space-y-4 tw-pl-0">
                        {display.organizations.map((org) => (
                          <OrgChartOrgBlock
                            key={org.organizationId}
                            node={org}
                            depth={0}
                            collapsedIds={orgFoldedIds}
                            onToggle={toggleOrgFold}
                            foldedGradeKeys={foldedGradeKeys}
                            onToggleGrade={toggleGradeFold}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Space>
    </Spin>
  );
}

function pickOrgId(node: OrganizationTreeNode): string {
  const raw =
    node.id ?? node.organizationId ?? node.organization_id ?? node.uuid ?? node.organizationUuid ?? node.organization_uuid;
  if (typeof raw === 'string' && raw) return raw;
  if (typeof raw === 'number') return String(raw);
  return '';
}

function pickOrgName(node: OrganizationTreeNode): string {
  return typeof node.name === 'string' ? node.name : '';
}

function pickParentId(node: OrganizationTreeNode): string | null {
  const p = node.parentId ?? node.parent_id;
  if (p === null || p === undefined || p === '') return null;
  return typeof p === 'string' ? p : String(p);
}

function toTreeNodes(nodes: OrganizationTreeNode[]): DataNode[] {
  if (!nodes.length) return [];
  const nested = nodes.some((n) => Array.isArray(n.children) && (n.children as unknown[]).length > 0);
  if (nested) {
    const mapOne = (n: OrganizationTreeNode, index: number): DataNode => {
      const id = pickOrgId(n);
      const ch = n.children as OrganizationTreeNode[] | undefined;
      return {
        key: id || `org-nested-${index}`,
        title: pickOrgName(n) || '(이름 없음)',
        children: Array.isArray(ch) ? ch.map((c, i) => mapOne(c, i)) : undefined,
      };
    };
    return nodes.map((n, i) => mapOne(n, i));
  }

  const byId = new Map<string, DataNode & { parentId: string | null }>();
  nodes.forEach((n) => {
    const id = pickOrgId(n);
    if (!id) return;
    byId.set(id, {
      key: id,
      title: pickOrgName(n) || '(이름 없음)',
      children: [],
      parentId: pickParentId(n),
    });
  });
  const roots: DataNode[] = [];
  byId.forEach((node, id) => {
    const p = node.parentId;
    if (p && byId.has(p)) {
      const parent = byId.get(p)!;
      if (!parent.children) parent.children = [];
      (parent.children as DataNode[]).push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function pickRowId(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return '';
}

export function OrganizationPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [orgChartActiveOnly, setOrgChartActiveOnly] = useState(false);
  const [selectedOrgKeys, setSelectedOrgKeys] = useState<Key[]>([]);
  const [orgModal, setOrgModal] = useState<null | { mode: 'create'; parentId: string | null } | { mode: 'edit'; id: string; name: string }>(
    null,
  );
  const [gradeModal, setGradeModal] = useState<null | { mode: 'create' } | { mode: 'edit'; id: string; name: string }>(null);
  const [titleModal, setTitleModal] = useState<null | { mode: 'create' } | { mode: 'edit'; id: string; name: string }>(null);
  const [orgForm] = Form.useForm<{ name: string }>();
  const [gradeForm] = Form.useForm<{ name: string }>();
  const [titleForm] = Form.useForm<{ name: string }>();

  const {
    data: orgChart,
    isLoading: orgChartLoading,
    isError: orgChartError,
    refetch: refetchOrgChart,
  } = useQuery({
    queryKey: ['organization', 'org-chart'],
    queryFn: () => organizationApi.getOrgChart(),
    staleTime: 60_000,
  });

  const { data: orgList = [], isFetching: orgLoading, refetch: refetchOrgList } = useQuery({
    queryKey: ['organization', 'list'],
    queryFn: () => organizationApi.list(),
    staleTime: 0,
  });

  const { data: grades = [], isFetching: gradesLoading } = useQuery({
    queryKey: ['organization', 'job-grades'],
    queryFn: () => organizationApi.listJobGrades(),
  });

  const { data: titles = [], isFetching: titlesLoading } = useQuery({
    queryKey: ['organization', 'job-titles'],
    queryFn: () => organizationApi.listJobTitles(),
  });

  const treeData = useMemo(() => toTreeNodes(orgList), [orgList]);
  const selectedOrgId = selectedOrgKeys[0] != null ? String(selectedOrgKeys[0]) : '';

  const createOrgM = useMutation({
    mutationFn: organizationApi.create,
    onSuccess: async () => {
      message.success('조직이 등록되었습니다.');
      setOrgModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
      await refetchOrgList();
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateOrgM = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => organizationApi.update(id, { name }),
    onSuccess: async () => {
      message.success('조직명이 수정되었습니다.');
      setOrgModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
      await refetchOrgList();
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteOrgM = useMutation({
    mutationFn: organizationApi.remove,
    onSuccess: async () => {
      message.success('조직이 삭제되었습니다.');
      setSelectedOrgKeys([]);
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
      await refetchOrgList();
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const createGradeM = useMutation({
    mutationFn: organizationApi.createJobGrade,
    onSuccess: () => {
      message.success('직급이 등록되었습니다.');
      setGradeModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'job-grades'] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateGradeM = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => organizationApi.updateJobGrade(id, { name }),
    onSuccess: () => {
      message.success('직급이 수정되었습니다.');
      setGradeModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'job-grades'] });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteGradeM = useMutation({
    mutationFn: organizationApi.removeJobGrade,
    onSuccess: () => {
      message.success('직급이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['organization', 'job-grades'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const createTitleM = useMutation({
    mutationFn: organizationApi.createJobTitle,
    onSuccess: () => {
      message.success('직책이 등록되었습니다.');
      setTitleModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'job-titles'] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateTitleM = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => organizationApi.updateJobTitle(id, { name }),
    onSuccess: () => {
      message.success('직책이 수정되었습니다.');
      setTitleModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'job-titles'] });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteTitleM = useMutation({
    mutationFn: organizationApi.removeJobTitle,
    onSuccess: () => {
      message.success('직책이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['organization', 'job-titles'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const openCreateRoot = () => {
    orgForm.resetFields();
    setOrgModal({ mode: 'create', parentId: null });
  };

  const openCreateChild = () => {
    if (!selectedOrgId) {
      message.warning('상위로 쓸 조직을 트리에서 선택해 주세요.');
      return;
    }
    orgForm.resetFields();
    setOrgModal({ mode: 'create', parentId: selectedOrgId });
  };

  const openEditOrg = () => {
    if (!selectedOrgId) {
      message.warning('수정할 조직을 선택해 주세요.');
      return;
    }
    const node = orgList.find((n) => pickOrgId(n) === selectedOrgId);
    const name = node ? pickOrgName(node) : '';
    orgForm.setFieldsValue({ name });
    setOrgModal({ mode: 'edit', id: selectedOrgId, name });
  };

  const submitOrgModal = async () => {
    const v = await orgForm.validateFields();
    if (!orgModal) return;
    if (orgModal.mode === 'create') {
      createOrgM.mutate({ name: v.name.trim(), parentId: orgModal.parentId });
    } else {
      updateOrgM.mutate({ id: orgModal.id, name: v.name.trim() });
    }
  };

  const gradeColumns = [
    {
      title: '직급명',
      dataIndex: 'name',
      key: 'name',
      render: (_: unknown, row: Record<string, unknown>) =>
        typeof row.name === 'string' ? row.name : String(row.name ?? ''),
    },
    {
      title: '관리',
      key: 'actions',
      width: 160,
      render: (_: unknown, row: Record<string, unknown>) => {
        const id = pickRowId(row, ['id', 'jobGradeId', 'job_grade_id']);
        const name = typeof row.name === 'string' ? row.name : '';
        return (
          <Space size="small">
            <AppButton
              type="text"
              variant="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                gradeForm.setFieldsValue({ name });
                setGradeModal({ mode: 'edit', id, name });
              }}
            >
              수정
            </AppButton>
            <Popconfirm title="이 직급을 삭제할까요?" onConfirm={() => id && deleteGradeM.mutate(id)}>
              <AppButton type="text" variant="text" size="small" danger icon={<DeleteOutlined />}>
                삭제
              </AppButton>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const titleColumns = [
    {
      title: '직책명',
      dataIndex: 'name',
      key: 'name',
      render: (_: unknown, row: Record<string, unknown>) =>
        typeof row.name === 'string' ? row.name : String(row.name ?? ''),
    },
    {
      title: '관리',
      key: 'actions',
      width: 160,
      render: (_: unknown, row: Record<string, unknown>) => {
        const id = pickRowId(row, ['id', 'jobTitleId', 'job_title_id']);
        const name = typeof row.name === 'string' ? row.name : '';
        return (
          <Space size="small">
            <AppButton
              type="text"
              variant="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                titleForm.setFieldsValue({ name });
                setTitleModal({ mode: 'edit', id, name });
              }}
            >
              수정
            </AppButton>
            <Popconfirm title="이 직책을 삭제할까요?" onConfirm={() => id && deleteTitleM.mutate(id)}>
              <AppButton type="text" variant="text" size="small" danger icon={<DeleteOutlined />}>
                삭제
              </AppButton>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          조직
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          조직도를 관리하고, 직급·직책 마스터를 설정합니다.
        </Typography.Paragraph>
      </div>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="조직도 (조회)">
        <OrgChartPanel
          data={orgChart}
          loading={orgChartLoading}
          fetchError={orgChartError}
          activeOnly={orgChartActiveOnly}
          onActiveOnlyChange={setOrgChartActiveOnly}
          onRefresh={() => void refetchOrgChart()}
        />
      </Card>

      <Card className="tw-border-slate-200/80 tw-shadow-sm" title="조직 구조">
        <Space direction="vertical" className="tw-w-full" size={12}>
          <Space wrap className="tw-w-full">
            <AppButton icon={<PlusOutlined />} onClick={openCreateRoot}>
              최상위 조직 추가
            </AppButton>
            <AppButton variant="secondary" icon={<PlusOutlined />} onClick={openCreateChild}>
              하위 조직 추가
            </AppButton>
            <AppButton variant="secondary" icon={<EditOutlined />} onClick={openEditOrg}>
              이름 수정
            </AppButton>
            <Popconfirm
              title="선택한 조직을 삭제할까요?"
              disabled={!selectedOrgId}
              onConfirm={() => selectedOrgId && deleteOrgM.mutate(selectedOrgId)}
            >
              <AppButton variant="danger" icon={<DeleteOutlined />} disabled={!selectedOrgId}>
                삭제
              </AppButton>
            </Popconfirm>
          </Space>
          <div className="tw-min-h-[200px] tw-rounded-xl tw-border tw-border-slate-100 tw-bg-slate-50/50 tw-p-4">
            {orgLoading ? (
              <Typography.Text type="secondary">불러오는 중…</Typography.Text>
            ) : treeData.length === 0 ? (
              <Typography.Text type="secondary">등록된 조직이 없습니다. 최상위 조직을 추가해 보세요.</Typography.Text>
            ) : (
              <Tree
                className="tw-bg-transparent"
                treeData={treeData}
                selectedKeys={selectedOrgKeys}
                onSelect={(keys) => setSelectedOrgKeys(keys)}
                defaultExpandAll
              />
            )}
          </div>
        </Space>
      </Card>

      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        title="직급"
        extra={
          <AppButton size="small" icon={<PlusOutlined />} onClick={() => { gradeForm.resetFields(); setGradeModal({ mode: 'create' }); }}>
            직급 추가
          </AppButton>
        }
      >
        <Table
          size="small"
          rowKey={(row) => pickRowId(row as Record<string, unknown>, ['id', 'jobGradeId', 'job_grade_id']) || JSON.stringify(row)}
          loading={gradesLoading}
          columns={gradeColumns}
          dataSource={grades}
          pagination={false}
          locale={{ emptyText: '등록된 직급이 없습니다.' }}
        />
      </Card>

      <Card
        className="tw-border-slate-200/80 tw-shadow-sm"
        title="직책"
        extra={
          <AppButton size="small" icon={<PlusOutlined />} onClick={() => { titleForm.resetFields(); setTitleModal({ mode: 'create' }); }}>
            직책 추가
          </AppButton>
        }
      >
        <Table
          size="small"
          rowKey={(row) => pickRowId(row as Record<string, unknown>, ['id', 'jobTitleId', 'job_title_id']) || JSON.stringify(row)}
          loading={titlesLoading}
          columns={titleColumns}
          dataSource={titles}
          pagination={false}
          locale={{ emptyText: '등록된 직책이 없습니다.' }}
        />
      </Card>

      <Modal
        title={orgModal?.mode === 'create' ? (orgModal.parentId ? '하위 조직 추가' : '최상위 조직 추가') : '조직명 수정'}
        open={orgModal !== null}
        onCancel={() => setOrgModal(null)}
        onOk={() => void submitOrgModal()}
        confirmLoading={createOrgM.isPending || updateOrgM.isPending}
        okText="저장"
        destroyOnHidden
      >
        <Form form={orgForm} layout="vertical" className="tw-mt-2">
          <Form.Item name="name" label="조직명" rules={[{ required: true, message: '조직명을 입력해 주세요.' }]}>
            <Input placeholder="예: 본사, 개발팀" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={gradeModal?.mode === 'create' ? '직급 추가' : '직급 수정'}
        open={gradeModal !== null}
        onCancel={() => setGradeModal(null)}
        onOk={async () => {
          const v = await gradeForm.validateFields();
          if (!gradeModal) return;
          if (gradeModal.mode === 'create') {
            createGradeM.mutate({ name: v.name.trim() });
          } else {
            updateGradeM.mutate({ id: gradeModal.id, name: v.name.trim() });
          }
        }}
        confirmLoading={createGradeM.isPending || updateGradeM.isPending}
        okText="저장"
        destroyOnHidden
      >
        <Form form={gradeForm} layout="vertical" className="tw-mt-2">
          <Form.Item name="name" label="직급명" rules={[{ required: true, message: '직급명을 입력해 주세요.' }]}>
            <Input placeholder="예: 대리, 과장" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={titleModal?.mode === 'create' ? '직책 추가' : '직책 수정'}
        open={titleModal !== null}
        onCancel={() => setTitleModal(null)}
        onOk={async () => {
          const v = await titleForm.validateFields();
          if (!titleModal) return;
          if (titleModal.mode === 'create') {
            createTitleM.mutate({ name: v.name.trim() });
          } else {
            updateTitleM.mutate({ id: titleModal.id, name: v.name.trim() });
          }
        }}
        confirmLoading={createTitleM.isPending || updateTitleM.isPending}
        okText="저장"
        destroyOnHidden
      >
        <Form form={titleForm} layout="vertical" className="tw-mt-2">
          <Form.Item name="name" label="직책명" rules={[{ required: true, message: '직책명을 입력해 주세요.' }]}>
            <Input placeholder="예: 팀장, 담당" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
