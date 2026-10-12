/**
 * Importing: copies a photo into the catalog with its shooting info and a thumbnail.
 * RAW files are opened once to read both (the embedded camera preview is the thumbnail).
 */
import { decoderFor } from '../decode/fileTypes';
import { mergeInfo, type PhotoInfo } from '../decode/photoInfo';
import { openRaw } from '../decode/raw';
import { DEFAULT_RECIPE } from '../develop/recipe';
import { loadRecipe, photoKey } from '../develop/recipeStore';
import { readExif } from '../photos/loadPhoto';
import type { Rotation } from '../render/sourceImage';
import { addPhoto, putThumbnail } from './db';
import type { CatalogPhoto } from './types';

export const THUMBNAIL_SIZE = 400;

export type ImportOutcome =
  | { status: 'imported'; photo: CatalogPhoto; thumbnail: Blob | null }
  | { status: 'duplicate' | 'unsupported'; name: string };

export function isDuplicate(file: File, existing: CatalogPhoto[]): boolean {
  return existing.some(
    (p) => p.name === file.name && p.size === file.size && p.lastModified === file.lastModified,
  );
}

export async function importFile(file: File, existing: CatalogPhoto[]): Promise<ImportOutcome> {
  const kind = decoderFor(file.name);
  if (!kind) return { status: 'unsupported', name: file.name };
  if (isDuplicate(file, existing)) return { status: 'duplicate', name: file.name };

  const { info, thumbnail } = await analyze(file, kind);
  const photo: CatalogPhoto = {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    kind,
    importedAt: Date.now(),
    info,
    rating: 0,
    flag: null,
    label: null,
    keywords: [],
    // Edits made in Phase 2 were remembered per file; bring them along.
    recipe: loadRecipe(photoKey(file)) ?? DEFAULT_RECIPE,
  };
  await addPhoto(photo, file);
  if (thumbnail) await putThumbnail(photo.id, thumbnail);
  return { status: 'imported', photo, thumbnail };
}

async function analyze(
  file: File,
  kind: NonNullable<ReturnType<typeof decoderFor>>,
): Promise<{ info: PhotoInfo; thumbnail: Blob | null }> {
  const exif = await readExif(file);
  if (kind === 'raw') {
    const raw = await openRaw(await file.arrayBuffer());
    try {
      const thumbnail = raw.preview
        ? await shrink(await createImageBitmap(raw.preview), raw.previewRotation)
        : null;
      return { info: mergeInfo(raw.info, exif), thumbnail };
    } finally {
      raw.dispose();
    }
  }
  if (kind === 'browser') {
    const bitmap = await createImageBitmap(file);
    const info = { ...exif, width: bitmap.width, height: bitmap.height };
    return { info, thumbnail: await shrink(bitmap, 0) };
  }
  // TIFF: the thumbnail is made from the developed photo when it is first opened.
  return { info: exif, thumbnail: null };
}

/** Draws a bitmap at thumbnail size (rotated upright) and returns a JPEG. */
export async function shrink(bitmap: ImageBitmap, rotation: Rotation): Promise<Blob> {
  try {
    const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const sideways = rotation % 180 !== 0;
    const canvas = new OffscreenCanvas(sideways ? h : w, sideways ? w : h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  } finally {
    bitmap.close();
  }
}
