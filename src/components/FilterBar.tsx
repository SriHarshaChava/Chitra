import { DEFAULT_FILTER, type LibraryFilter, type SortOrder } from '../catalog/filters';
import { COLOR_LABELS } from '../catalog/types';

interface FilterBarProps {
  filter: LibraryFilter;
  onChange: (filter: LibraryFilter) => void;
  shown: number;
  total: number;
}

const SORTS: { id: SortOrder; label: string }[] = [
  { id: 'taken', label: 'Capture time' },
  { id: 'imported', label: 'Import time' },
  { id: 'edited', label: 'Recently edited' },
  { id: 'rating', label: 'Rating' },
  { id: 'name', label: 'File name' },
];

export function FilterBar({ filter, onChange, shown, total }: FilterBarProps) {
  const set = (change: Partial<LibraryFilter>) => onChange({ ...filter, ...change });
  const active =
    filter.minRating > 0 || filter.flag !== 'all' || filter.label !== null || filter.text !== '';
  return (
    <div className="filter-bar" role="search">
      <input
        className="text-input filter-search"
        type="search"
        placeholder="Search names, camera, keywords…"
        aria-label="Search"
        value={filter.text}
        onChange={(event) => set({ text: event.target.value })}
      />
      <select
        aria-label="Minimum rating"
        value={filter.minRating}
        onChange={(event) => set({ minRating: Number(event.target.value) })}
      >
        <option value={0}>Any rating</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {'★'.repeat(n)} or more
          </option>
        ))}
      </select>
      <select
        aria-label="Flag"
        value={filter.flag}
        onChange={(event) => set({ flag: event.target.value as LibraryFilter['flag'] })}
      >
        <option value="all">All flags</option>
        <option value="pick">Picks</option>
        <option value="unflagged">Unflagged</option>
        <option value="reject">Rejected</option>
      </select>
      <select
        aria-label="Colour label"
        value={filter.label ?? ''}
        onChange={(event) => set({ label: (event.target.value || null) as LibraryFilter['label'] })}
      >
        <option value="">Any label</option>
        {COLOR_LABELS.map((label) => (
          <option key={label} value={label}>
            {label[0]!.toUpperCase() + label.slice(1)}
          </option>
        ))}
      </select>
      <select
        aria-label="Sort by"
        value={filter.sort}
        onChange={(event) => set({ sort: event.target.value as SortOrder })}
      >
        {SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <span className="filter-count" aria-live="polite">
        {shown === total ? `${total} photos` : `${shown} of ${total}`}
      </span>
      {active && (
        <button
          type="button"
          className="small-button"
          onClick={() => onChange({ ...DEFAULT_FILTER, sort: filter.sort })}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
