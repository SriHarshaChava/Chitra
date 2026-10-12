/**
 * Pixel loops used by the background worker. They avoid allocations and function
 * calls inside the loops because they touch tens of millions of values.
 */
import { uint16ToHalfLut } from '../gpu/halfFloat';
import type { Rect } from './tiles';

/** RGB image, 3 values per pixel. */
export interface RgbImage<T extends Float32Array | Uint16Array> {
  width: number;
  height: number;
  data: T;
}

/** Copies a rectangle of 16-bit RGB samples and converts them to half-float bits. */
export function uint16RectToHalf(src: Uint16Array, srcWidth: number, rect: Rect): Uint16Array {
  const lut = uint16ToHalfLut();
  const out = new Uint16Array(rect.width * rect.height * 3);
  let o = 0;
  for (let row = 0; row < rect.height; row++) {
    let i = ((rect.y + row) * srcWidth + rect.x) * 3;
    const end = i + rect.width * 3;
    for (; i < end; i++) out[o++] = lut[src[i]!]!;
  }
  return out;
}

/** Copies a rectangle of 16-bit RGB samples as 0..1 floats. */
export function uint16RectToFloat(
  src: Uint16Array,
  srcWidth: number,
  rect: Rect,
): RgbImage<Float32Array> {
  const out = new Float32Array(rect.width * rect.height * 3);
  const norm = 1 / 65535;
  let o = 0;
  for (let row = 0; row < rect.height; row++) {
    let i = ((rect.y + row) * srcWidth + rect.x) * 3;
    const end = i + rect.width * 3;
    for (; i < end; i++) out[o++] = src[i]! * norm;
  }
  return { width: rect.width, height: rect.height, data: out };
}

/**
 * Shrinks a 16-bit RGB image by averaging blocks of pixels (an "area" or box filter).
 * Averaging linear light is physically correct: it is what a lower-resolution sensor
 * would have recorded. Output values are 0..1 floats.
 */
export function downscaleUint16(
  src: Uint16Array,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number,
): RgbImage<Float32Array> {
  const out = new Float32Array(outWidth * outHeight * 3);
  const sx = width / outWidth;
  const sy = height / outHeight;
  const norm = 1 / 65535;
  for (let oy = 0; oy < outHeight; oy++) {
    const y0 = Math.floor(oy * sy);
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor((oy + 1) * sy)));
    for (let ox = 0; ox < outWidth; ox++) {
      const x0 = Math.floor(ox * sx);
      const x1 = Math.max(x0 + 1, Math.min(width, Math.floor((ox + 1) * sx)));
      let r = 0,
        g = 0,
        b = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * width + x0) * 3;
        for (let x = x0; x < x1; x++, i += 3) {
          r += src[i]!;
          g += src[i + 1]!;
          b += src[i + 2]!;
        }
      }
      const scale = norm / ((y1 - y0) * (x1 - x0));
      const o = (oy * outWidth + ox) * 3;
      out[o] = r * scale;
      out[o + 1] = g * scale;
      out[o + 2] = b * scale;
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}

/** Halves an RGB float image (2×2 average), the way GPU mipmap levels are made. */
export function halveFloat(img: RgbImage<Float32Array>): RgbImage<Float32Array> {
  const width = Math.max(1, Math.floor(img.width / 2));
  const height = Math.max(1, Math.floor(img.height / 2));
  const out = new Float32Array(width * height * 3);
  const { data, width: w, height: h } = img;
  for (let y = 0; y < height; y++) {
    const y0 = Math.min(h - 1, y * 2);
    const y1 = Math.min(h - 1, y * 2 + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.min(w - 1, x * 2);
      const x1 = Math.min(w - 1, x * 2 + 1);
      const a = (y0 * w + x0) * 3;
      const b = (y0 * w + x1) * 3;
      const c = (y1 * w + x0) * 3;
      const d = (y1 * w + x1) * 3;
      const o = (y * width + x) * 3;
      for (let k = 0; k < 3; k++) {
        out[o + k] = (data[a + k]! + data[b + k]! + data[c + k]! + data[d + k]!) * 0.25;
      }
    }
  }
  return { width, height, data: out };
}

/** Float RGB → half-float bits. */
export function floatToHalfBits(data: Float32Array, toHalf: (v: number) => number): Uint16Array {
  const out = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = toHalf(data[i]!);
  return out;
}

/** Copies a rectangle out of an 8-bit RGBA image. */
export function copyRgbaRect(
  src: Uint8Array | Uint8ClampedArray,
  srcWidth: number,
  rect: Rect,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  const rowBytes = rect.width * 4;
  for (let row = 0; row < rect.height; row++) {
    const start = ((rect.y + row) * srcWidth + rect.x) * 4;
    out.set(src.subarray(start, start + rowBytes), row * rowBytes);
  }
  return out;
}
