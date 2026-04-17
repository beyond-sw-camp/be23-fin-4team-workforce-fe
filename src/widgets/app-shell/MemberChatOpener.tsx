import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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
      <MemberChatModal
        open={open}
        onClose={closeMemberChat}
        initialDirectMemberId={directMemberId}
        onDirectIntentConsumed={onDirectIntentConsumed}
      />
    </MemberChatOpenerContext.Provider>
  );
}
