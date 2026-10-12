/**
 * A photo ready to draw on screen: full-resolution tiles plus a smaller "overview" copy.
 *
 * The overview (at most `OVERVIEW_MAX` pixels on the long edge) is drawn when the
 * photo is zoomed out, which looks smoother and is faster than scaling down the
 * tiles. When zoomed in, the full-resolution tiles are drawn.
 */
import type { DisplayColorSpace } from '../color/colorSpaces';
import type { TileBuffer } from '../decode/convertMessages';
import { computeHistogram, type Histogram } from './histogram';
import { tileGrid, type TileRect } from './tiles';

export const OVERVIEW_MAX = 3072;

/** Histogram sampling target: about a million pixels is plenty. */
const HISTOGRAM_SAMPLE_PIXELS = 1_000_000;

export type Rotation = 0 | 90 | 180 | 270;

export interface TiledImage {
  /** Size before rotation. */
  width: number;
  height: number;
  /** Clockwise rotation applied when drawing. */
  rotation: Rotation;
  tiles: { rect: TileRect; bitmap: ImageBitmap }[];
  overview: ImageBitmap;
  /** overview.width / width */
  overviewScale: number;
  histogram: Histogram;
  close(): void;
}

/** Splits a decoded bitmap (e.g. a JPEG) into tiles. Takes ownership of `bitmap`. */
export async function tiledImageFromBitmap(
  bitmap: ImageBitmap,
  rotation: Rotation,
  displaySpace: DisplayColorSpace,
): Promise<TiledImage> {
  const { width, height } = bitmap;
  try {
    const tiles = await Promise.all(
      tileGrid(width, height).map(async (rect) => ({
        rect,
        bitmap: await createImageBitmap(bitmap, rect.x, rect.y, rect.width, rect.height),
      })),
    );
    return finish(width, height, rotation, tiles, displaySpace);
  } finally {
    bitmap.close();
  }
}

/** Builds an image from RGBA tile buffers produced by the conversion worker. */
export async function tiledImageFromBuffers(
  width: number,
  height: number,
  buffers: TileBuffer[],
  colorSpace: DisplayColorSpace,
  rotation: Rotation,
  displaySpace: DisplayColorSpace,
): Promise<TiledImage> {
  const tiles = await Promise.all(
    buffers.map(async ({ rect, data }) => ({
      rect,
      bitmap: await createImageBitmap(new ImageData(data, rect.width, rect.height, { colorSpace })),
    })),
  );
  return finish(width, height, rotation, tiles, displaySpace);
}

async function finish(
  width: number,
  height: number,
  rotation: Rotation,
  tiles: TiledImage['tiles'],
  displaySpace: DisplayColorSpace,
): Promise<TiledImage> {
  const overviewScale = Math.min(1, OVERVIEW_MAX / Math.max(width, height));
  const ow = Math.max(1, Math.round(width * overviewScale));
  const oh = Math.max(1, Math.round(height * overviewScale));
  const canvas = new OffscreenCanvas(ow, oh);
  const ctx = canvas.getContext('2d', { colorSpace: displaySpace });
  if (!ctx) throw new Error('Could not create a drawing surface.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const { rect, bitmap } of tiles) {
    ctx.drawImage(
      bitmap,
      rect.x * overviewScale,
      rect.y * overviewScale,
      rect.width * overviewScale,
      rect.height * overviewScale,
    );
  }
  const pixels = ctx.getImageData(0, 0, ow, oh, { colorSpace: displaySpace }).data;
  const histogram = computeHistogram(pixels, (ow * oh) / HISTOGRAM_SAMPLE_PIXELS);
  const overview = canvas.transferToImageBitmap();

  return {
    width,
    height,
    rotation,
    tiles,
    overview,
    overviewScale: ow / width,
    histogram,
    close() {
      overview.close();
      for (const tile of tiles) tile.bitmap.close();
    },
  };
}
