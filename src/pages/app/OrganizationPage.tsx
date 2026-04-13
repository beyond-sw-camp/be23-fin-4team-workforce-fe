import { DeleteOutlined, EditOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Divider, Form, Input, Modal, Popconfirm, Space, Table, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMemo, useState, type Key } from 'react';
import { type OrganizationTreeNode, organizationApi } from '@/features/organization/api/organizationApi';
import { AppButton } from '@/shared/ui/AppButton';

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
  const [selectedOrgKeys, setSelectedOrgKeys] = useState<Key[]>([]);
  const [orgModal, setOrgModal] = useState<null | { mode: 'create'; parentId: string | null } | { mode: 'edit'; id: string; name: string }>(
    null,
  );
  const [gradeModal, setGradeModal] = useState<null | { mode: 'create' } | { mode: 'edit'; id: string; name: string }>(null);
  const [titleModal, setTitleModal] = useState<null | { mode: 'create' } | { mode: 'edit'; id: string; name: string }>(null);
  const [orgForm] = Form.useForm<{ name: string }>();
  const [gradeForm] = Form.useForm<{ name: string }>();
  const [titleForm] = Form.useForm<{ name: string }>();

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
        <Typography.Title
          level={4}
          className="!tw-mb-1.5 !tw-text-xl !tw-font-semibold !tw-tracking-tight !tw-text-[#1e3a5f] sm:!tw-text-2xl"
        >
          조직
        </Typography.Title>
        <Typography.Paragraph className="!tw-mb-0 !tw-max-w-3xl !tw-text-sm !tw-leading-relaxed !tw-text-slate-600">
          조직 구조와 직급·직책 마스터를 설정합니다. 조직도 조회는 왼쪽 메뉴의 조직도에서 열 수 있습니다.
        </Typography.Paragraph>
      </div>

      <Card variant="borderless" className={perfCardClass}>
        <Space direction="vertical" className="tw-w-full" size={0}>
          <div>
            <div className={`${sectionLabelClass} tw-mb-3`}>조직 구조</div>
            <Space wrap size={[8, 8]} className="tw-w-full">
              <AppButton icon={<PlusOutlined />} onClick={openCreateRoot} className={toolbarPrimaryBtn}>
                최상위 조직 추가
              </AppButton>
              <AppButton variant="secondary" icon={<PlusOutlined />} onClick={openCreateChild} className={toolbarSecondaryBtn}>
                하위 조직 추가
              </AppButton>
              <AppButton variant="secondary" icon={<EditOutlined />} onClick={openEditOrg} className={toolbarSecondaryBtn}>
                이름 수정
              </AppButton>
              <Popconfirm
                title="선택한 조직을 삭제할까요?"
                disabled={!selectedOrgId}
                onConfirm={() => selectedOrgId && deleteOrgM.mutate(selectedOrgId)}
              >
                <AppButton variant="danger" icon={<DeleteOutlined />} disabled={!selectedOrgId} className={toolbarDangerBtn}>
                  삭제
                </AppButton>
              </Popconfirm>
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
                  showLine={{ showLeafIcon: false }}
                  switcherIcon={({ expanded }) => (
                    <RightOutlined
                      className={`tw-text-[11px] tw-text-slate-400 tw-transition-transform tw-duration-200 tw-ease-out ${expanded ? 'tw-rotate-90' : ''}`}
                    />
                  )}
                  className="tw-bg-transparent [&_.ant-tree-switcher]:tw-flex [&_.ant-tree-switcher]:tw-w-5 [&_.ant-tree-switcher]:tw-shrink-0 [&_.ant-tree-switcher]:tw-items-center [&_.ant-tree-switcher]:tw-justify-center [&_.ant-tree-switcher]:tw-bg-transparent [&_.ant-tree-node-content-wrapper]:tw-rounded-md"
                  treeData={treeData}
                  selectedKeys={selectedOrgKeys}
                  onSelect={(keys) => setSelectedOrgKeys(keys)}
                  defaultExpandAll
                />
              )}
            </div>
          </div>

          <Divider className="!tw-my-8 !tw-border-slate-100" />

          <div>
            <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
              <span className={sectionLabelClass}>직급</span>
              <AppButton
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  gradeForm.resetFields();
                  setGradeModal({ mode: 'create' });
                }}
                className={addRowBtn}
              >
                직급 추가
              </AppButton>
            </div>
            <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200/90">
              <Table
                size="middle"
                rowKey={(row) => pickRowId(row as Record<string, unknown>, ['id', 'jobGradeId', 'job_grade_id']) || JSON.stringify(row)}
                loading={gradesLoading}
                columns={gradeColumns}
                dataSource={grades}
                pagination={false}
                locale={{ emptyText: '등록된 직급이 없습니다.' }}
                className="[&_.ant-table-thead>tr>th]:!tw-bg-slate-50/90 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600"
              />
            </div>
          </div>

          <Divider className="!tw-my-8 !tw-border-slate-100" />

          <div>
            <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
              <span className={sectionLabelClass}>직책</span>
              <AppButton
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  titleForm.resetFields();
                  setTitleModal({ mode: 'create' });
                }}
                className={addRowBtn}
              >
                직책 추가
              </AppButton>
            </div>
            <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200/90">
              <Table
                size="middle"
                rowKey={(row) => pickRowId(row as Record<string, unknown>, ['id', 'jobTitleId', 'job_title_id']) || JSON.stringify(row)}
                loading={titlesLoading}
                columns={titleColumns}
                dataSource={titles}
                pagination={false}
                locale={{ emptyText: '등록된 직책이 없습니다.' }}
                className="[&_.ant-table-thead>tr>th]:!tw-bg-slate-50/90 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600"
              />
            </div>
          </div>
        </Space>
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
    </div>
  );
}
