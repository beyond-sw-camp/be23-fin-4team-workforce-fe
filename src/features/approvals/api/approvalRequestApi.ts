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
  /** 백엔드 `isProxyYn` — Y면 대리결재 처리 라인 */
  isProxyYn: 'Y' | 'N' | null;
  /** `isProxyYn === 'Y'` 또는 구 boolean `isProxy` */
  isProxy: boolean;
  /** 대결자가 실제 승인/반려 처리한 경우 원 결재자 외 실제 처리자 memberId */
  actualApproverMemberId: string | null;
  actualApproverMemberPositionId: string | null;
  createdAt: string;
  updatedAt: string;
  /** 응답에 포함될 수 있음 — 없으면 프론트에서 member 상세로 보강 */
  approverName?: string;
  approverOrganizationName?: string;
  approverJobTitleName?: string;
  actualApproverName?: string;
  actualApproverOrganizationName?: string;
  actualApproverJobTitleName?: string;
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
  /** 목록 API(내 결재·부서 문서함 등)에서 올 수 있음 */
  requesterName?: string;
  requesterOrganizationId?: string;
  requesterOrganizationName?: string;
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

function asBool(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === 'y' || s === '1' || s === 'yes';
}

/** UUID 등 비교 시 대소문자·공백·하이픈 유무 차이 흡수 */
function eqMemberKey(a?: string | null, b?: string | null): boolean {
  const norm = (s: string) => s.replace(/-/g, '').trim().toLowerCase();
  const x = norm(typeof a === 'string' ? a : '');
  const y = norm(typeof b === 'string' ? b : '');
  return Boolean(x && y && x === y);
}

