/**
 * Phase 2 remembered each photo's recipe in localStorage, keyed by name, size and
 * modification time. The catalog (Phase 3) now stores recipes; this module only
 * reads those older entries so edits carry over when such a photo is imported.
 */
import { sanitizeRecipe, type Recipe } from './recipe';

const PREFIX = 'chitra.recipe.';

export function photoKey(file: { name: string; size: number; lastModified: number }): string {
  return `${PREFIX}${file.name}|${file.size}|${file.lastModified}`;
}

export function loadRecipe(
  key: string,
  storage: Storage | undefined = safeStorage(),
): Recipe | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? sanitizeRecipe(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
