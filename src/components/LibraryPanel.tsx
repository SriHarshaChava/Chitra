/** Left panel in Develop: the filtered photos as a vertical filmstrip. */
import type { CatalogPhoto } from '../catalog/types';
import { RatingStars } from './PhotoMeta';

interface LibraryPanelProps {
  photos: CatalogPhoto[];
  thumbnails: Record<string, string>;
  activeId: string | null;
  onImport: () => void;
  onSelect: (id: string) => void;
}

export function LibraryPanel({
  photos,
  thumbnails,
  activeId,
  onImport,
  onSelect,
}: LibraryPanelProps) {
  return (
    <aside className="panel panel-left" aria-label="Library">
      <h2 className="panel-title">Library</h2>
      <button type="button" className="button button-block" onClick={onImport}>
        Import photos…
      </button>
      {photos.length === 0 ? (
        <p className="panel-note">
          Nikon NEF, JPEG, PNG and TIFF are supported. Photos stay on this device and your originals
          are never modified.
        </p>
      ) : (
        <ul className="photo-list" aria-label="Opened photos">
          {photos.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                className={`photo-item${photo.id === activeId ? ' photo-item-selected' : ''}`}
                aria-current={photo.id === activeId ? 'true' : undefined}
                onClick={() => onSelect(photo.id)}
              >
                <span className="photo-thumb">
                  {thumbnails[photo.id] ? (
                    <img src={thumbnails[photo.id]} alt="" />
                  ) : (
                    <span className="photo-thumb-placeholder">{photo.kind.toUpperCase()}</span>
                  )}
                </span>
                <span className="photo-item-text">
                  <span className="photo-name">{photo.name}</span>
                  <RatingStars value={photo.rating} size="small" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
