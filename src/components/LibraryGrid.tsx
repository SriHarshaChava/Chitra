/**
 * The Library grid: every photo as a thumbnail with its rating, flag and label.
 * Click to select (Ctrl/⌘ to add, Shift for a range), double-click to edit.
 */
import type { CatalogPhoto } from '../catalog/types';
import { RatingStars } from './PhotoMeta';

interface LibraryGridProps {
  photos: CatalogPhoto[];
  thumbnails: Record<string, string>;
  selected: ReadonlySet<string>;
  activeId: string | null;
  onSelect: (id: string, mode: 'single' | 'toggle' | 'range') => void;
  onOpen: (id: string) => void;
  onImport: () => void;
  emptyBecauseFiltered: boolean;
}

export function LibraryGrid({
  photos,
  thumbnails,
  selected,
  activeId,
  onSelect,
  onOpen,
  onImport,
  emptyBecauseFiltered,
}: LibraryGridProps) {
  if (photos.length === 0) {
    return (
      <div className="viewer-overlay-center library-empty">
        <p className="viewer-title">
          {emptyBecauseFiltered ? 'No photos match the filters' : 'Your library is empty'}
        </p>
        {!emptyBecauseFiltered && (
          <>
            <p className="muted">
              Import Nikon NEF, JPEG, PNG or TIFF files. Chitra keeps a copy in this browser so your
              photos and edits are here next time.
            </p>
            <button type="button" className="button button-primary" onClick={onImport}>
              Import photos…
            </button>
          </>
        )}
      </div>
    );
  }
  return (
    <ul className="library-grid" aria-label="Photos" role="listbox" aria-multiselectable="true">
      {photos.map((photo) => {
        const isSelected = selected.has(photo.id);
        return (
          <li
            key={photo.id}
            role="option"
            aria-selected={isSelected}
            className={`grid-cell${isSelected ? ' grid-cell-selected' : ''}${
              photo.id === activeId ? ' grid-cell-active' : ''
            }${photo.flag === 'reject' ? ' grid-cell-rejected' : ''}`}
            onClick={(event) =>
              onSelect(
                photo.id,
                event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'single',
              )
            }
            onDoubleClick={() => onOpen(photo.id)}
            title={photo.name}
          >
            <div className="grid-thumb">
              {thumbnails[photo.id] ? (
                <img src={thumbnails[photo.id]} alt="" draggable={false} />
              ) : (
                <span className="photo-thumb-placeholder">{photo.kind.toUpperCase()}</span>
              )}
              {photo.flag && (
                <span className={`grid-flag grid-flag-${photo.flag}`} aria-label={photo.flag}>
                  {photo.flag === 'pick' ? '⚑' : '✕'}
                </span>
              )}
              {photo.editedAt && (
                <span className="grid-edited" title="Edited" aria-label="edited" />
              )}
            </div>
            <div className="grid-caption">
              <span className="grid-name">{photo.name}</span>
              <span className="grid-meta">
                {photo.label && <span className={`label-dot label-${photo.label}`} />}
                <RatingStars value={photo.rating} size="small" />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
