import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import type {
  MemberChatCursorResponse,
  MemberChatMessage,
} from '@/features/member-chat/model/types';

const PAGE_SIZE = 50;

/**
 * 채팅 히스토리 — 커서 기반 무한 스크롤.
 *
 *  - 1페이지: 가장 최신 50개 (cursor 없이 호출)
 *  - 2페이지 이후: nextCursor(현 페이지의 가장 오래된 messageId) 로 더 이전 50개
 *  - 모든 페이지를 합쳐 messageId ASC 로 정렬해 컴포넌트에 노출
 *  - hasNext: 더 가져올 옛 메시지가 있는지
 *
 * 호출 측은 스크롤이 최상단 근처에 도달하면 fetchOlder() 를 호출하면 된다.
 * 위치 보존(prepend 후 scrollTop 보정) 은 ChatThread / useChatReadAck 쪽에서 처리.
 */
export function useChatHistoryInfinite(roomId: number | null) {
  const query = useInfiniteQuery<MemberChatCursorResponse>({
    queryKey: ['member-chat', 'history', roomId],
    enabled: roomId != null,
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      if (roomId == null) {
        return { items: [], nextCursor: null, hasNext: false };
      }
      return memberChatApi.getRoomHistory(roomId, pageParam as number | undefined, PAGE_SIZE);
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasNext) return undefined;
      return lastPage.nextCursor ?? undefined;
    },
  });

  const orderedMessages = useMemo<MemberChatMessage[]>(() => {
    const all = query.data?.pages.flatMap((p) => p.items) ?? [];
    // 동일 messageId 가 중복으로 들어올 수 있어(STOMP/refetch 중첩) 마지막 값 우선
    const dedup = new Map<number, MemberChatMessage>();
    for (const m of all) dedup.set(m.messageId, m);
    return Array.from(dedup.values()).sort((a, b) => a.messageId - b.messageId);
  }, [query.data?.pages]);

  const fetchOlder = useCallback(() => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    void query.fetchNextPage();
  }, [query]);

  return {
    orderedMessages,
    isLoading: query.isLoading,
    isFetchingOlder: query.isFetchingNextPage,
    hasMoreOlder: Boolean(query.hasNextPage),
    fetchOlder,
  };
}
