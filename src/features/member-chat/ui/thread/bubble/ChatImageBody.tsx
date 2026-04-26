import { Image, Typography } from 'antd';
import { useSignedDownloadUrl } from '@/features/member-chat/hooks/useSignedDownloadUrl';
import {
  fallbackNameFromKey,
  formatFileSize,
  parseAttachmentPayload,
} from '@/features/member-chat/lib/attachmentPayload';
import { MEMBER_CHAT_OVERLAY_Z } from '@/features/member-chat/ui/shared/chatIdentity';

/**
 * `<img>` 는 Authorization 헤더를 실어 줄 수 없어 `/files/download` 의 302 응답을 직접 따를 수 없다.
 * 서버가 발급한 presigned S3 URL(자체 서명)을 JSON 으로 받아 src 에 꽂는다.
 */
function ChatImagePreview({ storageKey, alt }: { storageKey: string; alt?: string }) {
  const { url, isLoading, isError } = useSignedDownloadUrl(storageKey);
  if (isLoading) {
    return (
      <div
        className="tw-flex tw-h-40 tw-w-60 tw-max-w-full tw-items-center tw-justify-center tw-rounded-lg tw-bg-slate-100 tw-text-[11px] tw-text-slate-400"
        aria-label="이미지 불러오는 중"
      >
        이미지 불러오는 중…
      </div>
    );
  }
  if (isError || !url) {
    return (
      <div className="tw-flex tw-h-20 tw-w-60 tw-max-w-full tw-items-center tw-justify-center tw-rounded-lg tw-border tw-border-dashed tw-border-rose-300 tw-bg-rose-50 tw-text-[11px] tw-text-rose-500">
        이미지를 불러올 수 없습니다.
      </div>
    );
  }
  return (
    <Image
      src={url}
      alt={alt ?? ''}
      className="tw-max-h-64 tw-max-w-full tw-rounded-lg tw-object-contain"
      preview={{
        mask: '확대',
        zIndex: MEMBER_CHAT_OVERLAY_Z + 120,
      }}
      style={{ maxHeight: '16rem', objectFit: 'contain' }}
    />
  );
}

export function ChatImageBody({ content }: { content?: string }) {
  const payload = parseAttachmentPayload(content);
  const displayName = payload.name || fallbackNameFromKey(payload.key);
  if (!payload.key) {
    return (
      <Typography.Text type="secondary" className="tw-text-sm tw-italic">
        이미지 정보를 불러올 수 없습니다.
      </Typography.Text>
    );
  }
  return (
    <div>
      <ChatImagePreview storageKey={payload.key} alt={displayName} />
      <div className="tw-mt-1 tw-flex tw-flex-wrap tw-items-center tw-gap-2">
        <Typography.Text
          type="secondary"
          className="tw-break-all tw-text-[11px]"
          title={displayName}
        >
          {displayName}
          {formatFileSize(payload.size) ? ` · ${formatFileSize(payload.size)}` : ''}
        </Typography.Text>
      </div>
    </div>
  );
}
