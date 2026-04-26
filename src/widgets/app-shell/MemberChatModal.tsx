import { CloseOutlined, ExpandOutlined, ShrinkOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tooltip } from 'antd';
import { MemberChatPanel } from '@/features/member-chat/ui/MemberChatPanel';

type MemberChatModalProps = {
  open: boolean;
  onClose: () => void;
  /** 열릴 때 해당 멤버와 1:1 방을 만들거나 불러와 대화로 진입 */
  initialDirectMemberId?: string | null;
  /** 1:1 진입 시도 완료 후(성공·실패) 부모가 intent 초기화 */
  onDirectIntentConsumed?: () => void;
};

const STORAGE_KEY = 'wf-member-chat-pip';
const STORAGE_KEY_MAX = 'wf-member-chat-pip-max';
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

function loadBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function saveBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
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

/** 최대화 시 사용할 viewport-safe rect */
function maximizedRect(): Rect {
  if (typeof window === 'undefined') {
    return { x: 16, y: 16, w: DEFAULT_W, h: DEFAULT_H };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return { x: 16, y: 16, w: vw - 32, h: vh - 32 };
}

/**
 * 멤버 채팅 — antd Modal 없이 PIP처럼 드래그·리사이즈 가능한 플로팅 패널.
 *  - 헤더: 흰 바탕 + 파란 점 인디케이터 + MESSENGER 라벨 + 최대화/닫기 버튼
 *  - 최대화: viewport 가장자리에 16px 만 남기고 확장 (다시 누르면 이전 크기 복원)
 *  - 닫기: 모달 자체를 종료 (onClose 위임)
 *
 * 최소화 기능은 챗봇 FAB 와의 우하단 충돌 + 진정한 상태 보존 어려움으로 제거됨.
 * 메신저 재진입은 AppShell 의 MemberChatOpener 입구를 사용한다.
 */
export function MemberChatModal({
  open,
  onClose,
  initialDirectMemberId = null,
  onDirectIntentConsumed,
}: MemberChatModalProps) {
  const [rect, setRect] = useState<Rect>(() => loadRect() ?? defaultRect());
  const [isMaximized, setIsMaximized] = useState<boolean>(() => loadBool(STORAGE_KEY_MAX));
  /** 최대화 진입 시 직전 rect 를 보관해 복원에 사용 */
  const preMaxRectRef = useRef<Rect | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ ox: number; oy: number; ow: number; oh: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    if (isMaximized) {
      setRect(maximizedRect());
    } else {
      setRect((r) => clampRectToViewport(r));
    }
  }, [open, isMaximized]);

  useEffect(() => {
    const onResize = () => {
      if (isMaximized) {
        setRect(maximizedRect());
      } else {
        setRect((r) => clampRectToViewport(r));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMaximized]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const persistRect = useCallback((r: Rect) => {
    saveRect(r);
  }, []);

  const handleToggleMaximize = useCallback(() => {
    setIsMaximized((prev) => {
      const next = !prev;
      saveBool(STORAGE_KEY_MAX, next);
      if (next) {
        // 진입: 현재 rect 보관, 최대 rect 적용
        preMaxRectRef.current = rect;
        setRect(maximizedRect());
      } else {
        // 복원: 보관된 rect 또는 default 로
        const saved = preMaxRectRef.current ?? loadRect() ?? defaultRect();
        setRect(clampRectToViewport(saved));
      }
      return next;
    });
  }, [rect]);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (isMaximized) return; // 최대화 상태에서는 드래그 비활성
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y };
    },
    [rect.x, rect.y, isMaximized],
  );

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
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
  }, []);

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
          persistRect(next);
          return next;
        });
      }
    },
    [persistRect],
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isMaximized) return; // 최대화 상태에서는 리사이즈 비활성
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      resizeRef.current = { ox: e.clientX, oy: e.clientY, ow: rect.w, oh: rect.h };
    },
    [rect.w, rect.h, isMaximized],
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
        persistRect(next);
        return next;
      });
    },
    [persistRect],
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="tw-pointer-events-none tw-fixed tw-inset-0 tw-z-[1060] tw-flex tw-items-start tw-justify-start"
      aria-hidden={false}
    >
      <div
        className="tw-pointer-events-auto tw-absolute tw-flex tw-flex-col tw-overflow-hidden tw-rounded-2xl tw-border tw-border-slate-200 tw-bg-white tw-shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        role="dialog"
        aria-modal="true"
        aria-label="멤버 채팅"
      >
        <div
          className={`tw-relative tw-z-[1] tw-flex tw-h-12 tw-shrink-0 tw-items-center tw-justify-between tw-gap-2 tw-border-b tw-border-slate-100 tw-bg-white tw-px-4 tw-select-none ${
            isMaximized ? '' : 'tw-cursor-move'
          }`}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <div className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-relative tw-inline-flex tw-h-2.5 tw-w-2.5" aria-hidden>
              <span className="tw-absolute tw-inset-0 tw-rounded-full tw-bg-[#2563EB]/45 motion-safe:tw-animate-ping" />
              <span className="tw-relative tw-inline-flex tw-h-2.5 tw-w-2.5 tw-rounded-full tw-bg-[#2563EB] motion-safe:tw-animate-pulse" />
            </span>
            <span className="tw-text-sm tw-font-extrabold tw-tracking-tight tw-text-slate-800">MESSENGER</span>
          </div>
          <div className="tw-flex tw-items-center tw-gap-1">
            <Tooltip title={isMaximized ? '복원' : '최대화'} placement="bottom">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleToggleMaximize(); }}
                className="tw-inline-flex tw-h-7 tw-w-7 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-md tw-border-0 tw-bg-transparent tw-text-slate-400 tw-transition-colors hover:tw-bg-slate-100 hover:tw-text-slate-700"
                aria-label={isMaximized ? '복원' : '최대화'}
              >
                {isMaximized ? <ShrinkOutlined className="tw-text-[14px]" /> : <ExpandOutlined className="tw-text-[14px]" />}
              </button>
            </Tooltip>
            <Tooltip title="닫기" placement="bottom">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="tw-inline-flex tw-h-7 tw-w-7 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-md tw-border-0 tw-bg-transparent tw-text-slate-400 tw-transition-colors hover:tw-bg-rose-50 hover:tw-text-rose-500"
                aria-label="닫기"
              >
                <CloseOutlined className="tw-text-[14px]" />
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="tw-flex tw-min-h-0 tw-flex-1 tw-flex-col tw-overflow-hidden">
          <MemberChatPanel
            variant="floating"
            initialDirectMemberId={initialDirectMemberId}
            onInitialDirectConsumed={onDirectIntentConsumed}
          />
        </div>
        {!isMaximized ? (
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
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
