/**
 * Colour grading: tint the shadows, midtones and highlights separately, for example
 * cool shadows and warm highlights.
 *
 * Each wheel gives a hue and a strength. It shifts the colour's OKLab a/b values
 * towards that hue, weighted by how dark or bright the pixel is. Balance moves the
 * split between shadows and highlights; Blending sets how softly they overlap.
 */
import { oklabToRec2020, rec2020ToOklab } from '../color/oklab';

/** a/b shift of a wheel at full strength. */
export const GRADE_CHROMA = 0.06;

export interface GradingParams {
  /** a/b shifts at each wheel's own strength. */
  shadows: [number, number];
  midtones: [number, number];
  highlights: [number, number];
  /** Lightness where shadows end and highlights begin. */
  pivot: number;
  /** Half-width of the transition around the pivot. */
  width: number;
}

/** a/b shift for a wheel set to `hue` degrees with strength `amount` (0…100). */
export function wheelOffset(hue: number, amount: number): [number, number] {
  const r = (amount / 100) * GRADE_CHROMA;
  const h = (hue * Math.PI) / 180;
  return [r * Math.cos(h), r * Math.sin(h)];
}

export function gradingParams(
  wheels: { hue: number; saturation: number }[],
  balance: number,
  blending: number,
): GradingParams {
  const [s, m, h] = wheels.map((w) => wheelOffset(w.hue, w.saturation));
  return {
    shadows: s!,
    midtones: m!,
    highlights: h!,
    // Positive balance gives the highlights more of the picture.
    pivot: 0.5 - 0.25 * (balance / 100),
    width: 0.05 + 0.45 * (blending / 100),
  };
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** How much each wheel applies at OKLab lightness L: [shadows, midtones, highlights]. */
export function gradingWeights(L: number, g: GradingParams): [number, number, number] {
  const t = smoothstep(g.pivot - g.width, g.pivot + g.width, L);
  return [1 - t, 4 * t * (1 - t), t];
}

/** Applies colour grading to one linear Rec.2020 colour. */
export function applyGrading(
  rgb: readonly [number, number, number],
  g: GradingParams,
): [number, number, number] {
  const [L, a, b] = rec2020ToOklab(rgb);
  const [ws, wm, wh] = gradingWeights(L, g);
  // Fade out towards pure black, so black stays black.
  const fade = Math.min(1, Math.max(0, L * 5));
  const da = (ws * g.shadows[0] + wm * g.midtones[0] + wh * g.highlights[0]) * fade;
  const db = (ws * g.shadows[1] + wm * g.midtones[1] + wh * g.highlights[1]) * fade;
  const out = oklabToRec2020([L, a + da, b + db]);
  return out.map((v) => Math.max(0, v)) as [number, number, number];
}
