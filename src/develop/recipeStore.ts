/**
 * Remembers each photo's recipe in the browser (localStorage), so edits survive a
 * page reload. Photos are recognised by name, size and modification time.
 *
 * This is a stop-gap until the catalog in Phase 3. Browser storage can be cleared
 * (see docs/decisions/0001-web-app.md), so it must never be the only copy of
 * anything important — and the original photos are never stored here at all.
 */
import { isDefaultRecipe, sanitizeRecipe, type Recipe } from './recipe';

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

export function saveRecipe(
  key: string,
  recipe: Recipe,
  storage: Storage | undefined = safeStorage(),
) {
  try {
    if (isDefaultRecipe(recipe)) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(recipe));
  } catch {
    // Storage full or blocked (e.g. private browsing): edits still work for this session.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
