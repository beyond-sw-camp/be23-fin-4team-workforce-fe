import type { Ref } from 'react';
import { List } from 'antd';
import type { MemberChatMessage } from '@/features/member-chat/model/types';
import type { ChatSenderRow } from '@/features/member-chat/hooks/useChatSenderProfiles';
import { startOfDayKey } from '@/features/member-chat/ui/shared/chatFormatters';
import { sameMemberUuid } from '@/features/member-chat/ui/shared/chatIdentity';
import { PRETTY_SCROLLBAR_CLASS } from '@/features/member-chat/ui/shared/prettyScrollbar';
import { ChatDateSeparator } from '@/features/member-chat/ui/thread/ChatDateSeparator';
import { ChatLastReadSeparator } from '@/features/member-chat/ui/thread/ChatLastReadSeparator';
import { ChatMessageRow } from '@/features/member-chat/ui/thread/ChatMessageRow';
import { ChatNewMessagesButton } from '@/features/member-chat/ui/thread/ChatNewMessagesButton';
import { ChatTypingIndicator } from '@/features/member-chat/ui/thread/ChatTypingIndicator';

type Props = {
  /** useRef 가 만드는 mutable ref — div 의 Ref 타입과 호환된다. */
  threadRef: Ref<HTMLDivElement>;
  onScroll: () => void;
  loadingMessages: boolean;
  orderedMessages: readonly MemberChatMessage[];
  selfMemberId?: string;
  unreadByMessageId: Record<number, number>;
  getRow: (msg: MemberChatMessage) => ChatSenderRow;
  // 편집 상태
  editingMessageId: number | null;
  editingContent: string;
  onEditingContentChange: (next: string) => void;
  onStartEdit: (id: number, currentContent: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (id: number) => Promise<void> | void;
  editingLoading: boolean;
  onRequestDelete: (id: number) => void;
  // 타이핑
  typingMemberIds: string[];
  // 레이아웃
  threadHeightClass: string;
  // 무한 스크롤
  hasMoreOlder: boolean;
  isFetchingOlder: boolean;
  /** 스크롤 최상단 근처에 도달 시 호출 — 호출 측에서 위치 보존 처리 */
  onReachTop: () => void;
  // last-read separator
  /** 방 진입 시 캡처해 둔 내 마지막 읽은 메시지 id. 이 id 직후에 separator 가 표시된다. */
  lastReadAnchor?: number | null;
  // optimistic 상태 조회 (clientMessageId → status/handlers)
  getOptimistic?: (msg: MemberChatMessage) => {
    status: 'pending' | 'failed';
    onRetry: () => void;
    onDrop: () => void;
  } | null;
  // 새 메시지 다운 버튼
  /** 위로 스크롤한 상태에서 도착한 새 메시지 수 (0 이면 버튼은 안 보임) */
  newMessagesCount: number;
  /** 사용자가 위로 스크롤한 상태인지 — 다운 버튼 가시성 판단에 사용 */
  showNewMessagesButton: boolean;
  /** 다운 버튼 클릭 시 호출 — 호출 측에서 scrollThreadToBottom + 카운터 리셋 */
  onScrollDownToNew: () => void;
  // Reply 점프
  /** 인용 클릭 시 원본으로 점프하기 위한 messageId 핸들러 */
  onJumpToMessage?: (messageId: number) => void;
  /** 컨텍스트 메뉴 "답장" 핸들러 */
  onReply?: (msg: MemberChatMessage) => void;
};

/** 같은 사람 + 2분 이내면 그룹핑 */
const GROUP_WINDOW_MS = 2 * 60 * 1000;
function isGrouped(prev: MemberChatMessage | undefined, curr: MemberChatMessage): boolean {
  if (!prev) return false;
  if (!sameMemberUuid(prev.senderId, curr.senderId)) return false;
  // 날짜 separator 가 들어가는 지점에서는 그룹핑 끊기
  if (startOfDayKey(prev.createdAt) !== startOfDayKey(curr.createdAt)) return false;
  const dt = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return dt >= 0 && dt <= GROUP_WINDOW_MS;
}

/**
 * 우측 메시지 리스트 컨테이너.
 *  - 날짜 separator + 메시지 줄 + 하단 고정 타이핑 인디케이터.
 *  - 스크롤 핸들/ack 는 컨테이너(MemberChatPanel)가 useChatReadAck 으로 관리하고 ref·핸들러만 받는다.
 */
export function ChatThread({
  threadRef,
  onScroll,
  loadingMessages,
  orderedMessages,
  selfMemberId,
  unreadByMessageId,
  getRow,
  editingMessageId,
  editingContent,
  onEditingContentChange,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  editingLoading,
  onRequestDelete,
  typingMemberIds,
  threadHeightClass,
  hasMoreOlder,
  isFetchingOlder,
  onReachTop,
  lastReadAnchor,
  getOptimistic,
  newMessagesCount,
  showNewMessagesButton,
  onScrollDownToNew,
  onJumpToMessage,
  onReply,
}: Props) {
  /** 스크롤 핸들러 — 기존 onScroll(읽음 ack) + 최상단 근처면 fetchOlder 트리거 */
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    onScroll();
    const el = e.currentTarget;
    if (el.scrollTop < 80 && hasMoreOlder && !isFetchingOlder) {
      onReachTop();
    }
  };

  /** last-read separator 위치: lastReadAnchor 직후의 첫 "내가 안 보낸" 메시지 앞에 1회 */
  let separatorPlaced = false;

  return (
    <div className="tw-relative tw-flex tw-min-h-0 tw-flex-1 tw-flex-col">
      <div
        ref={threadRef}
        onScroll={handleScroll}
        className={`tw-rounded-lg tw-border tw-border-slate-100 tw-bg-[#FBFBFE] tw-p-4 ${threadHeightClass} ${PRETTY_SCROLLBAR_CLASS}`}
      >
        {isFetchingOlder ? (
          <div className="tw-mb-2 tw-flex tw-justify-center tw-text-[11px] tw-font-medium tw-text-slate-400">
            이전 메시지 불러오는 중…
          </div>
        ) : null}
        <List
          className="[&_.ant-list-item]:!tw-overflow-visible"
          loading={loadingMessages}
          rowKey="messageId"
          dataSource={orderedMessages as MemberChatMessage[]}
          locale={{ emptyText: '메시지가 없습니다.' }}
          renderItem={(item, index) => {
            const prev = index > 0 ? orderedMessages[index - 1] : undefined;
            const showDaySep =
              orderedMessages.length > 0 &&
              (!prev || startOfDayKey(prev.createdAt) !== startOfDayKey(item.createdAt));
            const compact = isGrouped(prev, item);
            const sender = getRow(item);
            const unreadForMessage = unreadByMessageId[item.messageId] ?? 0;
            const showLastReadSep =
              !separatorPlaced &&
              lastReadAnchor != null &&
              item.messageId > lastReadAnchor &&
              !sameMemberUuid(item.senderId, selfMemberId);
            if (showLastReadSep) separatorPlaced = true;
            const opt = getOptimistic ? getOptimistic(item) : null;
            return (
              <List.Item
                data-message-id={item.messageId}
                className="!tw-block !tw-overflow-visible !tw-border-0 !tw-px-0 !tw-py-1 [&.mc-jump-flash]:tw-rounded-lg [&.mc-jump-flash]:tw-ring-2 [&.mc-jump-flash]:tw-ring-[#2563EB]/40"
              >
                {showDaySep ? <ChatDateSeparator iso={item.createdAt} /> : null}
                {showLastReadSep ? <ChatLastReadSeparator /> : null}
                <ChatMessageRow
                  item={item}
                  allMessages={orderedMessages}
                  sender={sender}
                  selfMemberId={selfMemberId}
                  unreadForMessage={unreadForMessage}
                  compact={compact}
                  optimisticStatus={opt?.status}
                  onRetry={opt?.onRetry}
                  onDropFailed={opt?.onDrop}
                  editingMessageId={editingMessageId}
                  editingContent={editingContent}
                  onEditingContentChange={onEditingContentChange}
                  onStartEdit={onStartEdit}
                  onCancelEdit={onCancelEdit}
                  onSubmitEdit={onSubmitEdit}
                  onRequestDelete={onRequestDelete}
                  editingLoading={editingLoading}
                  onReply={onReply}
                  onJumpToMessage={onJumpToMessage}
                  getRow={getRow}
                />
              </List.Item>
            );
          }}
        />
      </div>
      <ChatNewMessagesButton
        visible={showNewMessagesButton}
        count={newMessagesCount}
        onClick={onScrollDownToNew}
      />
      <ChatTypingIndicator
        typingMemberIds={typingMemberIds}
        orderedMessages={orderedMessages}
        getRow={getRow}
      />
    </div>
  );
}
