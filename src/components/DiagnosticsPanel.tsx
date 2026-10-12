import { useEffect, useState } from 'react';
import { detectCapabilities, formatReport, type Capability } from '../platform/capabilities';
import { requestPersistentStorage } from '../platform/storage';

interface DiagnosticsPanelProps {
  onClose: () => void;
  /** Injectable for tests; defaults to checking the real browser. */
  detect?: () => Promise<Capability[]>;
  userAgent?: string;
}

const STATUS_TEXT = { yes: 'Supported', no: 'Not available', unknown: 'Unknown' } as const;

export function DiagnosticsPanel({
  onClose,
  detect = detectCapabilities,
  userAgent = navigator.userAgent,
}: DiagnosticsPanelProps) {
  const [capabilities, setCapabilities] = useState<Capability[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    detect().then((result) => {
      if (!cancelled) setCapabilities(result);
    });
    return () => {
      cancelled = true;
    };
  }, [detect, refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const persistent = capabilities?.find((c) => c.id === 'persistent-storage');

  async function copyReport() {
    if (!capabilities) return;
    try {
      await navigator.clipboard.writeText(formatReport(capabilities, userAgent));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function askForPersistence() {
    await requestPersistentStorage();
    setRefresh((n) => n + 1);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diagnostics-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="diagnostics-title">System check</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <p className="muted">
          What this browser supports. Everything runs on this device — no photos are uploaded.
        </p>

        {capabilities === null ? (
          <p className="muted">Checking…</p>
        ) : (
          <ul className="capability-list">
            {capabilities.map((c) => (
              <li key={c.id} className="capability">
                <span className={`status-dot status-${c.status}`} aria-hidden="true" />
                <div>
                  <div className="capability-row">
                    <span className="capability-label">{c.label}</span>
                    <span className={`status-text status-text-${c.status}`}>
                      {STATUS_TEXT[c.status]}
                    </span>
                  </div>
                  {c.detail && <div className="capability-detail">{c.detail}</div>}
                  <div className="capability-why">{c.why}</div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className="modal-footer">
          {persistent?.status === 'no' && (
            <button type="button" className="button" onClick={askForPersistence}>
              Request persistent storage
            </button>
          )}
          <button
            type="button"
            className="button button-primary"
            onClick={copyReport}
            disabled={!capabilities}
          >
            {copied ? 'Copied' : 'Copy report'}
          </button>
        </footer>
      </div>
    </div>
  );
}
