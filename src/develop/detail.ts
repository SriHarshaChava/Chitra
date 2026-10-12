/**
 * Detail: sharpening and noise reduction.
 *
 * Unlike the other adjustments, these look at a pixel's neighbours. They run first,
 * on the linear photo data (before white balance and exposure): neighbours are cheap
 * to read there, and removing sensor noise before the tone curve stretches it is the
 * physically right order.
 *
 * Every pixel reads two 5×5 grids of neighbours:
 *   - "near": 1 pixel apart, for luminance noise reduction and sharpening
 *   - "wide": 2 pixels apart, for colour noise reduction (colour noise is blotchy)
 *
 * The GPU shader (`src/gpu/shaders.ts`) mirrors this file step by step.
 */
import { decodeExtended, encodeExtended, LUMA_REC2020 } from '../color/colorSpaces';

type Vec3 = [number, number, number];

/** Neighbour offsets −2…2. */
export const TAPS = [-2, -1, 0, 1, 2] as const;
/** Spatial spread of the noise reduction filters, in grid steps. */
const NR_SPATIAL_SIGMA = 1.5;
/** Below this luminance, colour ratios are measured against this floor instead. */
export const LUMA_FLOOR = 0.002;
/** Colours only blend with neighbours of similar brightness (perceptual units). */
export const COLOR_NR_RANGE = 0.05;
/** How far sharpening may go past the brightest/darkest neighbour (limits halos). */
export const SHARPEN_OVERSHOOT = 0.04;

export interface DetailParams {
  /** Luminance noise reduction 0…1 (0 = off). */
  luminance: number;
  /** Brightness difference that still counts as "the same surface". */
  luminanceRange: number;
  /** Colour noise reduction 0…1 (0 = off). */
  color: number;
  /** Sharpening strength (0 = off). */
  sharpen: number;
  /** Normalised 5×5 Gaussian weights for the sharpening blur (row by row). */
  sharpenWeights: number[];
  /** Edge strength below which sharpening fades out (0 = sharpen everything). */
  masking: number;
}

export interface DetailSettings {
  sharpenAmount: number;
  sharpenRadius: number;
  sharpenMasking: number;
  noiseLuminance: number;
  noiseColor: number;
}

/** Fixed spatial weights of the noise reduction filters (row by row). */
export const NR_WEIGHTS: number[] = gaussianWeights(NR_SPATIAL_SIGMA, false);

