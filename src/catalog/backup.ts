/**
 * Library backup: a small JSON file with every photo's rating, flag, label, keywords
 * and edit recipe, plus your presets. It does not contain the photos themselves
 * (those would be gigabytes) — keep your originals safe separately.
 *
 * Restoring matches photos by file name, size and date, so it works after importing
 * the same files again, on another device or after the browser data was cleared.
 */
import { sanitizeRecipe, type Recipe } from '../develop/recipe';
import { sanitizePreset, type Preset } from './presets';
import {
  COLOR_LABELS,
  type CatalogPhoto,
  type ColorLabel,
  type Flag,
  type PhotoChanges,
} from './types';

export const BACKUP_VERSION = 1;

export interface BackupPhoto {
  name: string;
  size: number;
  lastModified: number;
  rating: number;
  flag: Flag;
  label: ColorLabel;
  keywords: string[];
  recipe: Recipe;
  editedAt?: number;
}

export interface LibraryBackup {
  app: 'chitra';
  version: typeof BACKUP_VERSION;
  createdAt: string;
  photos: BackupPhoto[];
  presets: Preset[];
}

export function makeBackup(photos: CatalogPhoto[], presets: Preset[], now = new Date()): string {
  const backup: LibraryBackup = {
    app: 'chitra',
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    photos: photos.map((p) => ({
      name: p.name,
      size: p.size,
      lastModified: p.lastModified,
      rating: p.rating,
      flag: p.flag,
      label: p.label,
      keywords: p.keywords,
      recipe: p.recipe,
      editedAt: p.editedAt,
    })),
    presets: presets.filter((p) => !p.builtIn),
  };
  return JSON.stringify(backup, null, 1);
}

export function backupFileName(now = new Date()): string {
  return `chitra-library-${now.toISOString().slice(0, 10)}.json`;
}

/** Reads a backup file, repairing or dropping anything invalid. Throws if it isn't one. */
export function parseBackup(text: string): LibraryBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Chitra library backup.');
  }
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (d.app !== 'chitra' || !Array.isArray(d.photos)) {
    throw new Error('This file is not a Chitra library backup.');
  }
  const photos: BackupPhoto[] = [];
  for (const raw of d.photos as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.name !== 'string' || typeof p.size !== 'number') continue;
    photos.push({
      name: p.name,
      size: p.size,
      lastModified: typeof p.lastModified === 'number' ? p.lastModified : 0,
      rating: typeof p.rating === 'number' ? Math.min(5, Math.max(0, Math.round(p.rating))) : 0,
      flag: p.flag === 'pick' || p.flag === 'reject' ? p.flag : null,
      label: COLOR_LABELS.includes(p.label as never) ? (p.label as ColorLabel) : null,
      keywords: Array.isArray(p.keywords)
        ? p.keywords.filter((k): k is string => typeof k === 'string').slice(0, 200)
        : [],
      recipe: sanitizeRecipe(p.recipe),
      editedAt: typeof p.editedAt === 'number' ? p.editedAt : undefined,
    });
  }
  const presets = Array.isArray(d.presets)
    ? (d.presets as unknown[]).map(sanitizePreset).filter((p): p is Preset => p !== null)
    : [];
  return {
    app: 'chitra',
    version: BACKUP_VERSION,
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : '',
    photos,
    presets,
  };
}

export interface RestorePlan {
  updates: { id: string; changes: PhotoChanges }[];
  /** Backed-up photos not found in the library (import them first). */
  missing: string[];
}

/** Matches backed-up photos to library photos by name and size (and date when known). */
export function planRestore(photos: CatalogPhoto[], backup: LibraryBackup): RestorePlan {
  const updates: RestorePlan['updates'] = [];
  const missing: string[] = [];
  for (const b of backup.photos) {
    const match =
      photos.find(
        (p) => p.name === b.name && p.size === b.size && p.lastModified === b.lastModified,
      ) ?? photos.find((p) => p.name === b.name && p.size === b.size);
    if (!match) {
      missing.push(b.name);
      continue;
    }
    updates.push({
      id: match.id,
      changes: {
        rating: b.rating,
        flag: b.flag,
        label: b.label,
        keywords: b.keywords,
        recipe: b.recipe,
        editedAt: b.editedAt,
      },
    });
  }
  return { updates, missing };
}
