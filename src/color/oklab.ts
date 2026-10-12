/**
 * OKLab: a perceptual colour space (Björn Ottosson, 2020, public domain maths).
 *
 * In OKLab, L is lightness and a/b are the green–red and blue–yellow axes. Its polar
 * form, OKLCh (lightness, chroma, hue angle), is where the colour mixer and colour
 * grading work: changing the hue or chroma there keeps the perceived brightness, so
 * "make the sky bluer" doesn't also make it darker or lighter.
 *
 * Chitra works in linear Rec.2020, so the published sRGB matrices are combined with
 * the Rec.2020 ↔ sRGB conversion here.
 */
import { multiply, rec2020From, rec2020To, transform, type Matrix3 } from './colorSpaces';

type Vec3 = [number, number, number];

/** Linear sRGB → cone responses (LMS), from the OKLab definition. */
// prettier-ignore
const SRGB_TO_LMS: Matrix3 = [
  0.4122214708, 0.5363325363, 0.0514459929,
  0.2119034982, 0.6806995451, 0.1073969566,
  0.0883024619, 0.2817188376, 0.6299787005,
];
// prettier-ignore
const LMS_TO_SRGB: Matrix3 = [
   4.0767416621, -3.3077115913,  0.2309699292,
  -1.2684380046,  2.6097574011, -0.3413193965,
  -0.0041960863, -0.7034186147,  1.707614701,
];
/** Cube-rooted LMS → L, a, b. */
// prettier-ignore
export const LMS_TO_LAB: Matrix3 = [
  0.2104542553,  0.793617785,  -0.0040720468,
  1.9779984951, -2.428592205,   0.4505937099,
  0.0259040371,  0.7827717662, -0.808675766,
];
/** L, a, b → cube-rooted LMS. */
// prettier-ignore
export const LAB_TO_LMS: Matrix3 = [
  1,  0.3963377774,  0.2158037573,
  1, -0.1055613458, -0.0638541728,
  1, -0.0894841775, -1.291485548,
];

/** Linear Rec.2020 → LMS. */
export const REC2020_TO_LMS: Matrix3 = multiply(SRGB_TO_LMS, rec2020To('srgb'));
/** LMS → linear Rec.2020. */
export const LMS_TO_REC2020: Matrix3 = multiply(rec2020From('srgb'), LMS_TO_SRGB);

/** Cube root that also works for (slightly) negative values. */
const cbrt = (x: number) => Math.sign(x) * Math.pow(Math.abs(x), 1 / 3);

export function rec2020ToOklab(rgb: readonly [number, number, number]): Vec3 {
  const lms = transform(REC2020_TO_LMS, rgb).map(cbrt) as Vec3;
  return transform(LMS_TO_LAB, lms);
}

export function oklabToRec2020(lab: readonly [number, number, number]): Vec3 {
  const lms = transform(LAB_TO_LMS, lab).map((v) => v * v * v) as Vec3;
  return transform(LMS_TO_REC2020, lms);
}

/** Hue angle in degrees, 0…360, of OKLab a/b. */
export function hueDegrees(a: number, b: number): number {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}
