/**
 * Export options: file format, picture size and colour space.
 */
import type { Size } from '../develop/geometry';
import type { OutputColorSpace } from './iccProfiles';

export type ExportFormat = 'jpeg' | 'tiff16';
export type SizeMode = 'full' | 'long-edge' | 'megapixels' | 'percent';

export interface ExportSettings {
  format: ExportFormat;
  /** JPEG quality, 1–100. */
  quality: number;
  sizeMode: SizeMode;
  /** Long edge in pixels, megapixels, or percent — depending on `sizeMode`. */
  sizeValue: number;
  colorSpace: OutputColorSpace;
}

export const DEFAULT_EXPORT: ExportSettings = {
  format: 'jpeg',
  quality: 90,
  sizeMode: 'full',
  sizeValue: 2048,
  colorSpace: 'srgb',
};

export const SIZE_MODES: { id: SizeMode; label: string; unit: string; min: number; max: number }[] =
  [
    { id: 'full', label: 'Full size', unit: '', min: 0, max: 0 },
    { id: 'long-edge', label: 'Long edge', unit: 'px', min: 16, max: 20000 },
    { id: 'megapixels', label: 'Megapixels', unit: 'MP', min: 0.1, max: 200 },
    { id: 'percent', label: 'Percentage', unit: '%', min: 1, max: 100 },
  ];

export const COLOR_SPACES: { id: OutputColorSpace; label: string; hint: string }[] = [
  { id: 'srgb', label: 'sRGB', hint: 'Best for the web, phones and most printing services' },
  {
    id: 'display-p3',
    label: 'Display P3',
    hint: 'Richer colours on Apple and modern wide-colour screens',
  },
  { id: 'adobe-rgb', label: 'Adobe RGB', hint: 'Wide gamut for professional printing workflows' },
];

/**
 * Pixel size of the exported photo. Photos are never enlarged: asking for more pixels
 * than the crop has gives the full size.
 */
export function outputSize(crop: Size, s: Pick<ExportSettings, 'sizeMode' | 'sizeValue'>): Size {
  let scale = 1;
  const longEdge = Math.max(crop.width, crop.height);
  switch (s.sizeMode) {
    case 'long-edge':
      scale = s.sizeValue / longEdge;
      break;
    case 'megapixels':
      scale = Math.sqrt((s.sizeValue * 1e6) / (crop.width * crop.height));
      break;
    case 'percent':
      scale = s.sizeValue / 100;
      break;
  }
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  scale = Math.min(1, scale);
  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

/** "DSC_0401.NEF" → "DSC_0401-chitra.jpg" */
export function exportFileName(original: string, format: ExportFormat): string {
  const dot = original.lastIndexOf('.');
  const base = dot > 0 ? original.slice(0, dot) : original;
  return `${base}-chitra.${format === 'jpeg' ? 'jpg' : 'tif'}`;
}

/** Rough file size, to show before exporting. */
export function estimateBytes(size: Size, s: Pick<ExportSettings, 'format' | 'quality'>): number {
  const pixels = size.width * size.height;
  if (s.format === 'tiff16') return pixels * 6 * 0.8; // 16-bit RGB; noisy photos compress little
  return pixels * (0.15 + (s.quality / 100) ** 3 * 0.9);
}

const STORAGE_KEY = 'chitra.export';

export function loadExportSettings(): ExportSettings {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<ExportSettings> | null;
    if (!saved) return DEFAULT_EXPORT;
    return {
      format: saved.format === 'tiff16' ? 'tiff16' : 'jpeg',
      quality: clampNumber(saved.quality, 1, 100, DEFAULT_EXPORT.quality),
      sizeMode: SIZE_MODES.some((m) => m.id === saved.sizeMode)
        ? (saved.sizeMode as SizeMode)
        : 'full',
      sizeValue: clampNumber(saved.sizeValue, 0.1, 20000, DEFAULT_EXPORT.sizeValue),
      colorSpace: COLOR_SPACES.some((c) => c.id === saved.colorSpace)
        ? (saved.colorSpace as OutputColorSpace)
        : 'srgb',
    };
  } catch {
    return DEFAULT_EXPORT;
  }
}

export function saveExportSettings(settings: ExportSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not important if it can't be remembered.
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
