/** Presets and copy/paste of settings, in the Develop panel. */
import type { Preset } from '../catalog/presets';

interface PresetsSectionProps {
  presets: Preset[];
  disabled: boolean;
  canPaste: boolean;
  onApply: (preset: Preset) => void;
  onDelete: (preset: Preset) => void;
  onSaveNew: () => void;
  onCopy: () => void;
  onPaste: () => void;
}

export function PresetsSection({
  presets,
  disabled,
  canPaste,
  onApply,
  onDelete,
  onSaveNew,
  onCopy,
  onPaste,
}: PresetsSectionProps) {
  return (
    <section className="panel-section" aria-label="Presets">
      <h3 className="section-title">Presets</h3>
      <div className="crop-buttons">
        <button
          type="button"
          className="small-button"
          onClick={onCopy}
          disabled={disabled}
          title="Copy settings (Ctrl/⌘ Shift C)"
        >
          Copy settings
        </button>
        <button
          type="button"
          className="small-button"
          onClick={onPaste}
          disabled={disabled || !canPaste}
          title="Paste settings (Ctrl/⌘ Shift V)"
        >
          Paste
        </button>
        <button type="button" className="small-button" onClick={onSaveNew} disabled={disabled}>
          Save as preset…
        </button>
      </div>
      <ul className="preset-list">
        {presets.map((preset) => (
          <li key={preset.id} className="preset-item">
            <button
              type="button"
              className="preset-apply"
              disabled={disabled}
              onClick={() => onApply(preset)}
            >
              {preset.name}
            </button>
            {!preset.builtIn && (
              <button
                type="button"
                className="icon-button preset-delete"
                aria-label={`Delete preset ${preset.name}`}
                onClick={() => onDelete(preset)}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
