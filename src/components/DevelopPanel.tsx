/**
 * The right-hand panel: histogram, photo info, and the Basic adjustments.
 *
 * Dragging a slider updates the photo live; releasing it records one undo step.
 * Double-click (or double-tap) a slider's name to reset just that slider.
 */
import type { ReactNode } from 'react';
import type { PhotoInfo } from '../decode/photoInfo';
import {
  DEFAULT_RECIPE,
  isDefaultRecipe,
  SLIDER_SECTIONS,
  type Recipe,
  type SliderSpec,
} from '../develop/recipe';
import type { Histogram } from '../render/histogram';
import { HistogramView } from './HistogramView';
import { InfoPanel } from './InfoPanel';

export interface DevelopControls {
  recipe: Recipe;
  preview: (recipe: Recipe) => void;
  commit: (recipe: Recipe) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface DevelopPanelProps {
  histogram?: Histogram;
  info?: PhotoInfo;
  fileName?: string;
  fileSize?: number;
  develop: DevelopControls;
  /** Why editing is unavailable right now, if it is. */
  disabledReason?: string;
  showingBefore: boolean;
  onToggleBefore: () => void;
  /** Size of the cropped photo, when cropped. */
  cropSize?: { width: number; height: number };
  /** Shown instead of the sliders while the crop tool is open. */
  cropPanel?: ReactNode;
}

export function DevelopPanel({
  histogram,
  info,
  fileName,
  fileSize,
  develop,
  disabledReason,
  showingBefore,
  onToggleBefore,
  cropSize,
  cropPanel,
}: DevelopPanelProps) {
  const disabled = Boolean(disabledReason);
  return (
    <aside className="panel panel-right" aria-label="Develop">
      <HistogramView histogram={histogram} />

      <section className="panel-section">
        <h2 className="section-title">Info</h2>
        <InfoPanel info={info} fileName={fileName} fileSize={fileSize} cropSize={cropSize} />
      </section>

      <div className="develop-header">
        <h2 className="panel-title">Develop</h2>
        <div className="develop-actions">
          <button
            type="button"
            className="small-button"
            onClick={develop.undo}
            disabled={disabled || !develop.canUndo}
            aria-label="Undo"
            title="Undo (Ctrl/⌘ Z)"
          >
            ↶
          </button>
          <button
            type="button"
            className="small-button"
            onClick={develop.redo}
            disabled={disabled || !develop.canRedo}
            aria-label="Redo"
            title="Redo (Ctrl/⌘ Shift Z)"
          >
            ↷
          </button>
          <button
            type="button"
            className={`small-button${showingBefore ? ' small-button-active' : ''}`}
            onClick={onToggleBefore}
            disabled={disabled}
            aria-pressed={showingBefore}
            title="Compare with the original settings (\\)"
          >
            Before
          </button>
          <button
            type="button"
            className="small-button"
            onClick={develop.reset}
            disabled={disabled || isDefaultRecipe(develop.recipe)}
            title="Reset all adjustments"
          >
            Reset
          </button>
        </div>
      </div>
      {disabledReason && <p className="panel-note">{disabledReason}</p>}

      {cropPanel}
      {!cropPanel &&
        SLIDER_SECTIONS.map((section) => (
          <section key={section.title} className="panel-section">
            <h3 className="section-title">{section.title}</h3>
            {section.sliders.map((spec) => (
              <Slider
                key={spec.key}
                spec={spec}
                recipe={develop.recipe}
                disabled={disabled}
                onPreview={develop.preview}
                onCommit={develop.commit}
              />
            ))}
          </section>
        ))}
    </aside>
  );
}

interface SliderProps {
  spec: SliderSpec;
  recipe: Recipe;
  disabled: boolean;
  onPreview: (recipe: Recipe) => void;
  onCommit: (recipe: Recipe) => void;
}

function Slider({ spec, recipe, disabled, onPreview, onCommit }: SliderProps) {
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
