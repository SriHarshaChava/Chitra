/**
 * Groups of settings, used when copying settings between photos and for presets.
 * For example you can paste the colour and tone of one photo onto others without
 * also pasting its crop.
 */
import {
  GRADING_SLIDERS,
  GRADING_WHEELS,
  MIXER_SLIDERS,
  type AdjustmentKey,
  type Recipe,
} from './recipe';

export type SettingsGroup =
  'whiteBalance' | 'tone' | 'presence' | 'toneCurve' | 'colorMixer' | 'colorGrading' | 'geometry';

/** Recipe fields that aren't single numbers. */
type ShapeField = 'toneCurve' | 'geometry';

export const SETTINGS_GROUPS: {
  id: SettingsGroup;
  label: string;
  keys: AdjustmentKey[];
  field?: ShapeField;
}[] = [
  { id: 'whiteBalance', label: 'White balance', keys: ['temperature', 'tint'] },
  {
    id: 'tone',
    label: 'Exposure & tone',
    keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'],
  },
  { id: 'presence', label: 'Vibrance & saturation', keys: ['vibrance', 'saturation'] },
  { id: 'toneCurve', label: 'Tone curve', keys: [], field: 'toneCurve' },
  { id: 'colorMixer', label: 'Colour mixer', keys: MIXER_SLIDERS.map((s) => s.key) },
  {
    id: 'colorGrading',
    label: 'Colour grading',
    keys: [
      ...GRADING_WHEELS.flatMap((w) => [w.hue.key, w.amount.key]),
      ...GRADING_SLIDERS.map((s) => s.key),
    ],
  },
  { id: 'geometry', label: 'Crop, straighten & rotate', keys: [], field: 'geometry' },
];

/** By default everything except the crop is copied (crops rarely suit other photos). */
export const DEFAULT_COPY_GROUPS: SettingsGroup[] = SETTINGS_GROUPS.map((g) => g.id).filter(
  (id) => id !== 'geometry',
);

/** `target` with the chosen groups taken from `source`. */
export function applyGroups(target: Recipe, source: Recipe, groups: SettingsGroup[]): Recipe {
  const result: Recipe = { ...target };
  for (const group of SETTINGS_GROUPS) {
    if (!groups.includes(group.id)) continue;
    for (const key of group.keys) result[key] = source[key];
    if (group.field === 'toneCurve') result.toneCurve = source.toneCurve;
    if (group.field === 'geometry') result.geometry = source.geometry;
  }
  return result;
}

/** Copied settings: the source recipe and which groups to apply. */
export interface CopiedSettings {
  recipe: Recipe;
  groups: SettingsGroup[];
}
