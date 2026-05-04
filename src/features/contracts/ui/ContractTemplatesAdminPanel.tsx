import { ArrowRightOutlined, PlusOutlined, ReloadOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Divider, Form, Input, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import {
  CONTRACT_TYPES,
  contractTemplateApi,
  type ContractBatchSummary,
  type ContractBatchSendResult,
  type ContractSendResult,
  type ContractTemplate,
  type ContractType,
} from '@/features/contracts/api/contractTemplateApi';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { useAuth } from '@/features/auth/useAuth';
import { parseApiError } from '@/shared/api/error-parser';
import {
  ApprovalFormSchemaBuilder,
  serializeFormSchema,
  validateSchemaFieldsForSubmit,
} from '@/features/approvals/ui/ApprovalFormSchemaBuilder';
import type { FormFieldSchema } from '@/features/approvals/lib/approvalFormSchema';
import { memberApi } from '@/features/member/api/memberApi';
import {
  compactAdminInputJson,
  CONTRACT_FIELD_DEFAULT_SOURCE,
  parseContractFormSchema,
  type ContractFieldMeta,
} from '@/features/contracts/lib/parseContractFormSchema';
import { ContractAdminFormFieldInput } from '@/features/contracts/ui/ContractAdminFormFieldInput';
import { CONTRACT_HUB_CARD_CLASS } from '@/features/contracts/ui/contractHubStyles';
import { ContractRecipientOrgChartModal } from '@/features/contracts/ui/ContractRecipientOrgChartModal';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

const NAVY_BUTTON_CLASS =
  '!tw-border-0 !tw-bg-[#1e3a5f] !tw-text-white hover:!tw-bg-[#152a45] hover:!tw-text-white disabled:!tw-opacity-60';

const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  EMPLOYMENT: '근로계약서',
  SALARY: '연봉계약서',
  NDA: '비밀유지서약서',
  PRIVACY_CONSENT: '개인정보 수집·이용 동의서',
};

type CreateForm = { templateName: string; contractType: ContractType; formSchema: string };
type EditForm = { templateName: string; formSchema: string };
type SingleSendForm = {
  templateId: string;
  employeeMemberId: string;
  adminInput?: Record<string, unknown>;
};
type BatchSendForm = {
  templateId: string;
  batchName: string;
  items: Array<{ employeeMemberId: string; adminInput?: Record<string, unknown> }>;
};
function buildContractSchemaJson(fields: FormFieldSchema[], metaByName: Record<string, ContractFieldMeta>): string {
  const base = JSON.parse(serializeFormSchema(fields)) as { fields: Array<Record<string, unknown>> };
  const contractFields = base.fields.map((f) => {
    const name = String(f.name ?? '').trim();
    const meta = metaByName[name];
    const source = meta?.source || CONTRACT_FIELD_DEFAULT_SOURCE;
    const sourceField = meta?.sourceField?.trim();
    const editable = meta?.editable === true;
    return {
      key: name,
      label: String(f.label ?? ''),
      type: String(f.type ?? 'text'),
      source,
      ...(sourceField ? { sourceField } : {}),
      editable,
      ...(Array.isArray(f.options) && f.options.length > 0 ? { options: f.options } : {}),
    };
  });
  return JSON.stringify({ fields: contractFields }, null, 2);
}

