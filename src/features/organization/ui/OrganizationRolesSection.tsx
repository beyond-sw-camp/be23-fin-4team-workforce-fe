import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Checkbox, Dropdown, Form, Input, Modal, Radio, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useState } from 'react';
import {
  memberApi,
  type MemberRoleDetail,
  type MemberRoleListItem,
} from '@/features/member/api/memberApi';
import type {
  PermissionAction,
  PermissionRange,
  PermissionResource,
  RolePermissionItem,
} from '@/features/member/model/role-permission';
import {
  ROLE_ACTIONS,
  ROLE_PERMISSION_RANGES,
  ROLE_RESOURCES,
} from '@/features/member/model/role-permission';
import { PERM } from '@/features/permissions/backend-permissions';
import { PermissionGuard } from '@/features/permissions/permission-guard';
import { usePermissions } from '@/features/permissions/usePermissionsHook';

const RESOURCE_LABELS: Record<PermissionResource, string> = {
  MEMBER: '구성원',
  ORGANIZATION: '조직',
  SALARY: '급여',
  ATTENDANCE: '근태',
  APPROVAL: '결재',
  ROLE: '역할',
  GOAL: '목표',
  EVALUATION: '평가',
  ESG: 'ESG',
  CALENDAR: '캘린더',
};

const ACTION_LABELS: Record<PermissionAction, string> = {
  CREATE: '생성',
  READ: '조회',
  UPDATE: '수정',
  DELETE: '삭제',
};

const RANGE_LABELS: Record<PermissionRange, string> = {
  COMPANY: '전사',
  TEAM: '같은 조직',
  SELF: '본인만',
};

const ROLES_QUERY_KEY = ['member', 'roles', 'list'] as const;
const roleCtaButtonClass =
  '!tw-h-10 !tw-min-h-10 !tw-rounded-xl !tw-border-0 !tw-bg-[#1e3a5f] !tw-font-semibold !tw-shadow-none hover:!tw-bg-[#152a45] disabled:!tw-opacity-60';

type ModalMode = { type: 'create' } | { type: 'edit'; roleId: string };

type FormValues = {
  name: string;
  description: string;
  permissions: Array<{
    resource: PermissionResource;
    actions: PermissionAction[];
    /** 리소스당 범위 1개 (전사 / 같은 조직 / 본인만) */
    permissionRange?: PermissionRange;
  }>;
};

const defaultPermissionRows = (): FormValues['permissions'] =>
  ROLE_RESOURCES.map((resource) => ({
    resource,
    actions: [],
    permissionRange: undefined,
  }));

/** 기존 데이터에 리소스별로 범위가 여러 개면 ROLE_PERMISSION_RANGES 우선순위로 하나만 고름 */
function pickSinglePermissionRange(ranges: Set<PermissionRange>): PermissionRange | undefined {
  if (ranges.size === 0) return undefined;
  if (ranges.size === 1) return [...ranges][0];
  for (const r of ROLE_PERMISSION_RANGES) {
    if (ranges.has(r)) return r;
  }
  return [...ranges][0];
}

function toPermissionRows(items: RolePermissionItem[]): FormValues['permissions'] {
  const byResource = new Map<
    PermissionResource,
    { actions: Set<PermissionAction>; ranges: Set<PermissionRange> }
  >();
  ROLE_RESOURCES.forEach((resource) => {
    byResource.set(resource, { actions: new Set<PermissionAction>(), ranges: new Set<PermissionRange>() });
  });
  items.forEach((p) => {
    const slot = byResource.get(p.resource);
    if (!slot) return;
    slot.actions.add(p.action);
    slot.ranges.add(p.permissionRange);
  });
  return ROLE_RESOURCES.map((resource) => {
    const slot = byResource.get(resource);
    const ranges = slot ? slot.ranges : new Set<PermissionRange>();
    return {
      resource,
      actions: slot ? Array.from(slot.actions) : [],
      permissionRange: pickSinglePermissionRange(ranges),
    };
  });
}

