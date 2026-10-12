/**
 * Background worker that prepares decoded pixels for the GPU.
 *
 * Splitting a 24-megapixel photo into tiles and building smaller versions takes a
 * noticeable fraction of a second. Doing it here keeps the interface responsive.
 */
import UTIF from 'utif';
import { toHalf } from '../gpu/halfFloat';
import {
  copyRgbaRect,
  downscaleUint16,
  floatToHalfBits,
  halveFloat,
  uint16RectToFloat,
  uint16RectToHalf,
  type RgbImage,
} from '../render/pixelConvert';
import { tileGrid } from '../render/tiles';
import type { ConvertRequest, ConvertResponse, HalfLevel, HalfTile } from './convertMessages';

/** Long edge of the overview used when the photo is zoomed out. */
export const OVERVIEW_MAX = 3072;
/** Smallest overview level kept (the GPU interpolates below that). */
const OVERVIEW_MIN = 32;

const toHalfLevel = (img: RgbImage<Float32Array>): HalfLevel => ({
  width: img.width,
  height: img.height,
  data: floatToHalfBits(img.data, toHalf),
});

function handle(request: ConvertRequest): ConvertResponse {
  if (request.type === 'linear-rec2020') {
    const { width, height, data } = request;
    const tiles: HalfTile[] = tileGrid(width, height).map(({ core, padded }) => ({
      core,
      padded,
      levels: [
        { width: padded.width, height: padded.height, data: uint16RectToHalf(data, width, padded) },
        toHalfLevel(halveFloat(uint16RectToFloat(data, width, padded))),
      ],
    }));

    const scale = Math.min(1, OVERVIEW_MAX / Math.max(width, height));
    let level = downscaleUint16(
      data,
      width,
      height,
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
    const overview: HalfLevel[] = [toHalfLevel(level)];
    while (Math.max(level.width, level.height) > OVERVIEW_MIN) {
      level = halveFloat(level);
      overview.push(toHalfLevel(level));
    }
    return { id: request.id, ok: true, type: 'linear-rec2020', width, height, tiles, overview };
  }

  const ifds = UTIF.decode(request.bytes);
  // Multi-page TIFFs may contain small previews; use the largest image.
  const main = ifds.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  UTIF.decodeImage(request.bytes, main, ifds);
  const rgba = UTIF.toRGBA8(main);
  const { width, height } = main;
  const tiles = tileGrid(width, height).map(({ core, padded }) => ({
    core,
    padded,
    data: copyRgbaRect(rgba, width, padded),
  }));
  return { id: request.id, ok: true, type: 'tiff', width, height, tiles };
}

function transferables(response: ConvertResponse): Transferable[] {
  if (!response.ok) return [];
  if (response.type === 'tiff') return response.tiles.map((t) => t.data.buffer);
  return [
    ...response.tiles.flatMap((t) => t.levels.map((l) => l.data.buffer)),
    ...response.overview.map((l) => l.data.buffer),
  ];
}

self.onmessage = (event: MessageEvent<ConvertRequest>) => {
  let response: ConvertResponse;
  try {
    response = handle(event.data);
  } catch (error) {
    response = { id: event.data.id, ok: false, error: String(error) };
  }
  (self as unknown as Worker).postMessage(response, transferables(response));
};
