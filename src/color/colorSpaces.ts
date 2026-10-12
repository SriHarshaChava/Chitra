/**
 * Colour-space maths.
 *
 * Chitra keeps RAW data in **linear Rec.2020**: "linear" means pixel values are
 * proportional to light (doubling the light doubles the number), which is what makes
 * exposure and white-balance maths behave like a real camera. Rec.2020 is a very wide
 * gamut, so saturated colours from the sensor (bird plumage, flowers) are not clipped
 * before editing.
 *
 * Screens are not linear and have smaller gamuts, so for display we convert:
 *   linear Rec.2020 → linear display RGB (3×3 matrix) → encode with the sRGB curve.
 * Both sRGB and Display P3 (iPad, Macs, many new monitors) use the same encoding curve.
 */

export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type DisplayColorSpace = 'srgb' | 'display-p3';

interface Chromaticity {
  x: number;
  y: number;
}

interface RgbPrimaries {
  red: Chromaticity;
  green: Chromaticity;
  blue: Chromaticity;
  white: Chromaticity;
}

const D65: Chromaticity = { x: 0.3127, y: 0.329 };

export const PRIMARIES = {
  srgb: {
    red: { x: 0.64, y: 0.33 },
    green: { x: 0.3, y: 0.6 },
    blue: { x: 0.15, y: 0.06 },
    white: D65,
  },
  'display-p3': {
    red: { x: 0.68, y: 0.32 },
    green: { x: 0.265, y: 0.69 },
    blue: { x: 0.15, y: 0.06 },
    white: D65,
  },
  rec2020: {
    red: { x: 0.708, y: 0.292 },
    green: { x: 0.17, y: 0.797 },
    blue: { x: 0.131, y: 0.046 },
    white: D65,
  },
} satisfies Record<string, RgbPrimaries>;

export function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const r = new Array<number>(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      r[row * 3 + col] =
        a[row * 3]! * b[col]! + a[row * 3 + 1]! * b[3 + col]! + a[row * 3 + 2]! * b[6 + col]!;
    }
  }
  return r as unknown as Matrix3;
}

export function invert(m: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Matrix is not invertible');
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

export function transform(
  m: Matrix3,
  rgb: readonly [number, number, number],
): [number, number, number] {
  const [r, g, b] = rgb;
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

/** Standard construction of the RGB → CIE XYZ matrix from a colour space's primaries. */
export function rgbToXyzMatrix(p: RgbPrimaries): Matrix3 {
  const toXyz = ({ x, y }: Chromaticity) => [x / y, 1, (1 - x - y) / y] as const;
  const [rX, rY, rZ] = toXyz(p.red);
  const [gX, gY, gZ] = toXyz(p.green);
  const [bX, bY, bZ] = toXyz(p.blue);
  const primaries: Matrix3 = [rX, gX, bX, rY, gY, bY, rZ, gZ, bZ];
  // Scale each primary so that R=G=B=1 produces the white point.
  const [s0, s1, s2] = transform(invert(primaries), toXyz(p.white));
  return [rX * s0, gX * s1, bX * s2, rY * s0, gY * s1, bY * s2, rZ * s0, gZ * s1, bZ * s2];
}

/** Matrix converting linear Rec.2020 RGB to linear RGB of the given display space. */
export function rec2020To(target: DisplayColorSpace): Matrix3 {
  return multiply(invert(rgbToXyzMatrix(PRIMARIES[target])), rgbToXyzMatrix(PRIMARIES.rec2020));
}

/** Matrix converting linear RGB of a display space to linear Rec.2020. */
export function rec2020From(source: DisplayColorSpace): Matrix3 {
  return invert(rec2020To(source));
}

/** sRGB / Display P3 encoding curve: linear light (0..1) → encoded signal (0..1). */
export function encodeSrgb(linear: number): number {
  if (linear <= 0) return 0;
  if (linear >= 1) return 1;
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}

/** Inverse of {@link encodeSrgb}. */
export function decodeSrgb(encoded: number): number {
  if (encoded <= 0) return 0;
  if (encoded >= 1) return 1;
  return encoded <= 0.04045 ? encoded / 12.92 : Math.pow((encoded + 0.055) / 1.055, 2.4);
}

/**
 * Strength of Chitra's default contrast curve (0 = none, 1 = strong).
 *
 * Linear RAW data shown with only the display encoding looks flat and grey: shadows
 * are lifted and midtones lack punch. Cameras and Lightroom therefore apply a default
 * "base" S-curve. This value gives a look close to a camera JPEG. In Phase 2 it
 * becomes the starting point of the editable tone curve.
 */
export const BASE_CONTRAST = 0.6;

/**
 * Gentle S-curve on encoded values (0..1): black, mid-grey (0.5) and white stay fixed;
 * shadows get a little darker and highlights a little brighter.
 */
export function baseCurve(encoded: number, strength = BASE_CONTRAST): number {
  const v = Math.min(1, Math.max(0, encoded));
  const s = v * v * (3 - 2 * v); // smoothstep: the classic S shape
  return v + strength * (s - v);
}