/** Weights exp(−d²/2σ²) on the 5×5 grid, optionally normalised to sum to 1. */
export function gaussianWeights(sigma: number, normalise = true): number[] {
  const w: number[] = [];
  for (const j of TAPS) {
    for (const i of TAPS) w.push(Math.exp(-(i * i + j * j) / (2 * sigma * sigma)));
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return normalise ? w.map((v) => v / sum) : w;
}

/** Turns the slider values into filter settings, or `null` when everything is off. */
export function detailParams(s: DetailSettings): DetailParams | null {
  if (s.sharpenAmount === 0 && s.noiseLuminance === 0 && s.noiseColor === 0) return null;
  const luminance = s.noiseLuminance / 100;
  const masking = s.sharpenMasking / 100;
  return {
    luminance,
    luminanceRange: 0.03 + 0.09 * luminance,
    color: s.noiseColor / 100,
    sharpen: s.sharpenAmount / 100,
    sharpenWeights: gaussianWeights(s.sharpenRadius),
    masking: masking * 0.06,
  };
}

const luma = (c: Vec3) => LUMA_REC2020[0] * c[0] + LUMA_REC2020[1] * c[1] + LUMA_REC2020[2] * c[2];
/** Perceptual brightness, where equal steps look equally large. */
const perceptual = (l: number) => encodeExtended(Math.max(0, l));

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Applies detail to one pixel.
 * @param sample reads the linear Rec.2020 colour `dx`, `dy` pixels away from this one
 */
export function detailPixel(sample: (dx: number, dy: number) => Vec3, p: DetailParams): Vec3 {
  const c0 = sample(0, 0);
  const l0 = luma(c0);
  const p0 = perceptual(l0);
  let pOut = p0;

  if (p.luminance > 0 || p.sharpen > 0) {
    // Perceptual brightness of the near neighbours.
    const near: number[] = [];
    for (const j of TAPS) for (const i of TAPS) near.push(perceptual(luma(sample(i, j))));
    const at = (i: number, j: number) => near[(j + 2) * 5 + (i + 2)]!;

    if (p.luminance > 0) {
      // Bilateral filter: average with neighbours of similar brightness, so edges stay.
      let sum = 0;
      let weights = 0;
      near.forEach((v, k) => {
        const d = v - p0;
        const w = NR_WEIGHTS[k]! * Math.exp(-(d * d) / (2 * p.luminanceRange * p.luminanceRange));
        sum += w * v;
        weights += w;
      });
      pOut = p0 + (sum / weights - p0) * Math.min(1, 2 * p.luminance);
    }

    if (p.sharpen > 0) {
      // Unsharp mask: boost the difference between the pixel and its blurred surroundings.
      let blurred = 0;
      near.forEach((v, k) => (blurred += p.sharpenWeights[k]! * v));
      // Masking: only sharpen where there is an edge (Sobel gradient).
      let mask = 1;
      if (p.masking > 0) {
        const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - (at(-1, -1) + 2 * at(-1, 0) + at(-1, 1));
        const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - (at(-1, -1) + 2 * at(0, -1) + at(1, -1));
        mask = smoothstep(0.5 * p.masking, p.masking, Math.hypot(gx, gy) / 4);
      }
      // Halo control: stay close to the range of the immediate neighbours.
      let lo = Infinity;
      let hi = -Infinity;
      for (const j of [-1, 0, 1]) {
        for (const i of [-1, 0, 1]) {
          lo = Math.min(lo, at(i, j));
          hi = Math.max(hi, at(i, j));
        }
      }
      const sharpened = pOut + p.sharpen * (p0 - blurred) * mask;
      pOut = Math.min(hi + SHARPEN_OVERSHOOT, Math.max(lo - SHARPEN_OVERSHOOT, sharpened));
    }
  }

  // New brightness, applied as a ratio so the colour (hue and saturation) is kept.
  const lOut = decodeExtended(Math.max(0, pOut));
  const k = lOut / Math.max(l0, LUMA_FLOOR);
  const grey = lOut - l0 * k;
  let out = c0.map((v) => v * k + grey) as Vec3;

  if (p.color > 0) {
    // Colour noise reduction: average the colour (colour ÷ brightness) of the wide
    // neighbours with similar brightness, keeping this pixel's brightness.
    const sum: Vec3 = [0, 0, 0];
    let weights = 0;
    let k2 = 0;
    for (const j of TAPS) {
      for (const i of TAPS) {
        const c = sample(2 * i, 2 * j);
        const l = luma(c);
        const d = perceptual(l) - p0;
        const w = NR_WEIGHTS[k2++]! * Math.exp(-(d * d) / (2 * COLOR_NR_RANGE * COLOR_NR_RANGE));
        const floor = Math.max(l, LUMA_FLOOR);
        for (let ch = 0; ch < 3; ch++) sum[ch]! += (w * c[ch]!) / floor;
        weights += w;
      }
    }
    const floor0 = Math.max(l0, LUMA_FLOOR);
    out = out.map((v, ch) => v + p.color * (sum[ch]! / weights - c0[ch]! / floor0) * lOut) as Vec3;
  }

  return out.map((v) => Math.max(0, v)) as Vec3;
}

/** A linear RGB image, 3 floats per pixel. */
export interface FloatImage {
  width: number;
  height: number;
  data: Float32Array;
}

/** Reads pixels with edges repeated (like the GPU's clamp-to-edge). */
export function clampedSampler(image: FloatImage, x: number, y: number) {
  return (dx: number, dy: number): Vec3 => {
    const sx = Math.min(image.width - 1, Math.max(0, x + dx));
    const sy = Math.min(image.height - 1, Math.max(0, y + dy));
    const o = (sy * image.width + sx) * 3;
    return [image.data[o]!, image.data[o + 1]!, image.data[o + 2]!];
  };
}

/** Applies detail to a whole image (used by tests). */
export function applyDetail(image: FloatImage, p: DetailParams): FloatImage {
  const data = new Float32Array(image.data.length);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      data.set(detailPixel(clampedSampler(image, x, y), p), (y * image.width + x) * 3);
    }
  }
  return { width: image.width, height: image.height, data };
}
