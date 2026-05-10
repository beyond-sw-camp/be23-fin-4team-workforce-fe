import {
  ArrowRightOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserAddOutlined,
  } from '@ant-design/icons';
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
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
import { salaryApi } from '@/features/salary-service/api/salaryApi';
import {
  collectContractAdminInputFromForm,
  CONTRACT_FIELD_DEFAULT_SOURCE,
  CONTRACT_FIELD_STATIC_BLOCK_SOURCE,
  isContractAdminInputSource,
  parseContractFormSchema,
  type ContractFieldMeta,
} from '@/features/contracts/lib/parseContractFormSchema';
import { notifyContractSendDebug } from '@/features/contracts/lib/contractSendDebug';
import { ContractAdminFormFieldInput } from '@/features/contracts/ui/ContractAdminFormFieldInput';
import { CONTRACT_HUB_CARD_CLASS } from '@/features/contracts/ui/contractHubStyles';
import { ContractRecipientOrgChartModal } from '@/features/contracts/ui/ContractRecipientOrgChartModal';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

import { AppDataTable } from '@/shared/ui/AppDataTable';

const NAVY_BUTTON_CLASS =
  '!tw-border-0 !tw-bg-[#1e3a5f] !tw-text-white hover:!tw-bg-[#152a45] hover:!tw-text-white disabled:!tw-opacity-60';

const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  EMPLOYMENT: '근로계약서',
  SALARY: '연봉계약서',
  NDA: '비밀유지서약서',
  PRIVACY_CONSENT: '개인정보 수집·이용 동의서',
};

