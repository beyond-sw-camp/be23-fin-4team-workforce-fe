import type { MemberChatMessage } from '@/features/member-chat/model/types';
import type { ChatSenderRow } from '@/features/member-chat/hooks/useChatSenderProfiles';

type Props = {
  /** 답장 대상이 되는 원본 메시지 (없으면 "삭제된/없는 메시지" 자리표시) */
  original: MemberChatMessage | null;
  /** 원본 발신자 표시 정보 */
  originalSender: ChatSenderRow | null;
  /** 인용 박스 클릭 시 원본으로 점프 */
  onClick?: () => void;
  /**
   * 부모 버블의 톤 — isMine 인 경우 인용 박스를 옅은 화이트 톤으로,
   * 상대 메시지엔 슬레이트 톤으로 차이를 둔다.
   */
  isInsideMineBubble?: boolean;
};

/**
 * 메시지 버블 상단의 인용(답장 대상) 박스.
 *  - 좌측 컬러 바 + 발신자 이름 + 본문 한 줄 미리보기
 *  - 클릭 시 원본 위치로 점프 (호출 측에서 querySelector + scrollIntoView 처리)
 */
export function ChatQuotedReply({ original, originalSender, onClick, isInsideMineBubble }: Props) {
  if (!original) {
    return (
      <div
        className={`tw-mb-1.5 tw-rounded-md tw-px-2 tw-py-1 tw-text-[11px] tw-italic ${
          isInsideMineBubble ? 'tw-bg-white/15 tw-text-white/70' : 'tw-bg-slate-100 tw-text-slate-400'
        }`}
      >
        원본 메시지를 찾을 수 없습니다.
      </div>
    );
  }

  const preview =
    original.deleted
      ? '삭제된 메시지'
      : original.type === 'IMAGE'
        ? '🖼 이미지'
        : original.type === 'FILE'
          ? '📎 파일'
          : (original.content ?? '').replace(/\s+/g, ' ').trim();

  const senderName = originalSender?.name || '대화 상대';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`tw-mb-1.5 tw-flex tw-w-full tw-cursor-pointer tw-items-stretch tw-gap-2 tw-overflow-hidden tw-rounded-md tw-border-0 tw-px-2 tw-py-1 tw-text-left tw-transition-colors ${
        isInsideMineBubble
          ? 'tw-bg-white/25 hover:tw-bg-white/35'
          : 'tw-bg-slate-100 hover:tw-bg-slate-200/70'
      }`}
      aria-label={`${senderName}의 메시지로 이동`}
    >
      <span
        className={`tw-w-1 tw-shrink-0 tw-rounded-full ${
          isInsideMineBubble ? 'tw-bg-white' : 'tw-bg-[#2563EB]/70'
        }`}
        aria-hidden
      />
      <span className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col tw-gap-0.5 tw-py-0.5">
        <span
          className={`tw-truncate tw-text-[11px] tw-font-bold ${
            isInsideMineBubble ? 'tw-text-white' : 'tw-text-[#2563EB]'
          }`}
        >
          {senderName}
        </span>
        <span
          className={`tw-truncate tw-text-[11px] tw-leading-snug ${
            isInsideMineBubble ? 'tw-text-white/90' : 'tw-text-slate-500'
          }`}
        >
          {preview || '(내용 없음)'}
        </span>
      </span>
    </button>
  );
}
