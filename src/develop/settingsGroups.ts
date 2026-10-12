/**
 * Groups of settings, used when copying settings between photos and for presets.
 * For example you can paste the colour and tone of one photo onto others without
 * also pasting its crop.
 */
import type { AdjustmentKey, Recipe } from './recipe';

export type SettingsGroup = 'whiteBalance' | 'tone' | 'presence' | 'geometry';

export const SETTINGS_GROUPS: { id: SettingsGroup; label: string; keys: AdjustmentKey[] }[] = [
  { id: 'whiteBalance', label: 'White balance', keys: ['temperature', 'tint'] },
  {
    id: 'tone',
    label: 'Exposure & tone',
    keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'],
  },
  { id: 'presence', label: 'Vibrance & saturation', keys: ['vibrance', 'saturation'] },
  { id: 'geometry', label: 'Crop, straighten & rotate', keys: [] },
];

/** By default everything except the crop is copied (crops rarely suit other photos). */
export const DEFAULT_COPY_GROUPS: SettingsGroup[] = ['whiteBalance', 'tone', 'presence'];

/** `target` with the chosen groups taken from `source`. */
export function applyGroups(target: Recipe, source: Recipe, groups: SettingsGroup[]): Recipe {
  const result: Recipe = { ...target };
  for (const group of SETTINGS_GROUPS) {
    if (!groups.includes(group.id)) continue;
    for (const key of group.keys) result[key] = source[key];
    if (group.id === 'geometry') result.geometry = source.geometry;
  }
  return result;
}

/** Copied settings: the source recipe and which groups to apply. */
export interface CopiedSettings {
  recipe: Recipe;
  groups: SettingsGroup[];
}