/** 백엔드가 boolean·숫자·문자열 등으로 `isProxyYn`을 줄 수 있음 */
function parseProxyYnRaw(raw: unknown): 'Y' | 'N' | null {
  if (raw == null) return null;
  if (raw === true || raw === 1) return 'Y';
  if (raw === false || raw === 0) return 'N';
  const s = String(raw).trim();
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === 'Y' || u === 'YES' || u === 'TRUE' || u === '1') return 'Y';
  if (u === 'N' || u === 'NO' || u === 'FALSE' || u === '0') return 'N';
  return null;
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
  const actualApproverName = optionalNonEmptyText(
    o.actualApproverName ??
      o.actual_approver_name ??
      o.actualMemberName ??
      o.actual_member_name ??
      o.substituteName ??
      o.substitute_name ??
      o.proxyActorName ??
      o.proxy_actor_name ??
      o.processorName ??
      o.processor_name,
  );
  const actualApproverOrganizationName = optionalNonEmptyText(
    o.actualApproverOrganizationName ?? o.actual_approver_organization_name,
  );
  const actualApproverJobTitleName = optionalNonEmptyText(
    o.actualApproverJobTitleName ?? o.actual_approver_job_title_name,
  );
  const nestedActual = o.actualApprover ?? o.actual_approver;
  let nestedActualMid = '';
  let nestedActualPid = '';
  if (nestedActual && typeof nestedActual === 'object') {
    const na = nestedActual as Record<string, unknown>;
    nestedActualMid = asText(
      na.memberId ??
        na.member_id ??
        na.approverMemberId ??
        na.approver_member_id ??
        na.actualApproverMemberId ??
        na.actual_approver_member_id,
    );
    nestedActualPid = asText(
      na.memberPositionId ??
        na.member_position_id ??
        na.approverMemberPositionId ??
        na.approver_member_position_id ??
        na.actualApproverMemberPositionId ??
        na.actual_approver_member_position_id,
    );
  }
  const actualApproverMemberIdRaw = asText(
    o.actualApproverMemberId ??
      o.actual_approver_member_id ??
      o.actualMemberId ??
      o.actual_member_id ??
      o.substituteMemberId ??
      o.substitute_member_id ??
      o.proxyActorMemberId ??
      o.proxy_actor_member_id ??
      o.processorMemberId ??
      o.processor_member_id,
  ) || nestedActualMid;
  const actualApproverMemberPositionIdRaw = asText(
    o.actualApproverMemberPositionId ??
      o.actual_approver_member_position_id ??
      o.actualMemberPositionId ??
      o.actual_member_position_id ??
      o.substituteMemberPositionId ??
      o.substitute_member_position_id ??
      o.proxyActorMemberPositionId ??
      o.proxy_actor_member_position_id,
  ) || nestedActualPid;
  const ynRaw =
    o.isProxyYn ??
    o.is_proxy_yn ??
    o.proxyYn ??
    o.proxy_yn ??
    o.isSubstituteYn ??
    o.is_substitute_yn ??
    o.proxyApprovalYn ??
    o.proxy_approval_yn;
  const isProxyYn = parseProxyYnRaw(ynRaw);
  const legacyIsProxy = asBool(o.isProxy ?? o.is_proxy);
  const designatedMid = asText(o.approverMemberId ?? o.approver_member_id);
  const designatedPid = asText(o.approverMemberPositionId ?? o.approver_member_position_id);
  const stUp = asText(o.approvalStatus ?? o.approval_status).toUpperCase();
  const terminal = stUp === 'APPROVED' || stUp === 'REJECTED';
  const hasActed = Boolean(asNullableText(o.actedAt ?? o.acted_at)?.trim());
  const idOrPosMismatch =
    (Boolean(actualApproverMemberIdRaw) &&
      Boolean(designatedMid) &&
      !eqMemberKey(actualApproverMemberIdRaw, designatedMid)) ||
    (Boolean(actualApproverMemberPositionIdRaw) &&
      Boolean(designatedPid) &&
      !eqMemberKey(actualApproverMemberPositionIdRaw, designatedPid));
  const nameA = (approverName ?? '').trim();
  const nameB = (actualApproverName ?? '').trim();
  const nameMismatch = Boolean(nameA && nameB && nameA !== nameB);
  /** 플래그 누락·오류 대비: 처리 완료 후 지정자≠실제 처리자면 대리결재로 간주 */
  const structuralProxy = terminal && hasActed && (idOrPosMismatch || nameMismatch);
  const isProxy = isProxyYn === 'Y' || (isProxyYn == null && legacyIsProxy) || structuralProxy;
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
    isProxyYn,
    isProxy,
    actualApproverMemberId: actualApproverMemberIdRaw || null,
    actualApproverMemberPositionId: actualApproverMemberPositionIdRaw || null,
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
    ...(approverName ? { approverName } : {}),
    ...(approverOrganizationName ? { approverOrganizationName } : {}),
    ...(approverJobTitleName ? { approverJobTitleName } : {}),
    ...(actualApproverName ? { actualApproverName } : {}),
    ...(actualApproverOrganizationName ? { actualApproverOrganizationName } : {}),
    ...(actualApproverJobTitleName ? { actualApproverJobTitleName } : {}),
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
  const requesterName = optionalNonEmptyText(o.requesterName ?? o.requester_name);
  const requesterOrganizationId = optionalNonEmptyText(o.requesterOrganizationId ?? o.requester_organization_id);
  const requesterOrganizationName = optionalNonEmptyText(
    o.requesterOrganizationName ?? o.requester_organization_name,
  );
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
    ...(requesterName ? { requesterName } : {}),
    ...(requesterOrganizationId ? { requesterOrganizationId } : {}),
    ...(requesterOrganizationName ? { requesterOrganizationName } : {}),
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

  /** 부서·하위 조직의 최종 처리(승인/반려) 문서 — 민감 양식은 서버에서 제외 */
  async listDepartmentRequests(organizationId: string): Promise<ApprovalRequestDetail[]> {
    const id = organizationId?.trim();
    if (!id) {
      throw new Error('조직 ID가 없습니다.');
    }
    const response = await httpClient.get('/approval/requests/department', {
      params: { organizationId: id },
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

  async approve(approvalId: string, comment?: string): Promise<ApprovalRequestDetail> {
    const response = await httpClient.patch(`/approval/approvals/${encodeURIComponent(approvalId)}/approve`, {
      ...(comment && comment.trim() ? { comment: comment.trim() } : {}),
    });
    return unwrapSingle(unwrapApiResponse<unknown>(response.data));
  },

  async reject(approvalId: string, comment: string): Promise<ApprovalRequestDetail> {
    const response = await httpClient.patch(`/approval/approvals/${encodeURIComponent(approvalId)}/reject`, {
      comment: comment.trim(),
    });
    return unwrapSingle(unwrapApiResponse<unknown>(response.data));
  },
};

/**
 * 지정 결재 직위(approverMemberPositionId)가 내 직위와 다르면 대결 슬롯으로 본다.
 * 결재 대기함(구분)·완료함(처리)에서 동일 기준으로 쓴다.
 */
function isProxyActorSlotByDesignatedPosition(
  line: ApprovalLine,
  myMemberPositionId: string | undefined,
  allowedStatuses: readonly string[],
): boolean {
  const my = myMemberPositionId?.trim();
  if (!my) return false;
  const st = String(line.approvalStatus).toUpperCase();
  if (!allowedStatuses.includes(st)) return false;
  const designated = line.approverMemberPositionId?.trim();
  if (!designated) return false;
  return !eqMemberKey(designated, my);
}

/** 결재 대기함: PENDING 라인이 내 지정 직위가 아니면 대결 */
export function isPendingApprovalLineForProxyActor(
  line: ApprovalLine,
  myMemberPositionId: string | undefined,
): boolean {
  return isProxyActorSlotByDesignatedPosition(line, myMemberPositionId, ['PENDING']);
}

/** 결재 완료함: 처리 완료 라인이 내 지정 직위가 아니면 대결(대기함 구분과 동일 논리) */
export function isActedApprovalLineForProxyActor(
  line: ApprovalLine,
  myMemberPositionId: string | undefined,
): boolean {
  return isProxyActorSlotByDesignatedPosition(line, myMemberPositionId, ['APPROVED', 'REJECTED']);
}

/** 내 결재 대기함에 이 요청이 아직 남아야 하는지(승인/반려 직후 캐시 갱신용) */
export function approvalRequestStillInMyPendingInbox(
  request: ApprovalRequestDetail,
  opts: { myMemberId?: string; myMemberPositionId?: string },
): boolean {
  const mid = opts.myMemberId?.trim();
  const pid = opts.myMemberPositionId?.trim();
  return request.approvalLines.some((l) => {
    if (String(l.approvalStatus).toUpperCase() !== 'PENDING') return false;
    const imSlot =
      (Boolean(mid) && eqMemberKey(l.approverMemberId, mid)) ||
      (Boolean(pid) && eqMemberKey(l.approverMemberPositionId, pid));
    if (imSlot) return true;
    return isPendingApprovalLineForProxyActor(l, pid);
  });
}

/** 정규화 시 `structuralProxy`·`isProxyYn` 등을 반영한 최종 대리결재 여부 */
export function approvalLineIsProxy(line: ApprovalLine): boolean {
  return line.isProxy;
}

/** API 계약상 `isProxyYn === 'Y'`만 엄격히 true — 목록 배지 등 플래그 기반 표시용 */
export function approvalLineIsProxyYnYes(line: ApprovalLine): boolean {
  return String(line.isProxyYn ?? '').trim().toUpperCase() === 'Y';
}

/**
 * 결재인장 등: 해당 라인을 대리결재로 표시할지.
 * - `isProxyYn === 'Y'`(또는 레거시 `isProxy`)
 * - 승인/반려 후 `actualApprover*`가 지정 결재자와 다름(플래그 누락 대비)
 * - `myMemberPositionId`가 있으면, `PENDING`인데 내 직위가 지정 결재 직위와 다를 때(대결 대기함에 올라온 건)
 */
export function approvalLineShowProxyOnStamp(
  line: ApprovalLine,
  opts?: { myMemberPositionId?: string },
): boolean {
  if (approvalLineIsProxy(line)) return true;
  const st = String(line.approvalStatus).toUpperCase();
  const myPid = opts?.myMemberPositionId?.trim();
  if (st === 'PENDING' && myPid && isPendingApprovalLineForProxyActor(line, myPid)) return true;
  if (st !== 'APPROVED' && st !== 'REJECTED') return false;
  if (!line.actedAt?.trim()) return false;
  const aMid = line.actualApproverMemberId?.trim();
  const dMid = line.approverMemberId?.trim();
  if (aMid && dMid && !eqMemberKey(aMid, dMid)) return true;
  const aPid = line.actualApproverMemberPositionId?.trim();
  const dPid = line.approverMemberPositionId?.trim();
  return Boolean(aPid && dPid && !eqMemberKey(aPid, dPid));
}

/**
 * 승인란 인장: 지정 결재자 성명 아래 `(대결)` — **조회자와 무관**, 라인이 대리 처리면 true.
 * (`approvalLineShowProxyOnStamp`는 PENDING 시 조회자 직위를 쓰므로 상세 인장에는 부적합)
 */
export function approvalLineShowProxyInStampNameCell(line: ApprovalLine): boolean {
  if (approvalLineIsProxy(line)) return true;
  const st = String(line.approvalStatus).toUpperCase();
  if (st !== 'APPROVED' && st !== 'REJECTED') return false;
  if (!line.actedAt?.trim()) return false;
  const aMid = line.actualApproverMemberId?.trim();
  const dMid = line.approverMemberId?.trim();
  if (aMid && dMid && !eqMemberKey(aMid, dMid)) return true;
  const aPid = line.actualApproverMemberPositionId?.trim();
  const dPid = line.approverMemberPositionId?.trim();
  if (aPid && dPid && !eqMemberKey(aPid, dPid)) return true;
  /** 식별자 누락 시 API가 지정/실제 성명만 줄 때 */
  const an = line.actualApproverName?.trim();
  const dn = line.approverName?.trim();
  return Boolean(an && dn && an !== dn);
}

/**
 * 결재 상세(인장·결재라인 표): 대리결재 안내 여부.
 * `approvalLineShowProxyInStampNameCell` + 멤버 조회로 보강된 지정/실제 표시명이 다를 때(승인·반려 완료 건).
 */
export function approvalLineShowProxyInDetailUi(
  line: ApprovalLine,
  opts?: { designatedDisplayName?: string; actualDisplayName?: string },
): boolean {
  if (approvalLineShowProxyInStampNameCell(line)) return true;
  const st = String(line.approvalStatus).toUpperCase();
  if (st !== 'APPROVED' && st !== 'REJECTED') return false;
  if (!line.actedAt?.trim()) return false;
  const d = opts?.designatedDisplayName?.trim() ?? '';
  const a = opts?.actualDisplayName?.trim() ?? '';
  return Boolean(d && a && d !== a);
}

function lineImDesignated(l: ApprovalLine, mid: string | undefined, pid: string | undefined): boolean {
  return (
    (Boolean(mid) && eqMemberKey(l.approverMemberId, mid)) ||
    (Boolean(pid) && eqMemberKey(l.approverMemberPositionId, pid))
  );
}

/** 해당 라인을 내가 승인/반려한 것으로 볼 수 있는지(actual·지정 슬롯·옛 응답) */
function approvalLineActedByViewer(
  l: ApprovalLine,
  mid: string | undefined,
  pid: string | undefined,
): boolean {
  const imActual =
    (Boolean(mid?.trim()) && eqMemberKey(l.actualApproverMemberId, mid)) ||
    (Boolean(pid?.trim()) && eqMemberKey(l.actualApproverMemberPositionId, pid));
  if (imActual) return true;

  const imDesignated = lineImDesignated(l, mid, pid);
  if (!imDesignated || !l.actedAt?.trim()) return false;
  const hasActual = Boolean(l.actualApproverMemberId?.trim() || l.actualApproverMemberPositionId?.trim());
  return !hasActual;
}

/**
 * 결재 완료함: 내가 **대결(대리)** 로 처리한 라인이 하나라도 있는지.
 * - **대기함「구분」과 동일**: 내가 처리한 라인에서 지정 결재 직위 ≠ 내 직위면 대결.
 * - 그다음 `isProxyYn`·actual*≠지정* 등 보조 판별.
 * - actual* 매칭 실패 시: 같은 요청에 내 지정 슬롯이 없고 대결 라인만 있으면 추론.
 */
export function requestIncludesMyProxyAct(
  request: ApprovalRequestDetail,
  opts: { myMemberId?: string; myMemberPositionId?: string },
): boolean {
  const pid = opts.myMemberPositionId?.trim();
  const mid = opts.myMemberId?.trim();
  const hasMyId = Boolean(mid) || Boolean(pid);

  const terminalLines = request.approvalLines.filter((l) => {
    const st = String(l.approvalStatus).toUpperCase();
    return (st === 'APPROVED' || st === 'REJECTED') && Boolean(l.actedAt?.trim());
  });

  const myActedLines = terminalLines.filter((l) => approvalLineActedByViewer(l, mid, pid));

  if (myActedLines.length > 0) {
    return myActedLines.some((l) => {
      if (isActedApprovalLineForProxyActor(l, pid)) return true;
      if (approvalLineIsProxy(l)) return true;
      const imActual =
        (Boolean(mid) && eqMemberKey(l.actualApproverMemberId, mid)) ||
        (Boolean(pid) && eqMemberKey(l.actualApproverMemberPositionId, pid));
      const imDesignated = lineImDesignated(l, mid, pid);
      return Boolean(imActual && !imDesignated);
    });
  }

  if (!hasMyId) return false;
  /**
   * 부재자 복귀 후에도, 내 지정 결재선이 대결(실제 처리자≠지정 결재자)로 완료된 건은
   * 결재 완료함 「처리」에서 `대결`로 표시한다.
   */
  const proxyOnMyDesignatedSlot = terminalLines.some(
    (l) => lineImDesignated(l, mid, pid) && approvalLineIsProxy(l),
  );
  if (proxyOnMyDesignatedSlot) return true;

  const iHaveDirectSlotInRequest = terminalLines.some((l) => lineImDesignated(l, mid, pid));
  if (iHaveDirectSlotInRequest) return false;
  return terminalLines.some(
    (l) =>
      (isActedApprovalLineForProxyActor(l, pid) || approvalLineIsProxy(l)) && !lineImDesignated(l, mid, pid),
  );
}
