/** Filtering and sorting the library. Pure functions, easy to test. */
import type { CatalogPhoto, ColorLabel, Flag } from './types';

export type FlagFilter = 'all' | 'pick' | 'reject' | 'unflagged';
export type SortOrder = 'taken' | 'imported' | 'name' | 'rating' | 'edited';

export interface LibraryFilter {
  /** Show photos with at least this many stars (0 = all). */
  minRating: number;
  flag: FlagFilter;
  /** null = any label. */
  label: ColorLabel;
  /** Matches file name, camera, lens and keywords. */
  text: string;
  sort: SortOrder;
}

export const DEFAULT_FILTER: LibraryFilter = {
  minRating: 0,
  flag: 'all',
  label: null,
  text: '',
  sort: 'taken',
};

function matchesFlag(flag: Flag, filter: FlagFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unflagged') return flag === null;
  return flag === filter;
}

function matchesText(photo: CatalogPhoto, text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [photo.name, photo.info.camera, photo.info.lens, ...photo.keywords]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

const takenTime = (p: CatalogPhoto) =>
  p.info.takenAt instanceof Date ? p.info.takenAt.getTime() : p.lastModified;

const COMPARE: Record<SortOrder, (a: CatalogPhoto, b: CatalogPhoto) => number> = {
  taken: (a, b) => takenTime(a) - takenTime(b),
  imported: (a, b) => a.importedAt - b.importedAt,
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
  rating: (a, b) => b.rating - a.rating,
  edited: (a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0),
};

export function applyFilter(photos: CatalogPhoto[], filter: LibraryFilter): CatalogPhoto[] {
  return photos
    .filter(
      (p) =>
        p.rating >= filter.minRating &&
        matchesFlag(p.flag, filter.flag) &&
        (filter.label === null || p.label === filter.label) &&
        matchesText(p, filter.text),
    )
    .sort(
      (a, b) =>
        COMPARE[filter.sort](a, b) || a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
}

/** Turns "bird, Kingfisher  ,river" into ["bird", "kingfisher", "river"] (no duplicates). */
export function parseKeywords(input: string): string[] {
  const words = input
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(words)];
}
