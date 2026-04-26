import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { memberChatApi } from '@/features/member-chat/api/memberChatApi';
import { useChatRoomListLiveSync } from '@/features/member-chat/hooks/useChatRoomListLiveSync';
import { MemberChatModal } from '@/widgets/app-shell/MemberChatModal';

export type MemberChatOpenerValue = {
  /** 메신저 플로팅 창을 엽니다. `directMemberId`가 있으면 해당 멤버와 1:1 방으로 진입합니다. */
  openMemberChat: (opts?: { directMemberId?: string | null }) => void;
};

const MemberChatOpenerContext = createContext<MemberChatOpenerValue | null>(null);

export function useMemberChatOpener(): MemberChatOpenerValue {
  const v = useContext(MemberChatOpenerContext);
  if (!v) {
    throw new Error('useMemberChatOpener must be used within MemberChatProvider');
  }
  return v;
}

/**
 * 항상 마운트되는 라이브싱크 에이전트.
 *  - 메신저 모달 열림 여부와 무관하게 사용자가 가진 모든 방의 STOMP 메시지 토픽을 구독.
 *  - 새 메시지 도착 시 `['member-chat', 'rooms']` 쿼리를 invalidate 하여
 *    AppShell 헤더의 채팅 뱃지(unreadCount 합) 가 실시간 갱신되도록 한다.
 *  - 인증 전에는 아무 것도 하지 않는다.
 */
function MemberChatLiveSyncAgent() {
  const { status } = useAuth();
  const { data: rooms = [] } = useQuery({
    queryKey: ['member-chat', 'rooms'],
    queryFn: () => memberChatApi.listMyRooms(),
    enabled: status === 'authenticated',
  });
  const roomIds = useMemo(() => rooms.map((r) => r.roomId), [rooms]);
  useChatRoomListLiveSync(roomIds);
  return null;
}

export function MemberChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [directMemberId, setDirectMemberId] = useState<string | null>(null);

  const openMemberChat = useCallback((opts?: { directMemberId?: string | null }) => {
    const raw = opts?.directMemberId?.trim();
    setDirectMemberId(raw && raw.length > 0 ? raw : null);
    setOpen(true);
  }, []);

  const closeMemberChat = useCallback(() => {
    setOpen(false);
    setDirectMemberId(null);
  }, []);

  const onDirectIntentConsumed = useCallback(() => {
    setDirectMemberId(null);
  }, []);

  const value = useMemo(() => ({ openMemberChat }), [openMemberChat]);

  return (
    <MemberChatOpenerContext.Provider value={value}>
      {children}
      <MemberChatLiveSyncAgent />
      <MemberChatModal
        open={open}
        onClose={closeMemberChat}
        initialDirectMemberId={directMemberId}
        onDirectIntentConsumed={onDirectIntentConsumed}
      />
    </MemberChatOpenerContext.Provider>
  );
}
