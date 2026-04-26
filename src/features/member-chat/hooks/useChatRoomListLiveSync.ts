import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { memberChatStompClient } from '@/features/member-chat/lib/memberChatStompClient';

/**
 * 사용자가 참여 중인 모든 방의 메시지 토픽에 가벼운 ping 구독을 걸어둔다.
 *
 * 왜 필요한가:
 *  - 활성 방에 대한 STOMP 구독은 useChatRoomConnection 이 따로 처리한다.
 *  - 그러나 비활성 방에 새 메시지가 들어오면 클라이언트는 알지 못해
 *    `unreadCount` 뱃지가 polling/포커스 이벤트 시점까지 갱신되지 않는다 (실시간 시차).
 *  - 모든 방의 메시지 도착 시점에 룸 리스트 쿼리를 invalidate 하면 서버의 최신 unreadCount 를 즉시 반영할 수 있다.
 *
 * 구현 비용:
 *  - 메시지 본문은 파싱하지 않고 콜백만 트리거 — Set/Map 카운팅 정도만.
 *  - 구독 객체는 STOMP 클라이언트 내부에서 재연결 시 자동 reattach.
 */
export function useChatRoomListLiveSync(roomIds: readonly number[]) {
  const queryClient = useQueryClient();
  // 정렬+JSON 으로 안정 키 생성 — 매 렌더의 새 배열 참조로 인한 재구독 방지.
  const stableKey = useMemo(() => [...roomIds].sort((a, b) => a - b).join(','), [roomIds]);

  useEffect(() => {
    const ids = stableKey ? stableKey.split(',').map(Number).filter((n) => !Number.isNaN(n)) : [];
    if (ids.length === 0) return;
    const unsubs: Array<() => void> = [];
    let cancelled = false;

    void memberChatStompClient.connect().then(() => {
      if (cancelled) return;
      for (const roomId of ids) {
        const unsub = memberChatStompClient.subscribeRoomMessages<unknown>(roomId, () => {
          // 본문은 보지 않고 룸 리스트만 갱신 — 서버가 unreadCount/preview 를 다시 채워준다.
          void queryClient.invalidateQueries({ queryKey: ['member-chat', 'rooms'] });
        });
        unsubs.push(unsub);
      }
    });

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
  }, [stableKey, queryClient]);
}
