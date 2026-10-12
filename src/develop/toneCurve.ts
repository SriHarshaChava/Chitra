/**
 * The tone curve: a line through a few points that you drag to reshape brightness.
 * The horizontal axis is the input brightness, the vertical axis the output.
 *
 * Between points the curve is a "monotone cubic" (Fritsch–Carlson): smooth, but it
 * never overshoots the points, so a gentle S never produces bright halos or flips.
 * For speed the curve is sampled into a lookup table of `CURVE_LUT_SIZE` values,
 * which the GPU reads as a small texture.
 */

export interface CurvePoint {
  x: number;
  y: number;
}

export type ToneCurve = readonly CurvePoint[];

export const MAX_CURVE_POINTS = 16;
/** Points closer together than this (horizontally) are merged. */
export const MIN_POINT_GAP = 0.01;
export const CURVE_LUT_SIZE = 1024;

export const LINEAR_CURVE: ToneCurve = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: 1, y: 1 }),
]);

export const CURVE_PRESETS: { id: string; label: string; points: ToneCurve }[] = [
  { id: 'linear', label: 'Linear', points: LINEAR_CURVE },
  {
    id: 'medium',
    label: 'Medium contrast',
    points: [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.21 },
      { x: 0.75, y: 0.79 },
      { x: 1, y: 1 },
    ],
  },
  {
    id: 'strong',
    label: 'Strong contrast',
    points: [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.17 },
      { x: 0.75, y: 0.83 },
      { x: 1, y: 1 },
    ],
  },
];

/** True if the curve leaves every value unchanged. */
export function isLinearCurve(curve: ToneCurve): boolean {
  return (
    curve[0]?.x === 0 &&
    curve[curve.length - 1]?.x === 1 &&
    curve.every((p) => Math.abs(p.x - p.y) < 1e-9)
  );
}

/**
 * Builds the curve function through `points` (sorted by x). Outside the first and
 * last point the curve stays flat.
 */
export function curveFunction(points: ToneCurve): (x: number) => number {
  const n = points.length;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  if (n === 1) return () => ys[0]!;

  // Slopes of each segment, then a tangent at each point.
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) delta.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  const m: number[] = new Array<number>(n);
  m[0] = delta[0]!;
  m[n - 1] = delta[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    // A peak or valley at a point gets a flat tangent; otherwise average the slopes.
    m[i] = delta[i - 1]! * delta[i]! <= 0 ? 0 : (delta[i - 1]! + delta[i]!) / 2;
  }
  // Fritsch–Carlson: shrink tangents that would make the curve overshoot.
  for (let i = 0; i < n - 1; i++) {
    const d = delta[i]!;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d;
    const b = m[i + 1]! / d;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d;
      m[i + 1] = t * b * d;
    }
  }

  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!;
    const t = (x - xs[i]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    // Cubic Hermite basis.
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * h * m[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * h * m[i + 1]!
    );
  };
}

/** Samples the curve at `CURVE_LUT_SIZE` evenly spaced inputs from 0 to 1. */
export function curveLut(points: ToneCurve): Float32Array {
  const f = curveFunction(points);
  const lut = new Float32Array(CURVE_LUT_SIZE);
  for (let i = 0; i < CURVE_LUT_SIZE; i++) {
    lut[i] = Math.min(1, Math.max(0, f(i / (CURVE_LUT_SIZE - 1))));
  }
  return lut;
}

/**
 * Reads the lookup table with linear interpolation (the shader does the same).
 * Values beyond 0…1 (over-bright highlights, for example) keep their distance from
 * the curve's ends, so they can still be recovered.
 */
export function lookupCurve(lut: Float32Array, v: number): number {
  const last = lut.length - 1;
  if (v <= 0) return lut[0]! + v;
  if (v >= 1) return lut[last]! + (v - 1);
  const position = v * last;
  const i = Math.min(last - 1, Math.floor(position));
  const f = position - i;
  return lut[i]! + (lut[i + 1]! - lut[i]!) * f;
}

/** Turns untrusted data into a valid curve: 2–16 points in 0…1, sorted, not too close. */
export function sanitizeCurve(data: unknown): ToneCurve {
  if (!Array.isArray(data)) return LINEAR_CURVE;
  const points: CurvePoint[] = [];
  for (const item of data as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { x, y } = item as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ x: clamp01(x), y: clamp01(y) });
  }
  points.sort((a, b) => a.x - b.x);
  const kept: CurvePoint[] = [];
  for (const p of points) {
    const previous = kept[kept.length - 1];
    if (previous && p.x - previous.x < MIN_POINT_GAP) continue;
    kept.push(p);
    if (kept.length === MAX_CURVE_POINTS) break;
  }
  if (kept.length < 2) return LINEAR_CURVE;
  return isLinearCurve(kept) ? LINEAR_CURVE : kept;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
