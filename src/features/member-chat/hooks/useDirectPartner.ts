import { useMemo } from 'react';
import type { MemberChatMessage, MemberChatRoomSummary } from '@/features/member-chat/model/types';
import type { ChatSenderRow } from '@/features/member-chat/hooks/useChatSenderProfiles';
import { sameMemberUuid } from '@/features/member-chat/ui/shared/chatIdentity';

export type DirectPartnerInfo = {
  name: string;
  subtitle: string;
  avatarUrl: string | null;
};

type Options = {
  activeRoom: MemberChatRoomSummary | null;
  orderedMessages: readonly MemberChatMessage[];
  selfMemberId?: string;
  getRow: (msg: MemberChatMessage) => ChatSenderRow;
};

/**
 * 1:1 방의 "상대방" 표시 정보 결정 우선순위:
 *   1) 방 서머리의 otherMember*  (백엔드 enriched, 빈 방에도 존재)
 *   2) 메시지 히스토리 senderInfo (REST/STOMP 양쪽에서 채워짐)
 *   3) null  (호출 측에서 방 title 폴백)
 */
export function useDirectPartner({
  activeRoom,
  orderedMessages,
  selfMemberId,
  getRow,
}: Options): DirectPartnerInfo | null {
  const isDirectRoom = activeRoom?.roomType === 'DIRECT';

  return useMemo(() => {
    if (!isDirectRoom || !activeRoom) return null;
    const fromRoom = activeRoom.otherMemberName?.trim();
    if (fromRoom) {
      const title =
        activeRoom.otherMemberJobTitleName?.trim() ||
        activeRoom.otherMemberJobGradeName?.trim() ||
        '';
      const org = activeRoom.otherMemberOrganizationName?.trim() || '';
      return {
        name: fromRoom,
        subtitle: [title, org].filter(Boolean).join(' · '),
        avatarUrl: activeRoom.otherMemberProfileUrl ?? null,
      };
    }
    if (!selfMemberId) return null;
    const other = orderedMessages.find((m) => !sameMemberUuid(m.senderId, selfMemberId));
    if (!other) return null;
    const row = getRow(other);
    return {
      name: row.name,
      subtitle: row.subtitle,
      avatarUrl: row.avatarUrl ?? null,
    };
  }, [
    isDirectRoom,
    activeRoom,
    selfMemberId,
    orderedMessages,
    getRow,
  ]);
}
