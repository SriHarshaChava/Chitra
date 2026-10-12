/**
 * Per-pixel conversion loops. These run inside a Web Worker for big photos, so they
 * avoid allocations and function calls inside the loops.
 */
import { ENCODE_LUT_SIZE, type Matrix3 } from '../color/colorSpaces';
import type { TileRect } from './tiles';

/**
 * Converts part of a linear 16-bit RGB image (3 values per pixel, e.g. LibRaw output in
 * linear Rec.2020) into display-ready 8-bit RGBA.
 *
 * @param matrix linear source RGB → linear display RGB
 * @param lut    encoding lookup table from `buildEncodeLut`
 */
export function convertLinearRgb16(
  src: Uint16Array,
  srcWidth: number,
  rect: TileRect,
  matrix: Matrix3,
  lut: Uint8Array,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  // Fold the 16-bit → 0..1 scaling and the LUT index scaling into the matrix.
  const k = (ENCODE_LUT_SIZE - 1) / 65535;
  const m0 = matrix[0] * k,
    m1 = matrix[1] * k,
    m2 = matrix[2] * k;
  const m3 = matrix[3] * k,
    m4 = matrix[4] * k,
    m5 = matrix[5] * k;
  const m6 = matrix[6] * k,
    m7 = matrix[7] * k,
    m8 = matrix[8] * k;
  const maxIndex = ENCODE_LUT_SIZE - 1;

  let o = 0;
  for (let row = 0; row < rect.height; row++) {
    let i = ((rect.y + row) * srcWidth + rect.x) * 3;
    for (let col = 0; col < rect.width; col++, i += 3, o += 4) {
      const r = src[i]!,
        g = src[i + 1]!,
        b = src[i + 2]!;
      let dr = m0 * r + m1 * g + m2 * b;
      let dg = m3 * r + m4 * g + m5 * b;
      let db = m6 * r + m7 * g + m8 * b;
      // Colours outside the display gamut are clipped (better gamut mapping comes later).
      dr = dr < 0 ? 0 : dr > maxIndex ? maxIndex : dr;
      dg = dg < 0 ? 0 : dg > maxIndex ? maxIndex : dg;
      db = db < 0 ? 0 : db > maxIndex ? maxIndex : db;
      out[o] = lut[(dr + 0.5) | 0]!;
      out[o + 1] = lut[(dg + 0.5) | 0]!;
      out[o + 2] = lut[(db + 0.5) | 0]!;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Copies a rectangle out of an 8-bit RGBA image. */
export function copyRgbaRect(
  src: Uint8Array | Uint8ClampedArray,
  srcWidth: number,
  rect: TileRect,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  const rowBytes = rect.width * 4;
  for (let row = 0; row < rect.height; row++) {
    const start = ((rect.y + row) * srcWidth + rect.x) * 4;
    out.set(src.subarray(start, start + rowBytes), row * rowBytes);
  }
  return out;
}
