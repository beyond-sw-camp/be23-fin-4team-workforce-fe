import { useState } from 'react';
import { Avatar, Typography, message as antdMessage } from 'antd';
import type { MemberChatMessage } from '@/features/member-chat/model/types';
import {
  chatSenderInitial,
  type ChatSenderRow,
} from '@/features/member-chat/hooks/useChatSenderProfiles';
import { formatChatTime } from '@/features/member-chat/ui/shared/chatFormatters';
import { sameMemberUuid } from '@/features/member-chat/ui/shared/chatIdentity';
import { ChatMessageBubble } from '@/features/member-chat/ui/thread/ChatMessageBubble';
import {
  ChatMessageContextMenu,
  type ChatMessageMenuItem,
} from '@/features/member-chat/ui/thread/ChatMessageContextMenu';
import { ChatLinkifiedText } from '@/features/member-chat/ui/thread/bubble/ChatLinkifiedText';
import { ChatDeletedBody } from '@/features/member-chat/ui/thread/bubble/ChatDeletedBody';
import { ChatEditingBody } from '@/features/member-chat/ui/thread/bubble/ChatEditingBody';
import { ChatImageBody } from '@/features/member-chat/ui/thread/bubble/ChatImageBody';
import { ChatFileBody } from '@/features/member-chat/ui/thread/bubble/ChatFileBody';
import { ChatQuotedReply } from '@/features/member-chat/ui/thread/bubble/ChatQuotedReply';

