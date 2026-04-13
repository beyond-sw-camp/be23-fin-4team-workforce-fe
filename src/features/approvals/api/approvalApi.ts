import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export const APPROVAL_REQUEST_TYPES = [
  'VACATION',
  'ATTENDANCE',
  'HR_MOVEMENT',
  'SALARY',
  'GENERAL',
  'CONTRACT',
  'CERTIFICATE',
] as const;

export type ApprovalRequestType = (typeof APPROVAL_REQUEST_TYPES)[number];

export type ApprovalDocument = {
  documentId: string;
  companyId: string;
  documentName: string;
  formSchema: string;
  isActiveYn: 'Y' | 'N';
  requestType: ApprovalRequestType | string;
  autoApproveYn: 'Y' | 'N';
  /** 부서 문서함 노출 — 민감 양식은 N */
  isDeptVisibleYn: 'Y' | 'N';
  createdAt: string;
  updatedAt: string;
};

export type ApprovalPolicyLine = {
  policyLineId: string;
  documentId: string;
  jobTitleId: string;
  stepOrder: number;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalPolicyLineCandidateMember = {
  memberPositionId: string;
  memberId: string;
  memberName: string;
  organizationId: string;
  organizationName: string;
  jobTitleId: string;
  jobTitleName: string;
  jobGradeId: string;
  jobGradeName: string;
};

export type ApprovalPolicyLineWithCandidates = ApprovalPolicyLine & {
  candidates: ApprovalPolicyLineCandidateMember[];
};

type SavePolicyLinePayload = {
  documentId: string;
  policyLines: Array<{
    jobTitleId: string;
    stepOrder: number;
    organizationId: string | null;
  }>;
};

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function asYn(value: unknown): 'Y' | 'N' {
  return String(value).toUpperCase() === 'Y' ? 'Y' : 'N';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function pickArray(raw: unknown, depth = 0): unknown[] {
  if (depth > 6) return [];
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const key of ['data', 'items', 'list', 'content', 'result', 'rows', 'payload']) {
    const next = o[key];
    if (Array.isArray(next)) return next;
    if (next && typeof next === 'object') {
      const nested = pickArray(next, depth + 1);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function normalizeApprovalDocument(raw: unknown): ApprovalDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const documentId = asText(o.documentId ?? o.document_id);
  const documentName = asText(o.documentName ?? o.document_name);
  const requestType = asText(o.requestType ?? o.request_type);
  if (!documentId || !documentName || !requestType) return null;
  const deptRaw = o.isDeptVisibleYn ?? o.is_dept_visible_yn;
  const isDeptVisibleYn =
    deptRaw == null || deptRaw === '' ? 'Y' : asYn(deptRaw);
  return {
    documentId,
    companyId: asText(o.companyId ?? o.company_id),
    documentName,
    formSchema: asText(o.formSchema ?? o.form_schema),
    isActiveYn: asYn(o.isActiveYn ?? o.is_active_yn),
    requestType,
    autoApproveYn: asYn(o.autoApproveYn ?? o.auto_approve_yn),
    isDeptVisibleYn,
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
  };
}

function normalizePolicyLine(raw: unknown): ApprovalPolicyLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const policyLineId = asText(o.policyLineId ?? o.policy_line_id);
  const documentId = asText(o.documentId ?? o.document_id);
  const jobTitleId = asText(o.jobTitleId ?? o.job_title_id);
  if (!policyLineId || !documentId || !jobTitleId) return null;
  const organizationIdRaw = o.organizationId ?? o.organization_id;
  return {
    policyLineId,
    documentId,
    jobTitleId,
    stepOrder: asNumber(o.stepOrder ?? o.step_order),
    organizationId: organizationIdRaw == null ? null : asText(organizationIdRaw) || null,
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
  };
}

function normalizeCandidate(raw: unknown): ApprovalPolicyLineCandidateMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const memberPositionId = asText(o.memberPositionId ?? o.member_position_id);
  const memberId = asText(o.memberId ?? o.member_id);
  const memberName = asText(o.memberName ?? o.member_name);
  if (!memberPositionId || !memberId || !memberName) return null;
  return {
    memberPositionId,
    memberId,
    memberName,
    organizationId: asText(o.organizationId ?? o.organization_id),
    organizationName: asText(o.organizationName ?? o.organization_name),
    jobTitleId: asText(o.jobTitleId ?? o.job_title_id),
    jobTitleName: asText(o.jobTitleName ?? o.job_title_name),
    jobGradeId: asText(o.jobGradeId ?? o.job_grade_id),
    jobGradeName: asText(o.jobGradeName ?? o.job_grade_name),
  };
}

function normalizePolicyLineWithCandidates(raw: unknown): ApprovalPolicyLineWithCandidates | null {
  const base = normalizePolicyLine(raw);
  if (!base || !raw || typeof raw !== 'object') return null;
  const candidatesRaw = (raw as Record<string, unknown>).candidates;
  const candidates = Array.isArray(candidatesRaw)
    ? candidatesRaw
        .map((item) => normalizeCandidate(item))
        .filter((item): item is ApprovalPolicyLineCandidateMember => item != null)
    : [];
  return {
    ...base,
    candidates,
  };
}

function unwrapDocument(raw: unknown): ApprovalDocument {
  const normalized = normalizeApprovalDocument(raw);
  if (!normalized) throw new Error('양식 응답을 해석할 수 없습니다.');
  return normalized;
}

export const approvalApi = {
  async listDocuments(): Promise<ApprovalDocument[]> {
    const response = await httpClient.get('/approval/documents');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeApprovalDocument(item))
      .filter((item): item is ApprovalDocument => item != null);
  },

  async listActiveDocuments(): Promise<ApprovalDocument[]> {
    const response = await httpClient.get('/approval/documents/active');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeApprovalDocument(item))
      .filter((item): item is ApprovalDocument => item != null);
  },

  async createDocument(payload: {
    documentName: string;
    requestType: ApprovalRequestType;
    formSchema: string;
    autoApproveYn?: 'Y' | 'N';
    isDeptVisibleYn?: 'Y' | 'N';
  }): Promise<ApprovalDocument> {
    const response = await httpClient.post('/approval/documents', payload);
    return unwrapDocument(unwrapApiResponse<unknown>(response.data));
  },

  async getDocument(documentId: string): Promise<ApprovalDocument> {
    const response = await httpClient.get(`/approval/documents/${encodeURIComponent(documentId)}`);
    return unwrapDocument(unwrapApiResponse<unknown>(response.data));
  },

  async activateDocument(documentId: string): Promise<ApprovalDocument> {
    const response = await httpClient.patch(`/approval/documents/${encodeURIComponent(documentId)}/activate`);
    return unwrapDocument(unwrapApiResponse<unknown>(response.data));
  },

  async deactivateDocument(documentId: string): Promise<ApprovalDocument> {
    const response = await httpClient.patch(`/approval/documents/${encodeURIComponent(documentId)}/deactivate`);
    return unwrapDocument(unwrapApiResponse<unknown>(response.data));
  },

  async enableAutoApprove(documentId: string): Promise<ApprovalDocument> {
    const response = await httpClient.patch(`/approval/documents/${encodeURIComponent(documentId)}/auto-approve/enable`);
    return unwrapDocument(unwrapApiResponse<unknown>(response.data));
  },

  async disableAutoApprove(documentId: string): Promise<ApprovalDocument> {
    const response = await httpClient.patch(`/approval/documents/${encodeURIComponent(documentId)}/auto-approve/disable`);
    return unwrapDocument(unwrapApiResponse<unknown>(response.data));
  },

  async enableDeptVisible(documentId: string): Promise<ApprovalDocument> {
    const response = await httpClient.patch(
      `/approval/documents/${encodeURIComponent(documentId)}/dept-visible/enable`,
    );
    return unwrapDocument(unwrapApiResponse<unknown>(response.data));
  },

  async disableDeptVisible(documentId: string): Promise<ApprovalDocument> {
    const response = await httpClient.patch(
      `/approval/documents/${encodeURIComponent(documentId)}/dept-visible/disable`,
    );
    return unwrapDocument(unwrapApiResponse<unknown>(response.data));
  },

  async getPolicyLines(documentId: string): Promise<ApprovalPolicyLine[]> {
    const response = await httpClient.get(`/approval/policyLines/${encodeURIComponent(documentId)}`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizePolicyLine(item))
      .filter((item): item is ApprovalPolicyLine => item != null)
      .sort((a, b) => a.stepOrder - b.stepOrder);
  },

  async savePolicyLines(payload: SavePolicyLinePayload): Promise<ApprovalPolicyLine[]> {
    const response = await httpClient.post('/approval/policyLines', payload);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizePolicyLine(item))
      .filter((item): item is ApprovalPolicyLine => item != null)
      .sort((a, b) => a.stepOrder - b.stepOrder);
  },

  async deletePolicyLines(documentId: string): Promise<void> {
    await httpClient.delete(`/approval/policyLines/${encodeURIComponent(documentId)}`);
  },

  async getPolicyLineCandidates(documentId: string): Promise<ApprovalPolicyLineWithCandidates[]> {
    const response = await httpClient.get(`/approval/policyLines/${encodeURIComponent(documentId)}/candidates`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizePolicyLineWithCandidates(item))
      .filter((item): item is ApprovalPolicyLineWithCandidates => item != null)
      .sort((a, b) => a.stepOrder - b.stepOrder);
  },
};
