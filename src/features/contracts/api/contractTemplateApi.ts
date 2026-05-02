import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export const CONTRACT_TYPES = ['EMPLOYMENT', 'SALARY', 'NDA', 'PRIVACY_CONSENT'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export type ContractTemplate = {
  templateId: string;
  companyId: string;
  templateName: string;
  contractType: ContractType | string;
  formSchema: string;
  isActiveYn: 'Y' | 'N';
  createdAt: string;
  updatedAt: string;
};

export type ContractSendResult = {
  contractId: string;
  templateId: string;
  templateName: string;
  employeeMemberId: string;
  contractType: string;
  contractStatus: string;
  createdAt: string;
};

export type ContractBatchSendResult = {
  batchId: string;
  templateId: string;
  templateName: string;
  batchName: string;
  contractType: string;
  totalCount: number;
  signedCount: number;
  createdBy?: string;
  createdAt: string;
};

export type ContractBatchSummary = {
  batchId: string;
  batchName: string;
  templateName: string;
  contractType: string;
  totalCount: number;
  signedCount: number;
  createdBy: string;
  createdAt: string;
};

export type ContractParty = {
  partyId: string;
  memberId: string;
  partyRole: string;
  signStatus: string;
  signedAt: string | null;
  signatureImageUrl: string | null;
  rejectReason: string | null;
};

export type ContractRecord = {
  contractId: string;
  companyId: string;
  templateId: string;
  templateName: string;
  batchId: string | null;
  employeeMemberId: string;
  contractType: string;
  contentJson: string;
  formSchemaSnapshot: string;
  contractStatus: string;
  signedPdfUrl: string | null;
  employeeName: string;
  employeeSabun: string | null;
  organizationName: string | null;
  jobTitleName: string | null;
  parties: ContractParty[];
  createdAt: string;
  updatedAt: string;
};

/** 계약이 서명 대기이고 직원(EMPLOYEE) 당사자 서명이 아직 완료되지 않은 경우 */
export function contractEmployeeSignaturePending(detail: ContractRecord): boolean {
  if (String(detail.contractStatus).toUpperCase() !== 'SENT') return false;
  const emp = detail.parties?.find((p) => String(p.partyRole).toUpperCase() === 'EMPLOYEE');
  if (!emp) return true;
  const st = String(emp.signStatus).toUpperCase();
  if (st === 'SIGNED') return false;
  if (st === 'REJECTED') return false;
  return true;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function asYn(value: unknown): 'Y' | 'N' {
  return String(value).toUpperCase() === 'Y' ? 'Y' : 'N';
}

function pickArray(raw: unknown, depth = 0): unknown[] {
  if (depth > 6) return [];
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const key of ['data', 'items', 'list', 'content', 'result', 'rows']) {
    const next = o[key];
    if (Array.isArray(next)) return next;
    if (next && typeof next === 'object') {
      const nested = pickArray(next, depth + 1);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function normalizeContractTemplate(raw: unknown): ContractTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const templateId = asText(o.templateId ?? o.template_id);
  const templateName = asText(o.templateName ?? o.template_name);
  const contractType = asText(o.contractType ?? o.contract_type);
  const formSchema = asText(o.formSchema ?? o.form_schema);
  if (!templateId || !templateName || !contractType) return null;
  return {
    templateId,
    companyId: asText(o.companyId ?? o.company_id),
    templateName,
    contractType,
    formSchema,
    isActiveYn: asYn(o.isActiveYn ?? o.is_active_yn),
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
  };
}

function unwrapTemplate(raw: unknown): ContractTemplate {
  const n = normalizeContractTemplate(raw);
  if (!n) throw new Error('계약서 템플릿 응답을 해석할 수 없습니다.');
  return n;
}

function normalizeContractSendResult(raw: unknown): ContractSendResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const contractId = asText(o.contractId ?? o.contract_id);
  const templateId = asText(o.templateId ?? o.template_id);
  const employeeMemberId = asText(o.employeeMemberId ?? o.employee_member_id);
  if (!contractId || !templateId || !employeeMemberId) return null;
  return {
    contractId,
    templateId,
    templateName: asText(o.templateName ?? o.template_name),
    employeeMemberId,
    contractType: asText(o.contractType ?? o.contract_type),
    contractStatus: asText(o.contractStatus ?? o.contract_status),
    createdAt: asText(o.createdAt ?? o.created_at),
  };
}

function normalizeContractBatchSendResult(raw: unknown): ContractBatchSendResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const batchId = asText(o.batchId ?? o.batch_id);
  const templateId = asText(o.templateId ?? o.template_id);
  if (!batchId || !templateId) return null;
  const totalCountRaw = o.totalCount ?? o.total_count;
  const signedCountRaw = o.signedCount ?? o.signed_count;
  return {
    batchId,
    templateId,
    templateName: asText(o.templateName ?? o.template_name),
    batchName: asText(o.batchName ?? o.batch_name),
    contractType: asText(o.contractType ?? o.contract_type),
    totalCount: typeof totalCountRaw === 'number' ? totalCountRaw : Number(totalCountRaw ?? 0) || 0,
    signedCount: typeof signedCountRaw === 'number' ? signedCountRaw : Number(signedCountRaw ?? 0) || 0,
    createdBy: asText(o.createdBy ?? o.created_by) || undefined,
    createdAt: asText(o.createdAt ?? o.created_at),
  };
}

function normalizeContractParty(raw: unknown): ContractParty | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const partyId = asText(o.partyId ?? o.party_id);
  const memberId = asText(o.memberId ?? o.member_id);
  if (!partyId || !memberId) return null;
  const signedAt = asText(o.signedAt ?? o.signed_at);
  const signatureImageUrl = asText(o.signatureImageUrl ?? o.signature_image_url);
  const rejectReason = asText(o.rejectReason ?? o.reject_reason);
  return {
    partyId,
    memberId,
    partyRole: asText(o.partyRole ?? o.party_role),
    signStatus: asText(o.signStatus ?? o.sign_status),
    signedAt: signedAt || null,
    signatureImageUrl: signatureImageUrl || null,
    rejectReason: rejectReason || null,
  };
}

