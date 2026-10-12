export function Viewer() {
  return (
    <main className="viewer" aria-label="Photo viewer">
      <div className="viewer-empty">
        <svg className="viewer-mark" viewBox="0 0 48 48" aria-hidden="true">
          <rect x="4" y="9" width="40" height="30" rx="3" />
          <path d="M8 35l10-12 8 9 5-6 9 9" />
          <circle cx="33" cy="17" r="3" />
        </svg>
        <p className="viewer-title">No photo open</p>
        <p className="muted">
          Chitra is a free, local-first photo and video editor. Photos stay on this device.
        </p>
      </div>
    </main>
  );
}
