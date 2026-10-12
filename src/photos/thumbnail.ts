/**
 * Small thumbnails for the Library panel, returned as object URLs for `<img>` tags.
 * RAW files use their embedded JPEG, so no full decode is needed.
 */
import { decoderFor } from '../decode/fileTypes';
import { openRaw } from '../decode/raw';
import type { Rotation } from '../render/tiledImage';

export const THUMBNAIL_SIZE = 320;

export async function makeThumbnail(file: File): Promise<string | null> {
  const kind = decoderFor(file.name);
  if (kind === 'browser') return shrink(await createImageBitmap(file), 0);
  if (kind === 'raw') {
    const raw = await openRaw(await file.arrayBuffer());
    try {
      if (!raw.preview) return null;
      return shrink(await createImageBitmap(raw.preview), raw.previewRotation);
    } finally {
      raw.dispose();
    }
  }
  return null; // TIFF thumbnails come with the catalog in Phase 3.
}

async function shrink(bitmap: ImageBitmap, rotation: Rotation): Promise<string> {
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
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    return URL.createObjectURL(blob);
  } finally {
    bitmap.close();
  }
}
