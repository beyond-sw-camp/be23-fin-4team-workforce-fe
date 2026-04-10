import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export const APPROVAL_REQUEST_STATUS = ['DRAFT', 'WAIT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUS)[number];
export type ApprovalLineStatus = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
export type ViewerType = 'CC' | 'CIRCULATION';
export type ViewerReadStatus = 'UNREAD' | 'READ';

export type ApprovalLine = {
  approvalId: string;
  requestId: string;
  approverMemberId: string;
  approverMemberPositionId: string;
  stepOrder: number;
  approvalStatus: ApprovalLineStatus | string;
  actedAt: string | null;
  comment: string | null;
  signatureImageUrl: string | null;
  isSignedYn: string | null;
  createdAt: string;
  updatedAt: string;
  /** 응답에 포함될 수 있음 — 없으면 프론트에서 member 상세로 보강 */
  approverName?: string;
  approverOrganizationName?: string;
  approverJobTitleName?: string;
};

export type ApprovalViewer = {
  viewerId: string;
  requestId: string;
  viewerMemberId: string;
  viewerMemberPositionId: string;
  viewerType: ViewerType | string;
  viewerReadStatus: ViewerReadStatus | string;
  viewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  viewerName?: string;
  viewerOrganizationName?: string;
  viewerJobTitleName?: string;
};

export type ApprovalRequestDetail = {
  requestId: string;
  documentId: string;
  documentName: string;
  memberId: string;
  requestType: string;
  contentJson: string;
  requestStatus: ApprovalRequestStatus | string;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvalLines: ApprovalLine[];
  viewers: ApprovalViewer[];
};

export type CreateApprovalRequestPayload = {
  documentId: string;
  contentJson: string;
  requestStatus: 'DRAFT' | 'WAIT';
  approvalLines?: Array<{
    stepOrder: number;
    approverMemberId: string;
    approverMemberPositionId: string;
  }>;
  viewers?: Array<{
    viewerMemberId: string;
    viewerMemberPositionId: string;
    viewerType: ViewerType;
  }>;
};

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function asNullableText(value: unknown): string | null {
  if (value == null) return null;
  const s = asText(value);
  return s || null;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function pickArray(raw: unknown, depth = 0): unknown[] {
  if (depth > 6) return [];
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const k of ['data', 'items', 'list', 'content', 'result', 'rows', 'payload']) {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const nested = pickArray(v, depth + 1);
      if (nested.length) return nested;
    }
  }
  return [];
}

function optionalNonEmptyText(value: unknown): string | undefined {
  const s = asText(value);
  return s || undefined;
}

function normalizeApprovalLine(raw: unknown): ApprovalLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const approvalId = asText(o.approvalId ?? o.approval_id);
  if (!approvalId) return null;
  const approverName = optionalNonEmptyText(
    o.approverName ?? o.approver_name ?? o.memberName ?? o.member_name ?? o.name,
  );
  const approverOrganizationName = optionalNonEmptyText(
    o.approverOrganizationName ?? o.approver_organization_name ?? o.organizationName ?? o.organization_name,
  );
  const approverJobTitleName = optionalNonEmptyText(
    o.approverJobTitleName ?? o.approver_job_title_name ?? o.jobTitleName ?? o.job_title_name,
  );
  return {
    approvalId,
    requestId: asText(o.requestId ?? o.request_id),
    approverMemberId: asText(o.approverMemberId ?? o.approver_member_id),
    approverMemberPositionId: asText(o.approverMemberPositionId ?? o.approver_member_position_id),
    stepOrder: asNumber(o.stepOrder ?? o.step_order),
    approvalStatus: asText(o.approvalStatus ?? o.approval_status),
    actedAt: asNullableText(o.actedAt ?? o.acted_at),
    comment: asNullableText(o.comment),
    signatureImageUrl: asNullableText(o.signatureImageUrl ?? o.signature_image_url),
    isSignedYn: asNullableText(o.isSignedYn ?? o.is_signed_yn),
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
    ...(approverName ? { approverName } : {}),
    ...(approverOrganizationName ? { approverOrganizationName } : {}),
    ...(approverJobTitleName ? { approverJobTitleName } : {}),
  };
}

