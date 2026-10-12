/**
 * Histogram: how many pixels have each brightness level (0–255), per colour channel.
 * It is computed from the displayed image, like Lightroom's histogram.
 */

export interface Histogram {
  red: Uint32Array;
  green: Uint32Array;
  blue: Uint32Array;
  luminance: Uint32Array;
  /** Number of pixels counted. */
  total: number;
}

/**
 * @param rgba 8-bit RGBA pixels
 * @param step count every `step`-th pixel; a sample is plenty for a histogram
 */
export function computeHistogram(rgba: Uint8Array | Uint8ClampedArray, step = 1): Histogram {
  const red = new Uint32Array(256);
  const green = new Uint32Array(256);
  const blue = new Uint32Array(256);
  const luminance = new Uint32Array(256);
  const stride = Math.max(1, Math.floor(step)) * 4;
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += stride) {
    const r = rgba[i]!,
      g = rgba[i + 1]!,
      b = rgba[i + 2]!;
    red[r]!++;
    green[g]!++;
    blue[b]!++;
    // Rec.709 luma weights.
    luminance[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]!++;
    total++;
  }
  return { red, green, blue, luminance, total };
}

/** Share of pixels with any channel at 0 (shadows clipped) or 255 (highlights clipped). */
export function clippedShares(h: Histogram): { shadows: number; highlights: number } {
  if (h.total === 0) return { shadows: 0, highlights: 0 };
  const shadows = Math.max(h.red[0]!, h.green[0]!, h.blue[0]!) / h.total;
  const highlights = Math.max(h.red[255]!, h.green[255]!, h.blue[255]!) / h.total;
  return { shadows, highlights };
}
