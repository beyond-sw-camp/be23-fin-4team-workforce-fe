import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

/** 게이트웨이 기준 `/ai` 프리픽스 (VITE_API_BASE_URL=http://localhost:8080) */
const AI_PREFIX = '/ai';

export type AiUploadedDocument = {
  id: string;
  companyId: string;
  documentName: string;
  createdAt: string;
};

export type AiChatHistoryItem = {
  id: string;
  question: string;
  answer: string;
  createdAt: string;
  /** 목록 API에 없을 수 있음 — 있으면 표시 */
  sources?: string[];
};

export type AiChatResponse = {
  answer: string;
  sources: string[];
};

function normalizeDoc(raw: Record<string, unknown>): AiUploadedDocument | null {
  const id = typeof raw.id === 'string' ? raw.id : '';
  const companyId =
    typeof raw.company_id === 'string'
      ? raw.company_id
      : typeof raw.companyId === 'string'
        ? raw.companyId
        : '';
  const documentName =
    typeof raw.document_name === 'string'
      ? raw.document_name
      : typeof raw.documentName === 'string'
        ? raw.documentName
        : '';
  const createdAt =
    typeof raw.created_at === 'string'
      ? raw.created_at
      : typeof raw.createdAt === 'string'
        ? raw.createdAt
        : '';
  if (!id || !documentName) return null;
  return { id, companyId: companyId || '—', documentName, createdAt: createdAt || '—' };
}

function normalizeHistoryItem(raw: Record<string, unknown>): AiChatHistoryItem | null {
  const id = typeof raw.id === 'string' ? raw.id : '';
  const question = typeof raw.question === 'string' ? raw.question : '';
  const answer = typeof raw.answer === 'string' ? raw.answer : '';
  const createdAt =
    typeof raw.created_at === 'string'
      ? raw.created_at
      : typeof raw.createdAt === 'string'
        ? raw.createdAt
        : '';
  if (!id || !question) return null;
  const sourcesRaw = raw.sources;
  const sources =
    Array.isArray(sourcesRaw) && sourcesRaw.every((x) => typeof x === 'string')
      ? (sourcesRaw as string[])
      : undefined;
  return { id, question, answer, createdAt: createdAt || '—', ...(sources?.length ? { sources } : {}) };
}

function normalizeListPayload(raw: unknown, depth = 0): unknown[] {
  if (depth > 6) return [];
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const k of ['data', 'list', 'items', 'content']) {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = normalizeListPayload(v, depth + 1);
      if (inner.length) return inner;
    }
  }
  return [];
}

function unwrapChatResponse(raw: unknown): AiChatResponse {
  if (!raw || typeof raw !== 'object') return { answer: '', sources: [] };
  const r = raw as Record<string, unknown>;
  const inner = r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : r;
  const answer = typeof inner.answer === 'string' ? inner.answer : '';
  const sources = Array.isArray(inner.sources)
    ? inner.sources.filter((x): x is string => typeof x === 'string')
    : [];
  return { answer, sources };
}

export const aiApi = {
  async uploadDocument(file: File): Promise<AiUploadedDocument> {
    const form = new FormData();
    form.append('file', file);
    const response = await httpClient.post(`${AI_PREFIX}/documents/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const row =
      unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)
        ? (unwrapped as Record<string, unknown>)
        : {};
    const doc = normalizeDoc(row);
    if (!doc) {
      throw new Error('업로드 응답을 해석할 수 없습니다.');
    }
    return doc;
  },

  async listDocuments(): Promise<AiUploadedDocument[]> {
    const response = await httpClient.get(`${AI_PREFIX}/documents`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const arr = normalizeListPayload(unwrapped);
    return arr
      .map((x) => (x && typeof x === 'object' ? normalizeDoc(x as Record<string, unknown>) : null))
      .filter((d): d is AiUploadedDocument => d != null);
  },

  async deleteDocument(documentId: string): Promise<void> {
    await httpClient.delete(`${AI_PREFIX}/documents/${encodeURIComponent(documentId)}`);
  },

  async chat(question: string): Promise<AiChatResponse> {
    const response = await httpClient.post(`${AI_PREFIX}/chat`, { question }, { timeout: 120_000 });
    return unwrapChatResponse(response.data);
  },

  async getChatHistory(): Promise<AiChatHistoryItem[]> {
    const response = await httpClient.get(`${AI_PREFIX}/chat/history`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const arr = normalizeListPayload(unwrapped);
    const items = arr
      .map((x) => (x && typeof x === 'object' ? normalizeHistoryItem(x as Record<string, unknown>) : null))
      .filter((h): h is AiChatHistoryItem => h != null);
    return items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },

  async clearChatHistory(): Promise<void> {
    await httpClient.delete(`${AI_PREFIX}/chat/history`);
  },
};
