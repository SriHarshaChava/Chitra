import { describe, expect, it } from 'vitest';
import { LUMA_REC2020 } from '../color/colorSpaces';
import {
  applyDetail,
  detailParams,
  gaussianWeights,
  type DetailSettings,
  type FloatImage,
} from './detail';
import { DEFAULT_RECIPE, RECIPE_VERSION, sanitizeRecipe } from './recipe';

const SIZE = 32;
const OFF: DetailSettings = {
  sharpenAmount: 0,
  sharpenRadius: 1,
  sharpenMasking: 0,
  noiseLuminance: 0,
  noiseColor: 0,
};

/** Small repeatable random numbers (so tests never flake). */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Roughly normal noise with standard deviation 1. */
function gaussian(rand: () => number) {
  return rand() + rand() + rand() + rand() - 2;
}

function image(pixel: (x: number, y: number) => [number, number, number]): FloatImage {
  const data = new Float32Array(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) data.set(pixel(x, y), (y * SIZE + x) * 3);
  }
  return { width: SIZE, height: SIZE, data };
}

const at = (img: FloatImage, x: number, y: number) => {
  const o = (y * img.width + x) * 3;
  return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!] as const;
};
const luma = (c: readonly number[]) =>
  LUMA_REC2020[0] * c[0]! + LUMA_REC2020[1] * c[1]! + LUMA_REC2020[2] * c[2]!;

/** Variance of luminance (or one channel) over the middle of the image. */
function variance(img: FloatImage, value: (c: readonly number[]) => number = luma) {
  const values: number[] = [];
  for (let y = 4; y < SIZE - 4; y++)
    for (let x = 4; x < SIZE - 4; x++) values.push(value(at(img, x, y)));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

/** A dark/bright vertical edge at x = 16. */
const edge = image((x) => (x < 16 ? [0.05, 0.05, 0.05] : [0.4, 0.4, 0.4]));

describe('detail', () => {
  it('is off (null) when all sliders are at zero', () => {
    expect(detailParams(OFF)).toBeNull();
    expect(detailParams({ ...OFF, sharpenRadius: 2, sharpenMasking: 50 })).toBeNull();
  });

  it('Gaussian weights sum to 1 and peak in the middle', () => {
    const w = gaussianWeights(1);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(Math.max(...w)).toBe(w[12]);
  });

  it('sharpening raises edge contrast and leaves flat areas alone', () => {
    const p = detailParams({ ...OFF, sharpenAmount: 100 })!;
    const out = applyDetail(edge, p);
    expect(luma(at(out, 15, 10))).toBeLessThan(0.05); // dark side gets darker
    expect(luma(at(out, 16, 10))).toBeGreaterThan(0.4); // bright side gets brighter
    expect(luma(at(out, 4, 10))).toBeCloseTo(0.05, 6);
    expect(luma(at(out, 28, 10))).toBeCloseTo(0.4, 6);
    // Halos are limited.
    expect(luma(at(out, 16, 10))).toBeLessThan(0.5);
  });

  it('masking stops noise in flat areas from being sharpened', () => {
    const rand = random(1);
    const noisy = image(() => {
      const v = 0.2 + 0.004 * gaussian(rand);
      return [v, v, v];
    });
    const plain = variance(applyDetail(noisy, detailParams({ ...OFF, sharpenAmount: 100 })!));
    const masked = variance(
      applyDetail(noisy, detailParams({ ...OFF, sharpenAmount: 100, sharpenMasking: 100 })!),
    );
    expect(plain).toBeGreaterThan(variance(noisy) * 1.5);
    expect(masked).toBeLessThan(variance(noisy) * 1.1);
    // …but real edges still are.
    const out = applyDetail(
      edge,
      detailParams({ ...OFF, sharpenAmount: 100, sharpenMasking: 100 })!,
    );
    expect(luma(at(out, 16, 10))).toBeGreaterThan(0.4);
  });

  it('luminance noise reduction smooths noise but keeps edges', () => {
    const rand = random(2);
    const noisy = image((x) => {
      const v = (x < 16 ? 0.05 : 0.4) + 0.01 * gaussian(rand);
      return [v, v, v];
    });
    const p = detailParams({ ...OFF, noiseLuminance: 60 })!;
    const out = applyDetail(noisy, p);
    // Noise within each half.
    const half = (img: FloatImage, from: number, to: number) => {
      const values: number[] = [];
      for (let y = 4; y < SIZE - 4; y++)
        for (let x = from; x < to; x++) values.push(luma(at(img, x, y)));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return { mean, variance: values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length };
    };
    expect(half(out, 20, 28).variance).toBeLessThan(half(noisy, 20, 28).variance * 0.5);
    // The edge stays sharp: the pixels right next to it keep their brightness.
    const rowMean = (img: FloatImage, x: number) => {
      let sum = 0;
      for (let y = 4; y < SIZE - 4; y++) sum += luma(at(img, x, y));
      return sum / (SIZE - 8);
    };
    expect(rowMean(out, 15)).toBeCloseTo(rowMean(noisy, 15), 2);
    expect(Math.abs(rowMean(out, 16) - rowMean(noisy, 16)) / rowMean(noisy, 16)).toBeLessThan(0.05);
  });

  it('colour noise reduction removes colour speckles from grey and keeps colour edges', () => {
    const rand = random(3);
    const speckled = image(() => {
      const r = 0.02 * gaussian(rand);
      const b = 0.02 * gaussian(rand);
      // Change the colour but not the brightness.
      const g = 0.2 - (LUMA_REC2020[0] * r + LUMA_REC2020[2] * b) / LUMA_REC2020[1];
      return [0.2 + r, g, 0.2 + b];
    });
    const out = applyDetail(speckled, detailParams({ ...OFF, noiseColor: 100 })!);
    const redness = (c: readonly number[]) => c[0]! - c[1]!;
    expect(variance(out, redness)).toBeLessThan(variance(speckled, redness) * 0.2);
    // Brightness is kept.
    expect(luma(at(out, 10, 10))).toBeCloseTo(luma(at(speckled, 10, 10)), 6);

    // A red/green edge of different brightness stays crisp.
    const redGreen = image((x) => (x < 16 ? [0.5, 0.05, 0.05] : [0.02, 0.1, 0.02]));
    const kept = applyDetail(redGreen, detailParams({ ...OFF, noiseColor: 100 })!);
    expect(at(kept, 15, 10)[0]).toBeGreaterThan(0.45);
    expect(at(kept, 16, 10)[0]).toBeLessThan(0.03);
  });
});

describe('recipe version 4', () => {
  it('upgrades a version 3 recipe with detail off', () => {
    const r = sanitizeRecipe({ version: 3, exposure: 0.5, hueBlue: 10 });
    expect(r.version).toBe(RECIPE_VERSION);
    expect(r.hueBlue).toBe(10);
    expect(r.sharpenAmount).toBe(0);
    expect(r.sharpenRadius).toBe(1);
    expect(detailParams(r)).toBeNull();
    expect(sanitizeRecipe({ sharpenRadius: 9, noiseColor: -5 })).toMatchObject({
      sharpenRadius: 2,
      noiseColor: 0,
    });
    expect(DEFAULT_RECIPE.noiseLuminance).toBe(0);
  });
});
