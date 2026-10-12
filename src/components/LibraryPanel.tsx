import type { PhotoEntry } from '../photos/usePhotoSession';

interface LibraryPanelProps {
  photos: PhotoEntry[];
  selectedId?: string;
  rejected: string[];
  onOpenFiles: () => void;
  onSelect: (id: string) => void;
}

export function LibraryPanel({
  photos,
  selectedId,
  rejected,
  onOpenFiles,
  onSelect,
}: LibraryPanelProps) {
  return (
    <aside className="panel panel-left" aria-label="Library">
      <h2 className="panel-title">Library</h2>
      <button type="button" className="button button-block" onClick={onOpenFiles}>
        Open photos…
      </button>

      {rejected.length > 0 && (
        <p className="panel-warning" role="status">
          Skipped unsupported file{rejected.length > 1 ? 's' : ''}: {rejected.join(', ')}
        </p>
      )}

      {photos.length === 0 ? (
        <p className="panel-note">
          Nikon NEF, JPEG, PNG and TIFF are supported. Photos are read on this device and your
          originals are never modified.
        </p>
      ) : (
        <ul className="photo-list" aria-label="Opened photos">
          {photos.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                className={`photo-item${photo.id === selectedId ? ' photo-item-selected' : ''}`}
                aria-current={photo.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(photo.id)}
              >
                <span className="photo-thumb">
                  {photo.thumbnailUrl ? (
                    <img src={photo.thumbnailUrl} alt="" />
                  ) : (
                    <span className="photo-thumb-placeholder">
                      {photo.kind === 'raw' ? 'RAW' : ''}
                    </span>
                  )}
                </span>
                <span className="photo-name">{photo.file.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
