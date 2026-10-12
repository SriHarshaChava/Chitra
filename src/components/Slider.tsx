/**
 * One adjustment slider. Dragging updates the photo live; releasing records one undo
 * step. Double-click (or double-tap) the name to reset just this slider.
 */
import type { ReactNode } from 'react';
import { DEFAULT_RECIPE, type Recipe, type SliderSpec } from '../develop/recipe';

interface SliderProps {
  spec: SliderSpec;
  recipe: Recipe;
  disabled: boolean;
  onPreview: (recipe: Recipe) => void;
  onCommit: (recipe: Recipe) => void;
  /** Shown before the name, for example a colour swatch. */
  icon?: ReactNode;
}

export function Slider({ spec, recipe, disabled, onPreview, onCommit, icon }: SliderProps) {
  const value = recipe[spec.key];
  const id = `slider-${spec.key}`;
  // By the time the pointer or key is released, React has re-rendered with the
  // dragged value, so `recipe` is exactly what is on screen.
  const commitLatest = () => onCommit(recipe);
  const resetThis = () => onCommit({ ...recipe, [spec.key]: DEFAULT_RECIPE[spec.key] });

  return (
    <div className={`slider${value !== DEFAULT_RECIPE[spec.key] ? ' slider-changed' : ''}`}>
      <label
        htmlFor={id}
        className="slider-label"
        onDoubleClick={disabled ? undefined : resetThis}
        title="Double-click to reset"
      >
        {icon}
        {spec.label}
      </label>
      <output htmlFor={id} className="slider-value">
        {spec.format(value)}
      </output>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onPreview({ ...recipe, [spec.key]: Number(event.target.value) });
        }}
        onPointerUp={commitLatest}
        onKeyUp={commitLatest}
        onBlur={commitLatest}
      />
    </div>
  );
}
