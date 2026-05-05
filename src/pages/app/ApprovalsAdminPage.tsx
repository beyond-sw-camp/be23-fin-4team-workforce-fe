import { DeleteOutlined, EyeOutlined, FormOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  APPROVAL_REQUEST_TYPES,
  approvalApi,
  type ApprovalDocument,
  type ApprovalRequestType,
} from '@/features/approvals/api/approvalApi';
import {
  APPROVAL_REQUEST_TYPE_LABEL_KO,
  approvalRequestTypeLabelKo,
} from '@/features/approvals/lib/approvalRequestTypeKo';
import {
  ApprovalFormSchemaBuilder,
  defaultSchemaFields,
  serializeFormSchema,
  validateSchemaFieldsForSubmit,
} from '@/features/approvals/ui/ApprovalFormSchemaBuilder';
import { parseFormSchema, type FormFieldSchema } from '@/features/approvals/lib/approvalFormSchema';
import { parseApiError } from '@/shared/api/error-parser';
import { flattenOrganizationsWithMeta } from '@/features/organization/lib/flattenOrganizationTree';
import { organizationApi } from '@/features/organization/api/organizationApi';
import { companyApi } from '@/features/organization/api/companyApi';
import { useAuth } from '@/features/auth/useAuth';
import { PERM } from '@/features/permissions/backend-permissions';
import {
  canAccessMemberDirectoryFromPermissionStrings,
  isHrTeamMember,
} from '@/features/permissions/member-directory-access';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import { ContractTemplatesAdminPanel } from '@/features/contracts/ui/ContractTemplatesAdminPanel';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';

type DocForm = {
  documentName: string;
  requestType: ApprovalRequestType;
};
const NAVY_BUTTON_CLASS =
  '!tw-border-0 !tw-bg-[#1e3a5f] !tw-text-white hover:!tw-bg-[#152a45] hover:!tw-text-white disabled:!tw-opacity-60';
const ADMIN_SHELL_CARD_CLASS =
  'tw-overflow-hidden tw-rounded-2xl tw-border-slate-200/80 tw-bg-white tw-shadow-[0_1px_3px_rgba(15,23,42,0.06)] [&_.ant-card-body]:tw-px-5 [&_.ant-card-body]:tw-pb-8 [&_.ant-card-body]:tw-pt-6 sm:[&_.ant-card-body]:tw-px-7';
const ADMIN_TABS_CLASS =
  '[&_.ant-tabs-nav]:tw-mb-4 [&_.ant-tabs-tab]:!tw-text-slate-600 [&_.ant-tabs-tab-active_.ant-tabs-tab-btn]:!tw-font-semibold [&_.ant-tabs-tab-active_.ant-tabs-tab-btn]:!tw-text-[#1e3a5f] [&_.ant-tabs-ink-bar]:!tw-bg-[#1e3a5f]';

type PolicyLineDraft = {
  key: string;
  jobTitleId: string;
  stepOrder: number;
  organizationId: string | null;
};

type JobTitleOption = {
  value: string;
  label: string;
};

