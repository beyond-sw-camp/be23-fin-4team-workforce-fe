import type { MemberChatAttachmentPayload } from '@/features/member-chat/model/types';

/**
 * FILE / IMAGE 메시지의 content 를 파싱한다.
 *   - 신규: JSON 문자열 `{key, name?, mime?, size?}`
 *   - 레거시: 순수 S3 key 문자열 → {key: content}
 * 파싱 실패시 빈 key 를 반환해도 UI 가 폴백할 수 있도록 한다.
 */
export function parseAttachmentPayload(content: string | undefined | null): MemberChatAttachmentPayload {
  const raw = (content ?? '').trim();
  if (!raw) return { key: '' };
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const key = typeof parsed.key === 'string' ? parsed.key : '';
      if (key) {
        return {
          key,
          name: typeof parsed.name === 'string' ? parsed.name : undefined,
          mime: typeof parsed.mime === 'string' ? parsed.mime : undefined,
          size:
            typeof parsed.size === 'number' && !Number.isNaN(parsed.size)
              ? parsed.size
              : typeof parsed.size === 'string' && !Number.isNaN(Number(parsed.size))
                ? Number(parsed.size)
                : undefined,
        };
      }
    } catch {
      /* fallthrough */
    }
  }
  return { key: raw };
}

export function encodeAttachmentPayload(p: MemberChatAttachmentPayload): string {
  // name 이 없으면 S3 key tail 로 폴백하도록 key 만 남긴다(최소 구성).
  const out: Record<string, unknown> = { key: p.key };
  if (p.name) out.name = p.name;
  if (p.mime) out.mime = p.mime;
  if (typeof p.size === 'number' && p.size >= 0) out.size = p.size;
  return JSON.stringify(out);
}

/** S3 key 에서 사람이 읽기 좋은 표시명을 뽑아낸다. 원본 파일명이 보존되지 않은 구버전을 위한 폴백. */
export function fallbackNameFromKey(key: string): string {
  if (!key) return '첨부파일';
  const tail = key.substring(key.lastIndexOf('/') + 1);
  // `{ts}_{uuid32}{.ext}` 패턴이면 확장자 + "첨부파일" 로 단순화
  const m = tail.match(/\.[A-Za-z0-9]{1,8}$/);
  if (m) return `첨부파일${m[0]}`;
  return tail || '첨부파일';
}

/** 바이트 → "12.3 MB" 형태 */
export function formatFileSize(size: number | undefined): string {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${size} B`;
  const k = size / 1024;
  if (k < 1024) return `${k.toFixed(k >= 10 ? 0 : 1)} KB`;
  const m = k / 1024;
  if (m < 1024) return `${m.toFixed(m >= 10 ? 0 : 1)} MB`;
  const g = m / 1024;
  return `${g.toFixed(g >= 10 ? 0 : 1)} GB`;
}
