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
  rejectedCount: number;
  previousBatchId: string | null;
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
  rejectedCount: number;
  previousBatchId: string | null;
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
  previousContractId: string | null;
  revision: number;
  cancelReason: string | null;
  rejectReason: string | null;
  /** 회사 직인 이미지 URL */
  sealImageUrl: string | null;
  /** 계약 문서번호 (예: 근로-2026-0001) */
  contractNumber: string | null;
};

/** 계약 본문 또는 직원 당사자에 표시할 거절 사유 */
export function contractEffectiveRejectReason(detail: ContractRecord): string | null {
  const top = detail.rejectReason?.trim();
  if (top) return top;
  const emp = detail.parties?.find((p) => String(p.partyRole).toUpperCase() === 'EMPLOYEE');
  return emp?.rejectReason?.trim() || null;
}

/** 계약이 서명 대기이고 직원(EMPLOYEE) 당사자 서명이 아직 완료되지 않은 경우 */
export function contractEmployeeSignaturePending(detail: ContractRecord): boolean {
  if (String(detail.contractStatus).toUpperCase() !== 'SENT') return false;
  const emp = detail.parties?.find((p) => String(p.partyRole).toUpperCase() === 'EMPLOYEE');
  if (!emp) return true;
  const st = String(emp.signStatus).toUpperCase();
  if (st === 'SIGNED') return false;
  if (st === 'REJECTED') return false;
  if (st === 'CANCELED') return false;
  return true;
}

/**
 * 직원 본인이 POST /reject 호출 가능한지 (SENT, EMPLOYEE 당사자 PENDING).
 * memberId 또는 employeeMemberId가 로그인 사용자와 일치해야 합니다.
 */
