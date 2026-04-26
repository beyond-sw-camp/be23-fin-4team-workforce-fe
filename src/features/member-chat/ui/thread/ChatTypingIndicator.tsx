import { useMemo } from 'react';
import type { MemberChatMessage } from '@/features/member-chat/model/types';
import type { ChatSenderRow } from '@/features/member-chat/hooks/useChatSenderProfiles';
import { sameMemberUuid } from '@/features/member-chat/ui/shared/chatIdentity';

type Props = {
  /** 입력 중인 다른 멤버 id 목록 (본인은 이미 훅에서 제외됨) */
  typingMemberIds: string[];
  /**
   * 메시지 히스토리 — 이름 표시를 위해 한 번이라도 보인 발신자에서 sender 프로필을 끌어온다.
   * 처음 보는 멤버는 "누군가" 로 표시.
   */
  orderedMessages: readonly MemberChatMessage[];
  getRow: (msg: MemberChatMessage) => ChatSenderRow;
};

/**
 * 메시지 리스트 하단에 고정되는 타이핑 인디케이터.
 *  - 1명: "○○님이 입력 중…"
 *  - 2명: "○○ 외 1명이 입력 중…"
 *  - 도트 3개 펄스 애니메이션은 Tailwind animate-bounce 의 staggered 변형 (개별 delay)
 */
export function ChatTypingIndicator({ typingMemberIds, orderedMessages, getRow }: Props) {
  const label = useMemo(() => {
    if (typingMemberIds.length === 0) return '';
    const first = typingMemberIds[0]!;
    const sample = orderedMessages.find((m) => sameMemberUuid(m.senderId, first));
    const firstName = sample ? getRow(sample).name : '누군가';
    if (typingMemberIds.length === 1) return `${firstName}님이 입력 중`;
    return `${firstName} 외 ${typingMemberIds.length - 1}명이 입력 중`;
  }, [typingMemberIds, orderedMessages, getRow]);

  if (typingMemberIds.length === 0) return null;

  return (
    <div
      className="tw-pointer-events-none tw-absolute tw-bottom-3 tw-left-4 tw-z-[5] tw-flex tw-items-center tw-gap-2 tw-rounded-full tw-border tw-border-slate-200 tw-bg-white/95 tw-px-3 tw-py-1.5 tw-shadow-md tw-backdrop-blur-sm"
      aria-live="polite"
    >
      <span className="tw-inline-flex tw-items-end tw-gap-0.5">
        <span
          className="tw-inline-block tw-h-1.5 tw-w-1.5 tw-animate-bounce tw-rounded-full tw-bg-slate-400"
          style={{ animationDelay: '0ms', animationDuration: '1.1s' }}
        />
        <span
          className="tw-inline-block tw-h-1.5 tw-w-1.5 tw-animate-bounce tw-rounded-full tw-bg-slate-400"
          style={{ animationDelay: '150ms', animationDuration: '1.1s' }}
        />
        <span
          className="tw-inline-block tw-h-1.5 tw-w-1.5 tw-animate-bounce tw-rounded-full tw-bg-slate-400"
          style={{ animationDelay: '300ms', animationDuration: '1.1s' }}
        />
      </span>
      <span className="tw-text-[11px] tw-font-medium tw-text-slate-500">{label}…</span>
    </div>
  );
}
