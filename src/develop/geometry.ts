/**
 * Crop, straighten, rotate and flip.
 *
 * Coordinate spaces, from the file to the screen:
 *   image      – pixels as stored in the file
 *   oriented   – after the camera's orientation (portrait photos stand upright)
 *   frame      – after the user's 90° rotation and horizontal flip
 *   straightened frame – the frame's content turned by the small straighten angle
 *                around the frame centre (the frame itself stays the same size)
 *   crop       – a rectangle inside the straightened frame; this is the final photo
 *
 * The crop is stored in *normalised* frame units (0..1), so it does not depend on
 * whether the camera preview or the full RAW is shown.
 */
import { multiply, type Matrix3 } from '../color/colorSpaces';
import type { Rotation } from '../render/sourceImage';

export interface CropRect {
  /** Left/top edge and size, as fractions of the frame width/height. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AspectPreset = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9' | '5:4';

export const ASPECT_PRESETS: { id: AspectPreset; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'original', label: 'Original', ratio: null },
  { id: '1:1', label: '1 : 1', ratio: 1 },
  { id: '5:4', label: '5 : 4', ratio: 5 / 4 },
  { id: '4:3', label: '4 : 3', ratio: 4 / 3 },
  { id: '3:2', label: '3 : 2', ratio: 3 / 2 },
  { id: '16:9', label: '16 : 9', ratio: 16 / 9 },
];

export interface Geometry {
  /** Extra clockwise rotation chosen by the user, on top of the camera's. */
  rotate: Rotation;
  /** Mirror left–right. */
  flipHorizontal: boolean;
  /** Small rotation to level the horizon, in degrees (positive = clockwise). */
  straighten: number;
  crop: CropRect;
  aspect: AspectPreset;
}

export const STRAIGHTEN_LIMIT = 45;
/** Crops can't get smaller than this many frame pixels. */
export const MIN_CROP_PIXELS = 32;

export const FULL_CROP: CropRect = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

export const DEFAULT_GEOMETRY: Geometry = Object.freeze({
  rotate: 0,
  flipHorizontal: false,
  straighten: 0,
  crop: FULL_CROP,
  aspect: 'free',
});

export interface Size {
  width: number;
  height: number;
}

/** Frame size for an oriented image after the user's 90° rotation. */
export function frameSize(oriented: Size, rotate: Rotation): Size {
  return rotate % 180 === 0 ? oriented : { width: oriented.height, height: oriented.width };
}

/** Size of the final (cropped) photo in pixels. */
export function cropPixelSize(frame: Size, crop: CropRect): Size {
  return {
    width: Math.max(1, Math.round(crop.width * frame.width)),
    height: Math.max(1, Math.round(crop.height * frame.height)),
  };
}

export function isDefaultGeometry(g: Geometry): boolean {
  return (
    g.rotate === 0 &&
    !g.flipHorizontal &&
    g.straighten === 0 &&
    g.crop.x === 0 &&
    g.crop.y === 0 &&
    g.crop.width === 1 &&
    g.crop.height === 1
  );
}

// ---------- Matrices ----------

