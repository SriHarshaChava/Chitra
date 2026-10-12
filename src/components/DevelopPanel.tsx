/**
 * The right-hand panel: histogram, photo info, and the adjustments (Basic, Tone
 * curve, Colour mixer, Colour grading), each in a section that can be folded away.
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
  type AdjustmentKey,
  type Recipe,
} from '../develop/recipe';
import { SETTINGS_GROUPS, type SettingsGroup } from '../develop/settingsGroups';
import { isLinearCurve, LINEAR_CURVE } from '../develop/toneCurve';
import type { Histogram } from '../render/histogram';
import { CollapsibleSection } from './CollapsibleSection';
import { ColorGrading } from './ColorGrading';
import { ColorMixer } from './ColorMixer';
import { HistogramView } from './HistogramView';
import { InfoPanel } from './InfoPanel';
import { Slider } from './Slider';
import { ToneCurveEditor } from './ToneCurveEditor';

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
  /** Rating, flag, label and keywords of the photo. */
  meta?: ReactNode;
  /** Presets and copy/paste, shown above the sliders. */
  presets?: ReactNode;
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
  meta,
  presets,
}: DevelopPanelProps) {
  const disabled = Boolean(disabledReason);
  return (
    <aside className="panel panel-right" aria-label="Develop">
      <HistogramView histogram={histogram} />
      {meta}

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
      {!cropPanel && presets}
      {!cropPanel && <Adjustments develop={develop} disabled={disabled} />}
    </aside>
  );
}

const groupKeys = (id: SettingsGroup): AdjustmentKey[] =>
  SETTINGS_GROUPS.find((g) => g.id === id)!.keys;

function Adjustments({ develop, disabled }: { develop: DevelopControls; disabled: boolean }) {
  const { recipe, preview, commit } = develop;
  const sliderProps = { recipe, disabled, onPreview: preview, onCommit: commit };
  const changed = (keys: AdjustmentKey[]) => keys.some((k) => recipe[k] !== DEFAULT_RECIPE[k]);
  /** Resets one section's sliders. */
  const resetButton = (label: string, keys: AdjustmentKey[]) => (
    <button
      type="button"
      className="small-button"
      disabled={disabled || !changed(keys)}
      onClick={() =>
        commit({ ...recipe, ...Object.fromEntries(keys.map((k) => [k, DEFAULT_RECIPE[k]])) })
      }
      aria-label={`Reset ${label}`}
    >
      Reset
    </button>
  );
  const basicKeys = SLIDER_SECTIONS.flatMap((s) => s.sliders.map((spec) => spec.key));
  const mixerKeys = groupKeys('colorMixer');
  const gradingKeys = groupKeys('colorGrading');
  const curveChanged = !isLinearCurve(recipe.toneCurve);

  return (
    <>
      <CollapsibleSection id="basic" title="Basic" defaultOpen changed={changed(basicKeys)}>
        {SLIDER_SECTIONS.map((section) => (
          <div key={section.title} className="slider-group">
            <h4 className="slider-group-title">{section.title}</h4>
            {section.sliders.map((spec) => (
              <Slider key={spec.key} spec={spec} {...sliderProps} />
            ))}
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        id="toneCurve"
        title="Tone curve"
        changed={curveChanged}
        actions={
          <button
            type="button"
            className="small-button"
            disabled={disabled || !curveChanged}
            onClick={() => commit({ ...recipe, toneCurve: LINEAR_CURVE })}
            aria-label="Reset Tone curve"
          >
            Reset
          </button>
        }
      >
        <ToneCurveEditor
          curve={recipe.toneCurve}
          disabled={disabled}
          onPreview={(toneCurve) => preview({ ...recipe, toneCurve })}
          onCommit={(toneCurve) => commit({ ...recipe, toneCurve })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        id="colorMixer"
        title="Colour mixer"
        changed={changed(mixerKeys)}
        actions={resetButton('Colour mixer', mixerKeys)}
      >
        <ColorMixer {...sliderProps} />
      </CollapsibleSection>

      <CollapsibleSection
        id="colorGrading"
        title="Colour grading"
        changed={changed(gradingKeys)}
        actions={resetButton('Colour grading', gradingKeys)}
      >
        <ColorGrading {...sliderProps} />
      </CollapsibleSection>
    </>
  );
}
