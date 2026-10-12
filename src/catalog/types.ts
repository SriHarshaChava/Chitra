/** What the catalog remembers about each imported photo. */
import type { DecoderKind } from '../decode/fileTypes';
import type { PhotoInfo } from '../decode/photoInfo';
import type { Recipe } from '../develop/recipe';

export type Flag = 'pick' | 'reject' | null;
export type ColorLabel = 'red' | 'yellow' | 'green' | 'blue' | 'purple' | null;

export const COLOR_LABELS: Exclude<ColorLabel, null>[] = [
  'red',
  'yellow',
  'green',
  'blue',
  'purple',
];

export interface CatalogPhoto {
  /** Random unique id; also the key of the stored original and thumbnail. */
  id: string;
  name: string;
  size: number;
  lastModified: number;
  kind: DecoderKind;
  /** When the photo was added to Chitra (ms since 1970). */
  importedAt: number;
  info: PhotoInfo;
  /** 0 = unrated, 1–5 stars. */
  rating: number;
  flag: Flag;
  label: ColorLabel;
  keywords: string[];
  recipe: Recipe;
  /** When the recipe last changed (ms since 1970), if ever. */
  editedAt?: number;
}

/** Fields the user can change directly. */
export type PhotoChanges = Partial<
  Pick<CatalogPhoto, 'rating' | 'flag' | 'label' | 'keywords' | 'recipe' | 'editedAt' | 'info'>
>;
