import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MemberChatMessage,
  MemberChatReadEvent,
  MemberChatRoomSummary,
} from '@/features/member-chat/model/types';
import { sameMemberUuid } from '@/features/member-chat/ui/shared/chatIdentity';

type Options = {
  activeRoom: MemberChatRoomSummary | null;
  orderedMessages: readonly MemberChatMessage[];
  /** 본인 멤버 id (시드용) */
  selfMemberId?: string;
};

/**
 * 방 내 멤버별 lastReadMessageId 를 관리하고, 메시지별 "안 읽은 사람 수" 를 계산한다.
 *
 *  - 1:1 방: 보낸 사람 기준으로
 *      내 메시지 → 상대 읽음선 ≥ id 면 0, 아니면 1
 *      상대 메시지 → 내 읽음선 ≥ id 면 0, 아니면 1
 *  - 그룹 방: max(서버 readerCount, 라이브 READ 이벤트 카운트) 기준 audience-readers
 */
export function usePerMemberLastRead({ activeRoom, orderedMessages, selfMemberId }: Options) {
  const [perMemberLastRead, setPerMemberLastRead] = useState<Record<string, number>>({});

  /** READ 이벤트 수신 콜백 (단조증가만 반영) */
  const onReadEvent = useCallback((payload: MemberChatReadEvent) => {
    setPerMemberLastRead((prev) => {
      const cur = prev[payload.memberId] ?? 0;
      const next = Math.max(cur, payload.lastReadMessageId ?? payload.messageId ?? 0);
      if (next === cur) return prev;
      return { ...prev, [payload.memberId]: next };
    });
  }, []);

  /** 방 전환 시 시드 — 본인 lastRead 만 우선 채워 둔다 */
  useEffect(() => {
    const seed: Record<string, number> = {};
    if (selfMemberId && activeRoom?.myLastReadMessageId != null) {
      seed[selfMemberId] = activeRoom.myLastReadMessageId;
    }
    setPerMemberLastRead(seed);
  }, [activeRoom?.roomId, activeRoom?.myLastReadMessageId, selfMemberId]);

  const isDirectRoom = activeRoom?.roomType === 'DIRECT';
  const roomParticipantCount = activeRoom?.participantCount ?? 0;

  const unreadByMessageId = useMemo(() => {
    const out: Record<number, number> = {};
    if (!activeRoom) return out;
    for (const m of orderedMessages) {
      let liveReaders = 0;
      for (const [memberId, lr] of Object.entries(perMemberLastRead)) {
        if (sameMemberUuid(memberId, m.senderId)) continue; // 보낸 사람 제외
        if ((lr ?? 0) >= m.messageId) liveReaders++;
      }

      if (isDirectRoom) {
        const senderIsMe = sameMemberUuid(m.senderId, selfMemberId);
        if (senderIsMe) {
          const roomOther = activeRoom.otherPartyLastReadMessageId ?? 0;
          const otherRead = roomOther >= m.messageId || liveReaders > 0;
          out[m.messageId] = otherRead ? 0 : 1;
        } else {
          const myRead =
            (selfMemberId ? perMemberLastRead[selfMemberId] : undefined) ??
            activeRoom.myLastReadMessageId ??
            0;
          out[m.messageId] = myRead >= m.messageId ? 0 : 1;
        }
      } else {
        const serverReaders = m.readerCount ?? 0;
        const readers = Math.max(serverReaders, liveReaders);
        const audience = Math.max(0, roomParticipantCount - 1);
        out[m.messageId] = Math.max(0, audience - readers);
      }
    }
    return out;
  }, [orderedMessages, perMemberLastRead, isDirectRoom, activeRoom, roomParticipantCount, selfMemberId]);

  return { perMemberLastRead, unreadByMessageId, onReadEvent };
}
