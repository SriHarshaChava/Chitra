/**
 * A decoded photo, ready to be uploaded to the GPU.
 *
 * - `linear`: developed RAW data — linear Rec.2020, half floats, editable.
 * - `rendered`: an already-finished image (JPEG, PNG, TIFF, or a RAW file's embedded
 *   preview) as browser bitmaps in sRGB.
 *
 * After upload the CPU copy is released with `release()` to save memory; the GPU
 * copy is what gets drawn and edited.
 */
import type { HalfLevel, HalfTile } from '../decode/convertMessages';
import type { Rect } from './tiles';
import { tileGrid } from './tiles';

export type Rotation = 0 | 90 | 180 | 270;

interface SourceBase {
  /** Size before rotation. */
  width: number;
  height: number;
  /** Clockwise rotation applied when drawing. */
  rotation: Rotation;
  /** True for a RAW file's embedded camera preview (shown while the RAW develops). */
  isPreview: boolean;
  /** Frees the CPU-side pixel data. Safe to call more than once. */
  release(): void;
}

export interface LinearSource extends SourceBase {
  kind: 'linear';
  tiles: HalfTile[];
  overview: HalfLevel[];
}

export interface RenderedTile {
  core: Rect;
  padded: Rect;
  bitmap: ImageBitmap;
}

export interface RenderedSource extends SourceBase {
  kind: 'rendered';
  tiles: RenderedTile[];
  overview: ImageBitmap;
}

export type SourceImage = LinearSource | RenderedSource;

/** Long edge of the overview bitmap for rendered images. */
const RENDERED_OVERVIEW_MAX = 3072;

export function linearSource(
  width: number,
  height: number,
  tiles: HalfTile[],
  overview: HalfLevel[],
  rotation: Rotation,
): LinearSource {
  const source: LinearSource = {
    kind: 'linear',
    width,
    height,
    rotation,
    isPreview: false,
    tiles,
    overview,
    release() {
      // Drop references so the garbage collector can free the arrays.
      source.tiles = [];
      source.overview = [];
    },
  };
  return source;
}

/** Splits a decoded bitmap into tiles. Takes ownership of `bitmap`. */
export async function renderedSourceFromBitmap(
  bitmap: ImageBitmap,
  rotation: Rotation,
  isPreview: boolean,
): Promise<RenderedSource> {
  try {
    const tiles = await Promise.all(
      tileGrid(bitmap.width, bitmap.height).map(async ({ core, padded }) => ({
        core,
        padded,
        bitmap: await createImageBitmap(bitmap, padded.x, padded.y, padded.width, padded.height),
      })),
    );
    return renderedSource(bitmap.width, bitmap.height, tiles, rotation, isPreview);
  } finally {
    bitmap.close();
  }
}

export async function renderedSourceFromTiles(
  width: number,
  height: number,
  tiles: { core: Rect; padded: Rect; data: Uint8ClampedArray<ArrayBuffer> }[],
): Promise<RenderedSource> {
  const bitmaps = await Promise.all(
    tiles.map(async ({ core, padded, data }) => ({
      core,
      padded,
      bitmap: await createImageBitmap(new ImageData(data, padded.width, padded.height)),
    })),
  );
  return renderedSource(width, height, bitmaps, 0, false);
}

async function renderedSource(
  width: number,
  height: number,
  tiles: RenderedTile[],
  rotation: Rotation,
  isPreview: boolean,
): Promise<RenderedSource> {
  const scale = Math.min(1, RENDERED_OVERVIEW_MAX / Math.max(width, height));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale)),
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const { core, padded, bitmap } of tiles) {
    // Draw only the core part of each tile so borders are not drawn twice.
    ctx.drawImage(
      bitmap,
      core.x - padded.x,
      core.y - padded.y,
      core.width,
      core.height,
      core.x * scale,
      core.y * scale,
      core.width * scale,
      core.height * scale,
    );
  }
  const source: RenderedSource = {
    kind: 'rendered',
    width,
    height,
    rotation,
    isPreview,
    tiles,
    overview: canvas.transferToImageBitmap(),
    release() {
      for (const tile of source.tiles) tile.bitmap.close();
      source.overview.close();
      source.tiles = [];
    },
  };
  return source;
}
