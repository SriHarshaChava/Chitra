/**
 * An edit "recipe": the list of slider values for one photo.
 *
 * Chitra never changes the original file. The photo you see is always
 * original + recipe, so edits can be undone, reset or copied at any time.
 */

import { DEFAULT_GEOMETRY, isDefaultGeometry, sanitizeGeometry, type Geometry } from './geometry';

/** Version 2 added `geometry` (crop, straighten, rotate, flip). */
export const RECIPE_VERSION = 2;

export interface Recipe {
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
  geometry: Geometry;
}

/** Keys of the numeric slider adjustments. */
export type AdjustmentKey = Exclude<keyof Recipe, 'version' | 'geometry'>;

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

export const ALL_SLIDERS: SliderSpec[] = SLIDER_SECTIONS.flatMap((s) => s.sliders);

export function isDefaultRecipe(recipe: Recipe): boolean {
  return (
    ALL_SLIDERS.every(({ key }) => recipe[key] === DEFAULT_RECIPE[key]) &&
    isDefaultGeometry(recipe.geometry)
  );
}

export function sameRecipe(a: Recipe, b: Recipe): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Turns untrusted data (e.g. from storage or an imported file) into a valid recipe:
 * unknown fields are dropped, missing or invalid values become defaults, and values
 * are clamped to each slider's range. Version 1 recipes (no geometry) still load.
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
  recipe.geometry = sanitizeGeometry(source.geometry);
  return recipe;
}
