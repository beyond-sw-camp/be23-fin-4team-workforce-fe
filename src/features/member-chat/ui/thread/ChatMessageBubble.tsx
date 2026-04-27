import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { MoreOutlined } from '@ant-design/icons';

type Props = {
  isMine: boolean;
  /** 호버 시 점 3개 노출 여부. 메뉴 항목이 없으면 false 로 두어 호출 측에서 제어. */
  showHoverHandle: boolean;
  /** 우클릭/점 3개/롱프레스 시 메뉴를 열기 위한 좌표 통지 */
  onOpenMenu: (anchor: { x: number; y: number }) => void;
  children: ReactNode;
};

const LONG_PRESS_MS = 600;

/**
 * 메시지 버블 본체.
 *  - 내/상대 톤 분기 (내 메시지는 네이비 톤 반투명, 상대는 흰 배경)
 *  - 우클릭, 호버 시 점 3개 버튼, 모바일 롱프레스 트리거를 한 곳에 통합
 *  - 텍스트 선택은 그대로 유지 (`select-text`)
 */
export function ChatMessageBubble({ isMine, showHoverHandle, onOpenMenu, children }: Props) {
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => {
    return () => {
      if (longPressTimer.current != null) window.clearTimeout(longPressTimer.current);
    };
  }, []);

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onOpenMenu({ x: e.clientX, y: e.clientY });
  };

  const openMenuAtBubble = () => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onOpenMenu({ x: isMine ? r.right - 8 : r.left + 8, y: r.bottom + 4 });
  };

  const handleHandleClick = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onOpenMenu({ x: e.clientX, y: e.clientY });
  };

  const onTouchStart = () => {
    longPressFired.current = false;
    if (longPressTimer.current != null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      openMenuAtBubble();
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      ref={containerRef}
      className="tw-relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onContextMenu={handleContextMenu}
        onTouchStart={onTouchStart}
        onTouchMove={cancelLongPress}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        className={`tw-relative tw-isolate tw-z-[1] tw-max-w-full tw-animate-mc-bubble-in tw-overflow-visible tw-rounded-2xl tw-px-3.5 tw-py-2.5 tw-shadow-sm ${
          isMine
            ? 'tw-rounded-tr-none tw-border tw-border-blue-500/20 tw-bg-blue-600/90 tw-text-white [&_.ant-typography]:!tw-text-white [&_.ant-typography-secondary]:!tw-text-blue-100 [&_a]:!tw-text-white [&_a]:!tw-underline [&_a]:!tw-underline-offset-2'
            : 'tw-rounded-tl-none tw-border tw-border-slate-100 tw-bg-white tw-text-slate-800'
        }`}
      >
        {children}
      </div>

      {showHoverHandle && hovered ? (
        <button
          type="button"
          onClick={handleHandleClick}
          className={`tw-absolute -tw-top-2 ${
            isMine ? '-tw-left-2' : '-tw-right-2'
          } tw-z-[2] tw-inline-flex tw-h-6 tw-w-6 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-full tw-border tw-border-slate-200 tw-bg-white tw-text-slate-500 tw-shadow-sm tw-transition-colors hover:tw-bg-slate-50 hover:tw-text-slate-800 focus:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-[#2563EB]/30`}
          aria-label="메시지 메뉴 열기"
        >
          <MoreOutlined className="tw-text-[14px]" />
        </button>
      ) : null}
    </div>
  );
}
