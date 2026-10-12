/**
 * Background worker that turns decoded pixel data into display-ready tiles.
 *
 * Converting 24 million pixels takes a noticeable fraction of a second. Doing it here,
 * off the main thread, keeps the interface responsive while a photo loads.
 */
import UTIF from 'utif';
import { buildEncodeLut, rec2020To, type DisplayColorSpace } from '../color/colorSpaces';
import { convertLinearRgb16, copyRgbaRect } from '../render/pixelConvert';
import { tileGrid } from '../render/tiles';
import type { ConvertRequest, ConvertResponse, TileBuffer } from './convertMessages';

const lut = buildEncodeLut();
const matrices: Record<DisplayColorSpace, ReturnType<typeof rec2020To>> = {
  srgb: rec2020To('srgb'),
  'display-p3': rec2020To('display-p3'),
};

function handle(request: ConvertRequest): ConvertResponse {
  if (request.type === 'linear-rec2020') {
    const { width, height, data, target } = request;
    const tiles: TileBuffer[] = tileGrid(width, height).map((rect) => ({
      rect,
      data: convertLinearRgb16(data, width, rect, matrices[target], lut),
    }));
    return { id: request.id, ok: true, width, height, colorSpace: target, tiles };
  }

  const ifds = UTIF.decode(request.bytes);
  // Multi-page TIFFs may contain small previews; use the largest image.
  const main = ifds.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  UTIF.decodeImage(request.bytes, main, ifds);
  const rgba = UTIF.toRGBA8(main);
  const { width, height } = main;
  const tiles: TileBuffer[] = tileGrid(width, height).map((rect) => ({
    rect,
    data: copyRgbaRect(rgba, width, rect),
  }));
  // UTIF does not read embedded colour profiles, so TIFFs are treated as sRGB.
  return { id: request.id, ok: true, width, height, colorSpace: 'srgb', tiles };
}

self.onmessage = (event: MessageEvent<ConvertRequest>) => {
  let response: ConvertResponse;
  try {
    response = handle(event.data);
  } catch (error) {
    response = { id: event.data.id, ok: false, error: String(error) };
  }
  const transfer = response.ok ? response.tiles.map((t) => t.data.buffer) : [];
  (self as unknown as Worker).postMessage(response, transfer);
};
