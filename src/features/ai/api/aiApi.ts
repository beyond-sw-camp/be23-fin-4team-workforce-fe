import { httpClient } from '@/shared/api/httpClient';
import { unwrapApiResponse } from '@/shared/api/response';

/** 게이트웨이 기준 `/ai` 프리픽스 — 문서 업로드 등 RAG API */
const AI_PREFIX = '/ai';

/**
 * 챗봇 API 베이스. 게이트웨이 `/chat/**` → member-service 이므로 기본 프리픽스 없음 → `POST /chat` 등.
 * `/ai/**` 는 ai-service(RAG 문서) 전용 — 챗봇에 쓰지 않음. `VITE_CHAT_API_PREFIX` 는 비우거나 생략.
 */
function chatApiPrefix(): string {
  const p = import.meta.env.VITE_CHAT_API_PREFIX as string | undefined;
  if (typeof p !== 'string' || !p.trim()) return '';
  return p.trim().replace(/\/$/, '');
}

const CHAT_PREFIX = chatApiPrefix();

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
  /** 백엔드가 주면 동일 createdAt 턴 순서 확정 (sequence, sortOrder 등) */
  sortSeq?: number;
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

function pickHistoryId(raw: Record<string, unknown>): string {
  const v =
    raw.chatHistoryId ??
    raw.chat_history_id ??
    raw.id ??
    raw.historyId ??
    raw.history_id;
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function pickHistoryCreatedAt(raw: Record<string, unknown>): string {
  const keys = [
    'createdAt',
    'created_at',
    'createTime',
    'create_time',
    'registeredAt',
    'registered_at',
    'timestamp',
  ] as const;
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) {
      return new Date(v).toISOString();
    }
  }
  return '';
}

function pickHistorySortSeq(raw: Record<string, unknown>): number | undefined {
  const v =
    raw.sequence ??
    raw.sortOrder ??
    raw.sort_order ??
    raw.chatOrder ??
    raw.chat_order ??
    raw.order ??
    raw.displayOrder ??
    raw.display_order;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizeHistoryItem(raw: Record<string, unknown>): AiChatHistoryItem | null {
  const id = pickHistoryId(raw);
  const question = typeof raw.question === 'string' ? raw.question : '';
  const answer = typeof raw.answer === 'string' ? raw.answer : '';
  const createdAt = pickHistoryCreatedAt(raw);
  const sortSeq = pickHistorySortSeq(raw);
  if (!id || !question) return null;
  const sourcesRaw = raw.sources;
  const sources =
    Array.isArray(sourcesRaw) && sourcesRaw.every((x) => typeof x === 'string')
      ? (sourcesRaw as string[])
      : undefined;
  return {
    id,
    question,
    answer,
    createdAt: createdAt || '—',
    ...(sortSeq !== undefined ? { sortSeq } : {}),
    ...(sources?.length ? { sources } : {}),
  };
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

/** `YYYY-MM-DD HH:mm:ss` 등 공백 구분 로컬 형식 보정 */
function parseHistoryTimeMs(isoOrLocal: string): number {
  if (!isoOrLocal || isoOrLocal === '—') return 0;
  const s = isoOrLocal.trim();
  let t = Date.parse(s);
  if (Number.isFinite(t)) return t;
  t = Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T'));
  return Number.isFinite(t) ? t : 0;
}

/**
 * UI: 위(과거) → 아래(최근).
 * - 시간 오름차순(오래된 턴이 위, 맨 아래가 최신).
 * - 동일 시각: `sortSeq` 오름차순, 없으면 GET 배열이 최신순일 때를 가정해 **원본 인덱스 역순**으로 질문 순서 복원.
 */
export function sortAiChatHistoryChronological(items: AiChatHistoryItem[]): AiChatHistoryItem[] {
  const decorated = items.map((item, index) => ({ item, index }));
  decorated.sort((a, b) => {
    const ta = parseHistoryTimeMs(a.item.createdAt);
    const tb = parseHistoryTimeMs(b.item.createdAt);
    if (ta !== tb) return ta - tb;
    const sa = a.item.sortSeq;
    const sb = b.item.sortSeq;
    if (sa != null && sb != null && sa !== sb) return sa - sb;
    return b.index - a.index;
  });
  return decorated.map((d) => d.item);
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
    /** LLM은 수십 초 넘어갈 수 있어 기본 httpClient(60s)보다 길게 — 500은 서버 오류(타임아웃 아님) */
    const response = await httpClient.post(`${CHAT_PREFIX}/chat`, { question }, { timeout: 120_000 });
    return unwrapChatResponse(response.data);
  },

  async getChatHistory(): Promise<AiChatHistoryItem[]> {
    const response = await httpClient.get(`${CHAT_PREFIX}/chat/history`);
    const unwrapped = unwrapApiResponse<unknown>(response.data);
    const arr = normalizeListPayload(unwrapped);
    const items = arr
      .map((x) => (x && typeof x === 'object' ? normalizeHistoryItem(x as Record<string, unknown>) : null))
      .filter((h): h is AiChatHistoryItem => h != null);
    return sortAiChatHistoryChronological(items);
  },

  async clearChatHistory(): Promise<void> {
    await httpClient.delete(`${CHAT_PREFIX}/chat/history`);
  },
};