function normalizeContractRecord(raw: unknown): ContractRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const contractId = asText(o.contractId ?? o.contract_id);
  const templateId = asText(o.templateId ?? o.template_id);
  const employeeMemberId = asText(o.employeeMemberId ?? o.employee_member_id);
  if (!contractId || !templateId || !employeeMemberId) return null;
  const batchId = asText(o.batchId ?? o.batch_id);
  const signedPdfUrl = asText(o.signedPdfUrl ?? o.signed_pdf_url);
  const employeeSabun = asText(o.employeeSabun ?? o.employee_sabun);
  const organizationName = asText(o.organizationName ?? o.organization_name);
  const jobTitleName = asText(o.jobTitleName ?? o.job_title_name);
  const partiesRaw = Array.isArray(o.parties) ? o.parties : [];
  const parties = partiesRaw.map((it) => normalizeContractParty(it)).filter((it): it is ContractParty => it != null);
  return {
    contractId,
    companyId: asText(o.companyId ?? o.company_id),
    templateId,
    templateName: asText(o.templateName ?? o.template_name),
    batchId: batchId || null,
    employeeMemberId,
    contractType: asText(o.contractType ?? o.contract_type),
    contentJson: asText(o.contentJson ?? o.content_json),
    formSchemaSnapshot: asText(o.formSchemaSnapshot ?? o.form_schema_snapshot),
    contractStatus: asText(o.contractStatus ?? o.contract_status),
    signedPdfUrl: signedPdfUrl || null,
    employeeName: asText(o.employeeName ?? o.employee_name),
    employeeSabun: employeeSabun || null,
    organizationName: organizationName || null,
    jobTitleName: jobTitleName || null,
    parties,
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
  };
}

export const DEFAULT_CONTRACT_FORM_SCHEMA = JSON.stringify(
  {
    fields: [
      {
        key: 'employeeName',
        label: '성명',
        type: 'text',
        source: 'AUTO',
        sourceField: 'name',
        editable: false,
      },
    ],
  },
  null,
  2,
);

