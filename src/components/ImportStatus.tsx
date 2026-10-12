/** Small notice at the bottom showing import progress, then a summary. */
import { useEffect } from 'react';
import type { ImportProgress, ImportReport } from '../catalog/useCatalog';

interface ImportStatusProps {
  progress: ImportProgress | null;
  report: ImportReport | null;
  onDismiss: () => void;
}

/** A summary with nothing to warn about disappears by itself after this long. */
const AUTO_HIDE_MS = 4000;

export function ImportStatus({ progress, report, onDismiss }: ImportStatusProps) {
  const clean =
    report && report.duplicates.length + report.unsupported.length + report.failed.length === 0;
  useEffect(() => {
    if (!clean) return;
    const timer = window.setTimeout(onDismiss, AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [clean, onDismiss]);

  if (progress) {
    return (
      <div className="toast" role="status">
        <span className="spinner spinner-small" aria-hidden="true" />
        Importing {progress.done + 1} of {progress.total}
        {progress.current ? ` · ${progress.current}` : ''}
      </div>
    );
  }
  if (!report) return null;
  const parts = [
    report.imported > 0 && `Imported ${report.imported} photo${report.imported > 1 ? 's' : ''}.`,
    report.duplicates.length > 0 && `Already in the library: ${report.duplicates.join(', ')}.`,
    report.unsupported.length > 0 && `Not supported: ${report.unsupported.join(', ')}.`,
    report.failed.length > 0 && `Could not import: ${report.failed.join(', ')}.`,
  ].filter(Boolean);
  return (
    <div className={`toast${clean ? '' : ' toast-warning'}`} role="status">
      <span>{parts.join(' ')}</span>
      <button
        type="button"
        className="icon-button toast-close"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}