const getContractTypeLabel = (type?: string | null) => {
  if (type && type in CONTRACT_TYPE_LABEL) return CONTRACT_TYPE_LABEL[type as ContractType];
  return type?.trim() || '—';
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
function buildContractSchemaJson(
  fields: FormFieldSchema[],
  metaByName: Record<string, ContractFieldMeta>,
  formDescription?: string,
): string {
  const base = JSON.parse(serializeFormSchema(fields)) as {
    fields: Array<Record<string, unknown>>;
  };
  const contractFields = base.fields.map((f) => {
    const name = String(f.name ?? '').trim();
    const type = String(f.type ?? 'text');
    if (type === 'static_note') {
      const body = typeof f.staticText === 'string' ? String(f.staticText).trim() : '';
      return {
        key: name,
        label: String(f.label ?? ''),
        type: 'static_note',
        source: CONTRACT_FIELD_STATIC_BLOCK_SOURCE,
        editable: false,
        ...(body ? { staticText: body } : {}),
      };
    }
    const meta = metaByName[name];
    const source = meta?.source || CONTRACT_FIELD_DEFAULT_SOURCE;
    const sourceField = meta?.sourceField?.trim();
    const editable = meta?.editable === true;
    return {
      key: name,
      label: String(f.label ?? ''),
      type,
      source,
      ...(sourceField ? { sourceField } : {}),
      editable,
      ...(Array.isArray(f.options) && f.options.length > 0 ? { options: f.options } : {}),
    };
  });
  const desc = formDescription?.trim();
  const out: { fields: typeof contractFields; formDescription?: string } = {
    fields: contractFields,
  };
  if (desc) out.formDescription = desc;
  return JSON.stringify(out, null, 2);
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
  const [createFormDescription, setCreateFormDescription] = useState('');
  const [editFormDescription, setEditFormDescription] = useState('');
  const [singleRecipientPickerOpen, setSingleRecipientPickerOpen] = useState(false);
  const [batchRecipientPickerOpen, setBatchRecipientPickerOpen] = useState(false);
  const [singleSendModalOpen, setSingleSendModalOpen] = useState(false);
  const [batchSendModalOpen, setBatchSendModalOpen] = useState(false);

  const fullTemplatesQ = useQuery({
    queryKey: ['contract', 'templates'],
    queryFn: () => contractTemplateApi.list(),
    enabled: showTemplateSection && canRead,
    retry: false,
  });
  const activeTemplatesQ = useQuery({
    queryKey: ['contract', 'templates', 'active'],
    queryFn: () => contractTemplateApi.listActive(),
    enabled: showSendSection && !showTemplateSection && (canCreate || canRead),
    retry: false,
  });
  const templates = fullTemplatesQ.data ?? [];
  const isFetching = fullTemplatesQ.isFetching;
  const templatesError = fullTemplatesQ.error;
  const activeTemplatesFetchError = activeTemplatesQ.error;
  const activeTemplatesLoading = activeTemplatesQ.isFetching;
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
        formSchema: buildContractSchemaJson(
          createSchemaFields,
          createMetaByName,
          createFormDescription,
        ),
      }),
    onSuccess: () => {
      message.success('계약서 템플릿이 등록되었습니다.');
      setCreateOpen(false);
      createForm.resetFields();
      setCreateSchemaFields([]);
      setCreateMetaByName({});
      setCreateFormDescription('');
      void qc.invalidateQueries({ queryKey: ['contract', 'templates'] });
      void qc.invalidateQueries({ queryKey: ['contract', 'templates', 'active'] });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });

  const updateM = useMutation({
    mutationFn: ({ id, v }: { id: string; v: EditForm }) =>
      contractTemplateApi.update(id, {
        templateName: v.templateName.trim(),
        formSchema: buildContractSchemaJson(editSchemaFields, editMetaByName, editFormDescription),
      }),
    onSuccess: () => {
      message.success('계약서 템플릿이 수정되었습니다.');
      setEditOpen(false);
      setEditing(null);
      setEditSchemaFields([]);
      setEditMetaByName({});
      setEditFormDescription('');
      void qc.invalidateQueries({ queryKey: ['contract', 'templates'] });
      void qc.invalidateQueries({ queryKey: ['contract', 'templates', 'active'] });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });

  const activateM = useMutation({
    mutationFn: (id: string) => contractTemplateApi.activate(id),
    onSuccess: () => {
      message.success('템플릿을 활성화했습니다.');
      void qc.invalidateQueries({ queryKey: ['contract', 'templates'] });
      void qc.invalidateQueries({ queryKey: ['contract', 'templates', 'active'] });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });

  const deactivateM = useMutation({
    mutationFn: (id: string) => contractTemplateApi.deactivate(id),
    onSuccess: () => {
      message.success('템플릿을 비활성화했습니다.');
      void qc.invalidateQueries({ queryKey: ['contract', 'templates'] });
      void qc.invalidateQueries({ queryKey: ['contract', 'templates', 'active'] });
    },
    onError: (e: Error) => message.error(parseApiError(e).message),
  });
  const sendSingleM = useMutation({
    mutationFn: (payload: {
      templateId: string;
      employeeMemberId: string;
      adminInputJson: Record<string, unknown>;
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
      items: Array<{ employeeMemberId: string; adminInputJson: Record<string, unknown> }>;
    }) => contractTemplateApi.sendContractBatch(payload),
    onSuccess: (res: ContractBatchSendResult) => {
      message.success(
        `일괄 발송 완료: ${res.totalCount}건 (배치: ${res.batchName || res.batchId})`,
      );
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
      categoryLabel: getContractTypeLabel(
        createWatchContractType ? String(createWatchContractType) : undefined,
      ),
      requestTypeCode: createWatchContractType ? String(createWatchContractType) : 'CONTRACT',
    }),
    [createWatchTemplateName, createWatchContractType],
  );

  const editWatchTemplateName = Form.useWatch('templateName', editForm);
  const editContractPaperMeta = useMemo(
    () => ({
      documentName: String(editWatchTemplateName ?? editing?.templateName ?? '').trim() || '—',
      categoryLabel: getContractTypeLabel(editing?.contractType),
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
  const activeTemplates = useMemo(() => {
    if (showTemplateSection && canRead) return templates.filter((t) => t.isActiveYn === 'Y');
    return activeTemplatesQ.data ?? [];
  }, [showTemplateSection, canRead, templates, activeTemplatesQ.data]);
  const templateSelectLoading =
    showTemplateSection && canRead ? isFetching : activeTemplatesLoading;
  const singleTemplateId = Form.useWatch('templateId', singleSendForm);
  const batchTemplateId = Form.useWatch('templateId', batchSendForm);
  const watchedBatchName = Form.useWatch('batchName', batchSendForm);
  const watchedSingleEmployeeId = Form.useWatch('employeeMemberId', singleSendForm);

  // 회사 전체 활성 Salary 조회 - 직원 선택 시 현재 연봉 표시용
  const companySalariesQ = useQuery({
    queryKey: ['salary', 'listByCompany', 'contracts-send'],
    queryFn: () => salaryApi.salary.listByCompany(),
    staleTime: 5 * 60_000,
  });
  const baseSalaryByMember = useMemo(() => {
    const map = new Map<string, number>();
    (companySalariesQ.data ?? []).forEach((s) => {
      if (s.memberId && s.baseSalary != null) map.set(s.memberId, s.baseSalary);
    });
    return map;
  }, [companySalariesQ.data]);
  const selectedSingleBaseSalary = watchedSingleEmployeeId
    ? baseSalaryByMember.get(watchedSingleEmployeeId)
    : undefined;
  const selectedSingleTemplate = useMemo(
    () => activeTemplates.find((t) => t.templateId === singleTemplateId),
    [activeTemplates, singleTemplateId],
  );
  const selectedBatchTemplate = useMemo(
    () => activeTemplates.find((t) => t.templateId === batchTemplateId),
    [activeTemplates, batchTemplateId],
  );
  const singleTemplateParsed = useMemo(
    () =>
      selectedSingleTemplate
        ? parseContractFormSchema(selectedSingleTemplate.formSchema)
        : { fields: [], metaByName: {} },
    [selectedSingleTemplate],
  );
  const batchTemplateParsed = useMemo(
    () =>
      selectedBatchTemplate
        ? parseContractFormSchema(selectedBatchTemplate.formSchema)
        : { fields: [], metaByName: {} },
    [selectedBatchTemplate],
  );
  const singleAdminInputFields = useMemo(
    () =>
      singleTemplateParsed.fields.filter((f) =>
        isContractAdminInputSource(singleTemplateParsed.metaByName[f.name]?.source),
      ),
    [singleTemplateParsed],
  );
  const batchAdminInputFields = useMemo(
    () =>
      batchTemplateParsed.fields.filter((f) =>
        isContractAdminInputSource(batchTemplateParsed.metaByName[f.name]?.source),
      ),
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

  useEffect(() => {
    if (!singleTemplateId) return;
    singleSendForm.setFieldsValue({ adminInput: {} });
  }, [singleTemplateId, singleSendForm]);

  useEffect(() => {
    if (!batchTemplateId) return;
    const items = batchSendForm.getFieldValue('items') as BatchSendForm['items'] | undefined;
    if (!items?.length) return;
    const cleared = items.map((row) => ({ ...row, adminInput: {} }));
    batchSendForm.setFieldValue('items', cleared);
  }, [batchTemplateId, batchSendForm]);

  const openCreate = () => {
    const initial = parseContractFormSchema(
      JSON.stringify({
        fields: [
          {
            key: 'employeeName',
            label: '성명',
            type: 'text',
            source: 'AUTO',
            sourceField: 'name',
            editable: false,
          },
          {
            key: 'sabun',
            label: '사번',
            type: 'text',
            source: 'AUTO',
            sourceField: 'sabun',
            editable: false,
          },
          {
            key: 'organizationName',
            label: '부서',
            type: 'text',
            source: 'AUTO',
            sourceField: 'organizationName',
            editable: false,
          },
          {
            key: 'jobTitleName',
            label: '직책',
            type: 'text',
            source: 'AUTO',
            sourceField: 'jobTitleName',
            editable: false,
          },
          {
            key: 'baseSalary',
            label: '연봉',
            type: 'number',
            source: 'AUTO',
            sourceField: 'baseSalary',
            editable: false,
          },
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
    setCreateFormDescription('');
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
    setEditFormDescription(parsed.formDescription ?? '');
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
  const formatContractSendCatchMessage = (err: unknown): string => {
    if (err && typeof err === 'object' && 'errorFields' in err) {
      const ef = (err as { errorFields?: Array<{ errors?: string[] }> }).errorFields;
      const msg = ef?.find((f) => (f.errors?.length ?? 0) > 0)?.errors?.[0];
      return msg?.trim() ? msg.trim() : '필수 입력을 확인해 주세요.';
    }
    return parseApiError(err as Error).message;
  };

  const submitSingleSend = async () => {
    console.log('★★★ submitSingleSend 호출됨');
    console.info('[wf] submitSingleSend enter');
    notifyContractSendDebug(message, '[DEBUG] submitSingleSend 진입 (try 전)');
    try {
      await singleSendForm.validateFields();
      const templateId = String(singleSendForm.getFieldValue('templateId') ?? '').trim();
      const employeeMemberId = String(
        singleSendForm.getFieldValue('employeeMemberId') ?? '',
      ).trim();
      const adminKeys = singleAdminInputFields.map((f) => f.name);

      console.log('=== 계약 발송 디버그 ===');
      console.log('1. adminKeys:', adminKeys);
      console.log('2. 폼 전체 값:', singleSendForm.getFieldsValue(true));
      adminKeys.forEach((key) => {
        console.log(
          `3. getFieldValue(['adminInput', '${key}']):`,
          singleSendForm.getFieldValue(['adminInput', key]),
        );
      });

      const adminObj = collectContractAdminInputFromForm(
        (path) => singleSendForm.getFieldValue(path),
        adminKeys,
      );
      console.log('4. 수집된 adminObj:', adminObj);

      await sendSingleM.mutateAsync({
        templateId,
        employeeMemberId,
        adminInputJson: adminObj,
      });
    } catch (err) {
      console.error('★ submitSingleSend 에러:', err);
      message.error(formatContractSendCatchMessage(err));
    }
  };
  const submitBatchSend = async () => {
    try {
      await batchSendForm.validateFields();
      const templateId = String(batchSendForm.getFieldValue('templateId') ?? '').trim();
      const batchName = String(batchSendForm.getFieldValue('batchName') ?? '').trim();
      const rowCount =
        (batchSendForm.getFieldValue('items') as BatchSendForm['items'] | undefined)?.length ?? 0;
      const adminKeys = batchAdminInputFields.map((f) => f.name);
      const items: Array<{ employeeMemberId: string; adminInputJson: Record<string, unknown> }> =
        [];
      for (let i = 0; i < rowCount; i += 1) {
        const employeeMemberId = String(
          batchSendForm.getFieldValue(['items', i, 'employeeMemberId']) ?? '',
        ).trim();
        if (!employeeMemberId) continue;
        const adminObj = collectContractAdminInputFromForm(
          (path) => batchSendForm.getFieldValue(path),
          adminKeys,
          ['items', i],
        );
        items.push({ employeeMemberId, adminInputJson: adminObj });
      }
      if (items.length === 0) {
        message.warning('일괄 발송 대상 직원을 1명 이상 선택해 주세요.');
        return;
      }
      await sendBatchM.mutateAsync({
        templateId,
        batchName,
        items,
      });
    } catch (err) {
      console.error('★ submitBatchSend 에러:', err);
      message.error(formatContractSendCatchMessage(err));
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
    const picked = memberIds.map((id) => String(id ?? '').trim()).filter(Boolean);
    if (picked.length === 0) return;
    const current = batchSendForm.getFieldValue('items') as BatchSendForm['items'] | undefined;
    const existing = current ?? [];
    // 직원이 선택되지 않은 빈 행(초기 placeholder 등)은 조직도로 추가할 때 합치지 않음 — 조직 노드만 대상처럼 남는 칸 방지
    const existingFilled = existing.filter(
      (i) => String(i.employeeMemberId ?? '').trim().length > 0,
    );
    const existingIds = new Set(existingFilled.map((i) => String(i.employeeMemberId ?? '').trim()));
    const appended = picked
      .filter((id) => {
        if (existingIds.has(id)) return false;
        existingIds.add(id);
        return true;
      })
      .map((id) => ({ employeeMemberId: id, adminInput: {} as Record<string, unknown> }));
    if (appended.length === 0) {
      message.info('이미 추가된 직원입니다.');
      setBatchRecipientPickerOpen(false);
      return;
    }
    batchSendForm.setFieldValue('items', [...existingFilled, ...appended]);
    setBatchRecipientPickerOpen(false);
  };

  if (showTemplateSection && !canRead) {
    return (
      <Card className="tw-border-slate-200/80 tw-shadow-sm">
        <Typography.Paragraph type="secondary" className="!tw-mb-0">
          전자계약 양식을 보려면 <Typography.Text code>CONTRACT:READ</Typography.Text> 권한이
          필요합니다.
        </Typography.Paragraph>
      </Card>
    );
  }

  return (
    <>
      {showTemplateSection ? (
        <div className="tw-space-y-4">
          {templatesError ? (
            <Alert
              type="error"
              showIcon
              className="!tw-rounded-xl !tw-border-red-100 !tw-bg-red-50/70"
              message="전자계약 템플릿을 불러오지 못했습니다."
              description={parseApiError(templatesError).message}
            />
          ) : null}
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
            <div className="tw-min-w-0">
              <Typography.Text type="secondary" className="tw-block tw-text-sm">
                계약 유형과 필드 정의를 관리합니다. 발송 화면에는 활성 템플릿만 노출됩니다.
              </Typography.Text>
              <div className="tw-mt-2 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                <span className="tw-inline-flex tw-h-7 tw-items-center tw-rounded-full tw-bg-slate-100 tw-px-3 tw-text-xs tw-font-semibold tw-text-slate-700">
                  전체 {templates.length}개
                </span>
                <span className="tw-inline-flex tw-h-7 tw-items-center tw-rounded-full tw-bg-blue-50 tw-px-3 tw-text-xs tw-font-semibold tw-text-blue-700">
                  활성 {templates.filter((row) => row.isActiveYn === 'Y').length}개
                </span>
              </div>
            </div>
            <Space wrap size={8}>
              {canCreate ? (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  className={NAVY_BUTTON_CLASS}
                  onClick={openCreate}
                >
                  새 계약서 양식
                </Button>
              ) : null}
              <Button
                icon={<ReloadOutlined />}
                className="!tw-rounded-xl"
                onClick={() => void fullTemplatesQ.refetch()}
              >
                새로고침
              </Button>
            </Space>
          </div>
          <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200">
            <AppDataTable<ContractTemplate>
              rowKey="templateId"
              loading={isFetching}
              dataSource={templates}
              pagination={false}
              className="[&_.ant-table]:!tw-bg-white [&_.ant-table-thead>tr>th]:!tw-border-slate-200 [&_.ant-table-thead>tr>th]:!tw-bg-slate-50 [&_.ant-table-thead>tr>th]:!tw-px-4 [&_.ant-table-thead>tr>th]:!tw-py-3 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600 [&_.ant-table-tbody>tr>td]:!tw-border-slate-100 [&_.ant-table-tbody>tr>td]:!tw-px-4 [&_.ant-table-tbody>tr>td]:!tw-py-4 [&_.ant-table-tbody>tr:hover>td]:!tw-bg-slate-50/70"
              columns={[
                {
                  title: '템플릿명',
                  dataIndex: 'templateName',
                  key: 'templateName',
                  ellipsis: true,
                  render: (name: string) => (
                    <Typography.Text strong className="tw-text-[#1e3a5f]">
                      {name}
                    </Typography.Text>
                  ),
                },
                {
                  title: '계약 유형',
                  dataIndex: 'contractType',
                  key: 'contractType',
                  width: 200,
                  render: (t: string) => (
                    <Tag className="!tw-m-0 !tw-rounded-lg">
                      {CONTRACT_TYPE_LABEL[t as ContractType] ?? t}
                    </Tag>
                  ),
                },
                {
                  title: '사용 상태',
                  dataIndex: 'isActiveYn',
                  key: 'isActiveYn',
                  width: 150,
                  render: (yn: 'Y' | 'N', row) => (
                    <Space size={8}>
                      <Switch
                        size="small"
                        checked={yn === 'Y'}
                        disabled={!canUpdate}
                        loading={
                          (activateM.isPending || deactivateM.isPending) &&
                          (activateM.variables === row.templateId ||
                            deactivateM.variables === row.templateId)
                        }
                        onChange={(checked) =>
                          checked
                            ? activateM.mutate(row.templateId)
                            : deactivateM.mutate(row.templateId)
                        }
                      />
                      <Typography.Text className="tw-text-xs tw-font-semibold tw-text-slate-600">
                        {yn === 'Y' ? '활성' : '비활성'}
                      </Typography.Text>
                    </Space>
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
                  title: '작업',
                  key: 'actions',
                  width: 130,
                  render: (_, row) =>
                    canUpdate ? (
                      <Tooltip title="수정">
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          className="!tw-h-8 !tw-w-8 !tw-rounded-lg !tw-border-slate-200 !tw-p-0"
                          aria-label={`${row.templateName} 계약서 양식 수정`}
                          onClick={() => openEdit(row)}
                        />
                      </Tooltip>
                    ) : null,
                },
              ]}
            />
          </div>
        </div>
      ) : null}
      {showSendSection ? (
        /* split: 개별·일괄 발송 제출 → AppDoubleActionModal onConfirm. stacked: 카드 안 primary Button onClick. (계약 발송 페이지는 ContractSendPage에서 sendLayout="split") */
        sendLayout === 'split' ? (
          <>
            {showSendSection && !showTemplateSection && activeTemplatesFetchError ? (
              <Alert
                type="error"
                showIcon
                className="!tw-mb-3 !tw-rounded-xl !tw-border-red-100 !tw-bg-red-50/70"
                message="활성 템플릿을 불러오지 못했습니다."
                description={parseApiError(activeTemplatesFetchError).message}
              />
            ) : null}
            <div className="tw-grid tw-w-full tw-grid-cols-1 tw-gap-3 lg:tw-grid-cols-2">
              <Card
                className={`${CONTRACT_HUB_CARD_CLASS} tw-overflow-hidden [&_.ant-card-body]:tw-p-5`}
              >
                <div className="tw-flex tw-h-full tw-flex-col tw-gap-4 md:tw-flex-row md:tw-items-center">
                  <div className="tw-flex tw-size-10 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-xl tw-bg-slate-100 tw-text-[#1e3a5f]">
                    <UserAddOutlined className="tw-text-lg" />
                  </div>
                  <div className="tw-min-w-0 tw-flex-1">
                    <Typography.Text className="tw-block tw-text-base tw-font-semibold tw-text-slate-900">
                      개별 발송
                    </Typography.Text>
                    <Typography.Paragraph
                      type="secondary"
                      className="!tw-mb-0 !tw-mt-2 !tw-text-sm"
                    >
                      특정 인원에게 맞춤형 계약서를 전송합니다. 수정 사항이 잦은 입사 계약이나 연봉
                      협상에 적합합니다.
                    </Typography.Paragraph>
                  </div>
                  <Button
                    type="primary"
                    className={`${NAVY_BUTTON_CLASS} tw-shrink-0 md:tw-ml-4`}
                    onClick={() => setSingleSendModalOpen(true)}
                  >
                    개별 계약 발송 <ArrowRightOutlined />
                  </Button>
                </div>
              </Card>
              <Card
                className={`${CONTRACT_HUB_CARD_CLASS} tw-overflow-hidden [&_.ant-card-body]:tw-p-5`}
              >
                <div className="tw-flex tw-h-full tw-flex-col tw-gap-4 md:tw-flex-row md:tw-items-center">
                  <div className="tw-flex tw-size-10 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-xl tw-bg-blue-50 tw-text-blue-700">
                    <TeamOutlined className="tw-text-lg" />
                  </div>
                  <div className="tw-min-w-0 tw-flex-1">
                    <Typography.Text className="tw-block tw-text-base tw-font-semibold tw-text-slate-900">
                      일괄 발송
                    </Typography.Text>
                    <Typography.Paragraph
                      type="secondary"
                      className="!tw-mb-0 !tw-mt-2 !tw-text-sm"
                    >
                      대규모 인원에게 동일한 계약 서식을 일괄 전송합니다. 기업정보 처리 동의서나
                      전사 정책 안내 서명에 최적화되어 있습니다.
                    </Typography.Paragraph>
                  </div>
                  <Button
                    type="primary"
                    className={`${NAVY_BUTTON_CLASS} tw-shrink-0 md:tw-ml-4`}
                    onClick={() => setBatchSendModalOpen(true)}
                  >
                    일괄 계약 발송 <ArrowRightOutlined />
                  </Button>
                </div>
              </Card>
            </div>

            <AppDoubleActionModal
              title="개별 발송"
              open={singleSendModalOpen}
              onClose={() => setSingleSendModalOpen(false)}
              onConfirm={() => {
                notifyContractSendDebug(
                  message,
                  '[DEBUG] 모달 "계약서 발송" 클릭 → submitSingleSend 호출 직전',
                );
                void submitSingleSend();
              }}
              confirmText="계약서 발송"
              cancelText="닫기"
              confirmLoading={sendSingleM.isPending}
              destroyOnHidden={false}
              width={700}
            >
              <div className="tw-px-5 tw-py-4">
                <Form<SingleSendForm> form={singleSendForm} layout="vertical" className="tw-pt-2">
                  <Form.Item
                    name="templateId"
                    label="템플릿"
                    rules={[{ required: true, message: '템플릿을 선택해 주세요.' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      loading={templateSelectLoading}
                      placeholder="활성 템플릿 선택"
                      options={activeTemplates.map((t) => ({
                        value: t.templateId,
                        label: `${t.templateName} (${CONTRACT_TYPE_LABEL[t.contractType as ContractType] ?? t.contractType})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="employeeMemberId"
                    label="대상 직원"
                    rules={[{ required: true, message: '직원을 선택해 주세요.' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="직원 선택"
                      options={memberOptions}
                    />
                  </Form.Item>
                  <div className="tw--mt-1 tw-mb-2">
                    <Button onClick={() => setSingleRecipientPickerOpen(true)}>
                      조직도에서 선택
                    </Button>
                  </div>
                  {watchedSingleEmployeeId ? (
                    <div className="tw-mb-3 tw-rounded-md tw-bg-slate-50 tw-px-3 tw-py-2 tw-text-xs tw-text-slate-600">
                      현재 월 기본급:{' '}
                      <span className="tw-font-semibold tw-text-slate-900">
                        {selectedSingleBaseSalary != null
                          ? `${selectedSingleBaseSalary.toLocaleString()}원`
                          : '정보 없음'}
                      </span>
                      {selectedSingleBaseSalary != null ? (
                        <>
                          {' '}· 연봉 환산:{' '}
                          <span className="tw-font-semibold tw-text-slate-900">
                            {(selectedSingleBaseSalary * 12).toLocaleString()}원
                          </span>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {singleAdminInputFields.map((field) => (
                    <Form.Item
                      key={field.name}
                      name={['adminInput', field.name]}
                      label={field.label}
                    >
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
              destroyOnHidden={false}
              width={820}
            >
              <div className="tw-px-5 tw-py-4">
                <Form<BatchSendForm>
                  form={batchSendForm}
                  layout="vertical"
                  className="tw-pt-2"
                  initialValues={{ items: [{ employeeMemberId: '', adminInput: {} }] }}
                >
                  <Form.Item
                    name="templateId"
                    label="템플릿"
                    rules={[{ required: true, message: '템플릿을 선택해 주세요.' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      loading={templateSelectLoading}
                      placeholder="활성 템플릿 선택"
                      options={activeTemplates.map((t) => ({
                        value: t.templateId,
                        label: `${t.templateName} (${CONTRACT_TYPE_LABEL[t.contractType as ContractType] ?? t.contractType})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="batchName"
                    label="배치 이름"
                    rules={[{ required: true, message: '배치 이름을 입력해 주세요.' }]}
                  >
                    <Input placeholder="예: 2026년 연봉계약" maxLength={120} />
                  </Form.Item>
                  <Form.List name="items">
                    {(fields, { add, remove }) => (
                      <Space direction="vertical" className="tw-w-full" size={12}>
                        <div className="tw-flex tw-items-center tw-justify-end">
                          <Button onClick={() => setBatchRecipientPickerOpen(true)}>
                            조직도에서 다중 추가
                          </Button>
                        </div>
                        {fields.map((field, index) => (
                          <Card
                            key={field.key}
                            size="small"
                            title={`대상 ${index + 1}`}
                            extra={
                              fields.length > 1 ? (
                                <Button
                                  type="link"
                                  danger
                                  size="small"
                                  onClick={() => remove(field.name)}
                                >
                                  삭제
                                </Button>
                              ) : null
                            }
                          >
                            <Form.Item
                              name={[field.name, 'employeeMemberId']}
                              label="직원"
                              rules={[{ required: true, message: '직원을 선택해 주세요.' }]}
                            >
                              <Select
                                showSearch
                                optionFilterProp="label"
                                placeholder="직원 선택"
                                options={memberOptions}
                              />
                            </Form.Item>
                            {batchAdminInputFields.map((adminField) => (
                              <Form.Item
                                key={`${field.key}-${adminField.name}`}
                                name={[field.name, 'adminInput', adminField.name]}
                                label={adminField.label}
                              >
                                <ContractAdminFormFieldInput field={adminField} textAreaRows={2} />
                              </Form.Item>
                            ))}
                          </Card>
                        ))}
                        <Button onClick={() => add({ employeeMemberId: '', adminInput: {} })}>
                          대상 직원 추가
                        </Button>
                      </Space>
                    )}
                  </Form.List>
                </Form>
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
                    loading={templateSelectLoading}
                    placeholder="활성 템플릿 선택"
                    options={activeTemplates.map((t) => ({
                      value: t.templateId,
                      label: `${t.templateName} (${CONTRACT_TYPE_LABEL[t.contractType as ContractType] ?? t.contractType})`,
                    }))}
                  />
                </Form.Item>
                <Form.Item name="batchName" label="발송 제목" rules={[{ required: true, message: '발송 제목을 입력해 주세요.' }]}>
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
              활성 템플릿을 선택한 뒤 개별 또는 일괄 발송할 수 있습니다. AUTO 필드는 시스템이 채우고
              ADMIN_INPUT만 입력해 발송합니다.
            </Typography.Paragraph>
            {showSendSection && !showTemplateSection && activeTemplatesFetchError ? (
              <Alert
                type="error"
                showIcon
                className="tw-mb-4"
                message="활성 템플릿을 불러오지 못했습니다."
                description={parseApiError(activeTemplatesFetchError).message}
              />
            ) : null}
            <Space direction="vertical" className="tw-w-full" size={18}>
              <section className="tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-white tw-p-4">
                <Typography.Text strong className="tw-mb-3 tw-block tw-text-sm">
                  개별 발송
                </Typography.Text>
                <Form<SingleSendForm> form={singleSendForm} layout="vertical" className="tw-pt-1">
                  <Form.Item
                    name="templateId"
                    label="템플릿"
                    rules={[{ required: true, message: '템플릿을 선택해 주세요.' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      loading={templateSelectLoading}
                      placeholder="활성 템플릿 선택"
                      options={activeTemplates.map((t) => ({
                        value: t.templateId,
                        label: `${t.templateName} (${CONTRACT_TYPE_LABEL[t.contractType as ContractType] ?? t.contractType})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="employeeMemberId"
                    label="대상 직원"
                    rules={[{ required: true, message: '직원을 선택해 주세요.' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="직원 선택"
                      options={memberOptions}
                    />
                  </Form.Item>
                  <div className="tw--mt-1 tw-mb-2">
                    <Button onClick={() => setSingleRecipientPickerOpen(true)}>
                      조직도에서 선택
                    </Button>
                  </div>
                  {watchedSingleEmployeeId ? (
                    <div className="tw-mb-3 tw-rounded-md tw-bg-slate-50 tw-px-3 tw-py-2 tw-text-xs tw-text-slate-600">
                      현재 월 기본급:{' '}
                      <span className="tw-font-semibold tw-text-slate-900">
                        {selectedSingleBaseSalary != null
                          ? `${selectedSingleBaseSalary.toLocaleString()}원`
                          : '정보 없음'}
                      </span>
                      {selectedSingleBaseSalary != null ? (
                        <>
                          {' '}· 연봉 환산:{' '}
                          <span className="tw-font-semibold tw-text-slate-900">
                            {(selectedSingleBaseSalary * 12).toLocaleString()}원
                          </span>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {singleAdminInputFields.map((field) => (
                    <Form.Item
                      key={field.name}
                      name={['adminInput', field.name]}
                      label={field.label}
                    >
                      <ContractAdminFormFieldInput field={field} textAreaRows={3} />
                    </Form.Item>
                  ))}
                  <div className="tw-flex tw-justify-end">
                    <Button
                      type="primary"
                      className={NAVY_BUTTON_CLASS}
                      loading={sendSingleM.isPending}
                      onClick={() => void submitSingleSend()}
                    >
                      계약서 발송
                    </Button>
                  </div>
                </Form>
              </section>
              <Divider className="!tw-my-0" />
              <section className="tw-rounded-xl tw-border tw-border-slate-200/90 tw-bg-white tw-p-4">
                <Typography.Text strong className="tw-mb-3 tw-block tw-text-sm">
                  일괄 발송
                </Typography.Text>
                <Form<BatchSendForm>
                  form={batchSendForm}
                  layout="vertical"
                  className="tw-pt-1"
                  initialValues={{ items: [{ employeeMemberId: '', adminInput: {} }] }}
                >
                  <Form.Item
                    name="templateId"
                    label="템플릿"
                    rules={[{ required: true, message: '템플릿을 선택해 주세요.' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      loading={templateSelectLoading}
                      placeholder="활성 템플릿 선택"
                      options={activeTemplates.map((t) => ({
                        value: t.templateId,
                        label: `${t.templateName} (${CONTRACT_TYPE_LABEL[t.contractType as ContractType] ?? t.contractType})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item name="batchName" label="발송 제목" rules={[{ required: true, message: '발송 제목을 입력해 주세요.' }]}>
                    <Input placeholder="예: 2026년 연봉계약" maxLength={120} />
                  </Form.Item>
                  <Form.List name="items">
                    {(fields, { add, remove }) => (
                      <Space direction="vertical" className="tw-w-full" size={12}>
                        <div className="tw-flex tw-items-center tw-justify-end">
                          <Button onClick={() => setBatchRecipientPickerOpen(true)}>
                            조직도에서 다중 추가
                          </Button>
                        </div>
                        {fields.map((field, index) => (
                          <div
                            key={field.key}
                            className="tw-rounded-xl tw-border tw-border-slate-200/80 tw-bg-slate-50/70 tw-p-4"
                          >
                            <div className="tw-mb-3 tw-flex tw-items-center tw-justify-between tw-gap-2">
                              <Typography.Text strong className="tw-text-sm">
                                대상 {index + 1}
                              </Typography.Text>
                              {fields.length > 1 ? (
                                <Button
                                  type="link"
                                  danger
                                  size="small"
                                  onClick={() => remove(field.name)}
                                >
                                  삭제
                                </Button>
                              ) : null}
                            </div>
                            <Form.Item
                              name={[field.name, 'employeeMemberId']}
                              label="직원"
                              rules={[{ required: true, message: '직원을 선택해 주세요.' }]}
                            >
                              <Select
                                showSearch
                                optionFilterProp="label"
                                placeholder="직원 선택"
                                options={memberOptions}
                              />
                            </Form.Item>
                            {batchAdminInputFields.map((adminField) => (
                              <Form.Item
                                key={`${field.key}-${adminField.name}`}
                                name={[field.name, 'adminInput', adminField.name]}
                                label={adminField.label}
                              >
                                <ContractAdminFormFieldInput field={adminField} textAreaRows={2} />
                              </Form.Item>
                            ))}
                          </div>
                        ))}
                        <Button onClick={() => add({ employeeMemberId: '', adminInput: {} })}>
                          대상 직원 추가
                        </Button>
                      </Space>
                    )}
                  </Form.List>
                  <div className="tw-mt-3 tw-flex tw-justify-end">
                    <Button
                      type="primary"
                      className={NAVY_BUTTON_CLASS}
                      loading={sendBatchM.isPending}
                      onClick={() => void submitBatchSend()}
                    >
                      일괄 발송
                    </Button>
                  </div>
                </Form>
              </section>
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
            setCreateFormDescription('');
          }}
          onConfirm={() => void submitCreate()}
          confirmText="등록"
          cancelText="취소"
          confirmLoading={createM.isPending}
          destroyOnHidden
          width={1120}
        >
          <div className="tw-px-6 tw-py-5 sm:tw-px-7">
            <Form<CreateForm> form={createForm} layout="vertical">
              <Form.Item
                label="양식 필드"
                extra="전자결재 양식과 동일한 방식으로 관리합니다. 기존 source/sourceField/editable 메타는 키 기준으로 유지됩니다."
              >
                <ApprovalFormSchemaBuilder
                  value={createSchemaFields}
                  paperPreviewMeta={createContractPaperMeta}
                  sidebarTop={
                    <>
                      <Form.Item
                        name="templateName"
                        label="템플릿 이름"
                        rules={[{ required: true, message: '이름을 입력해 주세요.' }]}
                      >
                        <Input placeholder="예: 연봉계약서" maxLength={120} showCount />
                      </Form.Item>
                      <Form.Item
                        name="contractType"
                        label="계약 유형"
                        rules={[{ required: true, message: '계약 유형을 선택해 주세요.' }]}
                      >
                        <Select options={contractTypeOptions} placeholder="유형 선택" />
                      </Form.Item>
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-font-medium tw-text-slate-700">
                          인사팀 안내 문구
                        </Typography.Text>
                        <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-[11px]">
                          내 계약 상세·서명 화면에서 직원에게 표시됩니다. (선택)
                        </Typography.Paragraph>
                        <Input.TextArea
                          rows={4}
                          value={createFormDescription}
                          onChange={(e) => setCreateFormDescription(e.target.value)}
                          placeholder="예: 서명 전 연봉표·특약 사항을 반드시 확인하세요."
                          maxLength={4000}
                          showCount
                          className="tw-resize-y"
                        />
                      </div>
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
                          merged[key] =
                            f.type === 'static_note'
                              ? { source: CONTRACT_FIELD_STATIC_BLOCK_SOURCE, editable: false }
                              : { source: CONTRACT_FIELD_DEFAULT_SOURCE, editable: false };
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
            singleRecipientPickerOpen && (sendLayout !== 'split' || singleSendModalOpen)
              ? (() => {
                  const id = singleSendForm.getFieldValue('employeeMemberId');
                  return id ? [String(id)] : [];
                })()
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
            batchRecipientPickerOpen && (sendLayout !== 'split' || batchSendModalOpen)
              ? ((
                  batchSendForm.getFieldValue('items') as
                    | Array<{ employeeMemberId?: string }>
                    | undefined
                )
                  ?.map((item) => String(item.employeeMemberId ?? '').trim())
                  .filter(Boolean) ?? [])
              : []
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
            setEditFormDescription('');
          }}
          onConfirm={() => void submitEdit()}
          confirmText="저장"
          cancelText="취소"
          confirmLoading={updateM.isPending}
          destroyOnHidden
          width={1120}
        >
          <div className="tw-px-6 tw-py-5 sm:tw-px-7">
            <Form<EditForm> form={editForm} layout="vertical">
              <Form.Item
                label="양식 필드"
                extra="필드 키를 변경하면 기존 source/sourceField 메타 연결이 끊길 수 있습니다."
              >
                <ApprovalFormSchemaBuilder
                  value={editSchemaFields}
                  paperPreviewMeta={editContractPaperMeta}
                  sidebarTop={
                    <>
                      <Form.Item
                        name="templateName"
                        label="템플릿 이름"
                        rules={[{ required: true, message: '이름을 입력해 주세요.' }]}
                      >
                        <Input maxLength={120} showCount />
                      </Form.Item>
                      {editing ? (
                        <div className="tw-mb-1 tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-px-3 tw-py-2.5">
                          <Typography.Text className="tw-mb-0.5 tw-block tw-text-[11px] tw-font-medium tw-text-slate-500">
                            계약 유형
                          </Typography.Text>
                          <Typography.Text className="tw-text-sm tw-text-slate-900">
                            {getContractTypeLabel(editing.contractType)} ({editing.contractType})
                          </Typography.Text>
                        </div>
                      ) : null}
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-font-medium tw-text-slate-700">
                          인사팀 안내 문구
                        </Typography.Text>
                        <Typography.Paragraph type="secondary" className="!tw-mb-2 !tw-text-[11px]">
                          내 계약 상세·서명 화면에서 직원에게 표시됩니다. (선택)
                        </Typography.Paragraph>
                        <Input.TextArea
                          rows={4}
                          value={editFormDescription}
                          onChange={(e) => setEditFormDescription(e.target.value)}
                          placeholder="예: 서명 전 연봉표·특약 사항을 반드시 확인하세요."
                          maxLength={4000}
                          showCount
                          className="tw-resize-y"
                        />
                      </div>
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
                          merged[key] =
                            f.type === 'static_note'
                              ? { source: CONTRACT_FIELD_STATIC_BLOCK_SOURCE, editable: false }
                              : { source: CONTRACT_FIELD_DEFAULT_SOURCE, editable: false };
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
