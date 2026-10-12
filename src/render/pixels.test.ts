import { describe, expect, it } from 'vitest';
import { fromHalf, toHalf, uint16ToHalfLut } from '../gpu/halfFloat';
import { clippedShares, computeHistogram } from './histogram';
import {
  copyRgbaRect,
  downscaleUint16,
  halveFloat,
  uint16RectToFloat,
  uint16RectToHalf,
} from './pixelConvert';
import { tileGrid } from './tiles';

describe('tileGrid', () => {
  it('covers a 24 MP photo with bordered tiles', () => {
    const tiles = tileGrid(6000, 4000, 2048, 4);
    expect(tiles).toHaveLength(6);
    expect(tiles[0]).toEqual({
      core: { x: 0, y: 0, width: 2048, height: 2048 },
      padded: { x: 0, y: 0, width: 2052, height: 2052 },
    });
    expect(tiles[4]).toEqual({
      core: { x: 2048, y: 2048, width: 2048, height: 1952 },
      padded: { x: 2044, y: 2044, width: 2056, height: 1956 },
    });
  });

  it('cores cover every pixel exactly once', () => {
    const tiles = tileGrid(5000, 3000, 1024, 4);
    const area = tiles.reduce((sum, t) => sum + t.core.width * t.core.height, 0);
    expect(area).toBe(5000 * 3000);
  });

  it('uses a single tile for a small image', () => {
    expect(tileGrid(100, 50)).toEqual([
      {
        core: { x: 0, y: 0, width: 100, height: 50 },
        padded: { x: 0, y: 0, width: 100, height: 50 },
      },
    ]);
  });
});

describe('half floats', () => {
  it.each([0, 1, 0.5, 0.18, 2, 1e-5, 65504])('round-trips %f closely', (v) => {
    expect(fromHalf(toHalf(v))).toBeCloseTo(v, v < 1 ? 3 : 0);
  });

  it('matches known bit patterns', () => {
    expect(toHalf(1)).toBe(0x3c00);
    expect(toHalf(-2)).toBe(0xc000);
    expect(toHalf(0.5)).toBe(0x3800);
    expect(toHalf(1e9)).toBe(0x7c00); // too large → infinity
  });

  it('LUT maps 16-bit samples to 0..1', () => {
    const lut = uint16ToHalfLut();
    expect(fromHalf(lut[0]!)).toBe(0);
    expect(fromHalf(lut[65535]!)).toBe(1);
    expect(fromHalf(lut[32768]!)).toBeCloseTo(0.5, 3);
  });
});

describe('pixel helpers', () => {
  // 2×2 RGB image: black, white / mid-grey, black
  const img = new Uint16Array([0, 0, 0, 65535, 65535, 65535, 32768, 32768, 32768, 0, 0, 0]);

  it('extracts a rectangle as half floats', () => {
    const out = uint16RectToHalf(img, 2, { x: 1, y: 0, width: 1, height: 1 });
    expect(Array.from(out)).toEqual([0x3c00, 0x3c00, 0x3c00]);
  });

  it('extracts a rectangle as floats', () => {
    expect(uint16RectToFloat(img, 2, { x: 0, y: 1, width: 1, height: 1 }).data[0]).toBeCloseTo(
      0.5,
      4,
    );
  });

  it('averages light when downscaling', () => {
    const small = downscaleUint16(img, 2, 2, 1, 1);
    expect(small.data[0]).toBeCloseTo((1 + 0.5) / 4, 4);
  });

  it('halves like a mipmap', () => {
    const half = halveFloat({
      width: 2,
      height: 2,
      data: new Float32Array([0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0]),
    });
    expect(half.width).toBe(1);
    expect(half.data[1]).toBeCloseTo(0.5);
  });

  it('copies RGBA rows from the right place', () => {
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