export function ContractTemplatesAdminPanel({
  showTemplateSection = true,
  showSendSection = true,
  sendLayout = 'stacked',
}: {
  showTemplateSection?: boolean;
  showSendSection?: boolean;
  /** stacked: 단일 카드 안에 개별/일괄. split: 전자결재 허브형 2열 카드 */
  sendLayout?: 'stacked' | 'split';
} = {}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const isSystemAdmin = user?.isSystemAdmin === true;

  const canRead = isSystemAdmin || hasPermission(PERM.CONTRACT_READ);
  const canCreate = isSystemAdmin || hasPermission(PERM.CONTRACT_CREATE);
  const canUpdate = isSystemAdmin || hasPermission(PERM.CONTRACT_UPDATE);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [createForm] = Form.useForm<CreateForm>();
  const [editForm] = Form.useForm<EditForm>();
  const [singleSendForm] = Form.useForm<SingleSendForm>();
  const [batchSendForm] = Form.useForm<BatchSendForm>();
  const [createSchemaFields, setCreateSchemaFields] = useState<FormFieldSchema[]>([]);
  const [editSchemaFields, setEditSchemaFields] = useState<FormFieldSchema[]>([]);
  const [createMetaByName, setCreateMetaByName] = useState<Record<string, ContractFieldMeta>>({});
  const [editMetaByName, setEditMetaByName] = useState<Record<string, ContractFieldMeta>>({});
  const [singleRecipientPickerOpen, setSingleRecipientPickerOpen] = useState(false);
  const [batchRecipientPickerOpen, setBatchRecipientPickerOpen] = useState(false);
  const [singleSendModalOpen, setSingleSendModalOpen] = useState(false);
  const [batchSendModalOpen, setBatchSendModalOpen] = useState(false);

  const { data: templates = [], isFetching, refetch, error: templatesError } = useQuery({
    queryKey: ['contract', 'templates'],
    queryFn: () => contractTemplateApi.list(),
    enabled: canRead,
    retry: false,
  });
  const { data: members = [] } = useQuery({
    queryKey: ['member', 'contract-send-list'],
    queryFn: () => memberApi.listMembersForApprovals(),
    enabled: showSendSection && canCreate,
    staleTime: 60_000,
  });
  const { data: existingBatchesForName = [] } = useQuery({
    queryKey: ['contract', 'batches', 'name-suggest'],
    queryFn: () => contractTemplateApi.listBatches(),
    enabled: showSendSection && canCreate,
    staleTime: 30_000,
  });

  const createM = useMutation({
    mutationFn: (v: CreateForm) =>
      contractTemplateApi.create({
        templateName: v.templateName.trim(),
        contractType: v.contractType,
        formSchema: buildContractSchemaJson(createSchemaFields, createMetaByName),
      }),
    onSuccess: () => {
      message.success('계약서 템플릿이 등록되었습니다.');
      setCreateOpen(false);
      createForm.resetFields();
      setCreateSchemaFields([]);
      setCreateMetaByName({});
      void qc.invalidateQueries({ queryKey: ['contract', 'templates'] });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });

  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: EditForm }) =>
      contractTemplateApi.update(id, {
        templateName: v.templateName.trim(),
        formSchema: buildContractSchemaJson(editSchemaFields, editMetaByName),
      }),
    onSuccess: () => {
      message.success('계약서 템플릿이 수정되었습니다.');
      setEditOpen(false);
      setEditing(null);
      setEditSchemaFields([]);
      setEditMetaByName({});
      void qc.invalidateQueries({ queryKey: ['contract', 'templates'] });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });

  const activateM = useMutation({
    mutationFn: (id: string) => contractTemplateApi.activate(id),
    onSuccess: () => {
      message.success('템플릿을 활성화했습니다.');
      void qc.invalidateQueries({ queryKey: ['contract', 'templates'] });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });

  const deactivateM = useMutation({
    mutationFn: (id: string) => contractTemplateApi.deactivate(id),
    onSuccess: () => {
      message.success('템플릿을 비활성화했습니다.');
      void qc.invalidateQueries({ queryKey: ['contract', 'templates'] });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });
  const sendSingleM = useMutation({
    mutationFn: (payload: {
      templateId: string;
      employeeMemberId: string;
      adminInputJson?: string;
    }) => contractTemplateApi.sendContract(payload),
    onSuccess: (res: ContractSendResult) => {
      message.success(`계약서를 발송했습니다. (계약 ID: ${res.contractId})`);
      singleSendForm.resetFields();
      queueMicrotask(() => {
        window.location.reload();
      });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });
  const sendBatchM = useMutation({
    mutationFn: (payload: {
      templateId: string;
      batchName: string;
      items: Array<{ employeeMemberId: string; adminInputJson?: string }>;
    }) => contractTemplateApi.sendContractBatch(payload),
    onSuccess: (res: ContractBatchSendResult) => {
      message.success(`일괄 발송 완료: ${res.totalCount}건 (배치: ${res.batchName || res.batchId})`);
      batchSendForm.setFieldsValue({ items: [{ employeeMemberId: '', adminInput: {} }] });
      queueMicrotask(() => {
        window.location.reload();
      });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });

  const contractTypeOptions = useMemo(
    () => CONTRACT_TYPES.map((t) => ({ value: t, label: CONTRACT_TYPE_LABEL[t] })),
    [],
  );

  const createWatchTemplateName = Form.useWatch('templateName', createForm);
  const createWatchContractType = Form.useWatch('contractType', createForm);
  const createContractPaperMeta = useMemo(
    () => ({
      documentName: String(createWatchTemplateName ?? '').trim() || '—',
      categoryLabel: createWatchContractType
        ? CONTRACT_TYPE_LABEL[createWatchContractType as ContractType] ?? String(createWatchContractType)
        : '—',
      requestTypeCode: createWatchContractType ? String(createWatchContractType) : 'CONTRACT',
    }),
    [createWatchTemplateName, createWatchContractType],
  );

  const editWatchTemplateName = Form.useWatch('templateName', editForm);
  const editContractPaperMeta = useMemo(
    () => ({
      documentName: String(editWatchTemplateName ?? editing?.templateName ?? '').trim() || '—',
      categoryLabel: editing ? CONTRACT_TYPE_LABEL[editing.contractType] : '—',
      requestTypeCode: editing?.contractType ?? '—',
    }),
    [editWatchTemplateName, editing],
  );

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.memberId,
        label: `${m.name} (${m.organizationName || '-'} / ${m.jobTitleName || '-'})`,
      })),
    [members],
  );
  const activeTemplates = useMemo(() => templates.filter((t) => t.isActiveYn === 'Y'), [templates]);
  const singleTemplateId = Form.useWatch('templateId', singleSendForm);
  const batchTemplateId = Form.useWatch('templateId', batchSendForm);
  const watchedBatchName = Form.useWatch('batchName', batchSendForm);
  const selectedSingleTemplate = useMemo(
    () => activeTemplates.find((t) => t.templateId === singleTemplateId),
    [activeTemplates, singleTemplateId],
  );
  const selectedBatchTemplate = useMemo(
    () => activeTemplates.find((t) => t.templateId === batchTemplateId),
    [activeTemplates, batchTemplateId],
  );
  const singleTemplateParsed = useMemo(
    () => (selectedSingleTemplate ? parseContractFormSchema(selectedSingleTemplate.formSchema) : { fields: [], metaByName: {} }),
    [selectedSingleTemplate],
  );
  const batchTemplateParsed = useMemo(
    () => (selectedBatchTemplate ? parseContractFormSchema(selectedBatchTemplate.formSchema) : { fields: [], metaByName: {} }),
    [selectedBatchTemplate],
  );
  const singleAdminInputFields = useMemo(
    () => singleTemplateParsed.fields.filter((f) => singleTemplateParsed.metaByName[f.name]?.source === 'ADMIN_INPUT'),
    [singleTemplateParsed],
  );
  const batchAdminInputFields = useMemo(
    () => batchTemplateParsed.fields.filter((f) => batchTemplateParsed.metaByName[f.name]?.source === 'ADMIN_INPUT'),
    [batchTemplateParsed],
  );
  const autoBatchName = useMemo(() => {
    if (!selectedBatchTemplate?.templateName?.trim()) return '';
    const templateName = selectedBatchTemplate.templateName.trim();
    const dateToken = dayjs().format('YYYYMMDD');
    const prefix = `${templateName}_${dateToken}_`;
    let maxSeq = 0;
    for (const row of existingBatchesForName as ContractBatchSummary[]) {
      const rawName = String(row.batchName ?? '').trim();
      if (!rawName.startsWith(prefix)) continue;
      const seqRaw = rawName.slice(prefix.length).trim();
      if (!/^\d+$/.test(seqRaw)) continue;
      const seq = Number(seqRaw);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
    return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
  }, [existingBatchesForName, selectedBatchTemplate?.templateName]);

  useEffect(() => {
    if (!selectedBatchTemplate) return;
    const current = String(watchedBatchName ?? '').trim();
    if (current) return;
    if (!autoBatchName) return;
    batchSendForm.setFieldValue('batchName', autoBatchName);
  }, [autoBatchName, batchSendForm, selectedBatchTemplate, watchedBatchName]);

  const openCreate = () => {
    const initial = parseContractFormSchema(
      JSON.stringify({
        fields: [
          { key: 'employeeName', label: '성명', type: 'text', source: 'AUTO', sourceField: 'name', editable: false },
          { key: 'sabun', label: '사번', type: 'text', source: 'AUTO', sourceField: 'sabun', editable: false },
          { key: 'organizationName', label: '부서', type: 'text', source: 'AUTO', sourceField: 'organizationName', editable: false },
          { key: 'jobTitleName', label: '직책', type: 'text', source: 'AUTO', sourceField: 'jobTitleName', editable: false },
          { key: 'baseSalary', label: '연봉', type: 'number', source: 'AUTO', sourceField: 'baseSalary', editable: false },
        ],
      }),
    );
    createForm.setFieldsValue({
      templateName: '',
      contractType: 'EMPLOYMENT',
      formSchema: '',
    });
    setCreateSchemaFields(initial.fields);
    setCreateMetaByName(initial.metaByName);
    setCreateOpen(true);
  };

  const openEdit = (row: ContractTemplate) => {
    const parsed = parseContractFormSchema(row.formSchema);
    setEditing(row);
    editForm.setFieldsValue({
      templateName: row.templateName,
      formSchema: '',
    });
    setEditSchemaFields(parsed.fields);
    setEditMetaByName(parsed.metaByName);
    setEditOpen(true);
  };

  const submitCreate = async () => {
    try {
      const v = await createForm.validateFields();
      const schemaError = validateSchemaFieldsForSubmit(createSchemaFields);
      if (schemaError) {
        message.warning(schemaError);
        return;
      }
      await createM.mutateAsync(v);
    } catch {
      /* validation */
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    try {
      const v = await editForm.validateFields();
      const schemaError = validateSchemaFieldsForSubmit(editSchemaFields);
      if (schemaError) {
        message.warning(schemaError);
        return;
      }
      await updateM.mutateAsync({ id: editing.templateId, v });
    } catch {
      /* validation */
    }
  };
  const submitSingleSend = async () => {
    try {
      const v = await singleSendForm.validateFields();
      const adminJson = compactAdminInputJson(v.adminInput as Record<string, unknown> | undefined);
      await sendSingleM.mutateAsync({
        templateId: v.templateId,
        employeeMemberId: v.employeeMemberId,
        ...(adminJson ? { adminInputJson: adminJson } : {}),
      });
    } catch {
      /* validation */
    }
  };
  const submitBatchSend = async () => {
    try {
      const v = await batchSendForm.validateFields();
      const items = (v.items ?? [])
        .filter((item) => item.employeeMemberId?.trim())
        .map((item) => {
          const adminJson = compactAdminInputJson(item.adminInput as Record<string, unknown> | undefined);
          return {
            employeeMemberId: item.employeeMemberId,
            ...(adminJson ? { adminInputJson: adminJson } : {}),
          };
        });
      if (items.length === 0) {
        message.warning('일괄 발송 대상 직원을 1명 이상 선택해 주세요.');
        return;
      }
      await sendBatchM.mutateAsync({
        templateId: v.templateId,
        batchName: v.batchName.trim(),
        items,
      });
    } catch {
      /* validation */
    }
  };
  const handleAddSingleRecipientFromOrgChart = (memberIds: string[]) => {
    if (memberIds.length === 0) return;
    if (memberIds.length > 1) {
      message.info('개별 발송은 1명만 선택할 수 있어 첫 번째 대상자로 설정했습니다.');
    }
    singleSendForm.setFieldValue('employeeMemberId', memberIds[0]);
    setSingleRecipientPickerOpen(false);
  };
  const handleAddBatchRecipientsFromOrgChart = (memberIds: string[]) => {
    if (memberIds.length === 0) return;
    const current = batchSendForm.getFieldValue('items') as BatchSendForm['items'] | undefined;
    const existing = current ?? [];
    const existingIds = new Set(existing.map((i) => String(i.employeeMemberId ?? '').trim()).filter(Boolean));
    const appended = memberIds
      .filter((id) => {
        const normalized = id.trim();
        if (!normalized || existingIds.has(normalized)) return false;
        existingIds.add(normalized);
        return true;
      })
      .map((id) => ({ employeeMemberId: id, adminInput: {} as Record<string, unknown> }));
    if (appended.length === 0) {
      message.info('이미 추가된 직원입니다.');
      setBatchRecipientPickerOpen(false);
      return;
    }
    batchSendForm.setFieldValue('items', [...existing, ...appended]);
    setBatchRecipientPickerOpen(false);
  };

  if (showTemplateSection && !canRead) {
    return (
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Typography.Paragraph type="secondary" className="!tw-mb-0">
          전자계약 양식을 보려면 <Typography.Text code>CONTRACT:READ</Typography.Text> 권한이 필요합니다.
        </Typography.Paragraph>
      </Card>
    );
  }

  return (
    <>
      {showTemplateSection ? (
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        {templatesError ? (
          <Alert
            type="error"
            showIcon
            className="tw-mb-4"
            message="전자계약 템플릿을 불러오지 못했습니다."
            description={parseApiError(templatesError).message}
          />
        ) : null}
        <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <Typography.Text type="secondary" className="tw-text-sm">
            등록된 계약서 템플릿 {templates.length}개
          </Typography.Text>
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void refetch()}>
              새로고침
            </Button>
            {canCreate ? (
              <Button type="primary" icon={<PlusOutlined />} className={NAVY_BUTTON_CLASS} onClick={openCreate}>
                새 계약서 양식
              </Button>
            ) : null}
          </Space>
        </div>
        <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-text-sm">
          계약 유형·필드 정의(formSchema)를 관리합니다. 발송 화면의 템플릿 선택은 활성 템플릿만 노출됩니다.
        </Typography.Paragraph>
        <div className="tw-pr-1">
          <Table<ContractTemplate>
            rowKey="templateId"
            loading={isFetching}
            dataSource={templates}
            pagination={false}
            columns={[
              {
                title: '템플릿명',
                dataIndex: 'templateName',
                key: 'templateName',
                ellipsis: true,
              },
              {
                title: '계약 유형',
                dataIndex: 'contractType',
                key: 'contractType',
                width: 200,
                render: (t: string) => CONTRACT_TYPE_LABEL[t as ContractType] ?? t,
              },
              {
                title: '상태',
                dataIndex: 'isActiveYn',
                key: 'isActiveYn',
                width: 120,
                render: (yn: 'Y' | 'N') => (
                  <Tag color={yn === 'Y' ? 'success' : 'default'}>{yn === 'Y' ? '활성' : '비활성'}</Tag>
                ),
              },
              {
                title: '수정일',
                dataIndex: 'updatedAt',
                key: 'updatedAt',
                width: 180,
                render: (v: string) => (v ? v.replace('T', ' ').slice(0, 19) : '—'),
              },
              {
                title: '관리',
                key: 'actions',
                width: 220,
                render: (_, row) => (
                  <Space size="small" wrap>
                    {canUpdate ? (
                      <Button type="link" size="small" onClick={() => openEdit(row)}>
                        수정
                      </Button>
                    ) : null}
                    {canUpdate ? (
                      <Button
                        size="small"
                        type={row.isActiveYn === 'Y' ? 'primary' : 'default'}
                        ghost={row.isActiveYn === 'Y'}
                        onClick={() =>
                          row.isActiveYn === 'Y'
                            ? deactivateM.mutate(row.templateId)
                            : activateM.mutate(row.templateId)
                        }
                        loading={
                          (activateM.isPending || deactivateM.isPending) &&
                          (activateM.variables === row.templateId || deactivateM.variables === row.templateId)
                        }
                      >
                        {row.isActiveYn === 'Y' ? '비활성화' : '활성화'}
                      </Button>
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
        </div>
      </Card>
      ) : null}
      {showSendSection ? (
        sendLayout === 'split' ? (
          <>
            <div className="tw-grid tw-w-full tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-2">
              <Card className={`${CONTRACT_HUB_CARD_CLASS} tw-overflow-hidden`}>
                <div className="tw-flex tw-gap-4">
                  <div className="tw-flex tw-size-12 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-xl tw-bg-[#1e3a5f] tw-text-white">
                    <UserAddOutlined className="tw-text-xl" />
                  </div>
                  <div className="tw-min-w-0 tw-flex-1">
                    <Typography.Title level={5} className="!tw-mb-2">개별 발송</Typography.Title>
                    <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-sm">
                      특정 인원에게 맞춤형 계약서를 전송합니다. 수정 사항이 잦은 입사 계약이나 연봉 협상에 적합합니다.
                    </Typography.Paragraph>
                    <Button type="link" className="!tw-px-0 !tw-font-semibold" onClick={() => setSingleSendModalOpen(true)}>
                      바로 시작하기 <ArrowRightOutlined />
                    </Button>
                  </div>
                </div>
              </Card>
              <Card className={`${CONTRACT_HUB_CARD_CLASS} tw-overflow-hidden`}>
                <div className="tw-flex tw-gap-4">
                  <div className="tw-flex tw-size-12 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-xl tw-bg-[#0b63ce] tw-text-white">
                    <TeamOutlined className="tw-text-xl" />
                  </div>
                  <div className="tw-min-w-0 tw-flex-1">
                    <Typography.Title level={5} className="!tw-mb-2">일괄 발송</Typography.Title>
                    <Typography.Paragraph type="secondary" className="!tw-mb-3 !tw-text-sm">
                      대규모 인원에게 동일한 계약 서식을 일괄 전송합니다. 기업정보 처리 동의서나 전사 정책 안내 서명에 최적화되어 있습니다.
                    </Typography.Paragraph>
                    <Button type="link" className="!tw-px-0 !tw-font-semibold" onClick={() => setBatchSendModalOpen(true)}>
                      바로 시작하기 <ArrowRightOutlined />
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <AppDoubleActionModal
              title="개별 발송"
              open={singleSendModalOpen}
              onClose={() => setSingleSendModalOpen(false)}
              onConfirm={() => void submitSingleSend()}
              confirmText="계약서 발송"
              cancelText="닫기"
              confirmLoading={sendSingleM.isPending}
              destroyOnHidden
              width={700}
            >
              <div className="tw-px-5 tw-py-4">
              <Form<SingleSendForm> form={singleSendForm} layout="vertical" className="tw-pt-2">
                <Form.Item name="templateId" label="템플릿" rules={[{ required: true, message: '템플릿을 선택해 주세요.' }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="활성 템플릿 선택"
                    options={activeTemplates.map((t) => ({
                      value: t.templateId,
                      label: `${t.templateName} (${CONTRACT_TYPE_LABEL[t.contractType as ContractType] ?? t.contractType})`,
                    }))}
                  />
                </Form.Item>
                <Form.Item name="employeeMemberId" label="대상 직원" rules={[{ required: true, message: '직원을 선택해 주세요.' }]}>
                  <Select showSearch optionFilterProp="label" placeholder="직원 선택" options={memberOptions} />
                </Form.Item>
                <div className="tw--mt-1 tw-mb-2">
                  <Button onClick={() => setSingleRecipientPickerOpen(true)}>조직도에서 선택</Button>
                </div>
                {singleAdminInputFields.map((field) => (
                  <Form.Item key={field.name} name={['adminInput', field.name]} label={field.label}>
                    <ContractAdminFormFieldInput field={field} textAreaRows={3} />
                  </Form.Item>
                ))}
              </Form>
              </div>
            </AppDoubleActionModal>

            <AppDoubleActionModal
              title="일괄 발송"
              open={batchSendModalOpen}
              onClose={() => setBatchSendModalOpen(false)}
              onConfirm={() => void submitBatchSend()}
              confirmText="일괄 발송"
              cancelText="닫기"
              confirmLoading={sendBatchM.isPending}
              destroyOnHidden
              width={820}
            >
              <div className="tw-px-5 tw-py-4">
              <Form<BatchSendForm>
                form={batchSendForm}
                layout="vertical"
                className="tw-pt-2"
                initialValues={{ items: [{ employeeMemberId: '', adminInput: {} }] }}
              >
                <Form.Item name="templateId" label="템플릿" rules={[{ required: true, message: '템플릿을 선택해 주세요.' }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="활성 템플릿 선택"
                    options={activeTemplates.map((t) => ({
                      value: t.templateId,
                      label: `${t.templateName} (${CONTRACT_TYPE_LABEL[t.contractType as ContractType] ?? t.contractType})`,
                    }))}
                  />
                </Form.Item>
                <Form.Item name="batchName" label="배치 이름" rules={[{ required: true, message: '배치 이름을 입력해 주세요.' }]}>
                  <Input placeholder="예: 2026년 연봉계약" maxLength={120} />
                </Form.Item>
                <Form.List name="items">
                  {(fields, { add, remove }) => (
                    <Space direction="vertical" className="tw-w-full" size={12}>
                      <div className="tw-flex tw-items-center tw-justify-end">
                        <Button onClick={() => setBatchRecipientPickerOpen(true)}>조직도에서 다중 추가</Button>
                      </div>
                      {fields.map((field, index) => (
                        <Card
                          key={field.key}
                          size="small"
                          title={`대상 ${index + 1}`}
                          extra={
                            fields.length > 1 ? (
                              <Button type="link" danger size="small" onClick={() => remove(field.name)}>
                                삭제
                              </Button>
                            ) : null
                          }
                        >
                          <Form.Item name={[field.name, 'employeeMemberId']} label="직원" rules={[{ required: true, message: '직원을 선택해 주세요.' }]}>
                            <Select showSearch optionFilterProp="label" placeholder="직원 선택" options={memberOptions} />
                          </Form.Item>
                          {batchAdminInputFields.map((adminField) => (
                            <Form.Item key={`${field.key}-${adminField.name}`} name={[field.name, 'adminInput', adminField.name]} label={adminField.label}>
                              <ContractAdminFormFieldInput field={adminField} textAreaRows={2} />
                            </Form.Item>
                          ))}
                        </Card>
                      ))}
                      <Button onClick={() => add({ employeeMemberId: '', adminInput: {} })}>대상 직원 추가</Button>
                    </Space>
                  )}
                </Form.List>
              </Form>
              </div>
            </AppDoubleActionModal>
          </>
        ) : (
          <Card className="tw-border-slate-200/80 tw-shadow-sm">
            <Typography.Title level={5} className="!tw-mb-3">
              계약 발송
            </Typography.Title>
            <Typography.Paragraph type="secondary" className="!tw-mb-4 !tw-text-sm">
              활성 템플릿을 선택한 뒤 개별 또는 일괄 발송할 수 있습니다. AUTO 필드는 시스템이 채우고 ADMIN_INPUT만 입력해 발송합니다.
            </Typography.Paragraph>
            <Space direction="vertical" className="tw-w-full" size={18}>
              <Card size="small" title="개별 발송" className="tw-border-slate-200/90">
                <Form<SingleSendForm> form={singleSendForm} layout="vertical" className="tw-pt-1">
                  <Form.Item name="templateId" label="템플릿" rules={[{ required: true, message: '템플릿을 선택해 주세요.' }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="활성 템플릿 선택"
                      options={activeTemplates.map((t) => ({
                        value: t.templateId,
                        label: `${t.templateName} (${CONTRACT_TYPE_LABEL[t.contractType as ContractType] ?? t.contractType})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item name="employeeMemberId" label="대상 직원" rules={[{ required: true, message: '직원을 선택해 주세요.' }]}>
                    <Select showSearch optionFilterProp="label" placeholder="직원 선택" options={memberOptions} />
                  </Form.Item>
                  <div className="tw--mt-1 tw-mb-2">
                    <Button onClick={() => setSingleRecipientPickerOpen(true)}>조직도에서 선택</Button>
                  </div>
                  {singleAdminInputFields.map((field) => (
                    <Form.Item key={field.name} name={['adminInput', field.name]} label={field.label}>
                      <ContractAdminFormFieldInput field={field} textAreaRows={3} />
                    </Form.Item>
                  ))}
                  <div className="tw-flex tw-justify-end">
                    <Button type="primary" className={NAVY_BUTTON_CLASS} loading={sendSingleM.isPending} onClick={() => void submitSingleSend()}>
                      계약서 발송
                    </Button>
                  </div>
                </Form>
              </Card>
              <Divider className="!tw-my-0" />
              <Card size="small" title="일괄 발송" className="tw-border-slate-200/90">
                <Form<BatchSendForm>
                  form={batchSendForm}
                  layout="vertical"
                  className="tw-pt-1"
                  initialValues={{ items: [{ employeeMemberId: '', adminInput: {} }] }}
                >
                  <Form.Item name="templateId" label="템플릿" rules={[{ required: true, message: '템플릿을 선택해 주세요.' }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="활성 템플릿 선택"
                      options={activeTemplates.map((t) => ({
                        value: t.templateId,
                        label: `${t.templateName} (${CONTRACT_TYPE_LABEL[t.contractType as ContractType] ?? t.contractType})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item name="batchName" label="배치 이름" rules={[{ required: true, message: '배치 이름을 입력해 주세요.' }]}>
                    <Input placeholder="예: 2026년 연봉계약" maxLength={120} />
                  </Form.Item>
                  <Form.List name="items">
                    {(fields, { add, remove }) => (
                      <Space direction="vertical" className="tw-w-full" size={12}>
                        <div className="tw-flex tw-items-center tw-justify-end">
                          <Button onClick={() => setBatchRecipientPickerOpen(true)}>조직도에서 다중 추가</Button>
                        </div>
                        {fields.map((field, index) => (
                          <Card
                            key={field.key}
                            size="small"
                            title={`대상 ${index + 1}`}
                            extra={
                              fields.length > 1 ? (
                                <Button type="link" danger size="small" onClick={() => remove(field.name)}>
                                  삭제
                                </Button>
                              ) : null
                            }
                          >
                            <Form.Item name={[field.name, 'employeeMemberId']} label="직원" rules={[{ required: true, message: '직원을 선택해 주세요.' }]}>
                              <Select showSearch optionFilterProp="label" placeholder="직원 선택" options={memberOptions} />
                            </Form.Item>
                            {batchAdminInputFields.map((adminField) => (
                              <Form.Item key={`${field.key}-${adminField.name}`} name={[field.name, 'adminInput', adminField.name]} label={adminField.label}>
                                <ContractAdminFormFieldInput field={adminField} textAreaRows={2} />
                              </Form.Item>
                            ))}
                          </Card>
                        ))}
                        <Button onClick={() => add({ employeeMemberId: '', adminInput: {} })}>대상 직원 추가</Button>
                      </Space>
                    )}
                  </Form.List>
                  <div className="tw-mt-3 tw-flex tw-justify-end">
                    <Button type="primary" className={NAVY_BUTTON_CLASS} loading={sendBatchM.isPending} onClick={() => void submitBatchSend()}>
                      일괄 발송
                    </Button>
                  </div>
                </Form>
              </Card>
            </Space>
          </Card>
        )
      ) : null}

      {showTemplateSection ? (
      <AppDoubleActionModal
        title="새 계약서 양식"
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          createForm.resetFields();
          setCreateSchemaFields([]);
          setCreateMetaByName({});
        }}
        onConfirm={() => void submitCreate()}
        confirmText="등록"
        cancelText="취소"
        confirmLoading={createM.isPending}
        destroyOnHidden
        width={1040}
      >
        <div className="tw-max-h-[min(82vh,900px)] tw-overflow-y-auto tw-px-5 tw-py-4">
        <Form<CreateForm> form={createForm} layout="vertical" className="tw-pt-2">
          <Form.Item
            label="양식 필드"
            extra="전자결재 양식과 동일한 방식으로 관리합니다. 기존 source/sourceField/editable 메타는 키 기준으로 유지됩니다."
          >
            <ApprovalFormSchemaBuilder
              value={createSchemaFields}
              paperPreviewMeta={createContractPaperMeta}
              sidebarTop={
                <>
                  <Form.Item name="templateName" label="템플릿 이름" rules={[{ required: true, message: '이름을 입력해 주세요.' }]}>
                    <Input placeholder="예: 연봉계약서" maxLength={120} showCount />
                  </Form.Item>
                  <Form.Item name="contractType" label="계약 유형" rules={[{ required: true, message: '계약 유형을 선택해 주세요.' }]}>
                    <Select options={contractTypeOptions} placeholder="유형 선택" />
                  </Form.Item>
                </>
              }
              onChange={(next) => {
                setCreateSchemaFields(next);
                setCreateMetaByName((prev) => {
                  const merged: Record<string, ContractFieldMeta> = { ...prev };
                  for (const f of next) {
                    const key = f.name.trim();
                    if (!key) continue;
                    if (!merged[key]) {
                      merged[key] = { source: CONTRACT_FIELD_DEFAULT_SOURCE, editable: false };
                    }
                  }
                  return merged;
                });
              }}
            />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>
      ) : null}
      {showSendSection ? (
      <ContractRecipientOrgChartModal
        open={singleRecipientPickerOpen}
        initialSelectedMemberIds={
          singleSendForm.getFieldValue('employeeMemberId')
            ? [String(singleSendForm.getFieldValue('employeeMemberId'))]
            : []
        }
        onClose={() => setSingleRecipientPickerOpen(false)}
        onConfirm={handleAddSingleRecipientFromOrgChart}
      />
      ) : null}
      {showSendSection ? (
      <ContractRecipientOrgChartModal
        open={batchRecipientPickerOpen}
        initialSelectedMemberIds={
          (batchSendForm.getFieldValue('items') as Array<{ employeeMemberId?: string }> | undefined)?.map((item) =>
            String(item.employeeMemberId ?? '').trim(),
          ) ?? []
        }
        onClose={() => setBatchRecipientPickerOpen(false)}
        onConfirm={handleAddBatchRecipientsFromOrgChart}
      />
      ) : null}

      {showTemplateSection ? (
      <AppDoubleActionModal
        title={editing ? `계약서 양식 수정 — ${editing.templateName}` : '계약서 양식 수정'}
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
          setEditSchemaFields([]);
          setEditMetaByName({});
        }}
        onConfirm={() => void submitEdit()}
        confirmText="저장"
        cancelText="취소"
        confirmLoading={updateM.isPending}
        destroyOnHidden
        width={1040}
      >
        <div className="tw-max-h-[min(82vh,900px)] tw-overflow-y-auto tw-px-5 tw-py-4">
        <Form<EditForm> form={editForm} layout="vertical" className="tw-pt-2">
          <Form.Item
            label="양식 필드"
            extra="필드 키를 변경하면 기존 source/sourceField 메타 연결이 끊길 수 있습니다."
          >
            <ApprovalFormSchemaBuilder
              value={editSchemaFields}
              paperPreviewMeta={editContractPaperMeta}
              sidebarTop={
                <>
                  <Form.Item name="templateName" label="템플릿 이름" rules={[{ required: true, message: '이름을 입력해 주세요.' }]}>
                    <Input maxLength={120} showCount />
                  </Form.Item>
                  {editing ? (
                    <div className="tw-mb-1 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-3 tw-py-2.5">
                      <Typography.Text className="tw-mb-0.5 tw-block tw-text-[11px] tw-font-medium tw-text-slate-500">
                        계약 유형
                      </Typography.Text>
                      <Typography.Text className="tw-text-sm tw-text-slate-900">
                        {CONTRACT_TYPE_LABEL[editing.contractType]} ({editing.contractType})
                      </Typography.Text>
                    </div>
                  ) : null}
                </>
              }
              onChange={(next) => {
                setEditSchemaFields(next);
                setEditMetaByName((prev) => {
                  const merged: Record<string, ContractFieldMeta> = { ...prev };
                  for (const f of next) {
                    const key = f.name.trim();
                    if (!key) continue;
                    if (!merged[key]) {
                      merged[key] = { source: CONTRACT_FIELD_DEFAULT_SOURCE, editable: false };
                    }
                  }
                  return merged;
                });
              }}
            />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>
      ) : null}
    </>
  );
}
