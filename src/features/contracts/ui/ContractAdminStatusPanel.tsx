import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppDoubleActionModal } from '@/shared/ui/AppDoubleActionModal';
import { AppModal } from '@/shared/ui/AppModal';
import { AppSingleActionModal } from '@/shared/ui/AppSingleActionModal';
import { useAuth } from '@/features/auth/useAuth';
import { PERM } from '@/features/permissions/backend-permissions';
import { usePermissions } from '@/features/permissions/usePermissionsHook';
import {
  contractEffectiveRejectReason,
  contractEmployeeCanReject,
  contractEmployeeSignaturePending,
  contractTemplateApi,
  type ContractBatchSummary,
  type ContractRecord,
} from '@/features/contracts/api/contractTemplateApi';
import {
  coerceAdminInputInitialForForm,
  collectContractAdminInputFromForm,
  isContractAdminInputSource,
  parseContractFormSchema,
} from '@/features/contracts/lib/parseContractFormSchema';
import { uploadSignaturePngForContract } from '@/features/contracts/lib/uploadSignaturePng';
import { ApprovalFormPaperFieldRow, ApprovalFormPaperLayout } from '@/features/approvals/ui/ApprovalFormPaperLayout';
import { ContractAdminFormFieldInput } from '@/features/contracts/ui/ContractAdminFormFieldInput';
import { CONTRACT_HUB_CARD_CLASS } from '@/features/contracts/ui/contractHubStyles';
import { ContractPartySignaturesCard } from '@/features/contracts/ui/ContractPartySignaturesCard';
import { ContractSignaturePad, type ContractSignaturePadHandle } from '@/features/contracts/ui/ContractSignaturePad';

type ContractSchemaField = { key: string; label: string; type: string; sourceField?: string };

const STATUS_OPTIONS = [
  { value: 'ALL', label: '전체' },
  { value: 'SENT', label: '서명 대기' },
  { value: 'SIGNED', label: '완료' },
  { value: 'REJECTED', label: '거절' },
  { value: 'CANCELED', label: '회수' },
  { value: 'CREATED', label: '생성됨' },
] as const;

function parseSchemaFields(raw: string): ContractSchemaField[] {
  try {
    const parsed = JSON.parse(raw) as { fields?: unknown };
    const items = Array.isArray(parsed.fields) ? parsed.fields : [];
    return items
      .map((it) => {
        if (!it || typeof it !== 'object') return null;
        const o = it as Record<string, unknown>;
        const key = String(o.key ?? o.name ?? '').trim();
        const label = String(o.label ?? '').trim();
        const type = String(o.type ?? 'text').trim();
        const sourceField = typeof o.sourceField === 'string' ? o.sourceField.trim() : '';
        if (!key || !label) return null;
        return { key, label, type, ...(sourceField ? { sourceField } : {}) };
      })
      .filter((v): v is ContractSchemaField => v != null);
  } catch {
    return [];
  }
}

