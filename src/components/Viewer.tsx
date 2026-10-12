import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from 'react';
import type { Matrix3 } from '../color/colorSpaces';
import { formatFileSize } from '../decode/photoInfo';
import {
  aspectRatio,
  frameSize,
  imageToCropMatrix,
  imageToFrameMatrix,
  toPixels,
  type Geometry,
} from '../develop/geometry';
import { DevelopRenderer, type GpuImage, type RenderSettings } from '../gpu/renderer';
import type { CurrentPhoto } from '../photos/usePhotoLoader';
import { displayColorSpace } from '../render/displayColor';
import type { Histogram } from '../render/histogram';
import type { SourceImage } from '../render/sourceImage';
import type { Rect } from '../render/tiles';
import {
  constrainView,
  FIT_PADDING,
  fitView,
  MAX_SCALE,
  minScale,
  panBy,
  zoomAt,
  zoomTo,
  type Size,
  type View,
} from '../render/viewTransform';
import { runExport, type ExportJob, type ExportResult } from '../export/runExport';
import { renderThumbnail } from '../export/thumbnails';
import { CropOverlay } from './CropOverlay';

/** Lets the export dialog render the photo with the viewer's GPU renderer. */
export interface Exporter {
  exportPhoto(
    job: Pick<ExportJob, 'geometry' | 'develop' | 'settings' | 'onProgress'>,
  ): Promise<ExportResult>;
  /** A small sRGB JPEG of the photo as edited, for the library grid. */
  makeThumbnail(geometry: Geometry, develop: RenderSettings): Promise<Blob>;
}

interface ViewerProps {
  current: CurrentPhoto | null;
  fileName?: string;
  fileSize?: number;
  /** Develop settings to apply; `null` shows the image unedited. */
  settings: RenderSettings;
  /** Shown as a badge while comparing with the original. */
  showingBefore?: boolean;
  /** Crop, straighten, rotate and flip. */
  geometry: Geometry;
  /** True while the crop tool is open: the whole photo is shown with a crop frame. */
  cropMode: boolean;
  onGeometryPreview: (geometry: Geometry) => void;
  onGeometryCommit: (geometry: Geometry) => void;
  onToggleCrop: () => void;
  /** Whether the crop tool can be used right now. */
  canCrop: boolean;
  exporterRef?: Ref<Exporter>;
  onOpenFiles: () => void;
  onHistogram: (histogram: Histogram | undefined) => void;
  /** The GPU was reset (e.g. iPad backgrounding); the photo must be decoded again. */
  onGpuReset: () => void;
}

/** Wait this long after the last change before recomputing the histogram. */
const HISTOGRAM_DELAY_MS = 120;
/** Extra room around the photo in crop mode, so the corner handles are easy to grab. */
const CROP_PADDING_CSS = 40;

/** How the photo maps to the screen for the current geometry and mode. */
interface Layout {
  /** Image pixel → display pixel. */
  imageToDisplay: Matrix3;
  /** Size of what is shown (the crop, or the whole frame in crop mode). */
  display: Size;
  /** Visible part of the display (the crop), or everything in crop mode. */
  visible: Rect | null;
  /** Image pixel → cropped photo pixel (for the histogram). */
  imageToCrop: Matrix3;
  crop: Size;
  frame: Size;
}

function computeLayout(image: SourceImage, g: Geometry, cropMode: boolean): Layout {
  const frame = frameSize(frameSize(image, image.rotation), g.rotate);
  const cropRect = toPixels(g.crop, frame);
  const crop = { width: cropRect.width, height: cropRect.height };
  const imageToCrop = imageToCropMatrix(image, g);
  if (cropMode) {
    return {
      imageToDisplay: imageToFrameMatrix(image, g),
      display: frame,
      visible: null,
      imageToCrop,
      crop,
      frame,
    };
  }
  return {
    imageToDisplay: imageToCrop,
    display: crop,
    visible: { x: 0, y: 0, ...crop },
    imageToCrop,
    crop,
    frame,
  };
}

/** A tap is a short press that barely moves; two taps close together toggle zoom. */
const TAP_MAX_MOVE_CSS = 8;
const TAP_MAX_MS = 300;
const DOUBLE_TAP_MS = 350;

