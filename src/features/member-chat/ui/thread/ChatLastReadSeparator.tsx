/**
 * "여기까지 읽음" 가로선 — 방 진입 시점의 myLastReadMessageId 직후에 1회 표시.
 * 사용자가 자리를 비웠다 돌아왔을 때 어디부터 새 메시지인지 즉시 인식할 수 있게 한다.
 */
export function ChatLastReadSeparator() {
  return (
    <div className="tw-my-3 tw-flex tw-w-full tw-items-center tw-gap-3" aria-hidden>
      <div className="tw-h-px tw-flex-1 tw-bg-rose-200/70" />
      <span className="tw-rounded-full tw-border tw-border-rose-200 tw-bg-rose-50 tw-px-3 tw-py-0.5 tw-text-[10px] tw-font-bold tw-text-rose-500 tw-shadow-sm">
        새 메시지
      </span>
      <div className="tw-h-px tw-flex-1 tw-bg-rose-200/70" />
    </div>
  );
}
