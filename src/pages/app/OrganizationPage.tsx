import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Dropdown, Form, Input, InputNumber, Space, Table, Tabs, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState, type Key } from 'react';
import { type OrganizationTreeNode, organizationApi } from '@/features/organization/api/organizationApi';
import { OrganizationRolesSection } from '@/features/organization/ui/OrganizationRolesSection';
import { AppWorkspacePageTitle } from '@/shared/ui/AppWorkspacePageTitle';
import { AdminOrgRestructurePage } from '@/pages/app/organization/AdminOrgRestructurePage';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

type OrgSettingsTab = 'structure' | 'grades' | 'titles' | 'roles' | 'restructure';

const ORG_TAB_KEYS: readonly OrgSettingsTab[] = ['structure', 'grades', 'titles', 'roles', 'restructure'] as const;

function parseOrgTab(raw: unknown): OrgSettingsTab {
  if (typeof raw === 'string' && (ORG_TAB_KEYS as readonly string[]).includes(raw)) {
    return raw as OrgSettingsTab;
  }
  return 'structure';
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

function pickDisplayOrder(row: Record<string, unknown>): number | undefined {
  const raw = row.displayOrder ?? row.display_order;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

export function OrganizationPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: string };
  const activeTab = parseOrgTab(search.tab);
  const qc = useQueryClient();
  const [selectedOrgKeys, setSelectedOrgKeys] = useState<Key[]>([]);
  const [orgModal, setOrgModal] = useState<null | { mode: 'create'; parentId: string | null } | { mode: 'edit'; id: string; name: string }>(
    null,
  );
  const [gradeModal, setGradeModal] = useState<null | { mode: 'create' } | { mode: 'edit'; id: string; name: string }>(null);
  const [titleModal, setTitleModal] = useState<null | { mode: 'create' } | { mode: 'edit'; id: string; name: string }>(null);
  const [orgForm] = Form.useForm<{ name: string }>();
  const [gradeForm] = Form.useForm<{ name: string; displayOrder: number }>();
  const [titleForm] = Form.useForm<{ name: string; displayOrder: number }>();

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
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateGradeM = useMutation({
    mutationFn: ({ id, name, displayOrder }: { id: string; name: string; displayOrder: number }) =>
      organizationApi.updateJobGrade(id, { name, displayOrder }),
    onSuccess: () => {
      message.success('직급이 수정되었습니다.');
      setGradeModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'job-grades'] });
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteGradeM = useMutation({
    mutationFn: organizationApi.removeJobGrade,
    onSuccess: () => {
      message.success('직급이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['organization', 'job-grades'] });
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const createTitleM = useMutation({
    mutationFn: organizationApi.createJobTitle,
    onSuccess: () => {
      message.success('직책이 등록되었습니다.');
      setTitleModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'job-titles'] });
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateTitleM = useMutation({
    mutationFn: ({ id, name, displayOrder }: { id: string; name: string; displayOrder: number }) =>
      organizationApi.updateJobTitle(id, { name, displayOrder }),
    onSuccess: () => {
      message.success('직책이 수정되었습니다.');
      setTitleModal(null);
      void qc.invalidateQueries({ queryKey: ['organization', 'job-titles'] });
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteTitleM = useMutation({
    mutationFn: organizationApi.removeJobTitle,
    onSuccess: () => {
      message.success('직책이 삭제되었습니다.');
      void qc.invalidateQueries({ queryKey: ['organization', 'job-titles'] });
      void qc.invalidateQueries({ queryKey: ['organization', 'org-chart'] });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const openCreateChild = () => {
    if (!selectedOrgId) {
      message.warning('상위로 쓸 조직을 트리에서 선택해 주세요.');
      return;
    }
    orgForm.resetFields();
    setOrgModal({ mode: 'create', parentId: selectedOrgId });
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
      title: '직급순서',
      key: 'displayOrder',
      width: 100,
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = pickDisplayOrder(row);
        return o !== undefined ? String(o) : '—';
      },
      sorter: (a: Record<string, unknown>, b: Record<string, unknown>) =>
        (pickDisplayOrder(a) ?? 999_999) - (pickDisplayOrder(b) ?? 999_999),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_: unknown, row: Record<string, unknown>) => {
        const id = pickRowId(row, ['id', 'jobGradeId', 'job_grade_id']);
        const name = typeof row.name === 'string' ? row.name : '';
        return (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'edit',
                  label: '수정',
                  icon: <EditOutlined />,
                },
                {
                  key: 'delete',
                  label: '삭제',
                  icon: <DeleteOutlined />,
                  danger: true,
                },
              ],
              onClick: ({ key }) => {
                if (key === 'edit') {
                  gradeForm.setFieldsValue({
                    name,
                    displayOrder: pickDisplayOrder(row) ?? 0,
                  });
                  setGradeModal({ mode: 'edit', id, name });
                  return;
                }
                if (key === 'delete' && id) {
                  modal.confirm({
                    title: '이 직급을 삭제할까요?',
                    okText: '삭제',
                    okType: 'danger',
                    cancelText: '취소',
                    onOk: () => deleteGradeM.mutate(id),
                  });
                }
              },
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              className="!tw-px-1 tw-text-slate-600"
              aria-label="직급 관리 메뉴"
            />
          </Dropdown>
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
      title: '직책순서',
      key: 'displayOrder',
      width: 100,
      render: (_: unknown, row: Record<string, unknown>) => {
        const o = pickDisplayOrder(row);
        return o !== undefined ? String(o) : '—';
      },
      sorter: (a: Record<string, unknown>, b: Record<string, unknown>) =>
        (pickDisplayOrder(a) ?? 999_999) - (pickDisplayOrder(b) ?? 999_999),
    },
    {
      title: '',
      key: 'actions',
      width: 90,
      render: (_: unknown, row: Record<string, unknown>) => {
        const id = pickRowId(row, ['id', 'jobTitleId', 'job_title_id']);
        const name = typeof row.name === 'string' ? row.name : '';
        return (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'edit',
                  label: '수정',
                  icon: <EditOutlined />,
                },
                {
                  key: 'delete',
                  label: '삭제',
                  icon: <DeleteOutlined />,
                  danger: true,
                },
              ],
              onClick: ({ key }) => {
                if (key === 'edit') {
                  titleForm.setFieldsValue({
                    name,
                    displayOrder: pickDisplayOrder(row) ?? 0,
                  });
                  setTitleModal({ mode: 'edit', id, name });
                  return;
                }
                if (key === 'delete' && id) {
                  modal.confirm({
                    title: '이 직책을 삭제할까요?',
                    okText: '삭제',
                    okType: 'danger',
                    cancelText: '취소',
                    onOk: () => deleteTitleM.mutate(id),
                  });
                }
              },
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              className="!tw-px-1 tw-text-slate-600"
              aria-label="직책 관리 메뉴"
            />
          </Dropdown>
        );
      },
    },
  ];

  const perfCardClass =
    'tw-overflow-hidden tw-rounded-2xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)] [&_.ant-card-body]:tw-px-5 [&_.ant-card-body]:tw-pb-8 [&_.ant-card-body]:tw-pt-6 sm:[&_.ant-card-body]:tw-px-7';

  const sectionLabelClass = 'tw-text-xs tw-font-semibold tw-text-slate-500';

  const toolbarPrimaryBtn =
    '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-font-semibold !tw-shadow-none hover:!tw-bg-[#152a45] disabled:!tw-opacity-60';

  const toolbarSecondaryBtn =
    '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border !tw-border-slate-200 !tw-bg-white !tw-font-medium !tw-text-slate-700 hover:!tw-border-slate-300 hover:!tw-bg-slate-50';

  const toolbarDangerBtn =
    '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-rose-600 !tw-font-semibold hover:!tw-bg-rose-700';

  const addRowBtn =
    '!tw-h-9 !tw-min-h-9 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-px-4 !tw-text-sm !tw-font-semibold hover:!tw-bg-[#152a45]';

  return (
    <div className="tw-w-full">
      <div className="tw-mb-5">
        <AppWorkspacePageTitle
          className="!tw-mb-0"
          eyebrow="Organization"
          title="조직"
          subtitle="조직 구조·직급·직책·역할·권한을 탭에서 설정합니다. 조직도 조회는 왼쪽 메뉴의 조직도에서 열 수 있습니다."
        />
      </div>

      {/* `destroyOnHidden` 모달이 닫히면 내부 Form이 제거되어 useForm 인스턴스가 끊긴다. */}
      {orgModal === null ? <Form form={orgForm} preserve={false} className="tw-hidden" aria-hidden /> : null}
      {gradeModal === null ? <Form form={gradeForm} preserve={false} className="tw-hidden" aria-hidden /> : null}
      {titleModal === null ? <Form form={titleForm} preserve={false} className="tw-hidden" aria-hidden /> : null}

      <Card variant="borderless" className={perfCardClass}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) =>
            void navigate({
              to: '/app/organization',
              search: { tab: key as OrgSettingsTab },
              replace: true,
            })
          }
          className="[&_.ant-tabs-nav]:tw-mb-4 [&_.ant-tabs-tab]:!tw-text-slate-600 [&_.ant-tabs-tab-active_.ant-tabs-tab-btn]:!tw-font-semibold [&_.ant-tabs-tab-active_.ant-tabs-tab-btn]:!tw-text-[#1e3a5f] [&_.ant-tabs-ink-bar]:!tw-bg-[#1e3a5f]"
          items={[
            {
              key: 'structure',
              label: '조직 구조',
              children: (
                <div>
                  <Space wrap size={[8, 8]} className="tw-w-full">
                    <Button type="primary" onClick={openCreateChild} className={toolbarPrimaryBtn}>
                      하위 조직 추가
                    </Button>
                  </Space>
                  <div className="tw-mt-4 tw-min-h-[220px] tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-slate-50/40 tw-p-3">
                    {orgLoading ? (
                      <Typography.Text type="secondary" className="tw-text-sm">
                        불러오는 중…
                      </Typography.Text>
                    ) : treeData.length === 0 ? (
                      <Typography.Text type="secondary" className="tw-text-sm">
                        등록된 조직이 없습니다. 최상위 조직을 추가해 보세요.
                      </Typography.Text>
                    ) : (
                      <Tree
                        blockNode
                        checkable
                        checkStrictly
                        showLine={{ showLeafIcon: false }}
                        switcherIcon={({ expanded }) => (
                          <RightOutlined
                            className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform tw-duration-200 tw-ease-out ${expanded ? 'tw-rotate-90' : ''}`}
                          />
                        )}
                        className="tw-bg-transparent [&_.ant-tree-switcher]:tw-flex [&_.ant-tree-switcher]:tw-w-5 [&_.ant-tree-switcher]:tw-shrink-0 [&_.ant-tree-switcher]:tw-items-center [&_.ant-tree-switcher]:tw-justify-center [&_.ant-tree-switcher]:tw-bg-transparent [&_.ant-tree-node-content-wrapper]:tw-rounded-md"
                        treeData={treeData}
                        titleRender={(node) => {
                          const id = String(node.key);
                          const name = typeof node.title === 'string' ? node.title : String(node.title ?? '');
                          return (
                            <Dropdown
                              trigger={['click']}
                              menu={{
                                items: [
                                  { key: 'edit', label: '수정', icon: <EditOutlined /> },
                                  { key: 'delete', label: '삭제', icon: <DeleteOutlined />, danger: true },
                                ],
                                onClick: ({ key, domEvent }) => {
                                  domEvent.stopPropagation();
                                  setSelectedOrgKeys([id]);
                                  if (key === 'edit') {
                                    orgForm.setFieldsValue({ name });
                                    setOrgModal({ mode: 'edit', id, name });
                                    return;
                                  }
                                  modal.confirm({
                                    title: '선택한 조직을 삭제할까요?',
                                    okText: '삭제',
                                    okType: 'danger',
                                    cancelText: '취소',
                                    onOk: () => deleteOrgM.mutate(id),
                                  });
                                },
                              }}
                            >
                              <span
                                role="button"
                                tabIndex={0}
                                className="tw-inline-block tw-cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }
                                }}
                              >
                                {name}
                              </span>
                            </Dropdown>
                          );
                        }}
                        checkedKeys={selectedOrgKeys}
                        onCheck={(checked) => {
                          const raw = Array.isArray(checked) ? checked : checked.checked;
                          const keys = raw.filter((k): k is Key => k != null);
                          const last = keys.at(-1);
                          setSelectedOrgKeys(last != null ? [last] : []);
                        }}
                        defaultExpandAll
                      />
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'grades',
              label: '직급',
              children: (
                <div>
                  <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2">
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => {
                        gradeForm.resetFields();
                        setGradeModal({ mode: 'create' });
                      }}
                      className={addRowBtn}
                    >
                      직급 추가
                    </Button>
                  </div>
                  <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200/90">
                    <Table
                      size="middle"
                      rowKey={(row) =>
                        pickRowId(row as Record<string, unknown>, ['id', 'jobGradeId', 'job_grade_id']) || JSON.stringify(row)
                      }
                      loading={gradesLoading}
                      columns={gradeColumns}
                      dataSource={grades}
                      pagination={false}
                      locale={{ emptyText: '등록된 직급이 없습니다.' }}
                      className="[&_.ant-table-thead>tr>th]:!tw-bg-slate-50/90 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600"
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'titles',
              label: '직책',
              children: (
                <div>
                  <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2">
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => {
                        titleForm.resetFields();
                        setTitleModal({ mode: 'create' });
                      }}
                      className={addRowBtn}
                    >
                      직책 추가
                    </Button>
                  </div>
                  <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200/90">
                    <Table
                      size="middle"
                      rowKey={(row) =>
                        pickRowId(row as Record<string, unknown>, ['id', 'jobTitleId', 'job_title_id']) || JSON.stringify(row)
                      }
                      loading={titlesLoading}
                      columns={titleColumns}
                      dataSource={titles}
                      pagination={false}
                      locale={{ emptyText: '등록된 직책이 없습니다.' }}
                      className="[&_.ant-table-thead>tr>th]:!tw-bg-slate-50/90 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600"
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'roles',
              label: '역할·권한',
              children: <OrganizationRolesSection />,
            },
            {
              key: 'restructure',
              label: '조직 개편',
              children: <AdminOrgRestructurePage />,
            },
          ]}
        />
      </Card>

      <AppDoubleActionModal
        title={orgModal?.mode === 'create' ? (orgModal.parentId ? '하위 조직 추가' : '최상위 조직 추가') : '조직명 수정'}
        open={orgModal !== null}
        onClose={() => setOrgModal(null)}
        onConfirm={() => void submitOrgModal()}
        confirmLoading={createOrgM.isPending || updateOrgM.isPending}
        confirmText="저장"
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        <Form form={orgForm} layout="vertical" className="tw-mt-2">
          <Form.Item name="name" label="조직명" rules={[{ required: true, message: '조직명을 입력해 주세요.' }]}>
            <Input placeholder="예: 본사, 개발팀" />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>

      <AppDoubleActionModal
        title={gradeModal?.mode === 'create' ? '직급 추가' : '직급 수정'}
        open={gradeModal !== null}
        onClose={() => setGradeModal(null)}
        onConfirm={async () => {
          const v = await gradeForm.validateFields();
          if (!gradeModal) return;
          const displayOrder = typeof v.displayOrder === 'number' ? v.displayOrder : Number(v.displayOrder);
          if (gradeModal.mode === 'create') {
            createGradeM.mutate({ name: v.name.trim(), displayOrder });
          } else {
            updateGradeM.mutate({ id: gradeModal.id, name: v.name.trim(), displayOrder });
          }
        }}
        confirmLoading={createGradeM.isPending || updateGradeM.isPending}
        confirmText="저장"
        confirmButtonClassName={toolbarPrimaryBtn}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        <Form form={gradeForm} layout="vertical" className="tw-mt-2">
          <Form.Item name="name" label="직급명" rules={[{ required: true, message: '직급명을 입력해 주세요.' }]}>
            <Input placeholder="예: 대리, 과장" />
          </Form.Item>
          <Form.Item
            name="displayOrder"
            label="직급순서"
            rules={[
              { required: true, message: '직급순서를 입력해 주세요.' },
              { type: 'number', min: 0, message: '0 이상의 숫자를 입력해 주세요.' },
            ]}
          >
            <InputNumber min={0} step={1} className="tw-w-full" />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>

      <AppDoubleActionModal
        title={titleModal?.mode === 'create' ? '직책 추가' : '직책 수정'}
        open={titleModal !== null}
        onClose={() => setTitleModal(null)}
        onConfirm={async () => {
          const v = await titleForm.validateFields();
          if (!titleModal) return;
          const displayOrder = typeof v.displayOrder === 'number' ? v.displayOrder : Number(v.displayOrder);
          if (titleModal.mode === 'create') {
            createTitleM.mutate({ name: v.name.trim(), displayOrder });
          } else {
            updateTitleM.mutate({ id: titleModal.id, name: v.name.trim(), displayOrder });
          }
        }}
        confirmLoading={createTitleM.isPending || updateTitleM.isPending}
        confirmText="저장"
        confirmButtonClassName={toolbarPrimaryBtn}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        <Form form={titleForm} layout="vertical" className="tw-mt-2">
          <Form.Item name="name" label="직책명" rules={[{ required: true, message: '직책명을 입력해 주세요.' }]}>
            <Input placeholder="예: 팀장, 담당" />
          </Form.Item>
          <Form.Item
            name="displayOrder"
            label="직책순서"
            rules={[
              { required: true, message: '직책순서를 입력해 주세요.' },
              { type: 'number', min: 0, message: '0 이상의 숫자를 입력해 주세요.' },
            ]}
          >
            <InputNumber min={0} step={1} className="tw-w-full" />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>
    </div>
  );
}
