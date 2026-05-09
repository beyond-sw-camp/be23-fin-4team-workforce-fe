import { httpClient } from '@/shared/api/httpClient';
import { parseApiError } from '@/shared/api/error-parser';
import { unwrapApiResponse } from '@/shared/api/response';

const TRANSCRIBE_TIMEOUT_MS = 120_000;
const SUMMARY_TIMEOUT_MS = 90_000;

function pickTranscribeBody(raw: unknown): { transcript: string; summary: string; language?: string } {
  const unwrapped = unwrapApiResponse<unknown>(raw);
  const o = unwrapped && typeof unwrapped === 'object' ? (unwrapped as Record<string, unknown>) : {};
  const transcript = typeof o.transcript === 'string' ? o.transcript : '';
  const summary = typeof o.summary === 'string' ? o.summary : '';
  const language = typeof o.language === 'string' ? o.language : undefined;
  return { transcript, summary, language };
}

function pickSummaryBody(raw: unknown): { summary: string } {
  const unwrapped = unwrapApiResponse<unknown>(raw);
  const o = unwrapped && typeof unwrapped === 'object' ? (unwrapped as Record<string, unknown>) : {};
  const summary = typeof o.summary === 'string' ? o.summary : '';
  return { summary };
}

export async function transcribeMeetingAudio(
  audioBlob: Blob,
  language: string,
  signal?: AbortSignal,
): Promise<{ transcript: string; summary: string; language?: string }> {
  const form = new FormData();
  form.append('audio', audioBlob, 'meeting.webm');
  form.append('language', (language || 'ko').trim() || 'ko');
  try {
    const res = await httpClient.post<unknown>('/ai/transcribe', form, {
      signal,
      timeout: TRANSCRIBE_TIMEOUT_MS,
    });
    return pickTranscribeBody(res.data);
  } catch (e) {
    const parsed = parseApiError(e);
    const err = new Error(parsed.message || '받아쓰기 요청에 실패했습니다.');
    (err as Error & { status?: number }).status = parsed.status;
    throw err;
  }
}

export async function summarizeMeetingTranscript(
  transcript: string,
  signal?: AbortSignal,
): Promise<{ summary: string }> {
  try {
    const res = await httpClient.post<unknown>(
      '/ai/transcribe/summary',
      { transcript },
      { signal, timeout: SUMMARY_TIMEOUT_MS },
    );
    return pickSummaryBody(res.data);
  } catch (e) {
    const parsed = parseApiError(e);
    const err = new Error(parsed.message || '회의록 정리 요청에 실패했습니다.');
    (err as Error & { status?: number }).status = parsed.status;
    throw err;
  }
}
