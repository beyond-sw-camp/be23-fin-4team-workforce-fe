import { ArrowDownOutlined } from '@ant-design/icons';

type Props = {
  visible: boolean;
  count: number;
  onClick: () => void;
};

/**
 * 위로 스크롤한 상태에서 새 메시지가 도착했을 때 메시지 영역 우하단에 뜨는 알약 버튼.
 *  - count > 0: "↓ N" 형태
 *  - count === 0: 단순히 "↓" 만 표시 (스크롤 다운 트리거)
 *  - 클릭 시 호출 측에서 scrollThreadToBottom(true) 처리.
 */
export function ChatNewMessagesButton({ visible, count, onClick }: Props) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="tw-absolute tw-bottom-3 tw-right-3 tw-z-[5] tw-inline-flex tw-cursor-pointer tw-items-center tw-gap-1.5 tw-rounded-full tw-border tw-border-[#2563EB]/30 tw-bg-white tw-px-3 tw-py-1.5 tw-text-[12px] tw-font-bold tw-text-[#2563EB] tw-shadow-md tw-transition-all hover:tw-bg-[#EFF6FF] active:tw-scale-95"
      aria-label={count > 0 ? `새 메시지 ${count}개 — 맨 아래로 이동` : '맨 아래로 이동'}
    >
      <ArrowDownOutlined className="tw-text-[12px]" />
      {count > 0 ? <span>{count > 99 ? '99+' : count}</span> : null}
    </button>
  );
}