function parseContent(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function pickAdminFromContractContent(contract: ContractRecord, adminFieldNames: string[]): Record<string, unknown> {
  const content = parseContent(contract.contentJson);
  const out: Record<string, unknown> = {};
  for (const n of adminFieldNames) {
    if (content[n] !== undefined) out[n] = content[n];
  }
  return out;
}

function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value.trim() || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

function statusTag(status: string) {
  const s = String(status).toUpperCase();
  if (s === 'SENT') return <Tag color="processing">서명 대기</Tag>;
  if (s === 'SIGNED') return <Tag color="success">완료</Tag>;
  if (s === 'REJECTED') return <Tag color="error">거절</Tag>;
  if (s === 'CANCELED') return <Tag color="default">회수</Tag>;
  if (s === 'CREATED') return <Tag>생성됨</Tag>;
  return <Tag>{status}</Tag>;
}

function employeePartySigned(contract: ContractRecord): boolean {
  const emp = contract.parties?.find((p) => String(p.partyRole).toUpperCase() === 'EMPLOYEE');
  if (!emp) return false;
  return String(emp.signStatus).toUpperCase() === 'SIGNED';
}

function formatDateTime(value: string): string {
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : value;
}

export function ContractAdminStatusPanel({ hubLayout = false }: { hubLayout?: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SENT' | 'SIGNED' | 'REJECTED' | 'CANCELED' | 'CREATED'>('ALL');
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ContractBatchSummary | null>(null);
  const [onlyUnsigned, setOnlyUnsigned] = useState(false);
  const [signModalContractId, setSignModalContractId] = useState<string | null>(null);
  const [signSubmitting, setSignSubmitting] = useState(false);
  const padRef = useRef<ContractSignaturePadHandle>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReasonDraft, setCancelReasonDraft] = useState('');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReasonDraft, setRejectReasonDraft] = useState('');
  const [resendModalOpen, setResendModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [batchResendModalOpen, setBatchResendModalOpen] = useState(false);
  const [contractsRefreshing, setContractsRefreshing] = useState(false);
  const [batchesRefreshing, setBatchesRefreshing] = useState(false);
  const [resendForm] = Form.useForm<{ adminInput?: Record<string, unknown> }>();
  const [batchResendForm] = Form.useForm<{
    batchName: string;
    items: Array<{ contractId: string; include?: boolean; adminInput?: Record<string, unknown> }>;
  }>();

  const { data: contracts = [], isFetching: contractsLoading, refetch: refetchContracts } = useQuery({
    queryKey: ['contract', 'admin', 'contracts'],
    queryFn: () => contractTemplateApi.listContracts(),
    staleTime: 30_000,
  });
  const { data: batches = [], isFetching: batchesLoading, refetch: refetchBatches } = useQuery({
    queryKey: ['contract', 'admin', 'batches'],
    queryFn: () => contractTemplateApi.listBatches(),
    staleTime: 30_000,
  });
  const { data: contractDetail, isFetching: detailLoading } = useQuery({
    queryKey: ['contract', 'detail', selectedContractId],
    queryFn: () => contractTemplateApi.getContract(selectedContractId!),
    enabled: Boolean(selectedContractId),
  });
  const { data: batchContracts = [], isFetching: batchContractsLoading } = useQuery({
    queryKey: ['contract', 'admin', 'batch-contracts', selectedBatch?.batchId],
    queryFn: () => contractTemplateApi.getBatchContracts(selectedBatch!.batchId),
    enabled: Boolean(selectedBatch?.batchId),
  });

  const resendableInBatch = useMemo(
    () =>
      batchContracts.filter((c) => {
        const s = String(c.contractStatus).toUpperCase();
        return s === 'REJECTED' || s === 'CANCELED';
      }),
    [batchContracts],
  );

  const templateIdForResend =
    contractDetail?.templateId?.trim() || resendableInBatch[0]?.templateId?.trim() || null;

  const { data: resendTemplate } = useQuery({
    queryKey: ['contract', 'template', templateIdForResend, 'resend-prefetch'],
    queryFn: () => contractTemplateApi.get(templateIdForResend!),
    enabled: (resendModalOpen || batchResendModalOpen) && Boolean(templateIdForResend),
  });

  const { data: contractHistory = [], isFetching: historyLoading } = useQuery({
    queryKey: ['contract', 'history', selectedContractId],
    queryFn: () => contractTemplateApi.getContractHistory(selectedContractId!),
    enabled: historyModalOpen && Boolean(selectedContractId),
  });

  const canRecallContract = user?.isSystemAdmin === true || hasPermission(PERM.CONTRACT_CREATE);

  const cancelContractM = useMutation({
    mutationFn: (vars: { contractId: string; cancelReason: string }) =>
      contractTemplateApi.cancelContract(vars.contractId, { cancelReason: vars.cancelReason }),
    onSuccess: async (updated, vars) => {
      message.success('계약이 회수되었습니다.');
      queryClient.setQueryData(['contract', 'detail', vars.contractId], updated);
      setCancelModalOpen(false);
      setCancelReasonDraft('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batches'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'history', vars.contractId] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '계약 회수에 실패했습니다.'),
  });

  const resendContractM = useMutation({
    mutationFn: (vars: { contractId: string; adminInputJson?: Record<string, unknown> | null }) =>
      contractTemplateApi.resendContract(vars.contractId, { adminInputJson: vars.adminInputJson ?? null }),
    onSuccess: async (newContract) => {
      message.success('계약이 재발송되었습니다.');
      setResendModalOpen(false);
      resendForm.resetFields();
      setSelectedContractId(newContract.contractId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batches'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'history', newContract.contractId] }),
      ]);
      queryClient.setQueryData(['contract', 'detail', newContract.contractId], newContract);
    },
    onError: (e: Error) => message.error(e.message || '재발송에 실패했습니다.'),
  });

  const resendBatchM = useMutation({
    mutationFn: (vars: {
      batchId: string;
      batchName: string;
      items: Array<{ contractId: string; adminInputJson?: Record<string, unknown> | null }>;
    }) => contractTemplateApi.resendBatch(vars.batchId, { batchName: vars.batchName, items: vars.items }),
    onSuccess: async (batchResult) => {
      message.success('배치가 재발송되었습니다.');
      setBatchResendModalOpen(false);
      batchResendForm.resetFields();
      const fresh: ContractBatchSummary = {
        batchId: batchResult.batchId,
        batchName: batchResult.batchName,
        templateName: batchResult.templateName,
        contractType: batchResult.contractType,
        totalCount: batchResult.totalCount,
        signedCount: batchResult.signedCount,
        rejectedCount: batchResult.rejectedCount,
        previousBatchId: batchResult.previousBatchId,
        createdBy: batchResult.createdBy ?? '',
        createdAt: batchResult.createdAt,
      };
      setSelectedBatch(fresh);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batches'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts', batchResult.batchId] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '배치 재발송에 실패했습니다.'),
  });

  const signM = useMutation({
    mutationFn: (vars: { contractId: string; signatureImageUrl: string }) =>
      contractTemplateApi.signContract(vars.contractId, { signatureImageUrl: vars.signatureImageUrl }),
    onSuccess: async (_res, vars) => {
      message.success('전자계약 서명이 완료되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'detail', vars.contractId] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'history', vars.contractId] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '계약 서명에 실패했습니다.'),
  });

  const rejectContractM = useMutation({
    mutationFn: (vars: { contractId: string; rejectReason: string }) =>
      contractTemplateApi.rejectContract(vars.contractId, { rejectReason: vars.rejectReason }),
    onSuccess: async (updated, vars) => {
      message.success('계약을 거절했습니다.');
      queryClient.setQueryData(['contract', 'detail', vars.contractId], updated);
      setRejectModalOpen(false);
      setRejectReasonDraft('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batches'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'history', vars.contractId] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '계약 거절에 실패했습니다.'),
  });

  const remindContractM = useMutation({
    mutationFn: (contractId: string) => contractTemplateApi.remindContract(contractId),
    onSuccess: async (res, contractId) => {
      message.success(res.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'detail', contractId] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my-detail', contractId] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '서명 리마인드 발송에 실패했습니다.'),
  });

  const remindBatchM = useMutation({
    mutationFn: (batchId: string) => contractTemplateApi.remindContractBatch(batchId),
    onSuccess: async (res, batchId) => {
      message.success(res.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batch-contracts', batchId] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'admin', 'batches'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', 'my-detail'] }),
      ]);
    },
    onError: (e: Error) => message.error(e.message || '일괄 리마인드 발송에 실패했습니다.'),
  });

  const openSignModal = (contractId: string) => {
    setSignModalContractId(contractId);
  };

  const closeSignModal = () => {
    setSignModalContractId(null);
    padRef.current?.clear();
  };

  const handleSubmitSign = async () => {
    if (!signModalContractId) return;
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      message.warning('서명 패드에 서명해 주세요.');
      return;
    }
    setSignSubmitting(true);
    try {
      const file = await pad.toPngFile();
      const signatureImageUrl = await uploadSignaturePngForContract(file);
      await signM.mutateAsync({ contractId: signModalContractId, signatureImageUrl });
      closeSignModal();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '계약 서명에 실패했습니다.';
      message.error(errorMessage);
      throw e;
    } finally {
      setSignSubmitting(false);
    }
  };

  const filteredContracts = useMemo(
    () =>
      statusFilter === 'ALL'
        ? contracts
        : contracts.filter((row) => String(row.contractStatus).toUpperCase() === statusFilter),
    [contracts, statusFilter],
  );
  const visibleBatchContracts = useMemo(
    () =>
      onlyUnsigned
        ? batchContracts.filter((row) => String(row.contractStatus).toUpperCase() === 'SENT')
        : batchContracts,
    [batchContracts, onlyUnsigned],
  );

  const detailFields = useMemo(
    () => (contractDetail ? parseSchemaFields(contractDetail.formSchemaSnapshot) : []),
    [contractDetail],
  );
  const detailContent = useMemo(
    () => (contractDetail ? parseContent(contractDetail.contentJson) : {}),
    [contractDetail],
  );

  const canSignContractAsCurrentEmployee = useMemo(() => {
    if (!contractDetail || !user?.id?.trim()) return false;
    if (user.id.trim() !== contractDetail.employeeMemberId?.trim()) return false;
    return contractEmployeeSignaturePending(contractDetail);
  }, [contractDetail, user?.id]);

  const canRejectContractAsCurrentEmployee = useMemo(
    () => (contractDetail ? contractEmployeeCanReject(contractDetail, user?.id) : false),
    [contractDetail, user?.id],
  );

  const canShowRecallButton = useMemo(() => {
    if (!contractDetail || !canRecallContract) return false;
    if (String(contractDetail.contractStatus).toUpperCase() !== 'SENT') return false;
    if (employeePartySigned(contractDetail)) return false;
    return true;
  }, [canRecallContract, contractDetail]);

  const canShowRemindButton = useMemo(() => {
    if (!contractDetail || !canRecallContract) return false;
    return contractEmployeeSignaturePending(contractDetail);
  }, [canRecallContract, contractDetail]);

  const batchPendingSignatureCount = useMemo(
    () => batchContracts.filter((c) => contractEmployeeSignaturePending(c)).length,
    [batchContracts],
  );

  const canShowResendButton = useMemo(() => {
    if (!contractDetail || !canRecallContract) return false;
    const st = String(contractDetail.contractStatus).toUpperCase();
    if (st !== 'REJECTED' && st !== 'CANCELED') return false;
    if ((contractDetail.revision ?? 1) >= 5) return false;
    return true;
  }, [canRecallContract, contractDetail]);

  const canShowHistoryButton = useMemo(() => {
    if (!contractDetail) return false;
    return (contractDetail.revision ?? 1) > 1;
  }, [contractDetail]);

  const refreshContracts = async () => {
    setContractsRefreshing(true);
    try {
      await Promise.all([refetchContracts(), new Promise((resolve) => window.setTimeout(resolve, 450))]);
    } finally {
      setContractsRefreshing(false);
    }
  };

  const refreshBatches = async () => {
    setBatchesRefreshing(true);
    try {
      await Promise.all([refetchBatches(), new Promise((resolve) => window.setTimeout(resolve, 450))]);
    } finally {
      setBatchesRefreshing(false);
    }
  };

  const detailSignCells = useMemo(() => {
    const empty = { label: '—', imageUrl: '', signedAt: '' };
    if (!contractDetail) return { employee: empty, company: empty };
    const employee = contractDetail.parties?.find((p) => String(p.partyRole).toUpperCase() === 'EMPLOYEE');
    const company = contractDetail.parties?.find((p) => String(p.partyRole).toUpperCase() === 'COMPANY');
    const employeeImg = employee?.signatureImageUrl?.trim() || '';
    const companyImg = company?.signatureImageUrl?.trim() || contractDetail.sealImageUrl?.trim() || '';
    return {
      employee: {
        label: contractDetail.employeeName?.trim() || '직원',
        imageUrl: employeeImg,
        signedAt: employee?.signedAt ? formatDateTime(employee.signedAt) : '',
      },
      company: {
        label: '회사',
        imageUrl: companyImg,
        signedAt: company?.signedAt ? formatDateTime(company.signedAt) : '',
      },
    };
  }, [contractDetail]);

  const singleResendAdminFields = useMemo(() => {
    if (!contractDetail) return [];
    const raw = resendTemplate?.formSchema ?? contractDetail.formSchemaSnapshot;
    const { fields, metaByName } = parseContractFormSchema(raw);
    return fields.filter((f) => isContractAdminInputSource(metaByName[f.name]?.source));
  }, [contractDetail, resendTemplate?.formSchema]);

  useEffect(() => {
    if (!resendModalOpen || !contractDetail) return;
    const { fields, metaByName } = parseContractFormSchema(contractDetail.formSchemaSnapshot);
    const adminFields = fields.filter((f) => isContractAdminInputSource(metaByName[f.name]?.source));
    const names = adminFields.map((f) => f.name);
    const picked = pickAdminFromContractContent(contractDetail, names);
    resendForm.setFieldsValue({ adminInput: coerceAdminInputInitialForForm(picked, adminFields) });
  }, [resendModalOpen, contractDetail?.contractId, contractDetail?.formSchemaSnapshot, resendForm]);

  const batchResendAdminFieldDefs = useMemo(() => {
    if (resendableInBatch.length === 0) return [];
    const raw = resendTemplate?.formSchema ?? resendableInBatch[0].formSchemaSnapshot;
    const { fields, metaByName } = parseContractFormSchema(raw);
    return fields.filter((f) => isContractAdminInputSource(metaByName[f.name]?.source));
  }, [resendableInBatch, resendTemplate?.formSchema]);

  const openBatchResendModal = () => {
    if (!selectedBatch || resendableInBatch.length === 0) return;
    const raw = resendTemplate?.formSchema ?? resendableInBatch[0]?.formSchemaSnapshot ?? '{}';
    const { fields, metaByName } = parseContractFormSchema(raw);
    const adminFieldDefs = fields.filter((f) => isContractAdminInputSource(metaByName[f.name]?.source));
    const adminNames = adminFieldDefs.map((f) => f.name);
    batchResendForm.setFieldsValue({
      batchName: `${selectedBatch.batchName || '배치'} 재발송`.trim(),
      items: resendableInBatch.map((c) => ({
        contractId: c.contractId,
        include: true,
        adminInput: coerceAdminInputInitialForForm(pickAdminFromContractContent(c, adminNames), adminFieldDefs),
      })),
    });
    setBatchResendModalOpen(true);
  };

  const contractsToolbar = (
    <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
      <Select value={statusFilter} onChange={(v) => setStatusFilter(v)} options={[...STATUS_OPTIONS]} className="tw-w-40" />
      <Button className="!tw-rounded-xl" loading={contractsRefreshing} onClick={() => void refreshContracts()}>
        새로고침
      </Button>
    </div>
  );

  const renderContractsTable = (compact: boolean) => (
    <Table<ContractRecord>
      rowKey="contractId"
      size={compact ? 'small' : 'middle'}
      loading={contractsLoading || contractsRefreshing}
      dataSource={filteredContracts}
      pagination={{ pageSize: compact ? 5 : 8, showSizeChanger: false }}
      className="[&_.ant-table]:!tw-bg-white [&_.ant-table-thead>tr>th]:!tw-border-slate-200 [&_.ant-table-thead>tr>th]:!tw-bg-slate-50 [&_.ant-table-thead>tr>th]:!tw-px-4 [&_.ant-table-thead>tr>th]:!tw-py-3 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600 [&_.ant-table-tbody>tr>td]:!tw-border-slate-100 [&_.ant-table-tbody>tr>td]:!tw-px-4 [&_.ant-table-tbody>tr>td]:!tw-py-4 [&_.ant-table-tbody>tr:hover>td]:!tw-bg-slate-50/70"
      locale={{ emptyText: '계약 데이터가 없습니다.' }}
      onRow={(record) => ({
        onClick: (e) => {
          const el = e.target as HTMLElement;
          if (el.closest('button, a, [role="button"], .ant-select, .ant-tabs')) return;
          setSelectedContractId(record.contractId);
        },
        className: 'tw-cursor-pointer',
      })}
      columns={compact ? [
        { title: '직원', dataIndex: 'employeeName', key: 'employeeName', width: 110 },
        { title: '템플릿', dataIndex: 'templateName', key: 'templateName', ellipsis: true },
        { title: '상태', dataIndex: 'contractStatus', key: 'contractStatus', width: 100, render: (v: string) => statusTag(v) },
      ] : [
        { title: '직원', dataIndex: 'employeeName', key: 'employeeName', width: 140 },
        { title: '사번', dataIndex: 'employeeSabun', key: 'employeeSabun', width: 120, render: (v: string | null) => v || '—' },
        { title: '부서', dataIndex: 'organizationName', key: 'organizationName', width: 140, render: (v: string | null) => v || '—' },
        { title: '템플릿', dataIndex: 'templateName', key: 'templateName', ellipsis: true },
        {
          title: '문서번호',
          dataIndex: 'contractNumber',
          key: 'contractNumber',
          width: 140,
          ellipsis: true,
          render: (v: string | null) => v?.trim() || '—',
        },
        { title: '상태', dataIndex: 'contractStatus', key: 'contractStatus', width: 120, render: (v: string) => statusTag(v) },
        {
          title: '회수 사유',
          key: 'cancelReason',
          width: 180,
          ellipsis: true,
          render: (_: unknown, row: ContractRecord) =>
            String(row.contractStatus).toUpperCase() === 'CANCELED' && row.cancelReason?.trim()
              ? row.cancelReason.trim()
              : '—',
        },
        { title: '생성일', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: (v: string) => formatDateTime(v) },
      ]}
    />
  );

  const batchesToolbar = (
    <div className="tw-mb-3 tw-flex tw-justify-end">
      <Button className="!tw-rounded-xl" loading={batchesRefreshing} onClick={() => void refreshBatches()}>
        새로고침
      </Button>
    </div>
  );

  const renderBatchesTable = (compact: boolean) => (
    <Table<ContractBatchSummary>
      rowKey="batchId"
      size={compact ? 'small' : 'middle'}
      loading={batchesLoading || batchesRefreshing}
      dataSource={batches}
      pagination={{ pageSize: compact ? 5 : 8, showSizeChanger: false }}
      className="[&_.ant-table]:!tw-bg-white [&_.ant-table-thead>tr>th]:!tw-border-slate-200 [&_.ant-table-thead>tr>th]:!tw-bg-slate-50 [&_.ant-table-thead>tr>th]:!tw-px-4 [&_.ant-table-thead>tr>th]:!tw-py-3 [&_.ant-table-thead>tr>th]:!tw-text-xs [&_.ant-table-thead>tr>th]:!tw-font-semibold [&_.ant-table-thead>tr>th]:!tw-text-slate-600 [&_.ant-table-tbody>tr>td]:!tw-border-slate-100 [&_.ant-table-tbody>tr>td]:!tw-px-4 [&_.ant-table-tbody>tr>td]:!tw-py-4 [&_.ant-table-tbody>tr:hover>td]:!tw-bg-slate-50/70"
      locale={{ emptyText: '배치 데이터가 없습니다.' }}
      onRow={(record) => ({
        onClick: (e) => {
          const el = e.target as HTMLElement;
          if (el.closest('button, a, [role="button"], .ant-select')) return;
          setSelectedBatch(record);
        },
        className: 'tw-cursor-pointer',
      })}
      columns={[
        { title: '배치명', dataIndex: 'batchName', key: 'batchName', ellipsis: true },
        { title: '템플릿', dataIndex: 'templateName', key: 'templateName', ellipsis: true },
        {
          title: '진행',
          key: 'signedRate',
          width: compact ? 148 : 200,
          render: (_: unknown, row) => {
            const total = row.totalCount || 0;
            const signed = row.signedCount || 0;
            const rejected = row.rejectedCount ?? 0;
            const rate = total > 0 ? Math.round((signed / total) * 100) : 0;
            return (
              <span className="tw-text-xs sm:tw-text-sm">
                서명 {signed}/{total} ({rate}%), 거절 {rejected}/{total}
              </span>
            );
          },
        },
        { title: '생성일', dataIndex: 'createdAt', key: 'createdAt', width: compact ? 138 : 170, render: (v: string) => formatDateTime(v) },
      ]}
    />
  );

  return (
    <>
      {hubLayout ? (
        <div className="tw-w-full">
          <div className="tw-grid tw-w-full tw-grid-cols-1 tw-gap-4 lg:tw-grid-cols-2">
            <Card
              title="전체 계약 목록"
              className={`${CONTRACT_HUB_CARD_CLASS} tw-overflow-hidden [&_.ant-card-head]:tw-border-slate-100 [&_.ant-card-head-title]:tw-text-sm [&_.ant-card-head-title]:tw-font-semibold [&_.ant-card-body]:tw-p-5`}
            >
              {contractsToolbar}
              <div className="tw-overflow-x-auto">
                {renderContractsTable(true)}
              </div>
            </Card>
            <Card
              title="일괄 발송 현황"
              className={`${CONTRACT_HUB_CARD_CLASS} tw-overflow-hidden [&_.ant-card-head]:tw-border-slate-100 [&_.ant-card-head-title]:tw-text-sm [&_.ant-card-head-title]:tw-font-semibold [&_.ant-card-body]:tw-p-5`}
            >
              {batchesToolbar}
              <div className="tw-overflow-x-auto">
                {renderBatchesTable(true)}
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <Space direction="vertical" className="tw-w-full" size={16}>
          <Card className="tw-border-slate-200/80 tw-shadow-sm" title="전체 계약 목록">
            {contractsToolbar}
            {renderContractsTable(false)}
          </Card>
          <Card className="tw-border-slate-200/80 tw-shadow-sm" title="일괄 발송 현황">
            {batchesToolbar}
            {renderBatchesTable(false)}
          </Card>
        </Space>
      )}

      <AppModal
        title={contractDetail ? `계약 상세 - ${contractDetail.templateName}` : '계약 상세'}
        open={selectedContractId != null}
        onCancel={() => setSelectedContractId(null)}
        footer={
          selectedContractId ? (
            <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-end tw-gap-2">
              <Button key="close" onClick={() => setSelectedContractId(null)}>
                닫기
              </Button>
              {!detailLoading && contractDetail && canShowHistoryButton ? (
                <Button key="history" onClick={() => setHistoryModalOpen(true)}>
                  이력 보기
                </Button>
              ) : null}
              {!detailLoading && contractDetail && canShowResendButton ? (
                <Button key="resend" onClick={() => setResendModalOpen(true)}>
                  재발송
                </Button>
              ) : null}
              {!detailLoading && contractDetail && canShowRemindButton ? (
                <Popconfirm
                  key="remind"
                  title="이 직원에게 서명 리마인드 알림을 보낼까요?"
                  description="템플릿명이 포함된 안내(CONTRACT_REMIND)가 직원에게 발송됩니다."
                  okText="보내기"
                  cancelText="취소"
                  onConfirm={() => void remindContractM.mutateAsync(contractDetail.contractId)}
                >
                  <Button
                    loading={remindContractM.isPending && remindContractM.variables === contractDetail.contractId}
                  >
                    서명 리마인드
                  </Button>
                </Popconfirm>
              ) : null}
              {!detailLoading && contractDetail && canShowRecallButton ? (
                <Button
                  key="recall"
                  danger
                  onClick={() => {
                    setCancelReasonDraft('');
                    setCancelModalOpen(true);
                  }}
                >
                  회수
                </Button>
              ) : null}
              {!detailLoading && contractDetail && canRejectContractAsCurrentEmployee ? (
                <Button
                  key="reject"
                  danger
                  onClick={() => {
                    setRejectReasonDraft('');
                    setRejectModalOpen(true);
                  }}
                >
                  거절
                </Button>
              ) : null}
              {!detailLoading && contractDetail && canSignContractAsCurrentEmployee ? (
                <Button
                  key="sign"
                  type="primary"
                  loading={
                    signSubmitting ||
                    (signM.isPending && signM.variables?.contractId === contractDetail.contractId)
                  }
                  onClick={() => openSignModal(contractDetail.contractId)}
                >
                  서명하기
                </Button>
              ) : null}
            </div>
          ) : null
        }
        width={920}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        {detailLoading || !contractDetail ? (
          <Spin />
        ) : (
          <Space direction="vertical" className="tw-w-full" size={12}>
            {!detailLoading && contractDetail && canRecallContract && (contractDetail.revision ?? 1) >= 5 ? (
              <Alert
                type="warning"
                showIcon
                message="이 계약은 재발송 한도(5회)에 도달했습니다. 추가 재발송은 불가합니다."
              />
            ) : null}
            {canSignContractAsCurrentEmployee || canRejectContractAsCurrentEmployee ? (
              <Card size="small" className="tw-border-amber-200/90 tw-bg-amber-50/60">
                <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
                  <Typography.Text className="!tw-mb-0">
                    {canRejectContractAsCurrentEmployee
                      ? '내용을 확인한 뒤 서명하거나, 동의하지 않으면 거절할 수 있습니다.'
                      : '직원 서명이 필요합니다. 내용을 확인한 뒤 서명해 주세요.'}
                  </Typography.Text>
                  <Space wrap className="tw-shrink-0">
                    {canRejectContractAsCurrentEmployee ? (
                      <Button
                        danger
                        onClick={() => {
                          setRejectReasonDraft('');
                          setRejectModalOpen(true);
                        }}
                      >
                        거절
                      </Button>
                    ) : null}
                    {canSignContractAsCurrentEmployee ? (
                      <Button
                        type="primary"
                        loading={
                          signSubmitting ||
                          (signM.isPending && signM.variables?.contractId === contractDetail.contractId)
                        }
                        onClick={() => openSignModal(contractDetail.contractId)}
                      >
                        서명하기
                      </Button>
                    ) : null}
                  </Space>
                </div>
              </Card>
            ) : null}
            <Card size="small" title="계약서 내용">
              <ApprovalFormPaperLayout
                documentName={contractDetail.templateName}
                categoryLabel="전자계약"
                requestTypeCode={contractDetail.contractType}
                drafterName={contractDetail.employeeName || '—'}
                drafterOrg={contractDetail.organizationName || '—'}
                drafterJobTitle={contractDetail.jobTitleName || undefined}
                writtenDate={dayjs(contractDetail.createdAt).isValid() ? dayjs(contractDetail.createdAt).format('YYYY-MM-DD') : contractDetail.createdAt}
                documentNumber={contractDetail.contractNumber?.trim() || undefined}
                stampColumn={
                  <table className="tw-w-[14rem] tw-table-fixed tw-border-collapse tw-text-sm">
                    <colgroup>
                      <col className="tw-w-[2rem]" />
                      <col className="tw-w-[6rem]" />
                      <col className="tw-w-[6rem]" />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td
                          rowSpan={3}
                          className="tw-border tw-border-solid tw-border-black tw-bg-[#efefef] tw-px-0 tw-py-2 tw-text-center tw-align-middle tw-text-[11px] tw-font-semibold tw-text-black"
                          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                        >
                          서명
                        </td>
                        <td className="tw-border tw-border-solid tw-border-black tw-bg-[#efefef] tw-px-2 tw-py-1 tw-text-center tw-text-xs tw-font-semibold">직원</td>
                        <td className="tw-border tw-border-solid tw-border-black tw-bg-[#efefef] tw-px-2 tw-py-1 tw-text-center tw-text-xs tw-font-semibold">회사</td>
                      </tr>
                      <tr>
                        <td className="tw-border tw-border-solid tw-border-black tw-bg-white tw-px-1 tw-py-1 tw-text-center tw-align-middle">
                          <div className="tw-flex tw-min-h-[3.2rem] tw-flex-col tw-items-center tw-justify-center tw-gap-1">
                            <span className="tw-text-[11px] tw-font-semibold">{detailSignCells.employee.label}</span>
                            {detailSignCells.employee.imageUrl ? (
                              <img src={detailSignCells.employee.imageUrl} alt="직원 서명" className="tw-max-h-8 tw-max-w-[3.25rem] tw-object-contain" />
                            ) : null}
                          </div>
                        </td>
                        <td className="tw-border tw-border-solid tw-border-black tw-bg-white tw-px-1 tw-py-1 tw-text-center tw-align-middle">
                          <div className="tw-flex tw-min-h-[3.2rem] tw-flex-col tw-items-center tw-justify-center tw-gap-1">
                            <span className="tw-text-[11px] tw-font-semibold">{detailSignCells.company.label}</span>
                            {detailSignCells.company.imageUrl ? (
                              <img src={detailSignCells.company.imageUrl} alt="회사 직인" className="tw-max-h-8 tw-max-w-[3.25rem] tw-object-contain" />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="tw-border tw-border-solid tw-border-black tw-bg-white tw-px-1 tw-py-0.5 tw-text-center tw-text-[10px]">
                          {detailSignCells.employee.signedAt || '\u00a0'}
                        </td>
                        <td className="tw-border tw-border-solid tw-border-black tw-bg-white tw-px-1 tw-py-0.5 tw-text-center tw-text-[10px]">
                          {detailSignCells.company.signedAt || '\u00a0'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                }
              >
                <ApprovalFormPaperFieldRow label="문서번호">
                  <Typography.Text>{contractDetail.contractNumber?.trim() || '—'}</Typography.Text>
                </ApprovalFormPaperFieldRow>
                <ApprovalFormPaperFieldRow label="상태">
                  {statusTag(contractDetail.contractStatus)}
                </ApprovalFormPaperFieldRow>
                <ApprovalFormPaperFieldRow label="개정 차수">
                  <Typography.Text>{contractDetail.revision ?? 1}</Typography.Text>
                </ApprovalFormPaperFieldRow>
                <ApprovalFormPaperFieldRow label="이전 계약">
                  {contractDetail.previousContractId ? (
                    <Button
                      type="link"
                      size="small"
                      className="!tw-h-auto !tw-p-0"
                      onClick={() => setSelectedContractId(contractDetail.previousContractId)}
                    >
                      이전 버전 보기
                    </Button>
                  ) : (
                    <Typography.Text type="secondary">—</Typography.Text>
                  )}
                </ApprovalFormPaperFieldRow>
                {String(contractDetail.contractStatus).toUpperCase() === 'CANCELED' && contractDetail.cancelReason?.trim() ? (
                  <ApprovalFormPaperFieldRow label="회수 사유">
                    <Typography.Text className="tw-whitespace-pre-wrap">{contractDetail.cancelReason.trim()}</Typography.Text>
                  </ApprovalFormPaperFieldRow>
                ) : null}
                {String(contractDetail.contractStatus).toUpperCase() === 'REJECTED' && contractEffectiveRejectReason(contractDetail) ? (
                  <ApprovalFormPaperFieldRow label="거절 사유">
                    <Typography.Text className="tw-whitespace-pre-wrap">{contractEffectiveRejectReason(contractDetail)}</Typography.Text>
                  </ApprovalFormPaperFieldRow>
                ) : null}
                {detailFields.length > 0 ? (
                  detailFields.map((field) => (
                    <ApprovalFormPaperFieldRow key={field.key} label={field.label}>
                      <Typography.Text className={field.type === 'textarea' ? 'tw-whitespace-pre-wrap tw-break-words' : undefined}>
                        {formatValue(detailContent[field.key] ?? (field.sourceField ? detailContent[field.sourceField] : undefined))}
                      </Typography.Text>
                    </ApprovalFormPaperFieldRow>
                  ))
                ) : (
                  <ApprovalFormPaperFieldRow label="안내">
                    <Typography.Text type="secondary">양식 스키마를 해석할 수 없습니다.</Typography.Text>
                  </ApprovalFormPaperFieldRow>
                )}
              </ApprovalFormPaperLayout>
            </Card>
          </Space>
        )}
        </div>
      </AppModal>

      <AppModal
        title={selectedBatch ? `배치 상세 - ${selectedBatch.batchName || selectedBatch.batchId}` : '배치 상세'}
        open={selectedBatch != null}
        onCancel={() => {
          setSelectedBatch(null);
          setOnlyUnsigned(false);
        }}
        footer={null}
        width={980}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
          <Space direction="vertical" size={0}>
            {selectedBatch ? (
              <Typography.Text type="secondary" className="tw-text-sm">
                서명 {selectedBatch.signedCount}/{selectedBatch.totalCount}, 거절 {(selectedBatch.rejectedCount ?? 0)}/{selectedBatch.totalCount}
              </Typography.Text>
            ) : null}
            {selectedBatch?.previousBatchId ? (
              <Button
                type="link"
                size="small"
                className="!tw-p-0"
                onClick={() => {
                  const prev = batches.find((b) => b.batchId === selectedBatch.previousBatchId);
                  if (prev) setSelectedBatch(prev);
                  else message.info('목록에 이전 배치가 없습니다. 상단 목록 새로고침 후 다시 시도해 주세요.');
                }}
              >
                이전 배치 보기
              </Button>
            ) : null}
          </Space>
          <Space wrap>
            {canRecallContract && selectedBatch && batchPendingSignatureCount > 0 ? (
              <Popconfirm
                title={`미서명 ${batchPendingSignatureCount}명에게 서명 리마인드 알림을 일괄 발송할까요?`}
                description="이미 서명·거절·회수된 건은 제외됩니다."
                okText="발송"
                cancelText="취소"
                onConfirm={() => void remindBatchM.mutateAsync(selectedBatch.batchId)}
              >
                <Button
                  loading={remindBatchM.isPending && remindBatchM.variables === selectedBatch.batchId}
                >
                  일괄 리마인드
                </Button>
              </Popconfirm>
            ) : null}
            {canRecallContract && resendableInBatch.length > 0 ? (
              <Button type="primary" onClick={() => openBatchResendModal()}>
                재발송
              </Button>
            ) : null}
            <Typography.Text type="secondary">미서명자만 보기</Typography.Text>
            <Switch checked={onlyUnsigned} onChange={setOnlyUnsigned} />
          </Space>
        </div>
        <Table<ContractRecord>
          rowKey="contractId"
          loading={batchContractsLoading}
          dataSource={visibleBatchContracts}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: '배치 계약 데이터가 없습니다.' }}
          onRow={(record) => ({
            onClick: (e) => {
              const el = e.target as HTMLElement;
              if (el.closest('button, a, [role="button"], .ant-select, .ant-switch')) return;
              setSelectedContractId(record.contractId);
            },
            className: 'tw-cursor-pointer',
          })}
          columns={[
            { title: '직원', dataIndex: 'employeeName', key: 'employeeName', width: 140 },
            { title: '사번', dataIndex: 'employeeSabun', key: 'employeeSabun', width: 120, render: (v: string | null) => v || '—' },
            { title: '부서', dataIndex: 'organizationName', key: 'organizationName', width: 140, render: (v: string | null) => v || '—' },
            {
              title: '문서번호',
              dataIndex: 'contractNumber',
              key: 'contractNumber',
              width: 130,
              ellipsis: true,
              render: (v: string | null) => v?.trim() || '—',
            },
            { title: '상태', dataIndex: 'contractStatus', key: 'contractStatus', width: 120, render: (v: string) => statusTag(v) },
            {
              title: '회수 사유',
              key: 'cancelReason',
              width: 160,
              ellipsis: true,
              render: (_: unknown, row: ContractRecord) =>
                String(row.contractStatus).toUpperCase() === 'CANCELED' && row.cancelReason?.trim()
                  ? row.cancelReason.trim()
                  : '—',
            },
          ]}
        />
        </div>
      </AppModal>

      <AppDoubleActionModal
        title="계약 회수"
        open={cancelModalOpen && Boolean(contractDetail)}
        onClose={() => {
          setCancelModalOpen(false);
          setCancelReasonDraft('');
        }}
        confirmText="회수"
        cancelText="닫기"
        confirmDanger
        confirmLoading={cancelContractM.isPending}
        onConfirm={() => {
          const r = cancelReasonDraft.trim();
          if (!r) {
            message.warning('회수 사유를 입력해 주세요.');
            return;
          }
          if (!contractDetail) return;
          void cancelContractM.mutateAsync({ contractId: contractDetail.contractId, cancelReason: r });
        }}
        destroyOnHidden
        width={520}
      >
        <div className="tw-px-5 tw-py-4">
        <Typography.Paragraph type="secondary" className="tw-text-sm">
          회수 시 직원에게 알림이 전송되며, 직원 당사자 서명 상태는 회수됨으로 표시됩니다.
        </Typography.Paragraph>
        <Input.TextArea
          rows={4}
          value={cancelReasonDraft}
          onChange={(e) => setCancelReasonDraft(e.target.value)}
          placeholder="회수 사유를 입력해 주세요."
          maxLength={2000}
          showCount
        />
        </div>
      </AppDoubleActionModal>

      <AppDoubleActionModal
        title="계약 거절"
        open={rejectModalOpen && Boolean(contractDetail)}
        onClose={() => {
          setRejectModalOpen(false);
          setRejectReasonDraft('');
        }}
        confirmText="거절"
        cancelText="닫기"
        confirmDanger
        confirmLoading={rejectContractM.isPending}
        onConfirm={() => {
          const r = rejectReasonDraft.trim();
          if (!r) {
            message.warning('거절 사유를 입력해 주세요.');
            return;
          }
          if (!contractDetail) return;
          void rejectContractM.mutateAsync({ contractId: contractDetail.contractId, rejectReason: r });
        }}
        destroyOnHidden
        width={520}
      >
        <div className="tw-px-5 tw-py-4">
        <Typography.Paragraph type="secondary" className="tw-text-sm">
          거절 후에는 이 계약에 서명할 수 없으며, 인사팀에서 재발송할 수 있습니다.
        </Typography.Paragraph>
        <Input.TextArea
          rows={4}
          value={rejectReasonDraft}
          onChange={(e) => setRejectReasonDraft(e.target.value)}
          placeholder="거절 사유를 입력해 주세요."
          maxLength={2000}
          showCount
        />
        </div>
      </AppDoubleActionModal>

      <AppDoubleActionModal
        title="계약 재발송"
        open={resendModalOpen && Boolean(contractDetail)}
        onClose={() => {
          setResendModalOpen(false);
          resendForm.resetFields();
        }}
        confirmText="재발송"
        cancelText="닫기"
        confirmLoading={resendContractM.isPending}
        onConfirm={async () => {
          if (!contractDetail) return;
          try {
            await resendForm.validateFields();
            const adminKeys = singleResendAdminFields.map((f) => f.name);
            const adminObj = collectContractAdminInputFromForm((path) => resendForm.getFieldValue(path), adminKeys);
            await resendContractM.mutateAsync({
              contractId: contractDetail.contractId,
              adminInputJson: Object.keys(adminObj).length > 0 ? adminObj : null,
            });
          } catch {
            /* validation */
          }
        }}
        destroyOnHidden
        width={640}
      >
        <div className="tw-px-5 tw-py-4">
        <Typography.Paragraph type="secondary" className="tw-text-sm">
          거절 또는 회수된 계약을 바탕으로 새 계약이 발송됩니다. ADMIN_INPUT 항목만 수정할 수 있으며, 비워 두면 기존 값이 유지됩니다.
        </Typography.Paragraph>
        <Form form={resendForm} layout="vertical" className="tw-mt-2">
          {singleResendAdminFields.length === 0 ? (
            <Typography.Text type="secondary">이 템플릿에는 관리자 입력(ADMIN_INPUT) 필드가 없습니다.</Typography.Text>
          ) : (
            singleResendAdminFields.map((field) => (
              <Form.Item key={field.name} name={['adminInput', field.name]} label={field.label}>
                <ContractAdminFormFieldInput field={field} textAreaRows={3} />
              </Form.Item>
            ))
          )}
        </Form>
        </div>
      </AppDoubleActionModal>

      <AppSingleActionModal
        title="계약 이력"
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        onSubmit={() => setHistoryModalOpen(false)}
        submitText="닫기"
        width={720}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        {historyLoading ? (
          <Spin />
        ) : contractHistory.length === 0 ? (
          <Typography.Text type="secondary">이력이 없습니다.</Typography.Text>
        ) : (
          <Timeline
            items={contractHistory.map((row) => {
              const st = String(row.contractStatus).toUpperCase();
              const color =
                st === 'SIGNED' ? 'green' : st === 'REJECTED' ? 'red' : st === 'CANCELED' ? 'gray' : 'blue';
              return {
                color,
                children: (
                  <div className="tw-space-y-1">
                    <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                      <Typography.Text strong>개정 {row.revision ?? 1}</Typography.Text>
                      {statusTag(row.contractStatus)}
                      <Typography.Text type="secondary" className="tw-text-xs">
                        {formatDateTime(row.createdAt)}
                      </Typography.Text>
                    </div>
                    <div className="tw-text-sm">
                      {row.employeeName} · {row.templateName}
                    </div>
                    {st === 'CANCELED' && row.cancelReason?.trim() ? (
                      <Typography.Text type="secondary" className="tw-text-xs tw-whitespace-pre-wrap">
                        회수: {row.cancelReason.trim()}
                      </Typography.Text>
                    ) : null}
                    {st === 'REJECTED' && contractEffectiveRejectReason(row) ? (
                      <Typography.Text type="secondary" className="tw-text-xs tw-whitespace-pre-wrap">
                        거절: {contractEffectiveRejectReason(row)}
                      </Typography.Text>
                    ) : null}
                    <Button
                      type="link"
                      size="small"
                      className="!tw-h-auto !tw-p-0"
                      onClick={() => {
                        setHistoryModalOpen(false);
                        setSelectedContractId(row.contractId);
                      }}
                    >
                      이 버전 상세 열기
                    </Button>
                  </div>
                ),
              };
            })}
          />
        )}
        </div>
      </AppSingleActionModal>

      <AppDoubleActionModal
        title={selectedBatch ? `배치 재발송 - ${selectedBatch.batchName}` : '배치 재발송'}
        open={batchResendModalOpen}
        onClose={() => {
          setBatchResendModalOpen(false);
          batchResendForm.resetFields();
        }}
        confirmText="재발송"
        cancelText="닫기"
        confirmLoading={resendBatchM.isPending}
        onConfirm={async () => {
          if (!selectedBatch) return;
          try {
            const v = await batchResendForm.validateFields();
            const rows = v.items ?? [];
            const adminKeys = batchResendAdminFieldDefs.map((f) => f.name);
            const items = rows
              .map((row, idx) => ({ row, idx }))
              .filter(({ row }) => row.include !== false)
              .map(({ row, idx }) => ({
                contractId: row.contractId,
                adminInputJson:
                  adminKeys.length > 0
                    ? collectContractAdminInputFromForm(
                        (path) => batchResendForm.getFieldValue(path),
                        adminKeys,
                        ['items', idx],
                      )
                    : {},
              }));
            if (items.length === 0) {
              message.warning('재발송할 계약을 1건 이상 선택해 주세요.');
              return;
            }
            await resendBatchM.mutateAsync({
              batchId: selectedBatch.batchId,
              batchName: v.batchName.trim(),
              items,
            });
          } catch {
            /* validation */
          }
        }}
        width={820}
        destroyOnHidden
      >
        <div className="tw-px-5 tw-py-4">
        <Form form={batchResendForm} layout="vertical">
          <Form.Item name="batchName" label="새 배치 이름" rules={[{ required: true, message: '배치 이름을 입력해 주세요.' }]}>
            <Input maxLength={120} placeholder="예: 2026년 상반기 근로계약 재발송" />
          </Form.Item>
          <Typography.Text type="secondary" className="tw-mb-2 tw-block tw-text-sm">
            거절·회수된 건만 표시됩니다. 포함에서 해제하면 해당 건은 재발송되지 않습니다.
          </Typography.Text>
          <Form.List name="items">
            {(fields) => (
              <Space direction="vertical" className="tw-w-full" size={12}>
                {fields.map((field) => {
                  const idx = field.name;
                  const row = batchResendForm.getFieldValue(['items', idx]) as { contractId?: string } | undefined;
                  const rec = resendableInBatch.find((c) => c.contractId === row?.contractId);
                  return (
                    <Card
                      key={field.key}
                      size="small"
                      title={
                        <Space wrap>
                          <span>{rec?.employeeName ?? row?.contractId ?? '계약'}</span>
                          {rec ? statusTag(rec.contractStatus) : null}
                        </Space>
                      }
                    >
                      <Form.Item name={[field.name, 'contractId']} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, 'include']} valuePropName="checked" initialValue={true}>
                        <Checkbox>이 건 재발송에 포함</Checkbox>
                      </Form.Item>
                      {batchResendAdminFieldDefs.length === 0 ? (
                        <Typography.Text type="secondary" className="tw-text-sm">
                          ADMIN_INPUT 필드가 없습니다.
                        </Typography.Text>
                      ) : (
                        batchResendAdminFieldDefs.map((af) => (
                          <Form.Item key={`${field.key}-${af.name}`} name={[field.name, 'adminInput', af.name]} label={af.label}>
                            <ContractAdminFormFieldInput field={af} textAreaRows={2} />
                          </Form.Item>
                        ))
                      )}
                    </Card>
                  );
                })}
              </Space>
            )}
          </Form.List>
        </Form>
        </div>
      </AppDoubleActionModal>

      <AppModal
        title="전자계약 서명"
        open={signModalContractId != null}
        onCancel={closeSignModal}
        destroyOnHidden
        okText="서명"
        cancelText="취소"
        confirmLoading={signSubmitting || signM.isPending}
        onOk={() => void handleSubmitSign()}
        afterOpenChange={(open) => {
          if (open) padRef.current?.clear();
        }}
        width={640}
        styles={{ body: { paddingTop: 8 } }}
      >
        <div className="tw-px-5 tw-py-4">
        <Typography.Paragraph type="secondary" className="tw-mb-3 tw-text-sm">
          계약 내용을 확인한 뒤 아래 패드에 서명하고 &quot;서명&quot;을 눌러 주세요. 서명 이미지는 업로드된 뒤
          전자계약에 반영됩니다.
        </Typography.Paragraph>
        <ContractSignaturePad ref={padRef} className="tw-w-full" />
        </div>
      </AppModal>
    </>
  );
}