/** Pixel → pixel after rotating a w×h image clockwise by a multiple of 90°. */
export function rotationMatrix(width: number, height: number, rotation: Rotation): Matrix3 {
  switch (rotation) {
    case 90: // the top-left corner moves to the top-right
      return [0, -1, height, 1, 0, 0, 0, 0, 1];
    case 180:
      return [-1, 0, width, 0, -1, height, 0, 0, 1];
    case 270:
      return [0, 1, 0, -1, 0, width, 0, 0, 1];
    default:
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
}

/** Turns content by `degrees` (clockwise on screen) around the point (cx, cy). */
export function turnAround(degrees: number, cx: number, cy: number): Matrix3 {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // Translate to the centre, rotate, translate back (y points down on screen).
  return [c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy, 0, 0, 1];
}

export interface ImageLayout {
  /** Image size as stored in the file. */
  width: number;
  height: number;
  /** Camera orientation. */
  rotation: Rotation;
}

/** Image pixel → straightened frame pixel. */
export function imageToFrameMatrix(image: ImageLayout, g: Geometry): Matrix3 {
  const camera = rotationMatrix(image.width, image.height, image.rotation);
  const oriented = frameSize(image, image.rotation);
  const user = rotationMatrix(oriented.width, oriented.height, g.rotate);
  const frame = frameSize(oriented, g.rotate);
  const flip: Matrix3 = g.flipHorizontal
    ? [-1, 0, frame.width, 0, 1, 0, 0, 0, 1]
    : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const straighten = turnAround(g.straighten, frame.width / 2, frame.height / 2);
  return multiply(straighten, multiply(flip, multiply(user, camera)));
}

/** Image pixel → final cropped photo pixel. */
export function imageToCropMatrix(image: ImageLayout, g: Geometry): Matrix3 {
  const frame = frameSize(frameSize(image, image.rotation), g.rotate);
  const shift: Matrix3 = [1, 0, -g.crop.x * frame.width, 0, 1, -g.crop.y * frame.height, 0, 0, 1];
  return multiply(shift, imageToFrameMatrix(image, g));
}

// ---------- Keeping the crop inside the photo ----------

/** Crop rectangle in frame pixels. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const toPixels = (c: CropRect, f: Size): PixelRect => ({
  x: c.x * f.width,
  y: c.y * f.height,
  width: c.width * f.width,
  height: c.height * f.height,
});

export const toNormalized = (r: PixelRect, f: Size): CropRect => ({
  x: r.x / f.width,
  y: r.y / f.height,
  width: r.width / f.width,
  height: r.height / f.height,
});

/**
 * True if the crop lies inside the straightened photo, i.e. it shows no empty
 * corners. Each crop corner is turned back by the straighten angle and must land
 * inside the unturned frame.
 */
export function cropFits(rect: PixelRect, frame: Size, straighten: number): boolean {
  if (rect.width < MIN_CROP_PIXELS - 1e-6 || rect.height < MIN_CROP_PIXELS - 1e-6) return false;
  const back = turnAround(-straighten, frame.width / 2, frame.height / 2);
  const eps = 1e-6 * Math.max(frame.width, frame.height);
  const corners: [number, number][] = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ];
  return corners.every(([px, py]) => {
    const x = back[0] * px + back[1] * py + back[2];
    const y = back[3] * px + back[4] * py + back[5];
    return x >= -eps && y >= -eps && x <= frame.width + eps && y <= frame.height + eps;
  });
}

/**
 * The largest crop with the given width/height ratio, centred in the frame, that
 * still fits inside the straightened photo.
 *
 * For a centred rectangle with half-sizes (a, b), turning it by θ makes its corners
 * reach |a·cosθ| + |b·sinθ| horizontally and |a·sinθ| + |b·cosθ| vertically; both
 * must stay within half the frame size.
 */
export function largestCenteredCrop(frame: Size, straighten: number, ratio: number): PixelRect {
  const t = (Math.abs(straighten) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const halfH = Math.min(frame.width / 2 / (ratio * c + s), frame.height / 2 / (ratio * s + c));
  const height = 2 * halfH;
  const width = height * ratio;
  return { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height };
}

/**
 * Moves from a valid crop towards a proposed one and stops at the last position that
 * still fits. Used while dragging: the crop slides along the edge instead of jumping.
 */
export function constrainCrop(
  valid: PixelRect,
  proposed: PixelRect,
  frame: Size,
  straighten: number,
): PixelRect {
  if (cropFits(proposed, frame, straighten)) return proposed;
  const lerp = (t: number): PixelRect => ({
    x: valid.x + (proposed.x - valid.x) * t,
    y: valid.y + (proposed.y - valid.y) * t,
    width: valid.width + (proposed.width - valid.width) * t,
    height: valid.height + (proposed.height - valid.height) * t,
  });
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (cropFits(lerp(mid), frame, straighten)) low = mid;
    else high = mid;
  }
  return lerp(low);
}

/**
 * The width/height ratio a preset asks for, or null for free cropping. Presets are
 * defined landscape (≥ 1); a crop that is currently taller than wide keeps that
 * orientation.
 */
export function aspectRatio(
  aspect: AspectPreset,
  current: PixelRect,
  original: Size,
): number | null {
  const preset = ASPECT_PRESETS.find((p) => p.id === aspect);
  let ratio = aspect === 'original' ? original.width / original.height : (preset?.ratio ?? null);
  if (ratio === null) return null;
  if (ratio < 1) ratio = 1 / ratio;
  return current.height > current.width ? 1 / ratio : ratio;
}

