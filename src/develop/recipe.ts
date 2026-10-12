/**
 * An edit "recipe": the list of slider values for one photo.
 *
 * Chitra never changes the original file. The photo you see is always
 * original + recipe, so edits can be undone, reset or copied at any time.
 */

import { DEFAULT_GEOMETRY, isDefaultGeometry, sanitizeGeometry, type Geometry } from './geometry';
import { BANDS, type Band } from './hsl';
import { isLinearCurve, LINEAR_CURVE, sanitizeCurve, type ToneCurve } from './toneCurve';

/**
 * Version 2 added `geometry` (crop, straighten, rotate, flip).
 * Version 3 added the tone curve, colour mixer and colour grading.
 */
export const RECIPE_VERSION = 3;

/** Colour mixer sliders, for example `hueBlue` or `luminanceOrange`. */
export type MixerKey = `${'hue' | 'saturation' | 'luminance'}${Band}`;

/** Colour grading sliders. Wheel hues are OKLCh angles in degrees. */
export type GradingKey =
  | 'gradeShadowsHue'
  | 'gradeShadowsSaturation'
  | 'gradeMidtonesHue'
  | 'gradeMidtonesSaturation'
  | 'gradeHighlightsHue'
  | 'gradeHighlightsSaturation'
  | 'gradeBalance'
  | 'gradeBlending';

export interface Recipe extends Record<MixerKey, number>, Record<GradingKey, number> {
  version: typeof RECIPE_VERSION;
  /** −100 (cooler/bluer) … +100 (warmer/yellower), relative to the camera's white balance. */
  temperature: number;
  /** −100 (greener) … +100 (more magenta). */
  tint: number;
  /** Exposure in stops (EV): +1 doubles the light. */
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vibrance: number;
  saturation: number;
  /** Points of the tone curve; a straight line changes nothing. */
  toneCurve: ToneCurve;
  geometry: Geometry;
}

/** Keys of the numeric slider adjustments. */
export type AdjustmentKey = Exclude<keyof Recipe, 'version' | 'geometry' | 'toneCurve'>;

const MIXER_DEFAULTS = Object.fromEntries(
  (['hue', 'saturation', 'luminance'] as const).flatMap((p) => BANDS.map((b) => [`${p}${b}`, 0])),
) as Record<MixerKey, number>;

export const DEFAULT_RECIPE: Recipe = Object.freeze({
  version: RECIPE_VERSION,
  temperature: 0,
  tint: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  vibrance: 0,
  saturation: 0,
  ...MIXER_DEFAULTS,
  gradeShadowsHue: 0,
  gradeShadowsSaturation: 0,
  gradeMidtonesHue: 0,
  gradeMidtonesSaturation: 0,
  gradeHighlightsHue: 0,
  gradeHighlightsSaturation: 0,
  gradeBalance: 0,
  gradeBlending: 50,
  toneCurve: LINEAR_CURVE,
  geometry: DEFAULT_GEOMETRY,
});

export interface SliderSpec {
  key: AdjustmentKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** How the value is shown next to the slider. */
  format: (value: number) => string;
}

export interface SliderSection {
  title: string;
  sliders: SliderSpec[];
}

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const degrees = (value: number) => `${value}°`;
const signedEv = (value: number) => (value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2));

const percentSlider = (key: AdjustmentKey, label: string): SliderSpec => ({
  key,
  label,
  min: -100,
  max: 100,
  step: 1,
  format: signed,
});

export const SLIDER_SECTIONS: SliderSection[] = [
  {
    title: 'White balance',
    sliders: [percentSlider('temperature', 'Temperature'), percentSlider('tint', 'Tint')],
  },
  {
    title: 'Tone',
    sliders: [
      { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.01, format: signedEv },
      percentSlider('contrast', 'Contrast'),
      percentSlider('highlights', 'Highlights'),
      percentSlider('shadows', 'Shadows'),
      percentSlider('whites', 'Whites'),
      percentSlider('blacks', 'Blacks'),
    ],
  },
  {
    title: 'Presence',
    sliders: [percentSlider('vibrance', 'Vibrance'), percentSlider('saturation', 'Saturation')],
  },
];

/** The colour mixer's three tabs, each with one slider per colour band. */
export const MIXER_TABS: { id: 'hue' | 'saturation' | 'luminance'; label: string }[] = [
  { id: 'hue', label: 'Hue' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'luminance', label: 'Luminance' },
];

export const MIXER_SLIDERS: SliderSpec[] = MIXER_TABS.flatMap((tab) =>
  BANDS.map((band) => percentSlider(`${tab.id}${band}`, band)),
);

const hueSlider = (key: GradingKey): SliderSpec => ({
  key,
  label: 'Hue',
  min: 0,
  max: 360,
  step: 1,
  format: degrees,
});
const amountSlider = (key: GradingKey): SliderSpec => ({
  key,
  label: 'Saturation',
  min: 0,
  max: 100,
  step: 1,
  format: String,
});

/** The three colour grading wheels. */
export const GRADING_WHEELS: { id: string; label: string; hue: SliderSpec; amount: SliderSpec }[] =
  [
    {
      id: 'shadows',
      label: 'Shadows',
      hue: hueSlider('gradeShadowsHue'),
      amount: amountSlider('gradeShadowsSaturation'),
    },
    {
      id: 'midtones',
      label: 'Midtones',
      hue: hueSlider('gradeMidtonesHue'),
      amount: amountSlider('gradeMidtonesSaturation'),
    },
    {
      id: 'highlights',
      label: 'Highlights',
      hue: hueSlider('gradeHighlightsHue'),
      amount: amountSlider('gradeHighlightsSaturation'),
    },
  ];

export const GRADING_SLIDERS: SliderSpec[] = [
  percentSlider('gradeBalance', 'Balance'),
  { key: 'gradeBlending', label: 'Blending', min: 0, max: 100, step: 1, format: String },
];

/** Every numeric adjustment. */
export const ALL_SLIDERS: SliderSpec[] = [
  ...SLIDER_SECTIONS.flatMap((s) => s.sliders),
  ...MIXER_SLIDERS,
  ...GRADING_WHEELS.flatMap((w) => [w.hue, w.amount]),
  ...GRADING_SLIDERS,
];

export function isDefaultRecipe(recipe: Recipe): boolean {
  return (
    ALL_SLIDERS.every(({ key }) => recipe[key] === DEFAULT_RECIPE[key]) &&
    isLinearCurve(recipe.toneCurve) &&
    isDefaultGeometry(recipe.geometry)
  );
}

export function sameRecipe(a: Recipe, b: Recipe): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Turns untrusted data (e.g. from storage or an imported file) into a valid recipe:
 * unknown fields are dropped, missing or invalid values become defaults, and values
 * are clamped to each slider's range. Older recipes still load: settings they don't
 * have (geometry in version 1; curve, mixer and grading in version 2) start at defaults.
 */
export function sanitizeRecipe(data: unknown): Recipe {
  const source = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const recipe: Recipe = { ...DEFAULT_RECIPE };
  for (const { key, min, max } of ALL_SLIDERS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      recipe[key] = Math.min(max, Math.max(min, value));
    }
  }
  recipe.toneCurve = sanitizeCurve(source.toneCurve);
  recipe.geometry = sanitizeGeometry(source.geometry);
  return recipe;
}
