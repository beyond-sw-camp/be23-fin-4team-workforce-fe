import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  CloseOutlined,
  EnterOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { Input, Tooltip, Upload } from 'antd';
import type { MemberChatMessage } from '@/features/member-chat/model/types';
import { MEMBER_CHAT_OVERLAY_Z } from '@/features/member-chat/ui/shared/chatIdentity';
import { PRETTY_SCROLLBAR_CLASS } from '@/features/member-chat/ui/shared/prettyScrollbar';

type Props = {
  draft: string;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  /** antd Upload.beforeUpload 시그니처 — Upload.LIST_IGNORE 등 false-y 값을 반환해야 한다. */
  onAttach: (file: File) => Promise<typeof Upload.LIST_IGNORE> | typeof Upload.LIST_IGNORE;
  disabled: boolean;
  uploading: boolean;
  sending: boolean;
  isFloating: boolean;
  /** 답장 대상이 설정되어 있을 때 입력창 위에 미리보기 표시 */
  replyTo?: MemberChatMessage | null;
  /** 답장 대상의 발신자 이름 (표시용) */
  replyToSenderName?: string;
  /** 답장 미리보기 X 클릭 핸들러 */
  onCancelReply?: () => void;
};

/**
 * 입력 영역.
 *  - Enter 전송, Shift+Enter 줄바꿈.
 *  - 파일 첨부(antd Upload), 전송 버튼은 액센트 컬러(#2563EB) 솔리드.
 *  - 메신저 톤은 다른 페이지의 primary(#1e3a5f) 보다 한 단계 밝은 액센트로 통일.
 */
export function ChatComposer({
  draft,
  onDraftChange,
  onSend,
  onAttach,
  disabled,
  uploading,
  sending,
  isFloating,
  replyTo,
  replyToSenderName,
  onCancelReply,
}: Props) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if (sending || uploading || disabled) return;
    if (!draft.trim()) return;
    onSend();
  };

  return (
    <div className="tw-flex tw-shrink-0 tw-flex-col tw-gap-1.5">
      {replyTo ? (
        <div className="tw-flex tw-items-center tw-gap-2 tw-rounded-xl tw-border tw-border-[#2563EB]/25 tw-bg-[#EFF6FF] tw-px-3 tw-py-2">
          <EnterOutlined className="tw-rotate-180 tw-text-[12px] tw-text-[#2563EB]" />
          <div className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col tw-gap-0.5">
            <span className="tw-truncate tw-text-[11px] tw-font-bold tw-text-[#2563EB]">
              {replyToSenderName || '대화 상대'}님에게 답장
            </span>
            <span className="tw-truncate tw-text-[11px] tw-text-slate-500">
              {replyTo.deleted
                ? '삭제된 메시지'
                : replyTo.type === 'IMAGE'
                  ? '🖼 이미지'
                  : replyTo.type === 'FILE'
                    ? '📎 파일'
                    : (replyTo.content ?? '').replace(/\s+/g, ' ').trim() || '(내용 없음)'}
            </span>
          </div>
          {onCancelReply ? (
            <button
              type="button"
              onClick={onCancelReply}
              className="tw-inline-flex tw-h-6 tw-w-6 tw-shrink-0 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-transparent tw-text-slate-400 hover:tw-bg-white hover:tw-text-slate-800"
              aria-label="답장 취소"
            >
              <CloseOutlined className="tw-text-[11px]" />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="tw-rounded-2xl tw-border tw-border-slate-200/90 tw-bg-slate-50 tw-px-3 tw-py-2 tw-transition-colors focus-within:tw-border-[#2563EB]/40 focus-within:tw-bg-white">
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: isFloating ? 5 : 8 }}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? '채팅방을 선택해 주세요' : '메시지를 입력하세요'}
          disabled={disabled || uploading}
          className={`!tw-max-h-[168px] !tw-min-h-[44px] !tw-border-0 !tw-bg-transparent !tw-p-0 !tw-pr-1 !tw-text-[15px] !tw-leading-[1.5] !tw-shadow-none placeholder:!tw-text-slate-400 focus:!tw-shadow-none ${PRETTY_SCROLLBAR_CLASS}`}
          style={{ resize: 'none' }}
          aria-label="메시지 입력"
        />
        <div className="tw-mt-2 tw-flex tw-items-center tw-justify-between tw-gap-2 tw-border-t tw-border-slate-100 tw-pt-2">
          <Tooltip
            title="사진·파일 보내기"
            zIndex={MEMBER_CHAT_OVERLAY_Z + 50}
            getPopupContainer={(n) => n.parentElement ?? document.body}
          >
            <span className="tw-inline-flex">
              <Upload showUploadList={false} beforeUpload={(file) => onAttach(file as File)}>
                <button
                  type="button"
                  disabled={disabled || uploading}
                  className="tw-flex tw-h-9 tw-w-9 tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-transparent tw-text-slate-500 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-800 disabled:tw-cursor-not-allowed disabled:tw-opacity-40"
                  aria-label="파일 보내기"
                >
                  <PaperClipOutlined className="tw-text-[18px]" />
                </button>
              </Upload>
            </span>
          </Tooltip>
          <Tooltip
            title="전송 (Enter)"
            zIndex={MEMBER_CHAT_OVERLAY_Z + 50}
            getPopupContainer={(n) => n.parentElement ?? document.body}
          >
            <button
              type="button"
              onClick={onSend}
              disabled={disabled || !draft.trim() || sending}
              className={`tw-inline-flex tw-h-10 tw-w-10 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-text-white tw-shadow-md tw-transition-colors disabled:tw-cursor-not-allowed ${
                draft.trim() && !disabled
                  ? 'tw-bg-[#2563EB] hover:tw-bg-[#1d4ed8]'
                  : 'tw-bg-slate-200 tw-text-slate-400 tw-shadow-none'
              }`}
              aria-label="메시지 전송"
            >
              {sending ? (
                <LoadingOutlined className="tw-text-base" />
              ) : (
                <SendOutlined className="tw-text-base" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>
      <p className="tw-m-0 tw-select-none tw-text-center tw-text-[10px] tw-leading-snug tw-text-slate-400">
        Enter로 전송 · Shift+Enter로 줄바꿈 · 맨 아래를 보면 자동 읽음
      </p>
    </div>
  );
}
