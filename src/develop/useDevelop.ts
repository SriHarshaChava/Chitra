/**
 * React state for editing: the selected photo's recipe and its undo/redo history.
 * Each opened photo keeps its own history; committed recipes are saved on this device.
 */
import { useCallback, useMemo, useState } from 'react';
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
import { DEFAULT_RECIPE, type Recipe } from './recipe';
import { loadRecipe, saveRecipe } from './recipeStore';

export function useDevelop(key: string | null) {
  const [histories, setHistories] = useState<ReadonlyMap<string, History>>(() => new Map());

  // A photo seen for the first time starts from its saved recipe (if any).
  const initial = useMemo(
    () => (key ? createHistory(loadRecipe(key) ?? DEFAULT_RECIPE) : null),
    [key],
  );
  const history = key ? (histories.get(key) ?? initial) : null;

  const update = useCallback(
    (change: (h: History) => History, save: boolean) => {
      if (!key || !initial) return;
      setHistories((map) => {
        const next = change(map.get(key) ?? initial);
        if (save) saveRecipe(key, next.past[next.index]!);
        return new Map(map).set(key, next);
      });
    },
    [key, initial],
  );

  return {
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
