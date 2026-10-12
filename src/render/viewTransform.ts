/**
 * Zoom and pan maths for the photo viewer.
 *
 * A `View` maps image pixels to screen (device) pixels:
 *   screenX = imageX * scale + x
 *   screenY = imageY * scale + y
 * `scale` = 1 means one image pixel per screen pixel ("100 %").
 *
 * All functions are pure (no side effects), which keeps them easy to test.
 */

export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 1600 % — enough to inspect individual pixels for focus checks. */
export const MAX_SCALE = 16;

/** Never zoom out further than this fraction of the fitted size. */
const MIN_FIT_FRACTION = 0.5;

/** Empty space kept around the photo when it is fitted to the screen. */
export const FIT_PADDING = 16;

export function fitScale(image: Size, viewport: Size, padding = FIT_PADDING): number {
  const availableW = Math.max(1, viewport.width - padding * 2);
  const availableH = Math.max(1, viewport.height - padding * 2);
  return Math.min(availableW / image.width, availableH / image.height);
}

/** View that shows the whole photo, centred. Small photos are not enlarged beyond 100 %. */
export function fitView(image: Size, viewport: Size, padding = FIT_PADDING): View {
  const scale = Math.min(1, fitScale(image, viewport, padding));
  return centeredView(image, viewport, scale);
}

export function centeredView(image: Size, viewport: Size, scale: number): View {
  return {
    scale,
    x: (viewport.width - image.width * scale) / 2,
    y: (viewport.height - image.height * scale) / 2,
  };
}

export function minScale(image: Size, viewport: Size): number {
  return Math.min(1, fitScale(image, viewport)) * MIN_FIT_FRACTION;
}

/**
 * Zooms by `factor` while keeping the image point under the screen position
 * (`anchorX`, `anchorY`) fixed — the behaviour you expect from a pinch or scroll wheel.
 */
export function zoomAt(
  view: View,
  factor: number,
  anchorX: number,
  anchorY: number,
  limits: { min: number; max: number },
): View {
  const scale = clamp(view.scale * factor, limits.min, limits.max);
  const applied = scale / view.scale;
  return {
    scale,
    x: anchorX - (anchorX - view.x) * applied,
    y: anchorY - (anchorY - view.y) * applied,
  };
}

/** Zooms to an exact scale around a screen position. */
export function zoomTo(view: View, scale: number, anchorX: number, anchorY: number): View {
  return zoomAt(view, scale / view.scale, anchorX, anchorY, { min: scale, max: scale });
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/**
 * Keeps the photo on screen: if it is smaller than the viewport in a direction it is
 * centred, otherwise its edges may not move inside the viewport.
 */
export function constrainView(view: View, image: Size, viewport: Size): View {
  return {
    scale: view.scale,
    x: constrainAxis(view.x, image.width * view.scale, viewport.width),
    y: constrainAxis(view.y, image.height * view.scale, viewport.height),
  };
}

function constrainAxis(offset: number, imageSize: number, viewportSize: number): number {
  if (imageSize <= viewportSize) return (viewportSize - imageSize) / 2;
  return clamp(offset, viewportSize - imageSize, 0);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Image size after rotation by a multiple of 90°. */
export function orientedSize(size: Size, rotation: number): Size {
  return rotation % 180 === 0 ? size : { width: size.height, height: size.width };
}
