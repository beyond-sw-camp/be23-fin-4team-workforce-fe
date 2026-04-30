import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Button } from 'antd';

export type ContractSignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toPngFile: () => Promise<File>;
};

type Props = {
  width?: number;
  height?: number;
  className?: string;
};

function clientPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(r.width, 1);
  const scaleY = canvas.height / Math.max(r.height, 1);
  return {
    x: (clientX - r.left) * scaleX,
    y: (clientY - r.top) * scaleY,
  };
}

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 255;
    const g = data[i + 1] ?? 255;
    const b = data[i + 2] ?? 255;
    if (r < 250 || g < 250 || b < 250) return false;
  }
  return true;
}

export const ContractSignaturePad = forwardRef<ContractSignaturePadHandle, Props>(function ContractSignaturePad(
  { width = 560, height = 200, className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const setupContext = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupContext(canvas);
  }, [setupContext, width, height]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupContext(canvas);
  }, [setupContext]);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      isEmpty: () => {
        const canvas = canvasRef.current;
        if (!canvas) return true;
        return isCanvasBlank(canvas);
      },
      toPngFile: () =>
        new Promise((resolve, reject) => {
          const canvas = canvasRef.current;
          if (!canvas) {
            reject(new Error('캔버스를 찾을 수 없습니다.'));
            return;
          }
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('서명 이미지를 만들 수 없습니다.'));
                return;
              }
              resolve(new File([blob], 'contract-signature.png', { type: 'image/png' }));
            },
            'image/png',
            0.92,
          );
        }),
    }),
    [clear],
  );

  const startDraw = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawing.current = true;
      last.current = clientPoint(canvas, clientX, clientY);
    },
    [],
  );

  const moveDraw = useCallback(
    (clientX: number, clientY: number) => {
      if (!drawing.current) return;
      const canvas = canvasRef.current;
      const prev = last.current;
      if (!canvas || !prev) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const p = clientPoint(canvas, clientX, clientY);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    },
    [],
  );

  const endDraw = useCallback(() => {
    drawing.current = false;
    last.current = null;
  }, []);

  return (
    <div className={className}>
      <div className="tw-rounded-lg tw-border tw-border-slate-200 tw-bg-white tw-p-2">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="tw-touch-none tw-block tw-w-full tw-cursor-crosshair tw-rounded-md"
          style={{ maxHeight: 220, touchAction: 'none' }}
          onMouseDown={(e) => startDraw(e.clientX, e.clientY)}
          onMouseMove={(e) => {
            if (!drawing.current || e.buttons !== 1) return;
            moveDraw(e.clientX, e.clientY);
          }}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={(e) => {
            e.preventDefault();
            const t = e.touches[0];
            if (t) startDraw(t.clientX, t.clientY);
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            const t = e.touches[0];
            if (t) moveDraw(t.clientX, t.clientY);
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            endDraw();
          }}
        />
      </div>
      <div className="tw-mt-2 tw-flex tw-justify-end">
        <Button size="small" onClick={clear}>
          지우기
        </Button>
      </div>
    </div>
  );
});
