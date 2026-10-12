interface TopBarProps {
  showLibrary: boolean;
  showDevelop: boolean;
  onToggleLibrary: () => void;
  onToggleDevelop: () => void;
  onOpenDiagnostics: () => void;
  onExport: () => void;
  canExport: boolean;
}

export function TopBar({
  showLibrary,
  showDevelop,
  onToggleLibrary,
  onToggleDevelop,
  onOpenDiagnostics,
  onExport,
  canExport,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar-group">
        <button
          type="button"
          className="icon-button"
          aria-label={showLibrary ? 'Hide library panel' : 'Show library panel'}
          aria-pressed={showLibrary}
          onClick={onToggleLibrary}
        >
          ☰
        </button>
        <span className="brand">Chitra</span>
      </div>

      <nav className="module-tabs" aria-label="Modules">
        <span className="module-tab module-tab-active" aria-current="page">
          Develop
        </span>
        <span className="module-tab module-tab-disabled" title="Video editing arrives in Phase 6">
          Video
        </span>
      </nav>

      <div className="top-bar-group">
        <button type="button" className="button top-bar-secondary" onClick={onOpenDiagnostics}>
          System check
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={onExport}
          disabled={!canExport}
          title="Save the edited photo as JPEG or TIFF (Ctrl/⌘ E)"
        >
          Export…
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={showDevelop ? 'Hide develop panel' : 'Show develop panel'}
          aria-pressed={showDevelop}
          onClick={onToggleDevelop}
        >
          ◧
        </button>
      </div>
    </header>
  );
}
