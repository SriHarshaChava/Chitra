import { describe, expect, it } from 'vitest';
import { buildEncodeLut, encodeSrgb, rec2020To, type Matrix3 } from '../color/colorSpaces';
import { clippedShares, computeHistogram } from './histogram';
import { convertLinearRgb16, copyRgbaRect } from './pixelConvert';
import { tileGrid } from './tiles';

const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// Contrast 0 so expected values are plain sRGB encoding.
const lut = buildEncodeLut(0);

describe('tileGrid', () => {
  it('covers a 24 MP photo with overlapping tiles', () => {
    const tiles = tileGrid(6000, 4000, 2048, 2);
    expect(tiles).toHaveLength(6);
    expect(tiles[0]).toEqual({ x: 0, y: 0, width: 2050, height: 2050 });
    expect(tiles.at(-1)).toEqual({ x: 4096, y: 2048, width: 1904, height: 1952 });
  });

  it('uses a single tile for a small image', () => {
    expect(tileGrid(100, 50)).toEqual([{ x: 0, y: 0, width: 100, height: 50 }]);
  });
});

describe('convertLinearRgb16', () => {
  it('encodes linear values with the sRGB curve', () => {
    const v = Math.round(0.18 * 65535);
    const src = new Uint16Array([0, 0, 0, v, v, v, 65535, 65535, 65535]);
    const out = convertLinearRgb16(src, 3, { x: 0, y: 0, width: 3, height: 1 }, IDENTITY, lut);
    expect(Array.from(out)).toEqual([
      0,
      0,
      0,
      255,
      ...Array(3).fill(Math.round(encodeSrgb(0.18) * 255)),
      255,
      255,
      255,
      255,
      255,
    ]);
  });

  it('keeps neutral grey neutral when converting Rec.2020 to Display P3', () => {
    const v = 20000;
    const src = new Uint16Array([v, v, v]);
    const out = convertLinearRgb16(
      src,
      1,
      { x: 0, y: 0, width: 1, height: 1 },
      rec2020To('display-p3'),
      lut,
    );
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
  });

  it('clips out-of-gamut colours instead of wrapping around', () => {
    const src = new Uint16Array([65535, 0, 0]);
    const out = convertLinearRgb16(
      src,
      1,
      { x: 0, y: 0, width: 1, height: 1 },
      rec2020To('srgb'),
      lut,
    );
    expect(out[0]).toBe(255);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });

  it('reads the requested sub-rectangle', () => {
    // 2×2 image, pick the bottom-right pixel.
    const src = new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 65535, 65535, 65535]);
    const out = convertLinearRgb16(src, 2, { x: 1, y: 1, width: 1, height: 1 }, IDENTITY, lut);
    expect(Array.from(out)).toEqual([255, 255, 255, 255]);
  });
});

describe('copyRgbaRect', () => {
  it('copies rows from the right place', () => {
    const src = new Uint8ClampedArray(3 * 2 * 4).map((_, i) => i);
    const out = copyRgbaRect(src, 3, { x: 1, y: 1, width: 2, height: 1 });
    expect(Array.from(out)).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
  });
});

describe('computeHistogram', () => {
  it('counts each channel', () => {
    const h = computeHistogram(new Uint8ClampedArray([255, 0, 10, 255, 255, 255, 255, 255]));
    expect(h.total).toBe(2);
    expect(h.red[255]).toBe(2);
    expect(h.green[0]).toBe(1);
    expect(h.blue[10]).toBe(1);
    expect(h.luminance[255]).toBe(1);
  });

  it('samples with a step', () => {
    expect(computeHistogram(new Uint8ClampedArray(400), 10).total).toBe(10);
  });

  it('reports clipping', () => {
    const h = computeHistogram(
      new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 50, 50, 50, 255, 60, 60, 60, 255]),
    );
    expect(clippedShares(h)).toEqual({ shadows: 0.25, highlights: 0.25 });
  });
});
