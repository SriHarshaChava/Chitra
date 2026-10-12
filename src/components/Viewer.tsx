import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatFileSize } from '../decode/photoInfo';
import type { CurrentPhoto } from '../photos/usePhotoSession';
import { displayColorSpace } from '../render/displayColor';
import { drawTiledImage } from '../render/drawTiledImage';
import type { TiledImage } from '../render/tiledImage';
import {
  constrainView,
  fitView,
  MAX_SCALE,
  minScale,
  orientedSize,
  panBy,
  zoomAt,
  zoomTo,
  type Size,
  type View,
} from '../render/viewTransform';

interface ViewerProps {
  current: CurrentPhoto | null;
  fileName?: string;
  fileSize?: number;
  onOpenFiles: () => void;
}

/** A tap is a short press that barely moves; two taps close together toggle zoom. */
const TAP_MAX_MOVE_CSS = 8;
const TAP_MAX_MS = 300;
const DOUBLE_TAP_MS = 350;

export function Viewer({ current, fileName, fileSize, onOpenFiles }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const fitModeRef = useRef(true);
  const viewportRef = useRef<Size>({ width: 1, height: 1 });
  const frameRef = useRef(0);
  const [zoomPercent, setZoomPercent] = useState<number | null>(null);

  const image = current?.image;
  const photoId = current?.id;
  const imageRef = useRef<TiledImage | undefined>(image);
  const photoIdRef = useRef<string | undefined>(photoId);

  const draw = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { colorSpace: displayColorSpace() });
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = imageRef.current;
    const view = viewRef.current;
    if (img && view) drawTiledImage(ctx, img, view);
  }, []);

  const scheduleDraw = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  const setView = useCallback(
    (next: View, fit = false) => {
      const img = imageRef.current;
      if (!img) return;
      const size = orientedSize(img, img.rotation);
      viewRef.current = constrainView(next, size, viewportRef.current);
      fitModeRef.current = fit;
      setZoomPercent(Math.round(viewRef.current.scale * 100));
      scheduleDraw();
    },
    [scheduleDraw],
  );

  const fit = useCallback(() => {
    const img = imageRef.current;
    if (img) setView(fitView(orientedSize(img, img.rotation), viewportRef.current), true);
  }, [setView]);

  const zoomLimits = useCallback(() => {
    const img = imageRef.current!;
    return { min: minScale(orientedSize(img, img.rotation), viewportRef.current), max: MAX_SCALE };
  }, []);

  // A new image arrives: keep the zoom if it is the same photo at a different resolution
  // (embedded preview → developed RAW), otherwise fit it to the screen.
  useLayoutEffect(() => {
    const previous = imageRef.current;
    const samePhoto = photoIdRef.current === photoId;
    imageRef.current = image;
    photoIdRef.current = photoId;
    if (!image) {
      viewRef.current = null;
      scheduleDraw();
      return;
    }
    const view = viewRef.current;
    if (samePhoto && previous && view && !fitModeRef.current && previous !== image) {
      const ratio =
        orientedSize(previous, previous.rotation).width / orientedSize(image, image.rotation).width;
      setView({ ...view, scale: view.scale * ratio });
    } else {
      fit();
    }
  }, [image, photoId, fit, setView, scheduleDraw]);

  // Keep the canvas matched to its container size, in device pixels.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(container.clientWidth * dpr));
      const height = Math.max(1, Math.round(container.clientHeight * dpr));
      canvas.width = width;
      canvas.height = height;
      viewportRef.current = { width, height };
      if (!imageRef.current) return scheduleDraw();
      if (fitModeRef.current || !viewRef.current) fit();
      else setView(viewRef.current);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fit, setView, scheduleDraw]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // ---- Gestures: drag to pan, pinch / wheel to zoom, double-tap to toggle 100 % ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    moved: false,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
  });

  const toDevice = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (event.clientX - rect.left) * dpr, y: (event.clientY - rect.top) * dpr };
  };

  const toggleZoom = (x: number, y: number) => {
    const view = viewRef.current;
    if (!view) return;
    if (fitModeRef.current || view.scale < 1) setView(zoomTo(view, 1, x, y));
    else fit();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, toDevice(event));
    if (pointers.current.size === 1) {
      gesture.current = {
        ...gesture.current,
        startX: event.clientX,
        startY: event.clientY,
        startTime: performance.now(),
        moved: false,
      };
    } else {
      gesture.current.moved = true; // a pinch is never a tap
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const previous = pointers.current.get(event.pointerId);
    const view = viewRef.current;
    if (!previous || !view) return;
    const point = toDevice(event);

    if (
      Math.hypot(event.clientX - gesture.current.startX, event.clientY - gesture.current.startY) >
      TAP_MAX_MOVE_CSS
    ) {
      gesture.current.moved = true;
    }

    if (pointers.current.size === 1) {
      pointers.current.set(event.pointerId, point);
      setView(panBy(view, point.x - previous.x, point.y - previous.y));
      return;
    }

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.entries()];
      const other = a![0] === event.pointerId ? b![1] : a![1];
      const before = {
        cx: (previous.x + other.x) / 2,
        cy: (previous.y + other.y) / 2,
        d: Math.hypot(previous.x - other.x, previous.y - other.y),
      };
      const after = {
        cx: (point.x + other.x) / 2,
        cy: (point.y + other.y) / 2,
        d: Math.hypot(point.x - other.x, point.y - other.y),
      };
      pointers.current.set(event.pointerId, point);
      if (before.d < 1) return;
      const zoomed = zoomAt(view, after.d / before.d, before.cx, before.cy, zoomLimits());
      setView(panBy(zoomed, after.cx - before.cx, after.cy - before.cy));
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(event.pointerId);
    if (!wasSingle || event.type === 'pointercancel') return;

    const g = gesture.current;
    const isTap = !g.moved && performance.now() - g.startTime < TAP_MAX_MS;
    if (!isTap) return;
    const now = performance.now();
    const nearLastTap =
      Math.hypot(event.clientX - g.lastTapX, event.clientY - g.lastTapY) < TAP_MAX_MOVE_CSS * 3;
    if (now - g.lastTapTime < DOUBLE_TAP_MS && nearLastTap) {
      g.lastTapTime = 0;
      const p = toDevice(event);
      toggleZoom(p.x, p.y);
    } else {
      g.lastTapTime = now;
      g.lastTapX = event.clientX;
      g.lastTapY = event.clientY;
    }
  };

  // Wheel / trackpad zoom needs a non-passive listener so the page itself doesn't scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      const view = viewRef.current;
      if (!view || !imageRef.current) return;
      event.preventDefault();
      const lineHeight = event.deltaMode === 1 ? 16 : 1;
      const sensitivity = event.ctrlKey ? 0.01 : 0.0015; // ctrlKey = trackpad pinch
      const factor = Math.exp(-event.deltaY * lineHeight * sensitivity);
      const p = toDevice(event);
      setView(zoomAt(view, factor, p.x, p.y, zoomLimits()));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [setView, zoomLimits]);

  const zoomStep = (factor: number) => {
    const view = viewRef.current;
    if (!view) return;
    const { width, height } = viewportRef.current;
    setView(zoomAt(view, factor, width / 2, height / 2, zoomLimits()));
  };

  const actualPixels = () => {
    const view = viewRef.current;
    if (!view) return;
    const { width, height } = viewportRef.current;
    setView(zoomTo(view, 1, width / 2, height / 2));
  };

  return (
    <main className="viewer" aria-label="Photo viewer">
      <div ref={containerRef} className="viewer-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="viewer-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={fileName ? `Photo ${fileName}` : undefined}
          role="img"
        />
      </div>

      {!current && <EmptyState onOpenFiles={onOpenFiles} />}
      {current && !image && current.status !== 'error' && (
        <div className="viewer-overlay-center">
          <div className="spinner" aria-hidden="true" />
          <p className="muted">Opening {fileName}…</p>
        </div>
      )}
      {current?.status === 'error' && (
        <div className="viewer-overlay-center" role="alert">
          <p className="viewer-title">Couldn't open {fileName}</p>
          <p className="muted">{current.error}</p>
        </div>
      )}

      {current && image && (
        <>
          <div className="viewer-status" aria-live="polite">
            {current.isPreview ? (
              <>
                <span className="spinner spinner-small" aria-hidden="true" /> Camera preview ·
                developing RAW…
              </>
            ) : (
              <>
                {fileName}
                {fileSize ? ` · ${formatFileSize(fileSize)}` : ''}
                {current.decodeMs ? ` · opened in ${(current.decodeMs / 1000).toFixed(1)} s` : ''}
              </>
            )}
          </div>
          <div className="viewer-toolbar" role="toolbar" aria-label="Zoom">
            <button type="button" className="tool-button" onClick={fit} aria-label="Fit to screen">
              Fit
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={actualPixels}
              aria-label="Zoom to 100 percent"
            >
              1:1
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={() => zoomStep(1 / 1.5)}
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="zoom-label" aria-label="Zoom level">
              {zoomPercent ?? '–'}%
            </span>
            <button
              type="button"
              className="tool-button"
              onClick={() => zoomStep(1.5)}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function EmptyState({ onOpenFiles }: { onOpenFiles: () => void }) {
  return (
    <div className="viewer-overlay-center">
      <svg className="viewer-mark" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="4" y="9" width="40" height="30" rx="3" />
        <path d="M8 35l10-12 8 9 5-6 9 9" />
        <circle cx="33" cy="17" r="3" />
      </svg>
      <p className="viewer-title">No photo open</p>
      <p className="muted">
        Open Nikon NEF, JPEG, PNG or TIFF files, or drag them here. Photos stay on this device.
      </p>
      <button type="button" className="button button-primary" onClick={onOpenFiles}>
        Open photos…
      </button>
    </div>
  );
}
