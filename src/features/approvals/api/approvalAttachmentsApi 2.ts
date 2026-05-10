import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

export type ApprovalAttachment = {
  attachmentId: string;
  requestId: string;
  fileName: string;
  approvalUrl: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
};

/** 서버·가이드 기준 — 프론트 검증용 */
export const APPROVAL_ATTACHMENT_MAX_COUNT = 3;
export const APPROVAL_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** 회의 녹음 webm 등 Whisper 한도(25MB)에 맞춘 첨부 상한 */
export const APPROVAL_ATTACHMENT_WEBM_MAX_FILE_BYTES = 26 * 1024 * 1024;
export const APPROVAL_ATTACHMENT_TOTAL_MAX_BYTES = 50 * 1024 * 1024;
export const APPROVAL_ATTACHMENT_ALLOWED_EXT = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'hwp',
  'hwpx',
  'txt',
  'csv',
  'zip',
  'webm',
]);

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
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
  for (const k of ['data', 'items', 'list', 'content', 'result']) {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const nested = pickArray(v, depth + 1);
      if (nested.length) return nested;
    }
  }
  return [];
}

export function normalizeApprovalAttachment(raw: unknown): ApprovalAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const attachmentId = asText(o.attachmentId ?? o.attachment_id);
  const requestId = asText(o.requestId ?? o.request_id);
  const fileName = asText(o.fileName ?? o.file_name);
  const approvalUrl = asText(o.approvalUrl ?? o.approval_url);
  if (!attachmentId || !requestId || !fileName || !approvalUrl) return null;
  return {
    attachmentId,
    requestId,
    fileName,
    approvalUrl,
    fileSize: asNumber(o.fileSize ?? o.file_size),
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
  };
}

function unwrapAttachmentList(payload: unknown): ApprovalAttachment[] {
  const unwrapped = unwrapApiResponse<unknown>(payload);
  const arr = Array.isArray(unwrapped) ? unwrapped : pickArray(unwrapped);
  return arr
    .map((item) => normalizeApprovalAttachment(item))
    .filter((item): item is ApprovalAttachment => item != null);
}

export function formatApprovalAttachmentBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** 새로 추가하려는 파일 검증 — 기존 서버 첨부 + 대기 중 로컬 파일 기준 */
export function validateApprovalAttachmentCandidate(
  file: File,
  ctx: {
    existingRemoteCount: number;
    pendingLocalCount: number;
    pendingLocalBytes: number;
    existingRemoteBytes: number;
  },
): string | null {
  const totalCount = ctx.existingRemoteCount + ctx.pendingLocalCount;
  if (totalCount >= APPROVAL_ATTACHMENT_MAX_COUNT) {
    return `첨부파일은 최대 ${APPROVAL_ATTACHMENT_MAX_COUNT}개까지 등록할 수 있습니다.`;
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : '';
  if (!ext || !APPROVAL_ATTACHMENT_ALLOWED_EXT.has(ext)) {
    return `허용되지 않는 파일 형식입니다: ${file.name}`;
  }
  const perFileLimit = ext === 'webm' ? APPROVAL_ATTACHMENT_WEBM_MAX_FILE_BYTES : APPROVAL_ATTACHMENT_MAX_FILE_BYTES;
  if (file.size > perFileLimit) {
    return ext === 'webm'
      ? 'webm 녹음 첨부는 파일당 최대 약 25MB까지 가능합니다.'
      : '파일당 최대 10MB까지 첨부할 수 있습니다.';
  }
  const nextTotal =
    ctx.existingRemoteBytes + ctx.pendingLocalBytes + file.size;
  if (nextTotal > APPROVAL_ATTACHMENT_TOTAL_MAX_BYTES) {
    return '첨부 파일 합계는 최대 50MB까지 가능합니다.';
  }
  return null;
}

export const approvalAttachmentsApi = {
  async uploadAttachments(requestId: string, files: File[]): Promise<ApprovalAttachment[]> {
    const id = requestId?.trim();
    if (!id) throw new Error('requestId가 없습니다.');
    if (!files.length) return [];
    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f);
    }
    const response = await httpClient.post(`/approval/attachments/${encodeURIComponent(id)}`, formData);
    return unwrapAttachmentList(response.data);
  },

  async listAttachments(requestId: string): Promise<ApprovalAttachment[]> {
    const id = requestId?.trim();
    if (!id) throw new Error('requestId가 없습니다.');
    const response = await httpClient.get(`/approval/attachments/${encodeURIComponent(id)}`);
    return unwrapAttachmentList(response.data);
  },

  async deleteAttachment(attachmentId: string): Promise<void> {
    const id = attachmentId?.trim();
    if (!id) throw new Error('attachmentId가 없습니다.');
    await httpClient.delete(`/approval/attachments/${encodeURIComponent(id)}`);
  },
};