function parseJobTitleOptions(raw: Array<Record<string, unknown>>): JobTitleOption[] {
  return raw
    .map((row) => {
      const idRaw =
        row.jobTitleId ?? row.job_title_id ?? row.id ?? row.uuid ?? row.jobTitleUuid ?? row.job_title_uuid;
      const nameRaw = row.jobTitleName ?? row.job_title_name ?? row.name ?? row.title;
      const value = typeof idRaw === 'string' ? idRaw.trim() : '';
      const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
      if (!value) return null;
      return { value, label: name || value };
    })
    .filter((item): item is JobTitleOption => item != null)
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

const CAL_FIELD_NONE = '__none__';

function buildSchemaFieldOptions(fields: FormFieldSchema[]) {
  return fields.map((f) => ({
    value: f.name,
    label: `${f.type === 'static_note' ? f.label.trim() || '안내 문구' : f.label} (${f.name})`,
  }));
}

/** 캘린더 시작일·종료일 연동: 날짜 입력 타입 필드만 선택 가능 */
function buildCalendarDateFieldOptions(fields: FormFieldSchema[]) {
  return buildSchemaFieldOptions(
    fields.filter((f) => f.type === 'date' || f.type === 'datetime-local'),
  );
}

function isCalendarDateFieldType(type: FormFieldSchema['type']): boolean {
  return type === 'date' || type === 'datetime-local';
}

/** 스키마에 있는 필드명인데 날짜 타입이 아니면 메시지 반환(타입 변경 등 레거시 선택 방지) */
function calendarDateFieldTypeError(
  fields: FormFieldSchema[],
  fieldName: string | undefined,
  roleLabel: string,
): string | null {
  const v = (fieldName ?? '').trim();
  if (!v || v === CAL_FIELD_NONE) return null;
  const f = fields.find((x) => x.name === v);
  if (!f) return null;
  if (!isCalendarDateFieldType(f.type)) {
    return `${roleLabel}은 날짜 또는 날짜·시간 형식 필드만 선택할 수 있습니다.`;
  }
  return null;
}

function withOrphanFieldOption(
  options: { value: string; label: string }[],
  currentValue: string | undefined,
  orphanLabel = '(스키마에 없음)',
) {
  const v = (currentValue ?? '').trim();
  if (!v) return options;
  const names = new Set(options.map((o) => o.value));
  if (names.has(v)) return options;
  return [...options, { value: v, label: `${v} ${orphanLabel}` }];
}

function withOptionalNoneOption(
  options: { value: string; label: string }[],
  currentValue?: string | undefined,
  orphanLabel = '(스키마에 없음)',
) {
  const names = new Set(options.map((o) => o.value));
  const out = [{ value: CAL_FIELD_NONE, label: '없음' }, ...options];
  if (currentValue && currentValue !== CAL_FIELD_NONE && !names.has(currentValue)) {
    out.push({ value: currentValue, label: `${currentValue} ${orphanLabel}` });
  }
  return out;
}

function validatePolicyLines(rows: PolicyLineDraft[]) {
  if (rows.length === 0) return '정책라인을 1개 이상 추가해 주세요.';
  const sorted = [...rows].sort((a, b) => a.stepOrder - b.stepOrder);
  const seen = new Set<number>();
  for (const [i, row] of sorted.entries()) {
    if (!row.jobTitleId) return `${row.stepOrder}단계의 직책을 선택해 주세요.`;
    if (row.stepOrder < 1) return '결재 순서는 1 이상이어야 합니다.';
    if (seen.has(row.stepOrder)) return '결재 순서가 중복되었습니다.';
    seen.add(row.stepOrder);
    if (row.stepOrder !== i + 1) return '결재 순서는 1부터 연속된 값이어야 합니다.';
  }
  return null;
}

export function ApprovalsAdminPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const isSystemAdmin = user?.isSystemAdmin === true;
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'policy-lines' | 'contract-templates' | 'seal-management'>('documents');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [policyDrafts, setPolicyDrafts] = useState<PolicyLineDraft[]>([]);
  const [sealFile, setSealFile] = useState<File | null>(null);
  const [sealPreviewUrl, setSealPreviewUrl] = useState<string | null>(null);
  const sealInputRef = useRef<HTMLInputElement | null>(null);
  const [schemaFields, setSchemaFields] = useState<FormFieldSchema[]>(() => defaultSchemaFields());
  const [form] = Form.useForm<DocForm>();
  const [editOpen, setEditOpen] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [editSchemaFields, setEditSchemaFields] = useState<FormFieldSchema[]>([]);

  const [createCalVisible, setCreateCalVisible] = useState(false);
  const [createCalDisplayName, setCreateCalDisplayName] = useState('');
  const [createCalStartField, setCreateCalStartField] = useState<string | undefined>(undefined);
  const [createCalEndField, setCreateCalEndField] = useState<string>(CAL_FIELD_NONE);
  const [createCalTitleField, setCreateCalTitleField] = useState<string>(CAL_FIELD_NONE);

  const [editCalVisible, setEditCalVisible] = useState(false);
  const [editCalDisplayName, setEditCalDisplayName] = useState('');
  const [editCalStartField, setEditCalStartField] = useState<string | undefined>(undefined);
  const [editCalEndField, setEditCalEndField] = useState<string>(CAL_FIELD_NONE);
  const [editCalTitleField, setEditCalTitleField] = useState<string>(CAL_FIELD_NONE);

  useEffect(() => {
    if (!sealFile) {
      setSealPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(sealFile);
    setSealPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [sealFile]);

  const canRead = isSystemAdmin || hasPermission(PERM.APPROVAL_AD_READ);
  const canCreate = isSystemAdmin || hasPermission(PERM.APPROVAL_AD_CREATE);
  const canUpdate = isSystemAdmin || hasPermission(PERM.APPROVAL_AD_UPDATE);
  const canDelete = isSystemAdmin || hasPermission(PERM.APPROVAL_AD_DELETE);

  const { data: documents = [], isFetching: docsLoading } = useQuery({
    queryKey: ['approval', 'documents', 'all'],
    queryFn: () => approvalApi.listDocuments(),
    enabled: canRead,
  });

  const { data: activeDocuments = [] } = useQuery({
    queryKey: ['approval', 'documents', 'active'],
    queryFn: () => approvalApi.listActiveDocuments(),
  });

  const { data: companyInfo, isFetching: companyInfoLoading } = useQuery({
    queryKey: ['company', 'info'],
    queryFn: () => companyApi.getCompanyInfo(),
    enabled: canRead,
    staleTime: 30_000,
  });

  const { data: jobTitleRaw = [] } = useQuery({
    queryKey: ['organization', 'job-title', 'list'],
    queryFn: () => organizationApi.listJobTitles(),
    staleTime: 60_000,
  });

  const { data: orgTree = [] } = useQuery({
    queryKey: ['organization', 'list'],
    queryFn: () => organizationApi.list(),
    staleTime: 60_000,
  });

  const jobTitleOptions = useMemo(() => parseJobTitleOptions(jobTitleRaw), [jobTitleRaw]);
  const orgOptions = useMemo(() => {
    const flat = flattenOrganizationsWithMeta(orgTree);
    return flat.map((row) => ({
      value: row.id,
      label: `${'  '.repeat(row.depth)}${row.name}`,
    }));
  }, [orgTree]);

  const { data: policyLines = [], isFetching: policyLoading } = useQuery({
    queryKey: ['approval', 'policy-lines', selectedDocumentId],
    queryFn: () => approvalApi.getPolicyLines(selectedDocumentId),
    enabled: selectedDocumentId.length > 0,
  });

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.documentId === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );
  useEffect(() => {
    if (!selectedDocumentId && documents.length > 0) {
      const firstDocument = documents[0];
      if (firstDocument) {
        setSelectedDocumentId(firstDocument.documentId);
      }
    }
  }, [documents, selectedDocumentId]);

  useEffect(() => {
    setPolicyDrafts(
      policyLines.map((line) => ({
        key: line.policyLineId || `${line.documentId}-${line.stepOrder}`,
        jobTitleId: line.jobTitleId,
        stepOrder: line.stepOrder,
        organizationId: line.organizationId,
      })),
    );
  }, [policyLines]);

  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: ['approval'] });
  };

  const createDocumentM = useMutation({
    mutationFn: approvalApi.createDocument,
    onSuccess: async () => {
      message.success('양식을 생성했습니다.');
      setCreateOpen(false);
      form.resetFields();
      setSchemaFields(defaultSchemaFields());
      setCreateCalVisible(false);
      setCreateCalDisplayName('');
      setCreateCalStartField(undefined);
      setCreateCalEndField(CAL_FIELD_NONE);
      setCreateCalTitleField(CAL_FIELD_NONE);
      await refreshAll();
    },
    onError: (e: unknown) => message.error(parseApiError(e).message || '양식 생성에 실패했습니다.'),
  });

  const updateDocumentM = useMutation({
    mutationFn: ({
      documentId,
      formSchema,
      isCalendarVisibleYn,
      calendarDisplayName,
      calendarStartField,
      calendarEndField,
      calendarTitleField,
    }: {
      documentId: string;
      formSchema: string;
      isCalendarVisibleYn: 'Y' | 'N';
      calendarDisplayName: string | null;
      calendarStartField: string | null;
      calendarEndField: string | null;
      calendarTitleField: string | null;
    }) =>
      approvalApi.updateDocument(documentId, {
        formSchema,
        isCalendarVisibleYn,
        calendarDisplayName,
        calendarStartField,
        calendarEndField,
        calendarTitleField,
      }),
    onSuccess: async () => {
      message.success('양식을 수정했습니다.');
      setEditOpen(false);
      setEditingDocumentId(null);
      setEditSchemaFields([]);
      setEditCalVisible(false);
      setEditCalDisplayName('');
      setEditCalStartField(undefined);
      setEditCalEndField(CAL_FIELD_NONE);
      setEditCalTitleField(CAL_FIELD_NONE);
      await refreshAll();
    },
    onError: (e: unknown) => message.error(parseApiError(e).message || '양식 수정에 실패했습니다.'),
  });

  const activateM = useMutation({
    mutationFn: (documentId: string) => approvalApi.activateDocument(documentId),
    onSuccess: async () => {
      message.success('양식을 활성화했습니다.');
      await refreshAll();
    },
    onError: (e: Error) => message.error(e.message || '활성화에 실패했습니다.'),
  });

  const deactivateM = useMutation({
    mutationFn: (documentId: string) => approvalApi.deactivateDocument(documentId),
    onSuccess: async () => {
      message.success('양식을 비활성화했습니다.');
      await refreshAll();
    },
    onError: (e: Error) => message.error(e.message || '비활성화에 실패했습니다.'),
  });

  const savePolicyLineM = useMutation({
    mutationFn: approvalApi.savePolicyLines,
    onSuccess: async () => {
      message.success('정책라인을 저장했습니다.');
      await refreshAll();
    },
    onError: (e: Error) => message.error(e.message || '정책라인 저장에 실패했습니다.'),
  });

  const deletePolicyLineM = useMutation({
    mutationFn: (documentId: string) => approvalApi.deletePolicyLines(documentId),
    onSuccess: async () => {
      message.success('정책라인을 삭제했습니다.');
      await refreshAll();
      setPolicyDrafts([]);
    },
    onError: (e: Error) => message.error(e.message || '정책라인 삭제에 실패했습니다.'),
  });

  const updateSealM = useMutation({
    mutationFn: (file: File) => companyApi.updateSeal(file),
    onSuccess: async () => {
      message.success('회사 인감이 등록되었습니다.');
      setSealFile(null);
      await qc.invalidateQueries({ queryKey: ['company', 'info'] });
    },
    onError: (e: Error) => message.error(e.message || '회사 인감 등록에 실패했습니다.'),
  });

  const handleOpenCreate = () => {
    setCreateOpen(true);
    setSchemaFields(defaultSchemaFields());
    setCreateCalVisible(false);
    setCreateCalDisplayName('');
    setCreateCalStartField(undefined);
    setCreateCalEndField(CAL_FIELD_NONE);
    setCreateCalTitleField(CAL_FIELD_NONE);
    form.setFieldsValue({
      documentName: '',
      requestType: 'GENERAL',
    });
  };

  const editingDocument = useMemo(
    () => (editingDocumentId ? documents.find((d) => d.documentId === editingDocumentId) ?? null : null),
    [documents, editingDocumentId],
  );

  const createWatchName = Form.useWatch('documentName', form);
  const createWatchType = Form.useWatch('requestType', form);
  const createPaperPreviewMeta = useMemo(
    () => ({
      documentName: String(createWatchName ?? '').trim() || '—',
      categoryLabel: createWatchType ? approvalRequestTypeLabelKo(String(createWatchType)) : '—',
      requestTypeCode: createWatchType ? String(createWatchType) : '—',
    }),
    [createWatchName, createWatchType],
  );

  const editPaperPreviewMeta = useMemo(() => {
    if (!editingDocument) {
      return { documentName: '—', categoryLabel: '—', requestTypeCode: '—' };
    }
    return {
      documentName: editingDocument.documentName,
      categoryLabel: approvalRequestTypeLabelKo(String(editingDocument.requestType)),
      requestTypeCode: editingDocument.requestType,
    };
  }, [editingDocument]);

  const handleOpenEdit = (doc: ApprovalDocument) => {
    setEditingDocumentId(doc.documentId);
    const parsed = parseFormSchema(doc.formSchema);
    setEditSchemaFields(parsed.fields);
    setEditCalVisible(doc.isCalendarVisibleYn === 'Y');
    setEditCalDisplayName((doc.calendarDisplayName ?? '').trim());
    setEditCalStartField((doc.calendarStartField ?? '').trim() || undefined);
    setEditCalEndField((doc.calendarEndField ?? '').trim() || CAL_FIELD_NONE);
    setEditCalTitleField((doc.calendarTitleField ?? '').trim() || CAL_FIELD_NONE);
    setEditOpen(true);
  };

  const handleSubmitEdit = async () => {
    if (!editingDocumentId) return;
    const schemaError = validateSchemaFieldsForSubmit(editSchemaFields);
    if (schemaError) {
      message.warning(schemaError);
      return;
    }
    if (editCalVisible) {
      if (!editCalDisplayName.trim()) {
        message.warning('캘린더 연동 시 캘린더 표시명은 필수입니다.');
        return;
      }
      if (!editCalStartField?.trim()) {
        message.warning('캘린더 연동 시 시작일 필드는 필수입니다.');
        return;
      }
      const startErr = calendarDateFieldTypeError(editSchemaFields, editCalStartField, '시작일 필드');
      if (startErr) {
        message.warning(startErr);
        return;
      }
      const endErr = calendarDateFieldTypeError(editSchemaFields, editCalEndField, '종료일 필드');
      if (endErr) {
        message.warning(endErr);
        return;
      }
    }
    try {
      const formSchema = serializeFormSchema(editSchemaFields);
      const isCalendarVisibleYn = editCalVisible ? 'Y' : 'N';
      await updateDocumentM.mutateAsync({
        documentId: editingDocumentId,
        formSchema,
        isCalendarVisibleYn,
        calendarDisplayName: editCalVisible ? editCalDisplayName.trim() : null,
        calendarStartField: editCalVisible ? editCalStartField!.trim() : null,
        calendarEndField: editCalVisible && editCalEndField !== CAL_FIELD_NONE ? editCalEndField : null,
        calendarTitleField: editCalVisible && editCalTitleField !== CAL_FIELD_NONE ? editCalTitleField : null,
      });
    } catch {
      // validation
    }
  };

  const handleSubmitCreate = async () => {
    const schemaError = validateSchemaFieldsForSubmit(schemaFields);
    if (schemaError) {
      message.warning(schemaError);
      return;
    }
    if (createCalVisible) {
      if (!createCalDisplayName.trim()) {
        message.warning('캘린더 연동 시 캘린더 표시명은 필수입니다.');
        return;
      }
      if (!createCalStartField?.trim()) {
        message.warning('캘린더 연동 시 시작일 필드는 필수입니다.');
        return;
      }
      const startErr = calendarDateFieldTypeError(schemaFields, createCalStartField, '시작일 필드');
      if (startErr) {
        message.warning(startErr);
        return;
      }
      const endErr = calendarDateFieldTypeError(schemaFields, createCalEndField, '종료일 필드');
      if (endErr) {
        message.warning(endErr);
        return;
      }
    }
    try {
      const values = await form.validateFields();
      const formSchema = serializeFormSchema(schemaFields);
      const isCalendarVisibleYn = createCalVisible ? 'Y' : 'N';
      await createDocumentM.mutateAsync({
        documentName: values.documentName.trim(),
        requestType: values.requestType,
        formSchema,
        isCalendarVisibleYn,
        ...(createCalVisible
          ? {
              calendarDisplayName: createCalDisplayName.trim(),
              calendarStartField: createCalStartField!.trim(),
              calendarEndField: createCalEndField !== CAL_FIELD_NONE ? createCalEndField : null,
              calendarTitleField: createCalTitleField !== CAL_FIELD_NONE ? createCalTitleField : null,
            }
          : {}),
      });
    } catch {
      // validation
    }
  };

  const createSchemaOptions = useMemo(() => buildSchemaFieldOptions(schemaFields), [schemaFields]);
  const createDateFieldOptions = useMemo(
    () => buildCalendarDateFieldOptions(schemaFields),
    [schemaFields],
  );
  const createStartOptions = useMemo(
    () => withOrphanFieldOption(createDateFieldOptions, createCalStartField),
    [createDateFieldOptions, createCalStartField],
  );
  const createEndOptions = useMemo(
    () =>
      withOptionalNoneOption(
        createDateFieldOptions,
        createCalEndField !== CAL_FIELD_NONE ? createCalEndField : undefined,
      ),
    [createDateFieldOptions, createCalEndField],
  );
  const createTitleOptions = useMemo(
    () =>
      withOptionalNoneOption(
        createSchemaOptions,
        createCalTitleField !== CAL_FIELD_NONE ? createCalTitleField : undefined,
      ),
    [createSchemaOptions, createCalTitleField],
  );

  const editSchemaOptions = useMemo(() => buildSchemaFieldOptions(editSchemaFields), [editSchemaFields]);
  const editDateFieldOptions = useMemo(
    () => buildCalendarDateFieldOptions(editSchemaFields),
    [editSchemaFields],
  );
  const editStartOptions = useMemo(
    () => withOrphanFieldOption(editDateFieldOptions, editCalStartField),
    [editDateFieldOptions, editCalStartField],
  );
  const editEndOptions = useMemo(
    () =>
      withOptionalNoneOption(
        editDateFieldOptions,
        editCalEndField !== CAL_FIELD_NONE ? editCalEndField : undefined,
      ),
    [editDateFieldOptions, editCalEndField],
  );
  const editTitleOptions = useMemo(
    () =>
      withOptionalNoneOption(
        editSchemaOptions,
        editCalTitleField !== CAL_FIELD_NONE ? editCalTitleField : undefined,
      ),
    [editSchemaOptions, editCalTitleField],
  );

  const handleAddPolicyLine = () => {
    setPolicyDrafts((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${Math.random()}`,
        jobTitleId: '',
        stepOrder: prev.length + 1,
        organizationId: null,
      },
    ]);
  };

  const handleSavePolicyLines = async () => {
    if (!selectedDocumentId) {
      message.warning('양식을 먼저 선택해 주세요.');
      return;
    }
    const sorted = [...policyDrafts].sort((a, b) => a.stepOrder - b.stepOrder);
    const errorMessage = validatePolicyLines(sorted);
    if (errorMessage) {
      message.warning(errorMessage);
      return;
    }
    await savePolicyLineM.mutateAsync({
      documentId: selectedDocumentId,
      policyLines: sorted.map((row) => ({
        jobTitleId: row.jobTitleId,
        stepOrder: row.stepOrder,
        organizationId: row.organizationId,
      })),
    });
  };

  const handleDeletePolicyLines = async () => {
    if (!selectedDocumentId) return;
    await deletePolicyLineM.mutateAsync(selectedDocumentId);
  };

  const currentSealUrl = sealPreviewUrl || companyInfo?.sealImageUrl || '';
  const currentSealIsImage =
    Boolean(sealFile?.type.startsWith('image/')) ||
    /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(currentSealUrl);

  const handleSealFilePicked = (file: File | null) => {
    if (!file) return;
    const allowedMime = new Set([
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'application/pdf',
    ]);
    const maxBytes = 5 * 1024 * 1024;
    if (!allowedMime.has(file.type)) {
      message.warning('PNG, JPG, JPEG, GIF, PDF 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > maxBytes) {
      message.warning('파일 크기는 5MB 이하여야 합니다.');
      return;
    }
    setSealFile(file);
  };

  return (
    <div className="tw-w-full">
      {!canRead ? (
        <Alert type="warning" showIcon message="결재 관리자 화면을 보려면 조회 권한이 필요합니다." />
      ) : (
        <Card variant="borderless" className={ADMIN_SHELL_CARD_CLASS}>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'documents' | 'policy-lines' | 'contract-templates' | 'seal-management')}
            className={ADMIN_TABS_CLASS}
            items={[
            {
              key: 'documents',
              label: '결재 양식 관리',
              children: (
                <div className="tw-space-y-4">
                  <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
                    <div className="tw-min-w-0">
                      <Typography.Text type="secondary" className="tw-block tw-text-sm">
                        결재 요청에 사용할 양식을 관리합니다.
                      </Typography.Text>
                      <div className="tw-mt-2 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                        <span className="tw-inline-flex tw-h-7 tw-items-center tw-rounded-full tw-bg-slate-100 tw-px-3 tw-text-xs tw-font-semibold tw-text-slate-700">
                          전체 {documents.length}개
                        </span>
                        <span className="tw-inline-flex tw-h-7 tw-items-center tw-rounded-full tw-bg-blue-50 tw-px-3 tw-text-xs tw-font-semibold tw-text-blue-700">
                          활성 {activeDocuments.length}개
                        </span>
                      </div>
                    </div>
                    <Space wrap size={8}>
                      {canCreate ? (
                        <Button type="primary" icon={<PlusOutlined />} className={NAVY_BUTTON_CLASS} onClick={handleOpenCreate}>
                          양식 추가
                        </Button>
                      ) : null}
                      <Button icon={<ReloadOutlined />} className="!tw-rounded-xl" onClick={() => void refreshAll()}>
                        새로고침
                      </Button>
                    </Space>
                  </div>

                  <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200">
                    <Table
                      rowKey="documentId"
                      loading={docsLoading}
                      dataSource={documents}
                      pagination={false}
                      className="[&_.ant-table]:!tw-bg-white [&_.ant-table-thead>tr>th]:!tw-border-slate-200 [&_.ant-table-thead>tr>th]:!tw-bg-slate-50 [&_.ant-table-thead>tr>th]:!tw-px-4 [&_.ant-table-thead>tr>th]:!tw-py-3 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600 [&_.ant-table-tbody>tr>td]:!tw-border-slate-100 [&_.ant-table-tbody>tr>td]:!tw-px-4 [&_.ant-table-tbody>tr>td]:!tw-py-4 [&_.ant-table-tbody>tr:hover>td]:!tw-bg-slate-50/70"
                      columns={[
                        {
                          title: '양식명',
                          dataIndex: 'documentName',
                          key: 'documentName',
                          render: (name: string, row) => (
                            <button
                              type="button"
                              className="tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-font-semibold tw-text-[#1e3a5f] hover:tw-underline"
                              onClick={() => {
                                setSelectedDocumentId(row.documentId);
                                setActiveTab('policy-lines');
                              }}
                            >
                              {name}
                            </button>
                          ),
                        },
                        {
                          title: '요청 유형',
                          dataIndex: 'requestType',
                          key: 'requestType',
                          width: 160,
                          render: (type: string) => <Tag className="!tw-m-0 !tw-rounded-lg">{approvalRequestTypeLabelKo(type)}</Tag>,
                        },
                        {
                          title: '사용 상태',
                          dataIndex: 'isActiveYn',
                          key: 'isActiveYn',
                          width: 140,
                          render: (value: 'Y' | 'N', row) => (
                            <Space size={8}>
                              <Switch
                                size="small"
                                checked={value === 'Y'}
                                disabled={!canUpdate}
                                loading={
                                  (value === 'Y' && deactivateM.isPending) ||
                                  (value !== 'Y' && activateM.isPending)
                                }
                                onChange={(checked) =>
                                  checked ? activateM.mutate(row.documentId) : deactivateM.mutate(row.documentId)
                                }
                              />
                              <Typography.Text className="tw-text-xs tw-font-semibold tw-text-slate-600">
                                {value === 'Y' ? '활성' : '비활성'}
                              </Typography.Text>
                            </Space>
                          ),
                        },
                        {
                          title: '작업',
                          key: 'actions',
                          width: 240,
                          render: (_, row) => (
                            <Space size={8} wrap>
                              {canUpdate ? (
                                <Button
                                  size="small"
                                  icon={<FormOutlined />}
                                  className="!tw-h-8 !tw-rounded-lg !tw-border-slate-200 !tw-font-medium"
                                  onClick={() => handleOpenEdit(row)}
                                >
                                  양식 수정
                                </Button>
                              ) : null}
                              <Button
                                size="small"
                                icon={<EyeOutlined />}
                                className="!tw-h-8 !tw-rounded-lg !tw-border-slate-200 !tw-font-medium"
                                onClick={() => {
                                  setSelectedDocumentId(row.documentId);
                                  setActiveTab('policy-lines');
                                }}
                              >
                                정책라인 확인
                              </Button>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'policy-lines',
              label: '정책라인 관리',
              children: (
                <div className="tw-space-y-4">
                  <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
                    <div className="tw-min-w-[320px] tw-flex-1">
                      <Typography.Text type="secondary" className="tw-block tw-text-sm">
                        양식별 결재 직책과 결재 순서를 설정합니다. 저장 시 기존 정책라인은 전체 교체됩니다.
                      </Typography.Text>
                      <div className="tw-mt-4 tw-flex tw-flex-wrap tw-items-center tw-gap-3">
                        <Typography.Text className="tw-text-xs tw-font-semibold tw-text-slate-500">양식 선택</Typography.Text>
                        <Select
                          value={selectedDocumentId || undefined}
                          onChange={(v) => {
                            setSelectedDocumentId(v);
                          }}
                          placeholder="양식을 선택하세요"
                          className="tw-min-w-[320px]"
                          options={documents.map((doc) => ({
                            value: doc.documentId,
                            label: `${doc.documentName} (${approvalRequestTypeLabelKo(String(doc.requestType))})`,
                          }))}
                        />
                      </div>
                    </div>
                    <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2">
                        {canCreate ? (
                          <Button icon={<PlusOutlined />} className="!tw-rounded-xl" onClick={handleAddPolicyLine}>
                            결재선 등록
                          </Button>
                        ) : null}
                        {canCreate ? (
                          <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            className={NAVY_BUTTON_CLASS}
                            loading={savePolicyLineM.isPending}
                            onClick={() => void handleSavePolicyLines()}
                          >
                            라인 저장
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Popconfirm
                            title="선택 양식의 정책라인을 전부 삭제할까요?"
                            okText="삭제"
                            cancelText="취소"
                            onConfirm={() => void handleDeletePolicyLines()}
                          >
                            <Button
                              danger
                              icon={<DeleteOutlined />}
                              className="!tw-rounded-xl !tw-font-semibold"
                              loading={deletePolicyLineM.isPending}
                            >
                              전체 삭제
                            </Button>
                          </Popconfirm>
                        ) : null}
                      </div>
                    </div>

                    {selectedDocument ? (
                      <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50/70 tw-px-4 tw-py-3">
                        <span className="tw-text-xs tw-font-semibold tw-text-slate-500">선택 양식</span>
                        <Typography.Text strong className="tw-text-slate-900">
                          {selectedDocument.documentName}
                        </Typography.Text>
                        <Tag className="!tw-m-0 !tw-rounded-lg">
                          {approvalRequestTypeLabelKo(String(selectedDocument.requestType))}
                        </Tag>
                        <Tag color={selectedDocument.isActiveYn === 'Y' ? 'success' : 'default'} className="!tw-m-0 !tw-rounded-lg">
                          {selectedDocument.isActiveYn === 'Y' ? '활성' : '비활성'}
                        </Tag>
                        <span className="tw-ml-auto tw-inline-flex tw-h-7 tw-items-center tw-rounded-full tw-bg-white tw-px-3 tw-text-xs tw-font-semibold tw-text-slate-600">
                          결재선 {policyDrafts.length}개
                        </span>
                      </div>
                    ) : null}

                  <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200">
                    <Table<PolicyLineDraft>
                      rowKey="key"
                      loading={policyLoading}
                      dataSource={[...policyDrafts].sort((a, b) => a.stepOrder - b.stepOrder)}
                      pagination={false}
                      className="[&_.ant-table]:!tw-bg-white [&_.ant-table-thead>tr>th]:!tw-border-slate-200 [&_.ant-table-thead>tr>th]:!tw-bg-slate-50 [&_.ant-table-thead>tr>th]:!tw-px-4 [&_.ant-table-thead>tr>th]:!tw-py-3 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600 [&_.ant-table-tbody>tr>td]:!tw-border-slate-100 [&_.ant-table-tbody>tr>td]:!tw-px-4 [&_.ant-table-tbody>tr>td]:!tw-py-4 [&_.ant-table-tbody>tr:hover>td]:!tw-bg-slate-50/70"
                      columns={[
                        {
                          title: '순서',
                          dataIndex: 'stepOrder',
                          key: 'stepOrder',
                          width: 120,
                          render: (value: number, row) => (
                            <InputNumber
                              min={1}
                              value={value}
                              className="!tw-w-20"
                              onChange={(next) => {
                                setPolicyDrafts((prev) =>
                                  prev.map((item) =>
                                    item.key === row.key ? { ...item, stepOrder: Number(next) || 1 } : item,
                                  ),
                                );
                              }}
                            />
                          ),
                        },
                        {
                          title: '직책',
                          dataIndex: 'jobTitleId',
                          key: 'jobTitleId',
                          render: (value: string, row) => (
                            <Select
                              value={value || undefined}
                              className="tw-min-w-[220px]"
                              placeholder="직책 선택"
                              options={jobTitleOptions}
                              onChange={(next) =>
                                setPolicyDrafts((prev) =>
                                  prev.map((item) => (item.key === row.key ? { ...item, jobTitleId: next } : item)),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: '조직(선택)',
                          dataIndex: 'organizationId',
                          key: 'organizationId',
                          render: (value: string | null, row) => (
                            <Select
                              allowClear
                              value={value ?? undefined}
                              className="tw-min-w-[250px]"
                              placeholder="조직 제한 없음"
                              options={orgOptions}
                              onChange={(next) =>
                                setPolicyDrafts((prev) =>
                                  prev.map((item) =>
                                    item.key === row.key ? { ...item, organizationId: next ?? null } : item,
                                  ),
                                )
                              }
                            />
                          ),
                        },
                        {
                          title: '관리',
                          key: 'actions',
                          width: 90,
                          render: (_, row) => (
                            <Button
                              danger
                              size="small"
                              className="!tw-h-8 !tw-rounded-lg !tw-border-slate-200 !tw-font-medium"
                              disabled={!canCreate}
                              onClick={() => setPolicyDrafts((prev) => prev.filter((item) => item.key !== row.key))}
                            >
                              삭제
                            </Button>
                          ),
                        },
                      ]}
                      locale={{ emptyText: selectedDocumentId ? '정책라인이 없습니다.' : '양식을 먼저 선택하세요.' }}
                    />
                    </div>
                  </div>
              ),
            },
            {
              key: 'contract-templates',
              label: '전자계약 양식 관리',
              children: (
                <div className="tw-min-h-0 tw-flex-1 tw-overflow-y-auto wf-scrollbar">
                  <ContractTemplatesAdminPanel showTemplateSection showSendSection={false} />
                </div>
              ),
            },
            {
              key: 'seal-management',
              label: '인감 관리',
              children: (
                <div className="tw-space-y-4">
                  <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
                    <div className="tw-min-w-0">
                      <Typography.Text type="secondary" className="tw-block tw-text-sm">
                        결재 및 계약 문서에 사용할 공식 인감을 등록하고 관리합니다.
                      </Typography.Text>
                    </div>
                    <span
                      className={`tw-inline-flex tw-h-7 tw-items-center tw-rounded-full tw-px-3 tw-text-xs tw-font-semibold ${
                        companyInfo?.sealImageUrl
                          ? 'tw-bg-blue-50 tw-text-blue-700'
                          : 'tw-bg-slate-100 tw-text-slate-600'
                      }`}
                    >
                      {companyInfoLoading ? '확인 중' : companyInfo?.sealImageUrl ? '등록됨' : '미등록'}
                    </span>
                  </div>

                  <div className="tw-grid tw-grid-cols-1 tw-gap-4 tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-p-4 lg:tw-grid-cols-[220px_minmax(0,1fr)]">
                    <div className="tw-min-w-0">
                      <Typography.Text className="tw-mb-2 tw-block tw-text-xs tw-font-semibold tw-text-slate-500">
                        미리보기
                      </Typography.Text>
                      <div className="tw-flex tw-aspect-square tw-w-full tw-items-center tw-justify-center tw-rounded-xl tw-border tw-border-slate-200 tw-bg-slate-50 tw-p-3">
                        {currentSealUrl && currentSealIsImage ? (
                          <img src={currentSealUrl} alt="회사 인감" className="tw-h-full tw-w-full tw-rounded-lg tw-object-contain" />
                        ) : (
                          <div className="tw-text-center">
                            <Typography.Text className="tw-block tw-text-sm tw-font-semibold tw-text-slate-400">
                              미리보기 없음
                            </Typography.Text>
                            <Typography.Text type="secondary" className="tw-mt-1 tw-block tw-text-xs">
                              {currentSealUrl ? 'PDF 파일은 저장 후 문서에서 확인합니다.' : '등록된 인감 이미지가 없습니다.'}
                            </Typography.Text>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="tw-min-w-0 tw-space-y-4">
                      <div>
                        <Typography.Text className="tw-block tw-text-sm tw-font-semibold tw-text-slate-900">
                          인감 이미지 업로드
                        </Typography.Text>
                        <Typography.Text type="secondary" className="tw-mt-1 tw-block tw-text-sm">
                          투명 배경 PNG 또는 JPG 파일을 권장합니다. PDF 업로드도 지원합니다.
                        </Typography.Text>
                        <Typography.Text type="secondary" className="tw-mt-1 tw-block tw-text-xs">
                          최대 5MB까지 업로드할 수 있고, 저장 시 기존 인감은 새 파일로 교체됩니다.
                        </Typography.Text>
                      </div>

                      {sealFile ? (
                        <div className="tw-rounded-lg tw-border tw-border-blue-100 tw-bg-blue-50 tw-px-3 tw-py-2">
                          <Typography.Text className="tw-block tw-truncate tw-text-xs tw-font-semibold tw-text-blue-700">
                            선택 파일: {sealFile.name}
                          </Typography.Text>
                        </div>
                      ) : null}

                      <input
                        ref={sealInputRef}
                        type="file"
                        accept=".png,.jpg,.jpeg,.gif,.pdf,image/png,image/jpeg,image/gif,application/pdf"
                        className="tw-hidden"
                        onChange={(e) => {
                          const next = e.target.files?.[0] ?? null;
                          handleSealFilePicked(next);
                          e.currentTarget.value = '';
                        }}
                      />

                      <Space wrap size={8}>
                        <Button
                          type="primary"
                          icon={<UploadOutlined />}
                          className={NAVY_BUTTON_CLASS}
                          onClick={() => sealInputRef.current?.click()}
                        >
                          파일 선택
                        </Button>
                        <Button
                          danger
                          className="!tw-rounded-xl !tw-font-semibold"
                          onClick={() => {
                            if (sealFile) {
                              setSealFile(null);
                              return;
                            }
                            message.info('삭제 API는 아직 제공되지 않아 파일 교체 방식만 지원합니다.');
                          }}
                        >
                          {sealFile ? '선택 해제' : '삭제'}
                        </Button>
                        <Button
                          type="primary"
                          className={NAVY_BUTTON_CLASS}
                          loading={updateSealM.isPending}
                          disabled={!sealFile}
                          onClick={() => {
                            if (!sealFile) {
                              message.info('먼저 업로드할 인감 파일을 선택해 주세요.');
                              return;
                            }
                            void updateSealM.mutateAsync(sealFile);
                          }}
                        >
                          저장
                        </Button>
                      </Space>

                      <div className="tw-rounded-xl tw-bg-slate-50 tw-px-3 tw-py-2">
                        <Typography.Text type="secondary" className="tw-text-xs">
                          {companyInfoLoading
                            ? '회사 인감 정보를 불러오는 중입니다.'
                            : companyInfo?.sealImageUrl
                              ? '현재 등록된 인감이 있습니다.'
                              : '현재 등록된 인감이 없습니다.'}
                        </Typography.Text>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            },
            ]}
          />
        </Card>
      )}

      <AppDoubleActionModal
        title="결재 양식 추가"
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateCalVisible(false);
          setCreateCalDisplayName('');
          setCreateCalStartField(undefined);
          setCreateCalEndField(CAL_FIELD_NONE);
          setCreateCalTitleField(CAL_FIELD_NONE);
        }}
        onConfirm={() => void handleSubmitCreate()}
        confirmText="등록"
        cancelText="취소"
        confirmLoading={createDocumentM.isPending}
        destroyOnHidden
        width={1120}
      >
        <div className="tw-px-6 tw-py-5 sm:tw-px-7">
        <Form<DocForm> form={form} layout="vertical">
          <Form.Item label="기안 입력 항목" required>
            <ApprovalFormSchemaBuilder
              value={schemaFields}
              onChange={setSchemaFields}
              paperPreviewMeta={createPaperPreviewMeta}
              sidebarTop={
                <>
                  <Form.Item name="documentName" label="양식명" rules={[{ required: true, message: '양식명을 입력해 주세요.' }]}>
                    <Input placeholder="예: 연차신청서" maxLength={100} showCount />
                  </Form.Item>
                  <Form.Item name="requestType" label="요청 유형" rules={[{ required: true, message: '요청 유형을 선택해 주세요.' }]}>
                    <Select
                      options={APPROVAL_REQUEST_TYPES.map((type) => ({
                        value: type,
                        label: APPROVAL_REQUEST_TYPE_LABEL_KO[type],
                      }))}
                    />
                  </Form.Item>
                </>
              }
              belowHelpSlot={
                <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/70 tw-p-3">
                  <Checkbox checked={createCalVisible} onChange={(e) => setCreateCalVisible(e.target.checked)}>
                    캘린더에 일정 자동 반영 (최종 승인 시)
                  </Checkbox>
                  {createCalVisible ? (
                    <div className="tw-mt-3 tw-space-y-3">
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-text-slate-600">
                          캘린더 표시명 <Typography.Text type="danger">*</Typography.Text>
                        </Typography.Text>
                        <Input
                          placeholder="예: 연차, 출장"
                          maxLength={100}
                          showCount
                          value={createCalDisplayName}
                          onChange={(e) => setCreateCalDisplayName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-text-slate-600">
                          시작일 필드 (contentJson 키) <Typography.Text type="danger">*</Typography.Text>
                        </Typography.Text>
                        <Select
                          className="tw-w-full"
                          placeholder="필드 선택"
                          options={createStartOptions}
                          value={createCalStartField}
                          onChange={(v) => setCreateCalStartField(v)}
                          showSearch
                          optionFilterProp="label"
                        />
                      </div>
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-text-slate-600">
                          종료일 필드 (선택, 없으면 당일)
                        </Typography.Text>
                        <Select
                          className="tw-w-full"
                          options={createEndOptions}
                          value={createCalEndField}
                          onChange={(v) => setCreateCalEndField(v)}
                          showSearch
                          optionFilterProp="label"
                        />
                      </div>
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-text-slate-600">
                          부가 제목 필드 (선택)
                        </Typography.Text>
                        <Select
                          className="tw-w-full"
                          options={createTitleOptions}
                          value={createCalTitleField}
                          onChange={(v) => setCreateCalTitleField(v)}
                          showSearch
                          optionFilterProp="label"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              }
            />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>

      <AppDoubleActionModal
        title={editingDocument ? `양식 수정 중 — ${editingDocument.documentName}` : '양식 수정 중'}
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditingDocumentId(null);
          setEditSchemaFields([]);
          setEditCalVisible(false);
          setEditCalDisplayName('');
          setEditCalStartField(undefined);
          setEditCalEndField(CAL_FIELD_NONE);
          setEditCalTitleField(CAL_FIELD_NONE);
        }}
        onConfirm={() => void handleSubmitEdit()}
        confirmText="저장"
        cancelText="취소"
        confirmLoading={updateDocumentM.isPending}
        destroyOnHidden
        width={1120}
      >
        <div className="tw-px-6 tw-py-5 sm:tw-px-7">
        <Form layout="vertical">
          <Form.Item label="기안 입력 항목" required>
            <ApprovalFormSchemaBuilder
              value={editSchemaFields}
              onChange={setEditSchemaFields}
              respectFieldLocks
              paperPreviewMeta={editPaperPreviewMeta}
              belowHelpSlot={
                <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-slate-50/70 tw-p-3">
                  <Checkbox checked={editCalVisible} onChange={(e) => setEditCalVisible(e.target.checked)}>
                    캘린더에 일정 자동 반영 (최종 승인 시)
                  </Checkbox>
                  {editCalVisible ? (
                    <div className="tw-mt-3 tw-space-y-3">
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-text-slate-600">
                          캘린더 표시명 <Typography.Text type="danger">*</Typography.Text>
                        </Typography.Text>
                        <Input
                          placeholder="예: 연차, 출장"
                          maxLength={100}
                          showCount
                          value={editCalDisplayName}
                          onChange={(e) => setEditCalDisplayName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-text-slate-600">
                          시작일 필드 (contentJson 키) <Typography.Text type="danger">*</Typography.Text>
                        </Typography.Text>
                        <Select
                          className="tw-w-full"
                          placeholder="필드 선택"
                          options={editStartOptions}
                          value={editCalStartField}
                          onChange={(v) => setEditCalStartField(v)}
                          showSearch
                          optionFilterProp="label"
                        />
                      </div>
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-text-slate-600">
                          종료일 필드 (선택, 없으면 당일)
                        </Typography.Text>
                        <Select
                          className="tw-w-full"
                          options={editEndOptions}
                          value={editCalEndField}
                          onChange={(v) => setEditCalEndField(v)}
                          showSearch
                          optionFilterProp="label"
                        />
                      </div>
                      <div>
                        <Typography.Text className="tw-mb-1 tw-block tw-text-xs tw-text-slate-600">
                          부가 제목 필드 (선택)
                        </Typography.Text>
                        <Select
                          className="tw-w-full"
                          options={editTitleOptions}
                          value={editCalTitleField}
                          onChange={(v) => setEditCalTitleField(v)}
                          showSearch
                          optionFilterProp="label"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              }
            />
          </Form.Item>
        </Form>
        </div>
      </AppDoubleActionModal>
    </div>
  );
}