/** 조직 설정 페이지의 「역할·권한」탭 본문 */
export function OrganizationRolesSection() {
  const { message, modal: appModal } = App.useApp();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();
  const [roleModal, setRoleModal] = useState<ModalMode | null>(null);
  const [form] = Form.useForm<FormValues>();

  const { data: roles = [], isFetching } = useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: () => memberApi.getRoles(),
  });

  const createM = useMutation({
    mutationFn: memberApi.createRole,
    onSuccess: async () => {
      message.success('역할이 등록되었습니다.');
      setRoleModal(null);
      await qc.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: Parameters<typeof memberApi.updateRole>[1] }) =>
      memberApi.updateRole(roleId, payload),
    onSuccess: async () => {
      message.success('역할이 수정되었습니다.');
      setRoleModal(null);
      await qc.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
    onError: (e: Error) => message.error(e.message || '수정에 실패했습니다.'),
  });

  const deleteM = useMutation({
    mutationFn: memberApi.deleteRole,
    onSuccess: async () => {
      message.success('역할이 삭제되었습니다.');
      await qc.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
    onError: (e: Error) => message.error(e.message || '삭제에 실패했습니다.'),
  });

  const openCreate = useCallback(() => {
    setRoleModal({ type: 'create' });
    form.setFieldsValue({
      name: '',
      description: '',
      permissions: defaultPermissionRows(),
    });
  }, [form]);

  const openEdit = useCallback(
    async (row: MemberRoleListItem) => {
      const id = row.id?.trim();
      if (!id) {
        message.error('역할 ID를 찾을 수 없습니다. 목록 API 필드명을 확인해 주세요.');
        return;
      }
      setRoleModal({ type: 'edit', roleId: id });
      form.resetFields();
      try {
        const detail: MemberRoleDetail = await memberApi.getRole(id);
        form.setFieldsValue({
          name: detail.name,
          description: detail.description ?? '',
          permissions: toPermissionRows(detail.permissions ?? []),
        });
      } catch (e) {
        message.error(e instanceof Error ? e.message : '역할 정보를 불러오지 못했습니다.');
        setRoleModal(null);
      }
    },
    [form, message],
  );

  const handleModalOk = async () => {
    try {
      const v = await form.validateFields();
      const permissions: RolePermissionItem[] = (v.permissions ?? []).flatMap((row) => {
        const actions = row.actions ?? [];
        const permissionRange = row.permissionRange;
        if (!actions.length) return [];
        if (!permissionRange) return [];
        return actions.map((action) => ({
          resource: row.resource,
          action,
          permissionRange,
        }));
      });
      if (!permissions.length) {
        message.warning('최소 1개 이상의 권한 조합(리소스/액션/범위)을 선택해 주세요.');
        return;
      }
      if (roleModal?.type === 'create') {
        await createM.mutateAsync({
          name: v.name.trim(),
          description: (v.description ?? '').trim(),
          permissions,
        });
      } else if (roleModal?.type === 'edit') {
        await updateM.mutateAsync({
          roleId: roleModal.roleId,
          payload: {
            name: v.name.trim(),
            description: (v.description ?? '').trim(),
            permissions,
          },
        });
      }
    } catch {
      // validation
    }
  };

  const columns: ColumnsType<MemberRoleListItem> = [
    {
      title: '역할명',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <span className="tw-font-medium tw-text-slate-900">{text}</span>,
    },
    {
      title: '설명',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v: string | undefined) => v || '—',
    },
    {
      title: '작업',
      key: 'actions',
      width: 90,
      render: (_, row) => {
        const canEdit = hasPermission(PERM.ROLE_UPDATE);
        const canDelete = hasPermission(PERM.ROLE_DELETE);
        if (!canEdit && !canDelete) {
          return <span className="tw-text-slate-400">—</span>;
        }
        return (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                ...(canEdit
                  ? [{ key: 'edit', label: '수정', icon: <EditOutlined /> } as const]
                  : []),
                ...(canDelete
                  ? [
                      {
                        key: 'delete',
                        label: '삭제',
                        icon: <DeleteOutlined />,
                        danger: true,
                      } as const,
                    ]
                  : []),
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'edit') {
                  void openEdit(row);
                  return;
                }
                if (key === 'delete') {
                  const id = row.id?.trim();
                  if (!id) {
                    message.error('역할 ID를 찾을 수 없습니다.');
                    return;
                  }
                  appModal.confirm({
                    title: '이 역할을 삭제할까요?',
                    okText: '삭제',
                    okType: 'danger',
                    cancelText: '취소',
                    onOk: () => deleteM.mutateAsync(id),
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
              aria-label="역할 작업 메뉴"
            />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <>
      <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-text-sm">
        역할을 만들고 리소스별 권한(조회·수정 범위)을 설정합니다.
      </Typography.Paragraph>

      <PermissionGuard
        required={PERM.ROLE_READ}
        fallback={
          <Alert
            type="warning"
            showIcon
            message="역할을 보려면 ROLE 조회 권한이 필요합니다."
            className="tw-rounded-xl"
          />
        }
      >
        <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <Typography.Text type="secondary" className="tw-text-sm">
            총 {roles.length}개 역할
          </Typography.Text>
          <PermissionGuard required={PERM.ROLE_CREATE}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} className={roleCtaButtonClass}>
              역할 추가
            </Button>
          </PermissionGuard>
        </div>
        <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200/90">
          <Table<MemberRoleListItem>
            rowKey={(r) => r.id}
            loading={isFetching}
            columns={columns}
            dataSource={roles}
            pagination={false}
            size="middle"
            className="[&_.ant-table-thead>tr>th]:!tw-bg-slate-50/90 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600"
          />
        </div>
      </PermissionGuard>

      <Modal
        title={roleModal?.type === 'edit' ? '역할 수정' : '역할 추가'}
        open={roleModal != null}
        onCancel={() => setRoleModal(null)}
        onOk={() => void handleModalOk()}
        okText={roleModal?.type === 'edit' ? '저장' : '등록'}
        cancelText="취소"
        width={960}
        destroyOnHidden
        confirmLoading={createM.isPending || updateM.isPending}
        okButtonProps={{ className: roleCtaButtonClass }}
      >
        <Form<FormValues> form={form} layout="vertical" className="tw-pt-2">
          <Form.Item name="name" label="역할명" rules={[{ required: true, message: '역할명을 입력하세요.' }]}>
            <Input placeholder="예: 인사 담당" maxLength={100} showCount />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="역할 설명 (선택)" maxLength={500} showCount />
          </Form.Item>

          <Typography.Text className="tw-mb-2 tw-block tw-text-sm tw-font-semibold tw-text-slate-800">
            권한
          </Typography.Text>
          <div className="tw-flex tw-flex-col tw-gap-3">
            {ROLE_RESOURCES.map((resource, idx) => (
              <div key={resource} className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/80 tw-p-3">
                <Form.Item name={['permissions', idx, 'resource']} initialValue={resource} hidden>
                  <Input />
                </Form.Item>
                <div className="tw-grid tw-grid-cols-1 tw-gap-3 lg:tw-grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <div className="tw-text-xs tw-font-semibold tw-text-slate-500">권한</div>
                    <div className="tw-mt-1 tw-font-medium tw-text-slate-900">{RESOURCE_LABELS[resource]}</div>
                  </div>
                  <Form.Item
                    label="액션"
                    name={['permissions', idx, 'actions']}
                    className="tw-mb-0"
                    rules={[{ required: true, message: '액션을 1개 이상 선택하세요.' }]}
                  >
                    <Checkbox.Group
                      options={ROLE_ACTIONS.map((a) => ({
                        value: a,
                        label: ACTION_LABELS[a],
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    label="범위"
                    name={['permissions', idx, 'permissionRange']}
                    className="tw-mb-0"
                    rules={[
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          const actions = getFieldValue(['permissions', idx, 'actions']) as PermissionAction[] | undefined;
                          if ((actions?.length ?? 0) > 0 && value == null) {
                            return Promise.reject(new Error('범위를 선택하세요.'));
                          }
                          return Promise.resolve();
                        },
                      }),
                    ]}
                  >
                    <Radio.Group className="tw-flex tw-flex-row tw-flex-wrap tw-items-center tw-gap-x-4 tw-gap-y-2">
                      {ROLE_PERMISSION_RANGES.map((x) => (
                        <Radio key={x} value={x}>
                          {RANGE_LABELS[x]}
                        </Radio>
                      ))}
                    </Radio.Group>
                  </Form.Item>
                </div>
              </div>
            ))}
          </div>
        </Form>
      </Modal>
    </>
  );
}
