/**
 * Library backup and restore. The backup file holds ratings, keywords, edits and presets
 * — not the photos themselves.
 */
import { useRef } from 'react';

interface BackupMenuProps {
  onBackup: () => void;
  onRestore: (file: File) => void;
  /** Show a gentle reminder next to the button. */
  remind: boolean;
}

export function BackupMenu({ onBackup, onRestore, remind }: BackupMenuProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="backup-menu">
      <button
        type="button"
        className={`small-button${remind ? ' small-button-on' : ''}`}
        onClick={onBackup}
        title="Save ratings, keywords, edits and presets to a file"
      >
        {remind ? 'Back up library ⚠' : 'Back up'}
      </button>
      <button
        type="button"
        className="small-button"
        onClick={() => input.current?.click()}
        title="Restore ratings, keywords, edits and presets from a backup file"
      >
        Restore…
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="restore-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onRestore(file);
          event.target.value = '';
        }}
      />
    </span>
  );
}