type Props = {
  item: MemberChatMessage;
  /** 전체 메시지 목록 — 인용된 원본을 찾을 때 사용 */
  allMessages: readonly MemberChatMessage[];
  sender: ChatSenderRow;
  selfMemberId?: string;
  unreadForMessage: number;
  /** 답장 핸들러 (없으면 컨텍스트 메뉴에서 항목 숨김) */
  onReply?: (msg: MemberChatMessage) => void;
  /** 인용 클릭 시 원본 messageId 로 점프 */
  onJumpToMessage?: (messageId: number) => void;
  /** 인용 표시 시 발신자 프로필 조회용 */
  getRow?: (msg: MemberChatMessage) => ChatSenderRow;
  /**
   * 직전 메시지와 그룹핑된 상태인지.
   *  true 면 아바타·이름·여백을 압축해 같은 발신자의 연속 메시지처럼 보여준다.
   */
  compact?: boolean;
  /** 옵티미스틱 상태 (pending/failed). 정식 메시지엔 undefined. */
  optimisticStatus?: 'pending' | 'failed';
  /** 옵티미스틱 실패 시 호출되는 재시도 핸들러 */
  onRetry?: () => void;
  /** 옵티미스틱 실패 시 호출되는 영구 삭제 핸들러 */
  onDropFailed?: () => void;
  /** 인라인 편집 진행 중인 메시지 id */
  editingMessageId: number | null;
  editingContent: string;
  onEditingContentChange: (next: string) => void;
  onStartEdit: (id: number, currentContent: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (id: number) => Promise<void> | void;
  onRequestDelete: (id: number) => void;
  editingLoading: boolean;
};

function isImageMessage(item: MemberChatMessage) {
  return item.type === 'IMAGE';
}
function isFileMessage(item: MemberChatMessage) {
  return item.type === 'FILE';
}

function formatSystemMessage(content: string | undefined, senderName: string): string {
  const raw = content?.trim();
  if (!raw) return '시스템 메시지';
  const inviter = senderName?.trim() || '알 수 없는 사용자';
  const inviteMatch = raw.match(/^(.+?)님이 초대되었습니다\.?$/);
  if (inviteMatch) {
    const invitee = inviteMatch[1]?.trim();
    if (invitee) return `${inviter}님이 ${invitee}님을 초대했습니다.`;
  }
  return raw;
}

/**
 * 메시지 1줄. 아바타·이름·버블·메타(시간/수정됨/안읽은수) + 컨텍스트 메뉴 통합.
 * 모든 메시지에 호버 시 점 3개 버튼이 노출되며, 메뉴 항목은 권한별 필터링.
 */
export function ChatMessageRow({
  item,
  allMessages,
  sender,
  selfMemberId,
  unreadForMessage,
  compact = false,
  optimisticStatus,
  onRetry,
  onDropFailed,
  editingMessageId,
  editingContent,
  onEditingContentChange,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onRequestDelete,
  editingLoading,
  onReply,
  onJumpToMessage,
  getRow,
}: Props) {
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const isSystem = item.type === 'SYSTEM';
  const isMine = sameMemberUuid(item.senderId, selfMemberId);
  const timeLabel = formatChatTime(item.createdAt);
  const systemText = formatSystemMessage(item.content, sender.name);

  const isEditing = editingMessageId === item.messageId;
  const isText = item.type === 'NORMAL';
  const canCopy = !item.deleted && isText;
  const canEdit = isMine && !item.deleted && isText && !isImageMessage(item) && !isFileMessage(item);
  const canDelete = isMine && !item.deleted;

  const menuItems: ChatMessageMenuItem[] = [];
  if (onReply && !item.deleted) {
    menuItems.push({
      kind: 'reply',
      onSelect: () => onReply(item),
    });
  }
  if (canCopy) {
    menuItems.push({
      kind: 'copy',
      onSelect: () => {
        const text = item.content ?? '';
        if (!text) return;
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          void navigator.clipboard.writeText(text).then(
            () => antdMessage.success('메시지를 복사했습니다.'),
            () => antdMessage.error('복사에 실패했습니다.'),
          );
        }
      },
    });
  }
  if (canEdit) {
    menuItems.push({
      kind: 'edit',
      onSelect: () => onStartEdit(item.messageId, item.content ?? ''),
    });
  }
  if (canDelete) {
    menuItems.push({
      kind: 'delete',
      onSelect: () => onRequestDelete(item.messageId),
    });
  }

  const showHoverHandle = menuItems.length > 0 && !isEditing;
  const showUnreadBadge = unreadForMessage > 0;

  if (isSystem) {
    return (
      <div className="tw-my-2 tw-flex tw-w-full tw-flex-col tw-items-center tw-gap-1">
        <div className="tw-inline-flex tw-max-w-[90%] tw-items-center tw-justify-center tw-rounded-full tw-border tw-border-slate-200 tw-bg-slate-100/80 tw-px-3 tw-py-1.5 tw-text-center tw-text-xs tw-font-medium tw-text-slate-600">
          {systemText}
        </div>
        {timeLabel ? <span className="tw-text-[10px] tw-text-slate-400">{timeLabel}</span> : null}
      </div>
    );
  }

  const bubbleBody = item.deleted ? (
    <ChatDeletedBody />
  ) : isEditing ? (
    <ChatEditingBody
      value={editingContent}
      onChange={onEditingContentChange}
      onCancel={onCancelEdit}
      onSave={() => void onSubmitEdit(item.messageId)}
      loading={editingLoading}
    />
  ) : isImageMessage(item) ? (
    <ChatImageBody content={item.content} />
  ) : isFileMessage(item) ? (
    <ChatFileBody content={item.content} />
  ) : (
    <ChatLinkifiedText
      text={item.content ?? ''}
      className="!tw-my-0 tw-text-sm tw-leading-relaxed tw-text-inherit"
    />
  );

  // compact 모드: 같은 발신자의 연속 메시지일 때 아바타·이름을 숨기고 들여쓰기로 묶어 보여준다.
  const isPending = optimisticStatus === 'pending';
  const isFailed = optimisticStatus === 'failed';

  return (
    <div
      className={`tw-flex tw-w-full tw-gap-2 ${isMine ? 'tw-flex-row-reverse' : 'tw-flex-row'} ${
        compact ? 'tw-mt-0.5' : 'tw-mt-2'
      } ${isPending ? 'tw-opacity-65' : ''}`}
    >
      {compact ? (
        // 아바타 자리는 비워두되 너비는 유지해 버블이 같은 라인에 정렬되도록.
        <div className="tw-h-9 tw-w-9 tw-shrink-0" aria-hidden />
      ) : (
        <Avatar
          className={
            isMine
              ? '!tw-shrink-0 !tw-rounded-2xl !tw-bg-[#2563EB] !tw-text-white'
              : 'tw-shrink-0 !tw-rounded-2xl tw-bg-slate-200 tw-text-slate-500'
          }
          size={36}
          src={sender.avatarUrl || undefined}
        >
          {chatSenderInitial(sender.name)}
        </Avatar>
      )}

      <div
        className={`tw-flex tw-min-w-0 tw-max-w-[min(100%,20rem)] tw-flex-col tw-gap-0.5 ${
          isMine ? 'tw-items-end' : 'tw-items-start'
        }`}
      >
        {!isMine && !compact ? (
          <div className="tw-px-0.5">
            <Typography.Text strong className="tw-text-sm tw-text-slate-900">
              {sender.name}
            </Typography.Text>
            {sender.subtitle ? (
              <Typography.Text type="secondary" className="tw-ml-1.5 tw-text-[11px] tw-leading-none">
                {sender.subtitle}
              </Typography.Text>
            ) : null}
          </div>
        ) : null}

        <div
          className={`tw-relative tw-z-[1] tw-inline-flex tw-max-w-full tw-flex-col tw-overflow-visible ${
            isMine ? 'tw-items-end' : 'tw-items-start'
          }`}
        >
          <ChatMessageBubble
            isMine={isMine}
            showHoverHandle={showHoverHandle}
            onOpenMenu={(a) => setMenuAnchor(a)}
          >
            {item.replyToId != null
              ? (() => {
                  const original = allMessages.find((m) => m.messageId === item.replyToId) ?? null;
                  const originalSender = original && getRow ? getRow(original) : null;
                  return (
                    <ChatQuotedReply
                      original={original}
                      originalSender={originalSender}
                      isInsideMineBubble={isMine}
                      onClick={() => {
                        if (item.replyToId != null && onJumpToMessage) {
                          onJumpToMessage(item.replyToId);
                        }
                      }}
                    />
                  );
                })()
              : null}
            {bubbleBody}
          </ChatMessageBubble>

          <div
            className={`tw-mt-1 tw-flex tw-w-full tw-max-w-full tw-flex-wrap tw-items-center tw-gap-x-2 tw-gap-y-1 tw-text-[11px] tw-leading-snug tw-text-slate-400 ${
              isMine ? 'tw-justify-end' : 'tw-justify-start'
            }`}
          >
            <span className="tw-inline-flex tw-flex-wrap tw-items-center tw-gap-x-1.5">
              {isPending ? (
                <span className="tw-italic tw-text-slate-400">전송 중…</span>
              ) : isFailed ? (
                <span className="tw-inline-flex tw-items-center tw-gap-1.5 tw-text-rose-500">
                  <span aria-hidden>⚠</span>
                  <span>전송 실패</span>
                  {onRetry ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="tw-cursor-pointer tw-border-0 tw-bg-transparent tw-p-0 tw-text-[11px] tw-font-bold tw-text-rose-500 tw-underline tw-underline-offset-2 hover:tw-text-rose-600"
                    >
                      재시도
                    </button>
                  ) : null}
                  {onDropFailed ? (
                    <button
                      type="button"
                      onClick={onDropFailed}
                      className="tw-cursor-pointer tw-border-0 tw-bg-transparent tw-p-0 tw-text-[11px] tw-text-slate-400 tw-underline tw-underline-offset-2 hover:tw-text-slate-800"
                    >
                      삭제
                    </button>
                  ) : null}
                </span>
              ) : (
                <>
                  {timeLabel ? <span className="tw-tabular-nums">{timeLabel}</span> : null}
                  {item.edited ? (
                    <>
                      {timeLabel ? <span className="tw-text-slate-300">·</span> : null}
                      <span>수정됨</span>
                    </>
                  ) : null}
                  {showUnreadBadge ? (
                    <>
                      {timeLabel || item.edited ? <span className="tw-text-slate-300">·</span> : null}
                      <span
                        className="tw-font-bold tw-text-rose-500"
                        aria-label={`안 읽은 ${unreadForMessage}명`}
                      >
                        {unreadForMessage}
                      </span>
                    </>
                  ) : null}
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      <ChatMessageContextMenu
        anchor={menuAnchor}
        items={menuItems}
        onClose={() => setMenuAnchor(null)}
      />
    </div>
  );
}