/** Fits a new crop of `ratio` around the current crop's centre (or the frame centre). */
export function cropForRatio(
  current: PixelRect,
  frame: Size,
  straighten: number,
  ratio: number,
): PixelRect {
  const largest = largestCenteredCrop(frame, straighten, ratio);
  // Keep roughly the current size and centre where possible.
  const area = Math.min(current.width * current.height, largest.width * largest.height);
  const height = Math.sqrt(area / ratio);
  const width = height * ratio;
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;
  const wanted = { x: cx - width / 2, y: cy - height / 2, width, height };
  return cropFits(wanted, frame, straighten)
    ? wanted
    : constrainCrop(largest, wanted, frame, straighten);
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

/**
 * New crop after dragging a handle to `point` (frame pixels). Opposite edges stay put;
 * with a ratio the free dimension follows. `move` shifts the whole crop by `delta`.
 */
export function dragCrop(
  start: PixelRect,
  handle: Handle,
  point: { x: number; y: number },
  delta: { x: number; y: number },
  ratio: number | null,
): PixelRect {
  if (handle === 'move') return { ...start, x: start.x + delta.x, y: start.y + delta.y };

  const left = start.x;
  const top = start.y;
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  const movesW = handle.includes('w');
  const movesE = handle.includes('e');
  const movesN = handle.includes('n');
  const movesS = handle.includes('s');

  let x0 = movesW ? Math.min(point.x, right - MIN_CROP_PIXELS) : left;
  let x1 = movesE ? Math.max(point.x, left + MIN_CROP_PIXELS) : right;
  let y0 = movesN ? Math.min(point.y, bottom - MIN_CROP_PIXELS) : top;
  let y1 = movesS ? Math.max(point.y, top + MIN_CROP_PIXELS) : bottom;
  if (ratio === null) return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };

  let width = x1 - x0;
  let height = y1 - y0;
  const corner = (movesW || movesE) && (movesN || movesS);
  if (corner) {
    // Follow whichever direction the pointer moved further.
    if (width / height > ratio) height = width / ratio;
    else width = height * ratio;
    if (movesW) x0 = x1 - width;
    else x1 = x0 + width;
    if (movesN) y0 = y1 - height;
    else y1 = y0 + height;
  } else if (movesW || movesE) {
    height = width / ratio;
    const cy = (top + bottom) / 2;
    y0 = cy - height / 2;
    y1 = cy + height / 2;
  } else {
    width = height * ratio;
    const cx = (left + right) / 2;
    x0 = cx - width / 2;
    x1 = cx + width / 2;
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// ---------- Rotate and flip buttons ----------

/** Rotates the photo 90° (direction +1 = clockwise), carrying the crop along. */
export function rotateGeometry(g: Geometry, direction: 1 | -1): Geometry {
  const { x, y, width, height } = g.crop;
  const crop =
    direction === 1
      ? { x: 1 - y - height, y: x, width: height, height: width }
      : { x: y, y: 1 - x - width, width: height, height: width };
  // With a flip applied after rotation, turning visually clockwise means the stored
  // rotation goes the other way.
  const step = g.flipHorizontal ? -direction : direction;
  const rotate = (((g.rotate + step * 90) % 360) + 360) % 360;
  return { ...g, rotate: rotate as Rotation, crop };
}

/** Mirrors left–right; the crop and straighten angle mirror with the picture. */
export function flipGeometry(g: Geometry): Geometry {
  return {
    ...g,
    flipHorizontal: !g.flipHorizontal,
    straighten: -g.straighten,
    crop: { ...g.crop, x: 1 - g.crop.x - g.crop.width },
  };
}

/** Changes the straighten angle and shrinks the crop if needed to avoid empty corners. */
export function straightenGeometry(g: Geometry, frame: Size, degrees: number): Geometry {
  const straighten = Math.max(-STRAIGHTEN_LIMIT, Math.min(STRAIGHTEN_LIMIT, degrees));
  const current = toPixels(g.crop, frame);
  if (cropFits(current, frame, straighten)) return { ...g, straighten };
  const ratio = current.width / current.height;
  const fitted = cropForRatio(current, frame, straighten, ratio);
  return { ...g, straighten, crop: toNormalized(fitted, frame) };
}

/** Turns untrusted data into valid geometry. */
export function sanitizeGeometry(data: unknown): Geometry {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const rotate = [0, 90, 180, 270].includes(d.rotate as number) ? (d.rotate as Rotation) : 0;
  const c = (typeof d.crop === 'object' && d.crop !== null ? d.crop : {}) as Record<
    string,
    unknown
  >;
  const width = Math.min(1, Math.max(0.001, num(c.width, 1)));
  const height = Math.min(1, Math.max(0.001, num(c.height, 1)));
  const crop = {
    x: Math.min(1 - width, Math.max(0, num(c.x, 0))),
    y: Math.min(1 - height, Math.max(0, num(c.y, 0))),
    width,
    height,
  };
  const aspect = ASPECT_PRESETS.some((p) => p.id === d.aspect)
    ? (d.aspect as AspectPreset)
    : 'free';
  return {
    rotate,
    flipHorizontal: d.flipHorizontal === true,
    straighten: Math.max(-STRAIGHTEN_LIMIT, Math.min(STRAIGHTEN_LIMIT, num(d.straighten, 0))),
    crop,
    aspect,
  };
}
