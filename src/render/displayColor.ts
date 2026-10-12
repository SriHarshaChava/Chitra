import type { DisplayColorSpace } from '../color/colorSpaces';

let cached: DisplayColorSpace | null = null;

/**
 * The colour space Chitra draws in: Display P3 on wide-gamut screens (iPad, many
 * laptops) when the browser supports P3 canvases, otherwise sRGB.
 */
export function displayColorSpace(): DisplayColorSpace {
  if (cached) return cached;
  cached = 'srgb';
  try {
    const wide = window.matchMedia?.('(color-gamut: p3)').matches;
    const ctx = document.createElement('canvas').getContext('2d', { colorSpace: 'display-p3' });
    const attributes = ctx?.getContextAttributes?.();
    if (wide && attributes?.colorSpace === 'display-p3') cached = 'display-p3';
  } catch {
    // Older browsers: stay with sRGB.
  }
  return cached;
}
