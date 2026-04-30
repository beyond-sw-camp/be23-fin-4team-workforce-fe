import { httpClient } from '@/shared/api/httpClient';
import { parseApiError } from '@/shared/api/error-parser';
import { unwrapApiResponse } from '@/shared/api/response';

const AI_RECORDINGS_PREFIX = '/member/ai-recordings';
const AI_RECORDING_CREATE_TIMEOUT_MS = 180_000;

export type AiRecordingLanguage = 'ko' | 'en' | 'ja' | 'zh' | string;

export type AiRecording = {
  recordingId: string;
  title: string;
  audioUrl: string;
  audioFileName: string;
  audioSize: number;
  language: AiRecordingLanguage;
  transcript: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type AiRecordingListItem = {
  recordingId: string;
  title: string;
  audioFileName: string;
  audioSize: number;
  language: AiRecordingLanguage;
  summaryPreview: string;
  createdAt: string;
};

export type PageResponse<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
};

export type ListAiRecordingsParams = {
  page?: number;
  size?: number;
  keyword?: string;
};

export type CreateAiRecordingPayload = {
  audioBlob: Blob;
  audioFileName?: string;
  title?: string;
  language?: AiRecordingLanguage;
};

export type UpdateAiRecordingPayload = {
  title?: string;
  transcript?: string;
  summary?: string;
};

function asText(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return '';
}

function asNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizeAiRecording(raw: unknown): AiRecording {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    recordingId: asText(o.recordingId ?? o.recording_id),
    title: asText(o.title),
    audioUrl: asText(o.audioUrl ?? o.audio_url),
    audioFileName: asText(o.audioFileName ?? o.audio_file_name),
    audioSize: asNum(o.audioSize ?? o.audio_size),
    language: asText(o.language) || 'ko',
    transcript: asText(o.transcript),
    summary: asText(o.summary),
    createdAt: asText(o.createdAt ?? o.created_at),
    updatedAt: asText(o.updatedAt ?? o.updated_at),
  };
}

function normalizeAiRecordingListItem(raw: unknown): AiRecordingListItem {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    recordingId: asText(o.recordingId ?? o.recording_id),
    title: asText(o.title),
    audioFileName: asText(o.audioFileName ?? o.audio_file_name),
    audioSize: asNum(o.audioSize ?? o.audio_size),
    language: asText(o.language) || 'ko',
    summaryPreview: asText(o.summaryPreview ?? o.summary_preview),
    createdAt: asText(o.createdAt ?? o.created_at),
  };
}

function normalizePage<T>(raw: unknown, map: (row: unknown) => T): PageResponse<T> {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const contentRaw = Array.isArray(o.content) ? o.content : [];
  return {
    content: contentRaw.map((r) => map(r)),
    totalElements: asNum(o.totalElements ?? o.total_elements),
    totalPages: asNum(o.totalPages ?? o.total_pages),
    number: asNum(o.number),
    size: asNum(o.size),
    first: o.first === true,
    last: o.last === true,
  };
}

function extFromBlob(blob: Blob): string {
  const t = blob.type || '';
  if (t.includes('webm')) return 'webm';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('mp4') || t.includes('m4a')) return 'm4a';
  if (t.includes('wav')) return 'wav';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  return 'webm';
}

function toErr(e: unknown, fallback: string): Error & { status?: number } {
  const parsed = parseApiError(e);
  const err = new Error(parsed.message || fallback) as Error & { status?: number };
  err.status = parsed.status;
  return err;
}

export const aiRecordingsApi = {
  async create(payload: CreateAiRecordingPayload): Promise<AiRecording> {
    const filename = payload.audioFileName?.trim() || `meeting_${Date.now()}.${extFromBlob(payload.audioBlob)}`;
    const fd = new FormData();
    fd.append('audio', payload.audioBlob, filename);
    if (payload.title?.trim()) fd.append('title', payload.title.trim());
    if (payload.language?.trim()) fd.append('language', payload.language.trim());
    try {
      const res = await httpClient.post<unknown>(AI_RECORDINGS_PREFIX, fd, {
        timeout: AI_RECORDING_CREATE_TIMEOUT_MS,
      });
      return normalizeAiRecording(unwrapApiResponse(res.data));
    } catch (e) {
      throw toErr(e, '녹음 저장에 실패했습니다.');
    }
  },

  async list(params: ListAiRecordingsParams = {}): Promise<PageResponse<AiRecordingListItem>> {
    try {
      const res = await httpClient.get<unknown>(AI_RECORDINGS_PREFIX, { params });
      return normalizePage(unwrapApiResponse(res.data), normalizeAiRecordingListItem);
    } catch (e) {
      throw toErr(e, '녹음 목록을 불러오지 못했습니다.');
    }
  },

  async get(recordingId: string): Promise<AiRecording> {
    try {
      const res = await httpClient.get<unknown>(`${AI_RECORDINGS_PREFIX}/${encodeURIComponent(recordingId)}`);
      return normalizeAiRecording(unwrapApiResponse(res.data));
    } catch (e) {
      throw toErr(e, '녹음 상세를 불러오지 못했습니다.');
    }
  },

  async update(recordingId: string, payload: UpdateAiRecordingPayload): Promise<AiRecording> {
    try {
      const res = await httpClient.patch<unknown>(
        `${AI_RECORDINGS_PREFIX}/${encodeURIComponent(recordingId)}`,
        payload,
      );
      return normalizeAiRecording(unwrapApiResponse(res.data));
    } catch (e) {
      throw toErr(e, '녹음 수정에 실패했습니다.');
    }
  },

  async delete(recordingId: string): Promise<void> {
    try {
      await httpClient.delete(`${AI_RECORDINGS_PREFIX}/${encodeURIComponent(recordingId)}`);
    } catch (e) {
      throw toErr(e, '녹음 삭제에 실패했습니다.');
    }
  },
};