export function contractEmployeeCanReject(detail: ContractRecord, currentMemberId: string | undefined | null): boolean {
  const uid = currentMemberId?.trim();
  if (!uid) return false;
  if (String(detail.contractStatus).toUpperCase() !== 'SENT') return false;
  const emp = detail.parties?.find((p) => String(p.partyRole).toUpperCase() === 'EMPLOYEE');
  if (!emp) return false;
  if (String(emp.signStatus).toUpperCase() !== 'PENDING') return false;
  const memberMatch = emp.memberId?.trim() === uid;
  const rowMatch = detail.employeeMemberId?.trim() === uid;
  return memberMatch || rowMatch;
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
  const rejectedCountRaw = o.rejectedCount ?? o.rejected_count;
  const prevBatch = asText(o.previousBatchId ?? o.previous_batch_id);
  return {
    batchId,
    templateId,
    templateName: asText(o.templateName ?? o.template_name),
    batchName: asText(o.batchName ?? o.batch_name),
    contractType: asText(o.contractType ?? o.contract_type),
    totalCount: typeof totalCountRaw === 'number' ? totalCountRaw : Number(totalCountRaw ?? 0) || 0,
    signedCount: typeof signedCountRaw === 'number' ? signedCountRaw : Number(signedCountRaw ?? 0) || 0,
    rejectedCount: typeof rejectedCountRaw === 'number' ? rejectedCountRaw : Number(rejectedCountRaw ?? 0) || 0,
    previousBatchId: prevBatch || null,
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
  const revisionRaw = o.revision ?? o.Revision;
  const revision =
    typeof revisionRaw === 'number' && Number.isFinite(revisionRaw)
      ? revisionRaw
      : Number(revisionRaw ?? 1) || 1;
  const prevContract = asText(o.previousContractId ?? o.previous_contract_id);
  const cancelReason = asText(o.cancelReason ?? o.cancel_reason);
  const rejectReasonTop = asText(o.rejectReason ?? o.reject_reason);
  const sealImageUrl = asText(o.sealImageUrl ?? o.seal_image_url);
  const contractNumber = asText(o.contractNumber ?? o.contract_number);
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
    previousContractId: prevContract || null,
    revision,
    cancelReason: cancelReason || null,
    rejectReason: rejectReasonTop || null,
    sealImageUrl: sealImageUrl || null,
    contractNumber: contractNumber || null,
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

  async listMyContracts(params?: { status?: 'SENT' | 'SIGNED' | 'REJECTED' | 'CANCELED' }): Promise<ContractRecord[]> {
    const response = await httpClient.get('/contract/contracts/my', {
      params: params?.status ? { status: params.status } : undefined,
    });
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
        rejectedCount: item.rejectedCount,
        previousBatchId: item.previousBatchId,
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

  /** 인사팀(CONTRACT:READ) — 전체 계약 상세 */
  async getContract(contractId: string): Promise<ContractRecord> {
    const response = await httpClient.get(`/contract/contracts/${encodeURIComponent(contractId)}`);
    const normalized = normalizeContractRecord(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('계약 상세 응답을 해석할 수 없습니다.');
    return normalized;
  },

  /** 직원 본인 계약만 — GET /{id} 는 인사팀 전용이므로 내 계약 화면에서 사용 */
  async getContractMy(contractId: string): Promise<ContractRecord> {
    const response = await httpClient.get(`/contract/contracts/${encodeURIComponent(contractId)}/my`);
    const normalized = normalizeContractRecord(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('계약 상세 응답을 해석할 수 없습니다.');
    return normalized;
  },

  /** 인사팀(CONTRACT:CREATE) — 서명 대기(SENT)이고 직원 미서명인 계약만 회수 가능 */
  async cancelContract(contractId: string, body: { cancelReason: string }): Promise<ContractRecord> {
    const response = await httpClient.post(`/contract/contracts/${encodeURIComponent(contractId)}/cancel`, body);
    const normalized = normalizeContractRecord(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('계약 회수 응답을 해석할 수 없습니다.');
    return normalized;
  },

  /** REJECTED 또는 CANCELED 계약만, revision 5 미만 */
  async resendContract(
    contractId: string,
    body: { adminInputJson?: string | null } = {},
  ): Promise<ContractRecord> {
    const response = await httpClient.post(`/contract/contracts/${encodeURIComponent(contractId)}/resend`, body);
    const normalized = normalizeContractRecord(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('계약 재발송 응답을 해석할 수 없습니다.');
    return normalized;
  },

  async resendBatch(
    batchId: string,
    body: {
      batchName: string;
      items: Array<{ contractId: string; adminInputJson?: string | null }>;
    },
  ): Promise<ContractBatchSendResult> {
    const response = await httpClient.post(`/contract/contracts/batches/${encodeURIComponent(batchId)}/resend`, body);
    const normalized = normalizeContractBatchSendResult(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('배치 재발송 응답을 해석할 수 없습니다.');
    return normalized;
  },

  /** 인사팀(CONTRACT:READ) — 계약 개정 이력 */
  async getContractHistory(contractId: string): Promise<ContractRecord[]> {
    const response = await httpClient.get(`/contract/contracts/${encodeURIComponent(contractId)}/history`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeContractRecord(item))
      .filter((item): item is ContractRecord => item != null);
  },

  /** 직원 본인 계약 이력만 — /history 는 인사팀 전용 */
  async getContractHistoryMy(contractId: string): Promise<ContractRecord[]> {
    const response = await httpClient.get(`/contract/contracts/${encodeURIComponent(contractId)}/history/my`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeContractRecord(item))
      .filter((item): item is ContractRecord => item != null);
  },

  /** 직원 본인 — SENT이고 EMPLOYEE 서명이 PENDING인 경우만 */
  async rejectContract(contractId: string, body: { rejectReason: string }): Promise<ContractRecord> {
    const response = await httpClient.post(`/contract/contracts/${encodeURIComponent(contractId)}/reject`, body);
    const normalized = normalizeContractRecord(unwrapApiResponse<unknown>(response.data));
    if (!normalized) throw new Error('계약 거절 응답을 해석할 수 없습니다.');
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

  /** 인사팀(CONTRACT:CREATE) — SENT인 계약만. 미서명 직원에게 CONTRACT_REMIND 알림 */
  async remindContract(contractId: string): Promise<{ message: string }> {
    const response = await httpClient.post(`/contract/contracts/${encodeURIComponent(contractId)}/remind`, undefined);
    const body = response.data as { message?: string } | undefined;
    return {
      message:
        typeof body?.message === 'string' && body.message.trim()
          ? body.message.trim()
          : '서명 리마인드 알림이 발송되었습니다.',
    };
  },

  /** 인사팀(CONTRACT:CREATE) — 배치 내 서명 대기 건만 대상(이미 서명·거절·회수 제외). 응답 data는 발송 인원 수 */
  async remindContractBatch(batchId: string): Promise<{ message: string; remindedCount: number }> {
    const response = await httpClient.post(
      `/contract/contracts/batches/${encodeURIComponent(batchId)}/remind`,
      undefined,
    );
    const body = response.data as { message?: string; data?: number | null } | undefined;
    const rawCount =
      typeof body?.data === 'number' && Number.isFinite(body.data)
        ? body.data
        : unwrapApiResponse<number | null>(response.data);
    const remindedCount =
      typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount >= 0 ? rawCount : 0;
    return {
      remindedCount,
      message:
        typeof body?.message === 'string' && body.message.trim()
          ? body.message.trim()
          : remindedCount > 0
            ? `${remindedCount}명에게 리마인드 알림이 발송되었습니다.`
            : '리마인드 알림이 발송되었습니다.',
    };
  },
};
