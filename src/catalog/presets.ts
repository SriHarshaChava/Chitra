/**
 * Presets: saved slider values that can be applied to any photo in one click.
 * A preset only changes the sliders it contains; everything else stays as it is.
 */
import { ALL_SLIDERS, type AdjustmentKey, type Recipe } from '../develop/recipe';
import { SETTINGS_GROUPS, type SettingsGroup } from '../develop/settingsGroups';
import { sanitizeCurve, type ToneCurve } from '../develop/toneCurve';

export type PresetValues = Partial<Record<AdjustmentKey, number>>;

export interface Preset {
  id: string;
  name: string;
  builtIn: boolean;
  values: PresetValues;
  /** The tone curve, if the preset includes one. */
  toneCurve?: ToneCurve;
  createdAt: number;
}

const builtIn = (
  id: string,
  name: string,
  values: PresetValues,
  toneCurve?: ToneCurve,
): Preset => ({
  id: `builtin-${id}`,
  name,
  builtIn: true,
  values,
  ...(toneCurve && { toneCurve }),
  createdAt: 0,
});

/** A few starting points for wildlife and people photography. */
export const BUILT_IN_PRESETS: Preset[] = [
  builtIn('wildlife-pop', 'Wildlife pop', {
    contrast: 20,
    shadows: 15,
    whites: 10,
    blacks: -10,
    vibrance: 25,
  }),
  builtIn('soft-portrait', 'Soft portrait', {
    temperature: 5,
    contrast: -10,
    highlights: -20,
    shadows: 15,
    vibrance: 10,
    saturation: -5,
  }),
  builtIn('recover-highlights', 'Recover highlights', {
    highlights: -70,
    whites: -15,
    shadows: 20,
  }),
  builtIn('black-and-white', 'Black & white', { saturation: -100, vibrance: 0, contrast: 25 }),
  builtIn('blue-sky', 'Blue sky', {
    saturationBlue: 25,
    luminanceBlue: -25,
    saturationAqua: 15,
    luminanceAqua: -15,
  }),
  builtIn('teal-orange', 'Teal & orange', {
    gradeShadowsHue: 215,
    gradeShadowsSaturation: 35,
    gradeHighlightsHue: 65,
    gradeHighlightsSaturation: 25,
    gradeBalance: 0,
    gradeBlending: 50,
  }),
  builtIn('matte', 'Matte', { contrast: -10 }, [
    { x: 0, y: 0.07 },
    { x: 0.25, y: 0.24 },
    { x: 0.75, y: 0.78 },
    { x: 1, y: 0.96 },
  ]),
];

export function applyPreset(recipe: Recipe, preset: Preset): Recipe {
  const result = { ...recipe, ...sanitizeValues(preset.values) };
  if (preset.toneCurve) result.toneCurve = sanitizeCurve(preset.toneCurve);
  return result;
}

/** Takes the chosen groups from a recipe (for "Save as preset"). */
export function presetSettings(
  recipe: Recipe,
  groups: SettingsGroup[],
): Pick<Preset, 'values' | 'toneCurve'> {
  const values: PresetValues = {};
  let toneCurve: ToneCurve | undefined;
  for (const group of SETTINGS_GROUPS) {
    if (!groups.includes(group.id)) continue;
    for (const key of group.keys) values[key] = recipe[key];
    if (group.field === 'toneCurve') toneCurve = recipe.toneCurve;
  }
  return toneCurve ? { values, toneCurve } : { values };
}

/** Keeps only known sliders with in-range numbers (presets can come from backup files). */
export function sanitizeValues(data: unknown): PresetValues {
  const source = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const values: PresetValues = {};
  for (const { key, min, max } of ALL_SLIDERS) {
    const v = source[key];
    if (typeof v === 'number' && Number.isFinite(v)) values[key] = Math.min(max, Math.max(min, v));
  }
  return values;
}

export function sanitizePreset(data: unknown): Preset | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.id !== 'string' || typeof d.name !== 'string' || !d.name.trim()) return null;
  return {
    id: d.id,
    name: d.name.trim().slice(0, 80),
    builtIn: false,
    values: sanitizeValues(d.values),
    ...(d.toneCurve !== undefined && { toneCurve: sanitizeCurve(d.toneCurve) }),
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
  };
}
