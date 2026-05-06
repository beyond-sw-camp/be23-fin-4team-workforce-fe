import { useEffect, useState } from 'react';
import { env } from '@/app/config/env';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import { httpClient } from '@/shared/api/httpClient';

/** 서명/첨부 URL이 member-chat 다운로드 게이트(Authorization 필요)인지 판별용 */
export function extractMemberChatFileKeyFromUrl(rawUrl: string): string | null {
  const u = rawUrl.trim();
  if (!u || !u.includes('member-chat/files/download')) return null;
  try {
    const base = env.VITE_API_BASE_URL.replace(/\/+$/, '');
    const parsed =
      u.startsWith('http://') || u.startsWith('https://') ? new URL(u) : new URL(u, `${base}/`);
    const key = parsed.searchParams.get('key')?.trim();
    return key || null;
  } catch {
    return null;
  }
}

async function fetchMemberChatFileAsObjectUrl(rawUrl: string): Promise<string | undefined> {
  const base = env.VITE_API_BASE_URL.replace(/\/+$/, '');
  const requestUrl =
    rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? rawUrl
      : `${base}/${rawUrl.replace(/^\/+/, '')}`;
  const { data } = await httpClient.get(requestUrl, { responseType: 'blob' });
  return URL.createObjectURL(data as Blob);
}

/**
 * 계약 서명 등 `<img src>`에 넣을 URL을 정리한다.
 * - `member-chat/files/download?key=` 형태는 브라우저 img 요청에 Bearer가 안 붙어 깨지므로,
 *   presigned URL 재발급 또는 httpClient blob 로딩으로 대체한다.
 */
export function useDisplayableContractImageUrl(
  rawUrl: string | undefined | null,
): { displaySrc: string | undefined; loading: boolean } {
  const [displaySrc, setDisplaySrc] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(() => Boolean(rawUrl?.trim()));

  useEffect(() => {
    const u = rawUrl?.trim();
    if (!u) {
      setDisplaySrc(undefined);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const apply = (next: string | undefined) => {
      if (!cancelled) {
        setDisplaySrc(next);
        setLoading(false);
      }
    };

    setLoading(true);

    void (async () => {
      const key = extractMemberChatFileKeyFromUrl(u);
      if (key) {
        try {
          const signed = (await memberChatApi.getSignedDownloadUrl(key)).trim();
          if (signed) {
            apply(signed);
            return;
          }
        } catch {
          /* blob 폴백 */
        }
        try {
          const { data } = await httpClient.get('/member-chat/files/download', {
            params: { key, scanStatus: 'CLEAN' },
            responseType: 'blob',
          });
          objectUrl = URL.createObjectURL(data as Blob);
          apply(objectUrl);
          return;
        } catch {
          apply(undefined);
          return;
        }
      }

      if (u.includes('member-chat/files/download')) {
        try {
          const blobUrl = await fetchMemberChatFileAsObjectUrl(u);
          if (blobUrl) {
            objectUrl = blobUrl;
            apply(objectUrl);
            return;
          }
        } catch {
          apply(undefined);
          return;
        }
      }

      apply(u);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rawUrl]);

  return { displaySrc, loading };
}

