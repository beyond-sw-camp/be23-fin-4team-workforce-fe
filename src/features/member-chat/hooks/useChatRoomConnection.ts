import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { memberChatStompClient } from '@/features/member-chat/lib/memberChatStompClient';
import type {
  MemberChatMessage,
  MemberChatReadEvent,
} from '@/features/member-chat/model/types';

type Options = {
  /** 활성화된 방의 id. null 이면 구독 X. */
  roomId: number | null;
  /** READ 이벤트 수신 시 호출 — 방 내 멤버별 lastReadMessageId 갱신 */
  onReadEvent: (payload: MemberChatReadEvent) => void;
};

/**
 * 활성 방에 대해 STOMP 연결·메시지·읽음·에러 구독을 일괄 처리.
 * 메시지 수신 시 query 무효화로 자동 재조회한다.
 */
export function useChatRoomConnection({ roomId, onReadEvent }: Options) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!roomId) return;
    let unsubMessage: () => void = () => {};
    let unsubRead: () => void = () => {};
    let unsubError: () => void = () => {};
    let mounted = true;

    const connect = async () => {
      try {
        await memberChatStompClient.connect();
        if (!mounted) return;
        // 서버가 방 구독 거부 시 /user/queue/errors 로 통지 — 먼저 에러 큐를 구독해야 알림을 받는다.
        unsubError = memberChatStompClient.subscribeErrors((raw) => {
          const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
          const detail = (o?.message as string) ?? (o?.code as string) ?? JSON.stringify(raw);
          void message.error(`채팅: ${detail}`);
        });
        unsubMessage = memberChatStompClient.subscribeRoomMessages<MemberChatMessage>(roomId, () => {
          void queryClient.invalidateQueries({ queryKey: ['member-chat', 'history', roomId] });
          void queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
        });
        unsubRead = memberChatStompClient.subscribeReadEvents(roomId, onReadEvent);
      } catch (e) {
        void message.error((e as Error).message || '채팅 연결에 실패했습니다.');
      }
    };

    void connect();

    return () => {
      mounted = false;
      unsubMessage();
      unsubRead();
      unsubError();
    };
  }, [roomId, queryClient, onReadEvent]);
}