function normalizeViewer(raw: unknown): ApprovalViewer | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const viewerId = asText(o.viewerId ?? o.viewer_id);
  if (!viewerId) return null;
  const viewerName = optionalNonEmptyText(o.viewerName ?? o.viewer_name ?? o.memberName ?? o.member_name ?? o.name);
  const viewerOrganizationName = optionalNonEmptyText(
    o.viewerOrganizationName ?? o.viewer_organization_name ?? o.organizationName ?? o.organization_name,
  );
  const viewerJobTitleName = optionalNonEmptyText(
    o.viewerJobTitleName ?? o.viewer_job_title_name ?? o.jobTitleName ?? o.job_title_name,
  );
  return {
    viewerId,
    requestId: asText(o.requestId ?? o.request_id),
    viewerMemberId: asText(o.viewerMemberId ?? o.viewer_member_id),
    viewerMemberPositionId: asText(o.viewerMemberPositionId ?? o.viewer_member_position_id),
    viewerType: asText(o.viewerType ?? o.viewer_type),
    viewerReadStatus: asText(o.viewerReadStatus ?? o.viewer_read_status),
    viewedAt: asNullableText(o.viewedAt ?? o.viewed_at),
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
    ...(viewerName ? { viewerName } : {}),
    ...(viewerOrganizationName ? { viewerOrganizationName } : {}),
    ...(viewerJobTitleName ? { viewerJobTitleName } : {}),
  };
}

function normalizeRequest(raw: unknown): ApprovalRequestDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const requestId = asText(o.requestId ?? o.request_id);
  if (!requestId) return null;
  const linesRaw = o.approvalLines ?? o.approval_lines;
  const viewersRaw = o.viewers;
  return {
    requestId,
    documentId: asText(o.documentId ?? o.document_id),
    documentName: asText(o.documentName ?? o.document_name),
    memberId: asText(o.memberId ?? o.member_id),
    requestType: asText(o.requestType ?? o.request_type),
    contentJson: asText(o.contentJson ?? o.content_json),
    requestStatus: asText(o.requestStatus ?? o.request_status),
    cancelReason: asNullableText(o.cancelReason ?? o.cancel_reason),
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
    approvalLines: Array.isArray(linesRaw)
      ? linesRaw.map((v) => normalizeApprovalLine(v)).filter((v): v is ApprovalLine => v != null)
      : [],
    viewers: Array.isArray(viewersRaw)
      ? viewersRaw.map((v) => normalizeViewer(v)).filter((v): v is ApprovalViewer => v != null)
      : [],
  };
}

function unwrapSingle(raw: unknown): ApprovalRequestDetail {
  const request = normalizeRequest(raw);
  if (!request) throw new Error('결재 요청 응답을 해석할 수 없습니다.');
  return request;
}

export const approvalRequestApi = {
  async createRequest(payload: CreateApprovalRequestPayload): Promise<ApprovalRequestDetail> {
    const response = await httpClient.post('/approval/requests', payload);
    return unwrapSingle(unwrapApiResponse<unknown>(response.data));
  },

  async listMyRequests(status?: ApprovalRequestStatus): Promise<ApprovalRequestDetail[]> {
    const response = await httpClient.get('/approval/requests/my', {
      params: status ? { status } : undefined,
    });
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeRequest(item))
      .filter((item): item is ApprovalRequestDetail => item != null);
  },

  async getRequest(requestId: string): Promise<ApprovalRequestDetail> {
    const response = await httpClient.get(`/approval/requests/${encodeURIComponent(requestId)}`);
    return unwrapSingle(unwrapApiResponse<unknown>(response.data));
  },

  async updateDraft(requestId: string, payload: CreateApprovalRequestPayload): Promise<ApprovalRequestDetail> {
    const response = await httpClient.patch(`/approval/requests/${encodeURIComponent(requestId)}`, payload);
    return unwrapSingle(unwrapApiResponse<unknown>(response.data));
  },

  async cancelRequest(requestId: string, cancelReason: string): Promise<ApprovalRequestDetail> {
    const response = await httpClient.patch(`/approval/requests/${encodeURIComponent(requestId)}/cancel`, { cancelReason });
    return unwrapSingle(unwrapApiResponse<unknown>(response.data));
  },

  async listPendingApprovals(): Promise<ApprovalRequestDetail[]> {
    const response = await httpClient.get('/approval/approvals/pending');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeRequest(item))
      .filter((item): item is ApprovalRequestDetail => item != null);
  },

  async listActedApprovals(): Promise<ApprovalRequestDetail[]> {
    const response = await httpClient.get('/approval/approvals/acted');
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    return pickArray(unwrapped)
      .map((item) => normalizeRequest(item))
      .filter((item): item is ApprovalRequestDetail => item != null);
  },

  async approve(approvalId: string, comment?: string): Promise<void> {
    await httpClient.patch(`/approval/approvals/${encodeURIComponent(approvalId)}/approve`, {
      ...(comment && comment.trim() ? { comment: comment.trim() } : {}),
    });
  },

  async reject(approvalId: string, comment: string): Promise<void> {
    await httpClient.patch(`/approval/approvals/${encodeURIComponent(approvalId)}/reject`, {
      comment: comment.trim(),
    });
  },
};
