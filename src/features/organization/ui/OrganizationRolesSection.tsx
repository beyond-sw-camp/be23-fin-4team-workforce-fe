import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Checkbox, Dropdown, Form, Input, Modal, Popover, Radio, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useRef, useState } from 'react';
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
export function OrganizationRolesSection(props: { onMoveToEsgStep?: () => void }) {
  const { onMoveToEsgStep } = props;
  const { message, modal: appModal } = App.useApp();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();
  const [roleModal, setRoleModal] = useState<ModalMode | null>(null);
  const [roleGuideStep, setRoleGuideStep] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  const [openedActionMenuRoleId, setOpenedActionMenuRoleId] = useState<string | null>(null);
  const [form] = Form.useForm<FormValues>();
  const roleActionGuideRef = useRef<HTMLSpanElement | null>(null);
  const modalPermissionGuideRef = useRef<HTMLDivElement | null>(null);
  const roleAddBtnGuideRef = useRef<HTMLSpanElement | null>(null);

  const { data: roles = [], isFetching } = useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: () => memberApi.getRoles(),
  });

  const createM = useMutation({
    mutationFn: memberApi.createRole,
    onSuccess: async () => {
      message.success('역할이 등록되었습니다.');
      await qc.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
    onError: (e: Error) => message.error(e.message || '등록에 실패했습니다.'),
  });

  const updateM = useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: Parameters<typeof memberApi.updateRole>[1] }) =>
      memberApi.updateRole(roleId, payload),
    onSuccess: async () => {
      message.success('역할이 수정되었습니다.');
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
    setRoleGuideStep((prev) => (prev >= 4 ? 5 : prev));
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
        setRoleModal(null);
        setRoleGuideStep(6);
      } else if (roleModal?.type === 'edit') {
        await updateM.mutateAsync({
          roleId: roleModal.roleId,
          payload: {
            name: v.name.trim(),
            description: (v.description ?? '').trim(),
            permissions,
          },
        });
        setRoleModal(null);
        setRoleGuideStep(4);
      }
    } catch {
      message.warning('필수 항목을 입력/선택해 주세요.');
    }
  };

  const guideRoleId = roles[0]?.id?.trim() || null;

  useEffect(() => {
    if (!guideRoleId) {
      if (roleGuideStep === 4 || roleGuideStep === 5 || roleGuideStep === 6) return;
      setRoleGuideStep(0);
      return;
    }
    if (roleModal == null) {
      setRoleGuideStep((prev) => (prev >= 4 ? prev : prev >= 2 ? 0 : prev));
      return;
    }
    setRoleGuideStep((prev) => (prev < 2 ? 2 : prev));
  }, [guideRoleId, roleGuideStep, roleModal]);

  useEffect(() => {
    if (roleGuideStep <= 1) {
      roleActionGuideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (roleGuideStep === 2) {
      modalPermissionGuideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (roleGuideStep === 4 || roleGuideStep === 6) {
      roleAddBtnGuideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [roleGuideStep]);

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
        const rowId = row.id?.trim() || '';
        const isGuideRow = guideRoleId != null && rowId === guideRoleId;
        const step1Open = isGuideRow && roleGuideStep === 0 && roleModal == null;
        const step2Open = isGuideRow && roleGuideStep === 1 && openedActionMenuRoleId === rowId && roleModal == null;
        const canEdit = hasPermission(PERM.ROLE_UPDATE);
        const canDelete = hasPermission(PERM.ROLE_DELETE);
        if (!canEdit && !canDelete) {
          return <span className="tw-text-slate-400">—</span>;
        }
        return (
          <Dropdown
            trigger={['click']}
            onOpenChange={(open) => {
              if (!isGuideRow) return;
              setOpenedActionMenuRoleId(open ? rowId : null);
              if (open && roleGuideStep === 0) {
                setRoleGuideStep(1);
              }
            }}
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
                  if (isGuideRow) setRoleGuideStep(2);
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
            <Popover
              title={step1Open ? '1단계: 역할 작업 메뉴 열기' : '2단계: 수정 선택'}
              content={
                <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                  {step1Open
                    ? '권한을 설정할 역할 행의 작업 메뉴(⋯) 버튼을 눌러 주세요.'
                    : '열린 메뉴에서 "수정"을 선택해 역할 수정 모달로 이동해 주세요.'}
                </Typography.Paragraph>
              }
              open={step1Open || step2Open}
              placement="left"
              overlayStyle={{ zIndex: 1080 }}
            >
              <span
                ref={isGuideRow ? roleActionGuideRef : undefined}
                className={`tw-inline-block tw-rounded-lg ${
                  step1Open || step2Open ? 'tw-ring-2 tw-ring-blue-500 tw-ring-offset-2 tw-ring-offset-white' : ''
                }`}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  className="!tw-px-1 tw-text-slate-600"
                  aria-label="역할 작업 메뉴"
                />
              </span>
            </Popover>
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
            <Popover
              title="5단계: 새 역할 추가"
              content={
                <Typography.Paragraph className="!tw-mb-0 tw-max-w-[300px] tw-text-sm">
                  저장이 완료되었습니다. 필요하면 역할 추가 버튼으로 새 역할을 계속 등록해 주세요.
                </Typography.Paragraph>
              }
              open={roleGuideStep === 4 && roleModal == null}
              placement="left"
              overlayStyle={{ zIndex: 1080 }}
            >
              <span
                ref={roleAddBtnGuideRef}
                className={`tw-inline-block tw-rounded-xl ${
                  roleGuideStep === 4 && roleModal == null ? 'tw-ring-2 tw-ring-blue-500 tw-ring-offset-2 tw-ring-offset-white' : ''
                }`}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} className={roleCtaButtonClass}>
                  역할 추가
                </Button>
              </span>
            </Popover>
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
        {roleGuideStep === 6 && roleModal == null ? (
          <div className="tw-mt-4 tw-flex tw-justify-end">
            <Popover
              title="7단계: ESG 그린장터로 이동"
              content={
                <Typography.Paragraph className="!tw-mb-0 tw-max-w-[300px] tw-text-sm">
                  역할 등록이 끝났습니다. 다음 단계 버튼으로 ESG 그린장터 탭으로 이동해 주세요.
                </Typography.Paragraph>
              }
              open
              placement="left"
              overlayStyle={{ zIndex: 1080 }}
            >
              <span className="tw-inline-block tw-rounded-xl tw-ring-2 tw-ring-blue-500 tw-ring-offset-2 tw-ring-offset-white">
                <Button
                  type="primary"
                  className={roleCtaButtonClass}
                  onClick={() => {
                    onMoveToEsgStep?.();
                    setRoleGuideStep(0);
                  }}
                >
                  다음 단계: ESG 그린장터
                </Button>
              </span>
            </Popover>
          </div>
        ) : null}
      </PermissionGuard>

      {/* `destroyOnHidden` 모달이 닫히면 Form이 제거되어 useForm 경고가 난다. */}
      {roleModal === null ? <Form form={form} preserve={false} className="tw-hidden" aria-hidden /> : null}

      <Modal
        title={roleModal?.type === 'edit' ? '역할 수정' : '역할 추가'}
        open={roleModal != null}
        onCancel={() => setRoleModal(null)}
        onOk={() => void handleModalOk()}
        width={960}
        destroyOnHidden
        confirmLoading={createM.isPending || updateM.isPending}
        footer={
          <div className="tw-flex tw-justify-end tw-gap-2">
            <Button onClick={() => setRoleModal(null)}>취소</Button>
            <Popover
              title={roleGuideStep === 5 ? '6단계: 등록' : '4단계: 저장'}
              trigger={[]}
              content={
                <Typography.Paragraph className="!tw-mb-0 tw-max-w-[300px] tw-text-sm">
                  {roleGuideStep === 5
                    ? '역할명을 입력하고 권한을 지정한 뒤 등록 버튼을 눌러 새 역할을 생성해 주세요.'
                    : '설정이 끝나면 저장 버튼을 눌러 반영하고, 목록에서 적용 여부를 확인해 주세요.'}
                </Typography.Paragraph>
              }
              open={roleGuideStep === 3 || roleGuideStep === 5}
              placement="top"
              overlayStyle={{ zIndex: 1100 }}
            >
              <Button
                type="primary"
                loading={createM.isPending || updateM.isPending}
                onClick={() => void handleModalOk()}
                className={`${roleCtaButtonClass} ${roleGuideStep === 3 || roleGuideStep === 5 ? 'tw-ring-2 tw-ring-blue-500 tw-ring-offset-2' : ''}`}
              >
                {roleModal?.type === 'edit' ? '저장' : '등록'}
              </Button>
            </Popover>
          </div>
        }
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          className="tw-pt-2"
          onValuesChange={(changed) => {
            if (roleGuideStep === 2 && changed.permissions) {
              setRoleGuideStep(3);
            }
          }}
        >
          <Alert
            type="info"
            showIcon
            className="!tw-mb-3 tw-rounded-lg"
            message="권한 부여 방법"
            description="리소스별로 액션(생성/조회/수정/삭제)을 먼저 고르고, 액션을 선택한 리소스에는 범위(전사/같은 조직/본인만)를 반드시 지정해 주세요."
          />
          <Form.Item name="name" label="역할명" rules={[{ required: true, message: '역할명을 입력하세요.' }]}>
            <Input placeholder="예: 인사 담당" maxLength={100} showCount />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="역할 설명 (선택)" maxLength={500} showCount />
          </Form.Item>

          <Typography.Text className="tw-mb-2 tw-block tw-text-sm tw-font-semibold tw-text-slate-800">
            권한
          </Typography.Text>
          <Popover
            title="3단계: 권한 부여"
            content={
              <Typography.Paragraph className="!tw-mb-0 tw-max-w-[300px] tw-text-sm">
                각 리소스의 액션(생성/조회/수정/삭제)과 범위(전사/같은 조직/본인만)를 선택해 주세요.
              </Typography.Paragraph>
            }
            open={roleGuideStep === 2}
            placement="bottomLeft"
            overlayStyle={{ zIndex: 1100 }}
          >
            <div
              ref={modalPermissionGuideRef}
              className={`tw-flex tw-flex-col tw-gap-3 ${
                roleGuideStep >= 2 ? 'tw-rounded-lg tw-ring-2 tw-ring-blue-500 tw-ring-offset-2' : ''
              }`}
            >
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
          </Popover>
        </Form>
      </Modal>
    </>
  );
}