export const contractTemplateApi = {
  async list(): Promise<ContractTemplate[]> {
    const response = await httpClient.get('/contract/templates');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeContractTemplate(item))
      .filter((item): item is ContractTemplate => item != null);
  },

  async listActive(): Promise<ContractTemplate[]> {
    const response = await httpClient.get('/contract/templates/active');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeContractTemplate(item))
      .filter((item): item is ContractTemplate => item != null);
  },

  async get(templateId: string): Promise<ContractTemplate> {
    const response = await httpClient.get(`/contract/templates/${encodeURIComponent(templateId)}`);
    return unwrapTemplate(unwrapApiResponse<unknown>(response.data));
  },

  async create(payload: { templateName: string; contractType: ContractType; formSchema: string }): Promise<ContractTemplate> {
    const response = await httpClient.post('/contract/templates', payload);
    return unwrapTemplate(unwrapApiResponse<unknown>(response.data));
  },

  async update(
    templateId: string,
    payload: { templateName?: string | null; formSchema?: string | null },
  ): Promise<ContractTemplate> {
    const response = await httpClient.put(`/contract/templates/${encodeURIComponent(templateId)}`, payload);
    return unwrapTemplate(unwrapApiResponse<unknown>(response.data));
  },

  async activate(templateId: string): Promise<ContractTemplate> {
    const response = await httpClient.patch(`/contract/templates/${encodeURIComponent(templateId)}/activate`);
    return unwrapTemplate(unwrapApiResponse<unknown>(response.data));
  },

  async deactivate(templateId: string): Promise<ContractTemplate> {
    const response = await httpClient.patch(`/contract/templates/${encodeURIComponent(templateId)}/deactivate`);
    return unwrapTemplate(unwrapApiResponse<unknown>(response.data));
  },

  async sendContract(payload: {
    templateId: string;
    employeeMemberId: string;
    adminInputJson?: string;
  }): Promise<ContractSendResult> {
    const response = await httpClient.post('/contract/contracts/send', payload);
    const normalized = normalizeContractSendResult(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('계약 발송 응답을 해석할 수 없습니다.');
    return normalized;
  },

  async sendContractBatch(payload: {
    templateId: string;
    batchName: string;
    items: Array<{ employeeMemberId: string; adminInputJson?: string }>;
  }): Promise<ContractBatchSendResult> {
    const response = await httpClient.post('/contract/contracts/send-batch', payload);
    const normalized = normalizeContractBatchSendResult(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('일괄 발송 응답을 해석할 수 없습니다.');
    return normalized;
  },

  async listMyContracts(): Promise<ContractRecord[]> {
    const response = await httpClient.get('/contract/contracts/my');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeContractRecord(item))
      .filter((item): item is ContractRecord => item != null);
  },

  async listContracts(): Promise<ContractRecord[]> {
    const response = await httpClient.get('/contract/contracts');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeContractRecord(item))
      .filter((item): item is ContractRecord => item != null);
  },

  async listBatches(): Promise<ContractBatchSummary[]> {
    const response = await httpClient.get('/contract/contracts/batches');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeContractBatchSendResult(item))
      .filter((item): item is ContractBatchSendResult => item != null)
      .map((item) => ({
        batchId: item.batchId,
        batchName: item.batchName,
        templateName: item.templateName,
        contractType: item.contractType,
        totalCount: item.totalCount,
        signedCount: item.signedCount,
        createdBy: item.createdBy ?? '',
        createdAt: item.createdAt,
      }));
  },

  async getBatchContracts(batchId: string): Promise<ContractRecord[]> {
    const response = await httpClient.get(`/contract/contracts/batches/${encodeURIComponent(batchId)}`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeContractRecord(item))
      .filter((item): item is ContractRecord => item != null);
  },

  async getContract(contractId: string): Promise<ContractRecord> {
    const response = await httpClient.get(`/contract/contracts/${encodeURIComponent(contractId)}`);
    const normalized = normalizeContractRecord(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('계약 상세 응답을 해석할 수 없습니다.');
    return normalized;
  },

  async signContract(
    contractId: string,
    body: { signatureImageUrl?: string } = {},
  ): Promise<ContractRecord> {
    const payload: Record<string, string> = {};
    const url = body.signatureImageUrl?.trim();
    if (url) payload.signatureImageUrl = url;
    const response = await httpClient.post(
      `/contract/contracts/${encodeURIComponent(contractId)}/sign`,
      payload,
    );
    const normalized = normalizeContractRecord(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('계약 서명 응답을 해석할 수 없습니다.');
    return normalized;
  },
};
