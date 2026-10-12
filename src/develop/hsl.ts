/**
 * The colour mixer (HSL): change the hue, saturation and luminance of one range of
 * colours, for example deeper blue skies or less orange skin.
 *
 * Colours are sorted into 8 bands by their OKLCh hue angle. Neighbouring bands
 * overlap with smooth (cosine) weights that always add up to 1, so there are no hard
 * edges where one band ends and the next begins.
 */
import { hueDegrees, oklabToRec2020, rec2020ToOklab } from '../color/oklab';

export const BANDS = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Aqua',
  'Blue',
  'Purple',
  'Magenta',
] as const;
export type Band = (typeof BANDS)[number];

/**
 * Centre hue of each band, in OKLCh degrees (close to the hue of the pure sRGB colour
 * with that name). Must stay in increasing order.
 */
export const BAND_CENTERS = [29, 58, 105, 142, 195, 260, 295, 330] as const;

/** Hue shift of a band at ±100, in degrees. */
export const HUE_RANGE = 30;
/** Brightness change of a band at ±100 (fraction of its lightness). */
export const LUMINANCE_RANGE = 0.35;
/** Below this chroma colours count as (partly) grey, and luminance changes fade out. */
export const NEUTRAL_CHROMA = 0.08;

export interface MixerParams {
  /** Per band: hue shift in degrees. */
  hue: number[];
  /** Per band: chroma change, −1 (grey) … +1 (twice as colourful). */
  saturation: number[];
  /** Per band: lightness change as a fraction. */
  luminance: number[];
}

/**
 * Which two bands a hue falls between and how much each one counts.
 * @returns [first band, second band, weight of the second band]
 */
export function bandWeights(hue: number): [number, number, number] {
  const first = BAND_CENTERS[0];
  const d = (((hue - first) % 360) + 360) % 360;
  let i = 0;
  while (i < BAND_CENTERS.length - 1 && d >= BAND_CENTERS[i + 1]! - first) i++;
  const start = BAND_CENTERS[i]! - first;
  const end = i === BAND_CENTERS.length - 1 ? 360 : BAND_CENTERS[i + 1]! - first;
  const t = (d - start) / (end - start);
  const s = Math.sin((Math.PI / 2) * t);
  return [i, (i + 1) % BAND_CENTERS.length, s * s];
}

/** Applies the colour mixer to one linear Rec.2020 colour. */
export function applyMixer(
  rgb: readonly [number, number, number],
  m: MixerParams,
): [number, number, number] {
  const [L, a, b] = rec2020ToOklab(rgb);
  const chroma = Math.hypot(a, b);
  if (chroma < 1e-7) return [rgb[0], rgb[1], rgb[2]];
  const [i, j, w] = bandWeights(hueDegrees(a, b));
  const mix = (values: number[]) => values[i]! * (1 - w) + values[j]! * w;

  const hue = ((Math.atan2(b, a) * 180) / Math.PI + mix(m.hue)) * (Math.PI / 180);
  const newChroma = chroma * (1 + mix(m.saturation));
  const colourfulness = Math.min(1, chroma / NEUTRAL_CHROMA);
  const newL = L * (1 + mix(m.luminance) * colourfulness);
  const out = oklabToRec2020([newL, newChroma * Math.cos(hue), newChroma * Math.sin(hue)]);
  return out.map((v) => Math.max(0, v)) as [number, number, number];
}
