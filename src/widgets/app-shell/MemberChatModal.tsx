import { CloseOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Tooltip } from 'antd';
import { MemberChatPanel } from '@/features/member-chat/ui/MemberChatPanel';

type MemberChatModalProps = {
  open: boolean;
  onClose: () => void;
};

const STORAGE_KEY = 'wf-member-chat-pip';
const MIN_W = 360;
const MIN_H = 280;
const DEFAULT_W = 920;
const DEFAULT_H = 580;
type Rect = { x: number; y: number; w: number; h: number };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function loadRect(): Rect | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Rect>;
    if (
      typeof p.x !== 'number' ||
      typeof p.y !== 'number' ||
      typeof p.w !== 'number' ||
      typeof p.h !== 'number'
    ) {
      return null;
    }
    return { x: p.x, y: p.y, w: p.w, h: p.h };
  } catch {
    return null;
  }
}

function saveRect(r: Rect) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

function defaultRect(): Rect {
  if (typeof window === 'undefined') {
    return { x: 48, y: 80, w: DEFAULT_W, h: DEFAULT_H };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = clamp(Math.min(DEFAULT_W, vw - 48), MIN_W, vw - 16);
  const h = clamp(Math.min(DEFAULT_H, vh - 64), MIN_H, vh - 16);
  const x = Math.max(16, vw - w - 24);
  const y = Math.max(16, vh - h - 24);
  return { x, y, w, h };
}

function clampRectToViewport(r: Rect): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = clamp(r.w, MIN_W, vw - 16);
  const h = clamp(r.h, MIN_H, vh - 16);
  const x = clamp(r.x, 8, vw - w - 8);
  const y = clamp(r.y, 8, vh - h - 8);
  return { x, y, w, h };
}

/**
 * 멤버 채팅 — antd Modal 없이 PIP처럼 드래그·리사이즈 가능한 플로팅 패널.
 * 본문은 채팅 영역 + 상단 제목줄(드래그) + 닫기만 포함.
 */
export function MemberChatModal({ open, onClose }: MemberChatModalProps) {
  const [rect, setRect] = useState<Rect>(() => loadRect() ?? defaultRect());
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ ox: number; oy: number; ow: number; oh: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setRect((r) => clampRectToViewport(r));
  }, [open]);

  useEffect(() => {
    const onResize = () => setRect((r) => clampRectToViewport(r));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const persist = useCallback((r: Rect) => {
    saveRect(r);
  }, []);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y };
    },
    [rect.x, rect.y],
  );

  const onHeaderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const nx = e.clientX - dragRef.current.dx;
      const ny = e.clientY - dragRef.current.dy;
      setRect((prev) =>
        clampRectToViewport({
          ...prev,
          x: nx,
          y: ny,
        }),
      );
    },
    [],
  );

  const onHeaderPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) {
        dragRef.current = null;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        setRect((r) => {
          const next = clampRectToViewport(r);
          persist(next);
          return next;
        });
      }
    },
    [persist],
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      resizeRef.current = { ox: e.clientX, oy: e.clientY, ow: rect.w, oh: rect.h };
    },
    [rect.w, rect.h],
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current) return;
    const { ox, oy, ow, oh } = resizeRef.current;
    const dw = e.clientX - ox;
    const dh = e.clientY - oy;
    setRect((prev) =>
      clampRectToViewport({
        ...prev,
        w: ow + dw,
        h: oh + dh,
      }),
    );
  }, []);

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setRect((r) => {
        const next = clampRectToViewport(r);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="tw-pointer-events-none tw-fixed tw-inset-0 tw-z-[1060] tw-flex tw-items-start tw-justify-start"
      aria-hidden={false}
    >
      <div
        className="tw-pointer-events-auto tw-absolute tw-flex tw-flex-col tw-overflow-hidden tw-rounded-xl tw-bg-white tw-shadow-2xl"
        style={{
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="멤버 채팅"
      >
        <div
          className="tw-relative tw-z-[1] tw-flex tw-cursor-move tw-select-none tw-items-center tw-justify-between tw-gap-2.5 tw-bg-gradient-to-br tw-from-[#4A7FF7] tw-to-[#7BB3FF] tw-px-3.5 tw-py-3 tw-shadow-[0_4px_14px_rgba(74,127,247,0.38)]"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <span className="tw-text-sm tw-font-semibold tw-tracking-[0.01em] tw-text-white">메신저</span>
          <Button
            type="text"
            size="small"
            className="tw-shrink-0 !tw-rounded-lg !tw-text-white/90 hover:!tw-bg-white/20 hover:!tw-text-white"
            icon={<CloseOutlined />}
            aria-label="닫기"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
        </div>
        <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden">
          <MemberChatPanel variant="floating" />
        </div>
        {/* SE 리사이즈 핸들 — 넓은 히트 영역 + 툴팁 */}
        <Tooltip title="창 크기 조절" placement="left">
          <div
            aria-label="창 크기 조절. 오른쪽 아래로 드래그하세요."
            className="tw-absolute tw-bottom-0 tw-right-0 tw-z-10 tw-flex tw-h-7 tw-w-7 tw-cursor-se-resize tw-touch-none tw-items-end tw-justify-end tw-p-0.5"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
          >
            <span
              className="tw-pointer-events-none tw-block tw-h-5 tw-w-5 tw-shrink-0"
              style={{ background: 'linear-gradient(135deg, transparent 52%, rgb(148 163 184 / 0.55) 52%)' }}
              aria-hidden
            />
          </div>
        </Tooltip>
      </div>
    </div>,
    document.body,
  );
}
