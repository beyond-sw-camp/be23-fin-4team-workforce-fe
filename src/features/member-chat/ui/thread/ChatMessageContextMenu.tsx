import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CopyOutlined, DeleteOutlined, EditOutlined, EnterOutlined } from '@ant-design/icons';
import { MEMBER_CHAT_OVERLAY_Z } from '@/features/member-chat/ui/shared/chatIdentity';

export type ChatMessageMenuItem =
  | { kind: 'reply'; onSelect: () => void }
  | { kind: 'edit'; onSelect: () => void }
  | { kind: 'delete'; onSelect: () => void }
  | { kind: 'copy'; onSelect: () => void };

type Props = {
  /** 클릭 좌표 (clientX/clientY). 메뉴는 이 점에서 펼쳐진다. */
  anchor: { x: number; y: number } | null;
  items: ChatMessageMenuItem[];
  onClose: () => void;
};

const MENU_W = 168;
const MENU_VPAD = 8;

const COPY: Record<ChatMessageMenuItem['kind'], { label: string; tone: 'default' | 'danger' }> = {
  reply: { label: '답장', tone: 'default' },
  edit: { label: '수정', tone: 'default' },
  delete: { label: '삭제', tone: 'danger' },
  copy: { label: '복사', tone: 'default' },
};

function iconFor(kind: ChatMessageMenuItem['kind']) {
  switch (kind) {
    case 'reply':
      return <EnterOutlined className="tw-text-[13px]" />;
    case 'edit':
      return <EditOutlined className="tw-text-[13px]" />;
    case 'delete':
      return <DeleteOutlined className="tw-text-[13px]" />;
    case 'copy':
      return <CopyOutlined className="tw-text-[13px]" />;
  }
}

/**
 * 메시지 컨텍스트 메뉴.
 *  - createPortal 로 body 에 렌더 — 플로팅 모달의 내부 overflow 와 무관하게 표시.
 *  - 외부 클릭, ESC, 스크롤 시 자동 닫기.
 *  - 화면 가장자리 보정.
 */
export function ChatMessageContextMenu({ anchor, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const open = anchor != null && items.length > 0;

  // 위치 계산 — 가장자리 넘어가지 않도록 보정
  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') {
      setPos(null);
      return;
    }
    const a = anchor!;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const estH = items.length * 36 + MENU_VPAD * 2;
    const left = Math.min(Math.max(8, a.x), vw - MENU_W - 8);
    const top = Math.min(Math.max(8, a.y), vh - estH - 8);
    setPos({ left, top });
  }, [open, anchor, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, onClose]);

  const visibleItems = useMemo(() => items, [items]);

  if (!open || !pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="메시지 동작"
      className="tw-fixed tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-200 tw-bg-white tw-shadow-lg tw-animate-mc-bubble-in"
      style={{
        left: pos.left,
        top: pos.top,
        width: MENU_W,
        zIndex: MEMBER_CHAT_OVERLAY_Z + 70,
      }}
    >
      <ul className="tw-m-0 tw-list-none tw-p-0 tw-py-1">
        {visibleItems.map((it) => {
          const meta = COPY[it.kind];
          const isDanger = meta.tone === 'danger';
          return (
            <li key={it.kind} className="tw-m-0">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  it.onSelect();
                  onClose();
                }}
                className={`tw-flex tw-w-full tw-cursor-pointer tw-appearance-none tw-items-center tw-gap-2 tw-border-0 tw-bg-transparent tw-px-3 tw-py-2 tw-text-left tw-text-sm tw-transition-colors focus:tw-outline-none ${
                  isDanger
                    ? 'tw-text-rose-600 hover:tw-bg-rose-50'
                    : 'tw-text-slate-800 hover:tw-bg-slate-50'
                }`}
              >
                <span className={isDanger ? 'tw-text-rose-500' : 'tw-text-slate-400'}>
                  {iconFor(it.kind)}
                </span>
                <span className="tw-flex-1">{meta.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}
