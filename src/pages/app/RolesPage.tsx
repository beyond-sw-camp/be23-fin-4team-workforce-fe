import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Typography } from 'antd';
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
import { AppButton } from '@/shared/ui/AppButton';

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

type ModalMode = { type: 'create' } | { type: 'edit'; roleId: string };

type FormValues = {
  name: string;
  description: string;
  permissions: RolePermissionItem[];
};

const defaultPermissionRow = (): RolePermissionItem => ({
  resource: 'MEMBER',
  action: 'READ',
  permissionRange: 'COMPANY',
});

export function RolesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [form] = Form.useForm<FormValues>();

  const { data: roles = [], isFetching } = useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: () => memberApi.getRoles(),
  });

  const createM = useMutation({
    mutationFn: memberApi.createRole,
    onSuccess: async () => {
      message.success('역할이 등록되었습니다.');
      setModal(null);
      await qc.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: Parameters<typeof memberApi.updateRole>[1] }) =>
      memberApi.updateRole(roleId, payload),
    onSuccess: async () => {
      message.success('역할이 수정되었습니다.');
      setModal(null);
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
    setModal({ type: 'create' });
    form.setFieldsValue({
      name: '',
      description: '',
      permissions: [defaultPermissionRow()],
    });
  }, [form]);

  const openEdit = useCallback(
    async (row: MemberRoleListItem) => {
      const id = row.id?.trim();
      if (!id) {
        message.error('역할 ID를 찾을 수 없습니다. 목록 API 필드명을 확인해 주세요.');
        return;
      }
      setModal({ type: 'edit', roleId: id });
      form.resetFields();
      try {
        const detail: MemberRoleDetail = await memberApi.getRole(id);
        form.setFieldsValue({
          name: detail.name,
          description: detail.description ?? '',
          permissions:
            detail.permissions?.length > 0 ? detail.permissions : [defaultPermissionRow()],
        });
      } catch (e) {
        message.error(e instanceof Error ? e.message : '역할 정보를 불러오지 못했습니다.');
        setModal(null);
      }
    },
    [form, message],
  );

  const handleModalOk = async () => {
    try {
      const v = await form.validateFields();
      const permissions = (v.permissions ?? []).map((p) => ({
        resource: p.resource,
        action: p.action,
        permissionRange: p.permissionRange,
      }));
      if (modal?.type === 'create') {
        await createM.mutateAsync({
          name: v.name.trim(),
          description: (v.description ?? '').trim(),
          permissions,
        });
      } else if (modal?.type === 'edit') {
        await updateM.mutateAsync({
          roleId: modal.roleId,
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
      width: 200,
      render: (_, row) => (
        <Space size="small">
          <PermissionGuard required={PERM.ROLE_UPDATE}>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void openEdit(row)}>
              수정
            </Button>
          </PermissionGuard>
          <PermissionGuard required={PERM.ROLE_DELETE}>
            <Popconfirm
              title="이 역할을 삭제할까요?"
              okText="삭제"
              cancelText="취소"
              okButtonProps={{ danger: true }}
              onConfirm={() => {
                const id = row.id?.trim();
                if (id) void deleteM.mutateAsync(id);
                else message.error('역할 ID를 찾을 수 없습니다.');
              }}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                삭제
              </Button>
            </Popconfirm>
          </PermissionGuard>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" className="tw-w-full" size={16}>
      <div>
        <Typography.Title level={4} className="!tw-m-0 !tw-text-slate-900">
          역할·권한
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!tw-mb-0 !tw-mt-1 !tw-text-sm">
          역할을 만들고 리소스별 권한(조회·수정 범위)을 설정합니다.
        </Typography.Paragraph>
      </div>

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
        <Card className="tw-border-slate-200/80 tw-shadow-sm">
          <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
            <Typography.Text type="secondary" className="tw-text-sm">
              총 {roles.length}개 역할
            </Typography.Text>
            <PermissionGuard required={PERM.ROLE_CREATE}>
              <AppButton type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                역할 추가
              </AppButton>
            </PermissionGuard>
          </div>
          <Table<MemberRoleListItem>
            rowKey={(r) => r.id}
            loading={isFetching}
            columns={columns}
            dataSource={roles}
            pagination={false}
            size="middle"
            className="tw-rounded-xl"
          />
        </Card>
      </PermissionGuard>

      <Modal
        title={modal?.type === 'edit' ? '역할 수정' : '역할 추가'}
        open={modal != null}
        onCancel={() => setModal(null)}
        onOk={() => void handleModalOk()}
        okText={modal?.type === 'edit' ? '저장' : '등록'}
        cancelText="취소"
        width={720}
        destroyOnClose
        confirmLoading={createM.isPending || updateM.isPending}
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
          <Form.List name="permissions">
            {(fields, { add, remove }) => (
              <div className="tw-flex tw-flex-col tw-gap-3">
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="tw-flex tw-flex-wrap tw-items-end tw-gap-2 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/80 tw-p-3"
                  >
                    <Form.Item
                      label="리소스"
                      name={[field.name, 'resource']}
                      className="tw-mb-0 tw-min-w-[140px] tw-flex-1"
                      rules={[{ required: true, message: '선택' }]}
                    >
                      <Select
                        placeholder="리소스"
                        options={ROLE_RESOURCES.map((r) => ({
                          value: r,
                          label: `${RESOURCE_LABELS[r]} (${r})`,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item
                      label="액션"
                      name={[field.name, 'action']}
                      className="tw-mb-0 tw-min-w-[120px] tw-flex-1"
                      rules={[{ required: true, message: '선택' }]}
                    >
                      <Select
                        placeholder="액션"
                        options={ROLE_ACTIONS.map((a) => ({
                          value: a,
                          label: `${ACTION_LABELS[a]} (${a})`,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item
                      label="범위"
                      name={[field.name, 'permissionRange']}
                      className="tw-mb-0 tw-min-w-[130px] tw-flex-1"
                      rules={[{ required: true, message: '선택' }]}
                    >
                      <Select
                        placeholder="범위"
                        options={ROLE_PERMISSION_RANGES.map((x) => ({
                          value: x,
                          label: `${RANGE_LABELS[x]} (${x})`,
                        }))}
                      />
                    </Form.Item>
                    <Button type="text" danger onClick={() => remove(field.name)} disabled={fields.length <= 1}>
                      삭제
                    </Button>
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add(defaultPermissionRow())}>
                  권한 행 추가
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Space>
  );
}
