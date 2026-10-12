/**
 * React state for editing: the active photo's recipe and its undo/redo history.
 * Each photo keeps its own history for this session; committed recipes are saved to
 * the catalog through `save`.
 */
import { useCallback, useRef, useState } from 'react';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  preview,
  redo,
  undo,
  type History,
} from './history';
import { DEFAULT_RECIPE, sameRecipe, type Recipe } from './recipe';

/**
 * Brings a photo's history up to date with its saved recipe. If the recipe was changed
 * elsewhere (pasted settings, a preset applied in the Library, a restored backup), that
 * change becomes a normal step that Undo can take back.
 */
export function reconcile(history: History | undefined, saved: Recipe): History {
  if (!history) return createHistory(saved);
  return sameRecipe(history.past[history.index]!, saved) ? history : commit(history, saved);
}

export function useDevelop(
  photo: { id: string; recipe: Recipe } | null,
  save: (id: string, recipe: Recipe) => void,
) {
  const [histories, setHistories] = useState<ReadonlyMap<string, History>>(() => new Map());
  // The latest histories, readable synchronously inside event handlers.
  const latest = useRef(histories);

  const id = photo?.id ?? null;
  const savedRecipe = photo?.recipe ?? DEFAULT_RECIPE;
  // A photo opened for the first time this session starts from its saved recipe.
  const history = id ? reconcile(histories.get(id), savedRecipe) : null;

  const update = useCallback(
    (change: (h: History) => History, persist: boolean) => {
      if (!id) return;
      const next = change(reconcile(latest.current.get(id), savedRecipe));
      const map = new Map(latest.current).set(id, next);
      latest.current = map;
      setHistories(map);
      if (persist) save(id, next.past[next.index]!);
    },
    [id, savedRecipe, save],
  );

  /**
   * Call before changing photos from outside Develop (paste, presets, restore): photos
   * without a history yet start one at their current recipe, so the change can be undone.
   */
  const remember = useCallback((photos: { id: string; recipe: Recipe }[]) => {
    const map = new Map(latest.current);
    let changed = false;
    for (const p of photos) {
      if (!map.has(p.id)) {
        map.set(p.id, createHistory(p.recipe));
        changed = true;
      }
    }
    if (!changed) return;
    latest.current = map;
    setHistories(map);
  }, []);

  return {
    remember,
    recipe: history?.current ?? DEFAULT_RECIPE,
    /** Live update while a slider is being dragged (not an undo step). */
    preview: useCallback((r: Recipe) => update((h) => preview(h, r), false), [update]),
    /** Records a finished change as one undo step and saves it. */
    commit: useCallback((r: Recipe) => update((h) => commit(h, r), true), [update]),
    undo: useCallback(() => update(undo, true), [update]),
    redo: useCallback(() => update(redo, true), [update]),
    reset: useCallback(() => update((h) => commit(h, DEFAULT_RECIPE), true), [update]),
    canUndo: history ? canUndo(history) : false,
    canRedo: history ? canRedo(history) : false,
  };
}
