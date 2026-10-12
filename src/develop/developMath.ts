/**
 * The develop maths: how slider values change a pixel.
 *
 * The GPU shader (`src/gpu/shaders.ts`) runs exactly these steps for every pixel.
 * This TypeScript version is the readable reference: unit tests check its behaviour,
 * and a browser test checks that the shader produces the same numbers.
 *
 * Order of operations (like Lightroom's Basic panel):
 *   1. white balance + exposure      (linear light, one 3×3 matrix)
 *   2. vibrance + saturation         (linear light, brightness preserved)
 *   3. whites/blacks, highlights/shadows, contrast, base curve
 *                                    (perceptual scale, per channel)
 *   4. convert to the display's colours and encode
 */
import { decodeSrgb, encodeSrgb, transform, type Matrix3 } from '../color/colorSpaces';
import type { Recipe } from './recipe';
import { whiteBalanceMatrix } from './whiteBalance';

/** Rec.2020 luminance weights (how bright each primary looks). */
export const LUMA_REC2020 = [0.2627, 0.678, 0.0593] as const;

// How far each slider at ±100 moves things, chosen to feel similar to Lightroom.
const BLACKS_RANGE = 0.08;
const WHITES_RANGE = 0.2;
const SHADOWS_RANGE = 0.3;
/**
 * Darkening shadows is limited: the shadow weight rises with slope 6.75 at black, so a
 * pull stronger than 1/6.75 would make the curve bend backwards (darker tones coming
 * out brighter than lighter ones). Blacks handles strong darkening instead.
 */
const SHADOWS_NEGATIVE_RANGE = 0.14;
const HIGHLIGHTS_RANGE = 0.3;
const CONTRAST_RANGE = 0.8;

/** Numbers derived from a recipe, ready for per-pixel use (and for shader uniforms). */
export interface DevelopParams {
  /** White balance × exposure, on linear Rec.2020. */
  inputMatrix: Matrix3;
  saturation: number;
  vibrance: number;
  /** Perceptual values mapped to black (0) and white (1). */
  blackPoint: number;
  whitePoint: number;
  shadows: number;
  highlights: number;
  contrast: number;
  /** Default S-curve strength: on for RAW, off for already-rendered JPEGs. */
  baseContrast: number;
}

export function developParams(recipe: Recipe, baseContrast: number): DevelopParams {
  const gain = Math.pow(2, recipe.exposure);
  const wb = whiteBalanceMatrix(recipe.temperature, recipe.tint);
  return {
    inputMatrix: wb.map((v) => v * gain) as unknown as Matrix3,
    saturation: recipe.saturation / 100,
    vibrance: recipe.vibrance / 100,
    blackPoint: (-recipe.blacks / 100) * BLACKS_RANGE,
    whitePoint: 1 - (recipe.whites / 100) * WHITES_RANGE,
    shadows:
      (recipe.shadows / 100) * (recipe.shadows >= 0 ? SHADOWS_RANGE : SHADOWS_NEGATIVE_RANGE),
    highlights: (recipe.highlights / 100) * HIGHLIGHTS_RANGE,
    contrast: (recipe.contrast / 100) * CONTRAST_RANGE,
    baseContrast,
  };
}

const smoothstep01 = (v: number) => v * v * (3 - 2 * v);

/** Weight of the Shadows slider: 0 at black and from mid-tones up, strongest at 1/3. */
export function shadowWeight(v: number): number {
  if (v <= 0 || v >= 1) return 0;
  return 6.75 * v * (1 - v) * (1 - v);
}

/** Weight of the Highlights slider: rises from black, full strength from 2/3 upwards. */
export function highlightWeight(v: number): number {
  if (v <= 0) return 0;
  if (v >= 2 / 3) return 1;
  return 6.75 * v * v * (1 - v);
}

/** S-curve with fixed black, mid-grey (0.5) and white; values outside 0..1 pass through. */
export function sCurve(v: number, strength: number): number {
  if (v <= 0 || v >= 1) return v;
  return v + strength * (smoothstep01(v) - v);
}

/** Tone adjustments on one channel, in the perceptual (sRGB-encoded) scale. */
export function toneChannel(v: number, p: DevelopParams): number {
  let t = (v - p.blackPoint) / (p.whitePoint - p.blackPoint);
  t += p.shadows * shadowWeight(t);
  t += p.highlights * highlightWeight(t);
  t = sCurve(t, p.contrast);
  t = sCurve(t, p.baseContrast);
  return t;
}

/** Encoding that keeps going above 1, so highlights pushed past white can be recovered. */
export function encodeExtended(linear: number): number {
  return linear <= 1 ? encodeSrgb(linear) : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}

export function decodeExtended(encoded: number): number {
  return encoded <= 1 ? decodeSrgb(encoded) : Math.pow((encoded + 0.055) / 1.055, 2.4);
}

/**
 * Develops one pixel.
 * @param rgb linear Rec.2020 input
 * @param outputMatrix linear Rec.2020 → linear display RGB
 * @returns encoded display RGB, 0..1
 */
export function developPixel(
  rgb: readonly [number, number, number],
  p: DevelopParams,
  outputMatrix: Matrix3,
): [number, number, number] {
  let c = transform(p.inputMatrix, rgb);

  // Vibrance boosts muted colours more than already-saturated ones.
  const luma = LUMA_REC2020[0] * c[0] + LUMA_REC2020[1] * c[1] + LUMA_REC2020[2] * c[2];
  const max = Math.max(...c);
  const min = Math.min(...c);
  const currentSaturation = max > 1e-6 ? (max - min) / max : 0;
  const k = 1 + p.saturation + p.vibrance * (1 - currentSaturation);
  c = c.map((ch) => Math.max(0, luma + (ch - luma) * k)) as [number, number, number];

  const toned = c.map((ch) => decodeExtended(Math.max(0, toneChannel(encodeExtended(ch), p))));
  const display = transform(outputMatrix, toned as [number, number, number]);
  return display.map((ch) => encodeSrgb(ch)) as [number, number, number];
}
