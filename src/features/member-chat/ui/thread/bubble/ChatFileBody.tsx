import { FileOutlined } from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import { useSignedDownloadUrl } from '@/features/member-chat/hooks/useSignedDownloadUrl';
import {
  fallbackNameFromKey,
  formatFileSize,
  parseAttachmentPayload,
} from '@/features/member-chat/lib/attachmentPayload';

/** 파일 메시지 하단 링크 — signed URL 을 새 탭으로 연다. */
function ChatFileDownloadLink({ storageKey, fileName }: { storageKey: string; fileName?: string }) {
  const { url, isLoading, isError } = useSignedDownloadUrl(storageKey);
  if (isLoading) {
    return (
      <span className="tw-text-xs tw-text-slate-400" aria-label="다운로드 URL 준비 중">
        준비 중…
      </span>
    );
  }
  if (isError || !url) {
    return <span className="tw-text-xs tw-text-rose-500">다운로드 URL 을 받을 수 없습니다.</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="tw-text-xs tw-text-[#2563EB] hover:tw-underline"
      aria-label={`${fileName ?? '첨부파일'} 새 탭에서 열기`}
    >
      새 탭에서 열기
    </a>
  );
}

export function ChatFileBody({ content }: { content?: string }) {
  const payload = parseAttachmentPayload(content);
  const displayName = payload.name || fallbackNameFromKey(payload.key);
  if (!payload.key) {
    return (
      <Typography.Text type="secondary" className="tw-text-sm tw-italic">
        파일 정보를 불러올 수 없습니다.
      </Typography.Text>
    );
  }
  const sizeLabel = formatFileSize(payload.size);
  return (
    <div>
      <Tag icon={<FileOutlined />} className="!tw-mb-1">
        파일
      </Tag>
      <div className="tw-flex tw-min-w-0 tw-flex-col tw-gap-0.5">
        <Typography.Text strong className="tw-break-all tw-text-sm" title={displayName}>
          {displayName}
        </Typography.Text>
        {sizeLabel ? (
          <Typography.Text type="secondary" className="tw-text-[11px]">
            {sizeLabel}
          </Typography.Text>
        ) : null}
      </div>
      <div className="tw-mt-1">
        <ChatFileDownloadLink storageKey={payload.key} fileName={displayName} />
      </div>
    </div>
  );
}