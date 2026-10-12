export function LibraryPanel() {
  return (
    <aside className="panel panel-left" aria-label="Library">
      <h2 className="panel-title">Library</h2>
      <button type="button" className="button button-block" disabled>
        Open photos…
      </button>
      <p className="panel-note">
        Opening Nikon NEF, JPEG, PNG and TIFF files arrives in Phase 1. Your originals are never
        modified.
      </p>
    </aside>
  );
}
