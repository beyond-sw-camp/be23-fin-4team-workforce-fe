import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Checkbox, Form, Input, Popover, Radio, Space, Table, Tooltip, Typography } from 'antd';
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
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
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
  const isOnboardingGuideEnabled = typeof onMoveToEsgStep === 'function';
  const { message, modal: appModal } = App.useApp();
  const { hasPermission } = usePermissions();
  const qc = useQueryClient();
  const [roleModal, setRoleModal] = useState<ModalMode | null>(null);
  const [roleGuideStep, setRoleGuideStep] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  const [form] = Form.useForm<FormValues>();
  const roleActionGuideRef = useRef<HTMLSpanElement | null>(null);
  const modalPermissionGuideRef = useRef<HTMLDivElement | null>(null);
  const roleAddBtnGuideRef = useRef<HTMLSpanElement | null>(null);
  const watchedPermissions = Form.useWatch('permissions', form);

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
    if (isOnboardingGuideEnabled) {
      setRoleGuideStep((prev) => (prev >= 4 ? 5 : prev));
    }
    form.setFieldsValue({
      name: '',
      description: '',
      permissions: defaultPermissionRows(),
    });
  }, [form, isOnboardingGuideEnabled]);

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
        if (isOnboardingGuideEnabled) setRoleGuideStep(6);
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
        if (isOnboardingGuideEnabled) setRoleGuideStep(4);
      }
    } catch {
      message.warning('필수 항목을 입력/선택해 주세요.');
    }
  };

  const guideRoleId = roles[0]?.id?.trim() || null;
  const selectedPermissionCount = (watchedPermissions ?? []).reduce((sum, row) => {
    const actionCount = row?.actions?.length ?? 0;
    return sum + (row?.permissionRange ? actionCount : 0);
  }, 0);

  useEffect(() => {
    if (!isOnboardingGuideEnabled) return;
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
  }, [guideRoleId, isOnboardingGuideEnabled, roleGuideStep, roleModal]);

  useEffect(() => {
    if (!isOnboardingGuideEnabled) return;
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
  }, [isOnboardingGuideEnabled, roleGuideStep]);

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
        const step1Open = isOnboardingGuideEnabled && isGuideRow && roleGuideStep === 0 && roleModal == null;
        const canEdit = hasPermission(PERM.ROLE_UPDATE);
        const canDelete = hasPermission(PERM.ROLE_DELETE);
        if (!canEdit && !canDelete) {
          return <span className="tw-text-slate-400">—</span>;
        }
        return (
          <Space size={4}>
            {canEdit ? (
              <Popover
                title="1단계: 역할 수정 열기"
                content={
                  <Typography.Paragraph className="!tw-mb-0 tw-max-w-[280px] tw-text-sm">
                    권한을 설정할 역할의 수정 버튼을 눌러 역할 수정 모달을 열어 주세요.
                  </Typography.Paragraph>
                }
                open={step1Open}
                placement="left"
                overlayStyle={{ zIndex: 1080 }}
              >
                <span
                  ref={isGuideRow ? roleActionGuideRef : undefined}
                  className={`tw-inline-flex tw-rounded-md ${
                    step1Open ? 'tw-ring-2 tw-ring-blue-500 tw-ring-offset-2 tw-ring-offset-white' : ''
                  }`}
                >
                  <Tooltip title="수정">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      aria-label={`${row.name} 역할 수정`}
                      className="!tw-h-7 !tw-w-7 !tw-rounded-md !tw-p-0 !tw-text-slate-500 hover:!tw-bg-slate-100 hover:!tw-text-slate-700"
                      onClick={() => {
                        if (isOnboardingGuideEnabled && isGuideRow) setRoleGuideStep(2);
                        void openEdit(row);
                      }}
                    />
                  </Tooltip>
                </span>
              </Popover>
            ) : null}
            {canDelete ? (
              <Tooltip title="삭제">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`${row.name} 역할 삭제`}
                  className="!tw-h-7 !tw-w-7 !tw-rounded-md !tw-p-0"
                  onClick={() => {
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
                  }}
                />
              </Tooltip>
            ) : null}
          </Space>
        );
      },
    },
  ];

  return (
    <>
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
        <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
          <div className="tw-min-w-0">
            <Typography.Text className="tw-block tw-text-sm tw-text-slate-500">
              역할을 만들고 리소스별 권한과 접근 범위를 설정합니다.
            </Typography.Text>
            <span className="tw-mt-2 tw-inline-flex tw-h-7 tw-items-center tw-rounded-full tw-bg-slate-100 tw-px-3 tw-text-xs tw-font-semibold tw-text-slate-600">
              총 {roles.length}개 역할
            </span>
          </div>
          <PermissionGuard required={PERM.ROLE_CREATE}>
            <Popover
              title="5단계: 새 역할 추가"
              content={
                <Typography.Paragraph className="!tw-mb-0 tw-max-w-[300px] tw-text-sm">
                  저장이 완료되었습니다. 필요하면 역할 추가 버튼으로 새 역할을 계속 등록해 주세요.
                </Typography.Paragraph>
              }
              open={isOnboardingGuideEnabled && roleGuideStep === 4 && roleModal == null}
              placement="left"
              overlayStyle={{ zIndex: 1080 }}
            >
              <span
                ref={roleAddBtnGuideRef}
                className={`tw-inline-block tw-rounded-xl ${
                  isOnboardingGuideEnabled && roleGuideStep === 4 && roleModal == null
                    ? 'tw-ring-2 tw-ring-blue-500 tw-ring-offset-2 tw-ring-offset-white'
                    : ''
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
            rowClassName="hover:tw-bg-slate-50/70"
            locale={{ emptyText: '등록된 역할이 없습니다.' }}
            className="[&_.ant-table-cell]:!tw-py-4 [&_.ant-table-thead>tr>th]:!tw-bg-slate-50/90 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600"
          />
        </div>
        {isOnboardingGuideEnabled && roleGuideStep === 6 && roleModal == null ? (
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

      <AppDoubleActionModal
        title={roleModal?.type === 'edit' ? '역할 수정' : '역할 추가'}
        open={roleModal != null}
        onClose={() => setRoleModal(null)}
        onConfirm={() => void handleModalOk()}
        width={960}
        confirmText={roleModal?.type === 'edit' ? '저장' : '등록'}
        confirmLoading={createM.isPending || updateM.isPending}
        confirmButtonClassName={
          isOnboardingGuideEnabled && (roleGuideStep === 3 || roleGuideStep === 5)
            ? 'tw-ring-2 tw-ring-blue-500 tw-ring-offset-2'
            : ''
        }
        destroyOnHidden
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          className="tw-px-5 tw-py-5"
          onValuesChange={(changed) => {
            if (isOnboardingGuideEnabled && roleGuideStep === 2 && changed.permissions) {
              setRoleGuideStep(3);
            }
          }}
        >
          <div className="tw-mb-5 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50/70 tw-p-4">
            <Typography.Text className="tw-block tw-text-sm tw-font-semibold tw-text-slate-800">역할 기본 정보</Typography.Text>
            <Typography.Text className="tw-mt-1 tw-block tw-text-xs tw-text-slate-500">
              역할명과 설명을 정한 뒤, 아래에서 이 역할이 접근할 수 있는 리소스와 범위를 선택합니다.
            </Typography.Text>
          </div>
          <div className="tw-grid tw-grid-cols-1 tw-gap-4 md:tw-grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
            <Form.Item name="name" label="역할명" rules={[{ required: true, message: '역할명을 입력하세요.' }]}>
              <Input placeholder="예: 인사 담당" maxLength={100} showCount />
            </Form.Item>
            <Form.Item name="description" label="설명">
              <Input.TextArea rows={1} placeholder="역할 설명 (선택)" maxLength={500} showCount />
            </Form.Item>
          </div>

          <div className="tw-mt-1 tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
            <div>
              <Typography.Text className="tw-block tw-text-sm tw-font-semibold tw-text-slate-800">권한 설정</Typography.Text>
              <Typography.Text className="tw-text-xs tw-text-slate-500">
                액션을 선택한 리소스에는 범위를 함께 지정해 주세요.
              </Typography.Text>
            </div>
            <span className="tw-inline-flex tw-h-7 tw-items-center tw-rounded-full tw-bg-blue-50 tw-px-3 tw-text-xs tw-font-semibold tw-text-blue-700">
              선택된 권한 {selectedPermissionCount}개
            </span>
          </div>
          <Popover
            title="3단계: 권한 부여"
            content={
              <Typography.Paragraph className="!tw-mb-0 tw-max-w-[300px] tw-text-sm">
                각 리소스의 액션(생성/조회/수정/삭제)과 범위(전사/같은 조직/본인만)를 선택해 주세요.
              </Typography.Paragraph>
            }
            open={isOnboardingGuideEnabled && roleGuideStep === 2}
            placement="bottomLeft"
            overlayStyle={{ zIndex: 1100 }}
          >
            <div
              ref={modalPermissionGuideRef}
              className={`tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200 ${
                isOnboardingGuideEnabled && roleGuideStep >= 2 ? 'tw-rounded-lg tw-ring-2 tw-ring-blue-500 tw-ring-offset-2' : ''
              }`}
            >
              <div className="tw-hidden tw-grid-cols-[120px_minmax(360px,1fr)_210px] tw-gap-3 tw-border-b tw-border-slate-200 tw-bg-slate-50/90 tw-px-4 tw-py-2.5 tw-text-[11px] tw-font-semibold tw-text-slate-500 lg:tw-grid">
                <div>리소스</div>
                <div>액션</div>
                <div>범위</div>
              </div>
              {ROLE_RESOURCES.map((resource, idx) => (
              <div
                key={resource}
                className="tw-grid tw-grid-cols-1 tw-gap-3 tw-border-b tw-border-slate-100 tw-bg-white tw-px-4 tw-py-3 last:tw-border-b-0 lg:tw-grid-cols-[120px_minmax(360px,1fr)_210px]"
              >
                <Form.Item name={['permissions', idx, 'resource']} initialValue={resource} hidden>
                  <Input />
                </Form.Item>
                <div className="tw-flex tw-items-center">
                  <div className="tw-font-semibold tw-text-slate-900">{RESOURCE_LABELS[resource]}</div>
                </div>
                <div className="tw-min-w-0">
                  <Form.Item name={['permissions', idx, 'actions']} className="tw-mb-0">
                    <Checkbox.Group className="tw-grid tw-grid-cols-2 tw-gap-1.5 sm:tw-grid-cols-4">
                      {ROLE_ACTIONS.map((a) => (
                        <Checkbox
                          key={a}
                          value={a}
                          className="!tw-mr-0 tw-flex tw-min-h-8 tw-items-center tw-rounded-md tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-px-2.5 tw-py-1 [&_.ant-checkbox+span]:tw-text-sm [&_.ant-checkbox+span]:tw-font-medium [&_.ant-checkbox+span]:tw-text-slate-700"
                        >
                          {ACTION_LABELS[a]}
                        </Checkbox>
                      ))}
                    </Checkbox.Group>
                  </Form.Item>
                </div>
                <div className="tw-min-w-0">
                  <Form.Item
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
                    <Radio.Group className="tw-grid tw-grid-cols-3 tw-gap-1.5 lg:tw-grid-cols-1">
                      {ROLE_PERMISSION_RANGES.map((x) => (
                        <Radio
                          key={x}
                          value={x}
                          className="!tw-mr-0 tw-flex tw-min-h-8 tw-items-center tw-rounded-md tw-border tw-border-slate-200 tw-bg-slate-50/60 tw-px-2.5 tw-py-1 [&_.ant-radio+span]:tw-text-sm [&_.ant-radio+span]:tw-font-medium [&_.ant-radio+span]:tw-text-slate-700"
                        >
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
      </AppDoubleActionModal>
    </>
  );
}
