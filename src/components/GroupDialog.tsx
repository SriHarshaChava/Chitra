/**
 * Choose which groups of settings to copy, or to include in a new preset.
 */
import { useEffect, useState } from 'react';
import { SETTINGS_GROUPS, type SettingsGroup } from '../develop/settingsGroups';

interface GroupDialogProps {
  title: string;
  confirmLabel: string;
  initialGroups: SettingsGroup[];
  /** Ask for a name too (for presets). */
  askName?: boolean;
  /** Groups that can't be chosen (presets don't store crops). */
  disabledGroups?: SettingsGroup[];
  onConfirm: (groups: SettingsGroup[], name: string) => void;
  onClose: () => void;
}

export function GroupDialog({
  title,
  confirmLabel,
  initialGroups,
  askName,
  disabledGroups = [],
  onConfirm,
  onClose,
}: GroupDialogProps) {
  const [groups, setGroups] = useState<SettingsGroup[]>(initialGroups);
  const [name, setName] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (id: SettingsGroup) =>
    setGroups((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const valid = groups.length > 0 && (!askName || name.trim().length > 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-dialog-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onConfirm(groups, name.trim());
        }}
      >
        <header className="modal-header">
          <h2 id="group-dialog-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        {askName && (
          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="text-input"
              value={name}
              autoFocus
              maxLength={80}
              placeholder="e.g. Golden hour birds"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        <fieldset className="export-group">
          <legend>Include</legend>
          {SETTINGS_GROUPS.filter((g) => !disabledGroups.includes(g.id)).map((group) => (
            <label key={group.id} className="check-row">
              <input
                type="checkbox"
                checked={groups.includes(group.id)}
                onChange={() => toggle(group.id)}
              />
              {group.label}
            </label>
          ))}
        </fieldset>
        <footer className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={!valid}>
            {confirmLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
