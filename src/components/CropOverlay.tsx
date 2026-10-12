/**
 * The crop frame drawn over the photo in crop mode: drag a corner or edge to resize,
 * drag inside to move. The crop can never leave the (straightened) photo.
 */
import { useRef } from 'react';
import {
  constrainCrop,
  dragCrop,
  toNormalized,
  toPixels,
  type Geometry,
  type Handle,
  type PixelRect,
  type Size,
} from '../develop/geometry';
import type { View } from '../render/viewTransform';

interface CropOverlayProps {
  frame: Size;
  view: View;
  geometry: Geometry;
  /** Locked width/height ratio, or null for free cropping. */
  ratio: number | null;
  onPreview: (geometry: Geometry) => void;
  onCommit: (geometry: Geometry) => void;
}

const HANDLES: Exclude<Handle, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function CropOverlay({
  frame,
  view,
  geometry,
  ratio,
  onPreview,
  onCommit,
}: CropOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    handle: Handle;
    start: PixelRect;
    startPoint: { x: number; y: number };
    valid: PixelRect;
    latest: Geometry;
  } | null>(null);

  const dpr = window.devicePixelRatio || 1;
  const rect = toPixels(geometry.crop, frame);
  // Frame pixels → CSS pixels inside the viewer.
  const css = {
    left: (view.x + rect.x * view.scale) / dpr,
    top: (view.y + rect.y * view.scale) / dpr,
    width: (rect.width * view.scale) / dpr,
    height: (rect.height * view.scale) / dpr,
  };

  const toFrame = (event: React.PointerEvent) => {
    const box = overlayRef.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) * dpr - view.x) / view.scale,
      y: ((event.clientY - box.top) * dpr - view.y) / view.scale,
    };
  };

  const begin = (event: React.PointerEvent<HTMLElement>) => {
    const handle = (event.currentTarget.dataset.handle ?? 'move') as Handle;
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = {
      handle,
      start: rect,
      startPoint: toFrame(event),
      valid: rect,
      latest: geometry,
    };
  };

  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const point = toFrame(event);
    const delta = { x: point.x - d.startPoint.x, y: point.y - d.startPoint.y };
    const proposed = dragCrop(d.start, d.handle, point, delta, ratio);
    d.valid = constrainCrop(d.valid, proposed, frame, geometry.straighten);
    d.latest = { ...geometry, crop: toNormalized(d.valid, frame) };
    onPreview(d.latest);
  };

  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d) onCommit(d.latest);
  };

  return (
    <div ref={overlayRef} className="crop-overlay">
      <svg className="crop-shade" aria-hidden="true">
        <path
          fillRule="evenodd"
          d={`M-9999 -9999H99999V99999H-9999Z M${css.left} ${css.top}h${css.width}v${css.height}h${-css.width}Z`}
        />
      </svg>
      <div
        className="crop-box"
        style={css}
        data-handle="move"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        role="group"
        aria-label="Crop area: drag to move, drag the corners to resize"
      >
        <div className="crop-thirds crop-thirds-v" />
        <div className="crop-thirds crop-thirds-h" />
        {HANDLES.map((handle) => (
          <div
            key={handle}
            className={`crop-handle crop-handle-${handle}`}
            data-handle={handle}
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
      </div>
    </div>
  );
}
