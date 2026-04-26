import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import { memberChatStompClient } from '@/features/member-chat/lib/memberChatStompClient';
import type { MemberChatMessage } from '@/features/member-chat/model/types';

type Options = {
  roomId: number | null;
  orderedMessages: readonly MemberChatMessage[];
  myLastReadMessageId?: number;
  viewing: boolean;
};

export function useChatReadAck({
  roomId,
  orderedMessages,
  myLastReadMessageId,
  viewing,
}: Options) {
  const qc = useQueryClient();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  // 새 메시지 다운 버튼 등 외부 컴포넌트가 반응할 수 있도록 state 도 함께 노출
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const lastAckedRef = useRef(0);
  const lastRoomRef = useRef<number | null>(null);
  const orderedRef = useRef<readonly MemberChatMessage[]>(orderedMessages);
  orderedRef.current = orderedMessages;
  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;

  const scrollThreadToBottom = useCallback((force: boolean, behavior: ScrollBehavior = 'auto') => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = threadRef.current;
        if (!el) return;
        if (!force && userScrolledUpRef.current) return;
        el.scrollTo({ top: el.scrollHeight, behavior });
      });
    });
  }, []);

  const ackLatestIfViewing = useCallback(() => {
    if (!roomId) return;
    if (!viewingRef.current) return;
    const list = orderedRef.current;
    if (list.length === 0) return;
    const last = list[list.length - 1]!;
    if (last.messageId <= lastAckedRef.current) return;
    lastAckedRef.current = last.messageId;
    void memberChatStompClient.sendReadLatest(roomId, 'web');
    void memberChatApi.ackReadLatest(roomId, 'web').then(() => {
      void qc.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
    });
  }, [roomId, qc]);

  const onThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = dist <= 96;
    userScrolledUpRef.current = !atBottom;
    setUserScrolledUp(!atBottom);
    if (atBottom) ackLatestIfViewing();
  }, [ackLatestIfViewing]);

  const resetForRoomChange = useCallback(() => {
    const rid = roomId ?? null;
    const changed = lastRoomRef.current !== rid;
    lastRoomRef.current = rid;
    if (!changed) return false;
    userScrolledUpRef.current = false;
    lastAckedRef.current = 0;
    scrollThreadToBottom(true);
    if (rid && viewingRef.current) {
      void memberChatStompClient.sendReadLatest(rid, 'web');
      void memberChatApi.ackReadLatest(rid, 'web').then((lastReadId) => {
        if (lastReadId != null) {
          lastAckedRef.current = Math.max(lastAckedRef.current, lastReadId);
        }
        void qc.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
      });
    }
    return true;
  }, [roomId, qc, scrollThreadToBottom]);

  useEffect(() => {
    resetForRoomChange();
  }, [resetForRoomChange, myLastReadMessageId]);

  useEffect(() => {
    if (!viewing) return;
    ackLatestIfViewing();
  }, [viewing, ackLatestIfViewing]);

  /**
   * 컴팩트 레이아웃에서 "목록으로 뒤로가기" 누르는 순간처럼,
   * 리렌더 전에 즉시 읽음 ack 경로를 끊어야 할 때 사용.
   */
  const suspendViewingAck = useCallback(() => {
    viewingRef.current = false;
  }, []);

  return {
    threadRef,
    userScrolledUpRef,
    userScrolledUp,
    scrollThreadToBottom,
    onThreadScroll,
    ackLatestIfViewing,
    resetForRoomChange,
    suspendViewingAck,
  };
}