export function Viewer({
  current,
  fileName,
  fileSize,
  settings,
  showingBefore,
  geometry,
  cropMode,
  onGeometryPreview,
  onGeometryCommit,
  onToggleCrop,
  canCrop,
  exporterRef,
  onOpenFiles,
  onHistogram,
  onGpuReset,
}: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View | null>(null);
  const fitModeRef = useRef(true);
  const viewportRef = useRef<Size>({ width: 1, height: 1 });
  const frameRef = useRef(0);
  const [zoomPercent, setZoomPercent] = useState<number | null>(null);
  /** The view, as state, for the crop overlay (which must re-render as it changes). */
  const [cropView, setCropView] = useState<{ view: View; frame: Size } | null>(null);

  const [gpuError, setGpuError] = useState<string | null>(null);

  const image = current?.image;
  const photoId = current?.id;
  const layoutRef = useRef<Layout | null>(null);
  const cropModeRef = useRef(cropMode);
  /** What was shown last time, to decide whether to keep the zoom. */
  const shownRef = useRef<{
    photoId?: string;
    image: SourceImage;
    cropMode: boolean;
    display: Size;
  } | null>(null);
  const rendererRef = useRef<DevelopRenderer | null>(null);
  const gpuRef = useRef<{ source: SourceImage; gpu: GpuImage } | null>(null);
  const settingsRef = useRef<RenderSettings>(settings);
  const histogramTimer = useRef(0);
  const callbacks = useRef({ onHistogram, onGpuReset });
  useEffect(() => {
    callbacks.current = { onHistogram, onGpuReset };
  });

  useImperativeHandle<Exporter, Exporter>(
    exporterRef,
    () => ({
      async exportPhoto(job) {
        const renderer = rendererRef.current;
        const shown = gpuRef.current;
        if (!renderer || !shown) throw new Error('No photo is loaded.');
        return runExport({ ...job, renderer, gpu: shown.gpu, layout: shown.source });
      },
      async makeThumbnail(geometry: Geometry, develop: RenderSettings) {
        const renderer = rendererRef.current;
        const shown = gpuRef.current;
        if (!renderer || !shown) throw new Error('No photo is loaded.');
        return renderThumbnail(renderer, shown.gpu, shown.source, geometry, develop);
      },
    }),
    [],
  );

  // The renderer is created as soon as the canvas exists.
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (!canvas || rendererRef.current) return;
    try {
      rendererRef.current = new DevelopRenderer(canvas, displayColorSpace());
    } catch (error) {
      setGpuError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const getRenderer = useCallback((): DevelopRenderer | null => {
    if (!rendererRef.current && canvasRef.current) {
      // After a GPU reset the renderer is rebuilt on the same canvas.
      try {
        rendererRef.current = new DevelopRenderer(canvasRef.current, displayColorSpace());
      } catch {
        return null;
      }
    }
    return rendererRef.current;
  }, []);

  const draw = useCallback(() => {
    frameRef.current = 0;
    const renderer = getRenderer();
    if (!renderer || renderer.gl.isContextLost()) return;
    const layout = layoutRef.current;
    const view = viewRef.current;
    renderer.draw(
      gpuRef.current?.gpu ?? null,
      layout && view
        ? { imageToDisplay: layout.imageToDisplay, view, visible: layout.visible }
        : null,
      settingsRef.current,
    );
  }, [getRenderer]);

  const scheduleDraw = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  const scheduleHistogram = useCallback(() => {
    window.clearTimeout(histogramTimer.current);
    histogramTimer.current = window.setTimeout(() => {
      const renderer = rendererRef.current;
      const gpu = gpuRef.current?.gpu;
      const layout = layoutRef.current;
      if (!renderer || !gpu || !layout || renderer.gl.isContextLost()) return;
      callbacks.current.onHistogram(
        renderer.histogram(gpu, layout.imageToCrop, layout.crop, settingsRef.current),
      );
    }, HISTOGRAM_DELAY_MS);
  }, []);

  // New develop settings: redraw now, update the histogram shortly after.
  useLayoutEffect(() => {
    settingsRef.current = settings;
    scheduleDraw();
    scheduleHistogram();
  }, [settings, scheduleDraw, scheduleHistogram]);

  const setView = useCallback(
    (next: View, fit = false) => {
      const layout = layoutRef.current;
      if (!layout) return;
      // In crop mode the straightened photo may extend past the frame, so don't clamp.
      viewRef.current = cropModeRef.current
        ? next
        : constrainView(next, layout.display, viewportRef.current);
      fitModeRef.current = fit;
      setZoomPercent(Math.round(viewRef.current.scale * 100));
      setCropView(cropModeRef.current ? { view: viewRef.current, frame: layout.frame } : null);
      scheduleDraw();
    },
    [scheduleDraw],
  );

  const fit = useCallback(() => {
    const layout = layoutRef.current;
    if (!layout) return;
    const padding = cropModeRef.current
      ? CROP_PADDING_CSS * (window.devicePixelRatio || 1)
      : FIT_PADDING;
    setView(fitView(layout.display, viewportRef.current, padding), true);
  }, [setView]);

  const zoomLimits = useCallback(() => {
    const layout = layoutRef.current!;
    return { min: minScale(layout.display, viewportRef.current), max: MAX_SCALE };
  }, []);

  // A new image, crop or mode: keep the zoom when it is the same photo at a different
  // resolution (camera preview → developed RAW); otherwise fit it to the screen.
  useLayoutEffect(() => {
    cropModeRef.current = cropMode;

    // Move the new pixels to the GPU (once per image), then free the CPU copy.
    const renderer = getRenderer();
    if (renderer && gpuRef.current?.source !== image) {
      if (gpuRef.current) renderer.disposeImage(gpuRef.current.gpu);
      gpuRef.current = null;
      if (image) {
        try {
          gpuRef.current = { source: image, gpu: renderer.upload(image) };
        } catch (error) {
          // Rare (e.g. out of GPU memory) but must be visible, so set state here.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setGpuError(error instanceof Error ? error.message : String(error));
        }
        image.release();
      }
    }

    if (!image) {
      viewRef.current = null;
      layoutRef.current = null;
      shownRef.current = null;
      callbacks.current.onHistogram(undefined);
      scheduleDraw();
      return;
    }

    const layout = computeLayout(image, geometry, cropMode);
    layoutRef.current = layout;
    scheduleHistogram();

    const shown = shownRef.current;
    const view = viewRef.current;
    shownRef.current = { photoId, image, cropMode, display: layout.display };
    const keepZoom =
      shown &&
      view &&
      !fitModeRef.current &&
      shown.photoId === photoId &&
      shown.cropMode === cropMode;
    if (keepZoom && shown.image !== image) {
      setView({ ...view, scale: (view.scale * shown.display.width) / layout.display.width });
    } else if (
      keepZoom &&
      shown.display.width === layout.display.width &&
      shown.display.height === layout.display.height
    ) {
      setView(view);
    } else {
      fit();
    }
  }, [
    image,
    photoId,
    geometry,
    cropMode,
    fit,
    setView,
    scheduleDraw,
    scheduleHistogram,
    getRenderer,
  ]);

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
      if (!layoutRef.current) return scheduleDraw();
      if (fitModeRef.current || !viewRef.current) fit();
      else setView(viewRef.current);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fit, setView, scheduleDraw]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      window.clearTimeout(histogramTimer.current);
    },
    [],
  );

  // The GPU can be reset by the system (for example when an iPad app goes to the
  // background). Textures are lost then, so start again with a fresh renderer.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onLost = (event: Event) => {
      event.preventDefault(); // allows the context to be restored
      gpuRef.current = null;
    };
    const onRestored = () => {
      rendererRef.current = null;
      callbacks.current.onGpuReset();
      scheduleDraw();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [scheduleDraw]);

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
    if (!layoutRef.current || cropModeRef.current) return;
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
      if (!view || !layoutRef.current || cropModeRef.current) return;
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
          ref={attachCanvas}
          className="viewer-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={fileName ? `Photo ${fileName}` : undefined}
          role="img"
        />
      </div>

      {cropMode && cropView && (
        <CropOverlay
          frame={cropView.frame}
          view={cropView.view}
          geometry={geometry}
          ratio={aspectRatio(
            geometry.aspect,
            toPixels(geometry.crop, cropView.frame),
            cropView.frame,
          )}
          onPreview={onGeometryPreview}
          onCommit={onGeometryCommit}
        />
      )}

      {!current && <EmptyState onOpenFiles={onOpenFiles} />}
      {current && !image && current.status !== 'error' && (
        <div className="viewer-overlay-center">
          <div className="spinner" aria-hidden="true" />
          <p className="muted">Opening {fileName}…</p>
        </div>
      )}
      {gpuError && (
        <div className="viewer-overlay-center" role="alert">
          <p className="viewer-title">Graphics problem</p>
          <p className="muted">{gpuError}</p>
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
            {showingBefore ? (
              <>Before (original settings)</>
            ) : current.isPreview ? (
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
          <div className="viewer-toolbar" role="toolbar" aria-label="View tools">
            <button
              type="button"
              className={`tool-button${cropMode ? ' tool-button-active' : ''}`}
              onClick={onToggleCrop}
              disabled={!canCrop}
              aria-pressed={cropMode}
              title="Crop and straighten (R)"
            >
              {cropMode ? 'Done' : 'Crop'}
            </button>
            {!cropMode && (
              <>
                <button
                  type="button"
                  className="tool-button"
                  onClick={fit}
                  aria-label="Fit to screen"
                >
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
              </>
            )}
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
