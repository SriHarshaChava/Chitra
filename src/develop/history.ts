/**
 * Undo/redo history for one photo's recipe.
 *
 * While a slider is being dragged the photo updates live (`preview`), but only the
 * final value is recorded (`commit`), so one drag is one undo step.
 */
import type { Recipe } from './recipe';

/** Plenty for an editing session, while keeping memory use trivial. */
export const MAX_HISTORY = 200;

export interface History {
  /** Recorded states; `past[index]` is the committed current state. */
  past: Recipe[];
  index: number;
  /** What is shown right now (may be an uncommitted live preview). */
  current: Recipe;
}

export function createHistory(initial: Recipe): History {
  return { past: [initial], index: 0, current: initial };
}

export function preview(history: History, recipe: Recipe): History {
  return { ...history, current: recipe };
}

export function commit(history: History, recipe: Recipe): History {
  const committed = history.past[history.index]!;
  if (sameRecipe(committed, recipe)) return { ...history, current: recipe };
  // Making a new change after undoing discards the redo steps.
  const past = [...history.past.slice(0, history.index + 1), recipe].slice(-MAX_HISTORY);
  return { past, index: past.length - 1, current: recipe };
}

export function undo(history: History): History {
  if (!canUndo(history)) return history;
  const index = history.index - 1;
  return { ...history, index, current: history.past[index]! };
}

export function redo(history: History): History {
  if (!canRedo(history)) return history;
  const index = history.index + 1;
  return { ...history, index, current: history.past[index]! };
}

export const canUndo = (h: History) => h.index > 0;
export const canRedo = (h: History) => h.index < h.past.length - 1;

function sameRecipe(a: Recipe, b: Recipe): boolean {
  return (Object.keys(a) as (keyof Recipe)[]).every((key) => a[key] === b[key]);
}
