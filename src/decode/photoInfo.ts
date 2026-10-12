/**
 * Shooting information shown in the Info panel, in one shape for every file format.
 */

export interface PhotoInfo {
  camera?: string;
  lens?: string;
  /** Focal length in millimetres. */
  focalLength?: number;
  /** f-number, e.g. 5.6. */
  aperture?: number;
  /** Exposure time in seconds. */
  shutter?: number;
  iso?: number;
  /** Exposure compensation in EV. */
  exposureBias?: number;
  takenAt?: Date;
  /** Pixel size after orientation is applied. */
  width?: number;
  height?: number;
}

export function formatShutter(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds >= 0.3) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${rounded} s`;
  }
  return `1/${Math.round(1 / seconds)} s`;
}

export function formatAperture(fNumber: number): string {
  return `f/${Math.round(fNumber * 10) / 10}`;
}

export function formatFocalLength(mm: number): string {
  return `${Math.round(mm)} mm`;
}

export function formatExposureBias(ev: number): string {
  if (Math.abs(ev) < 0.05) return '0 EV';
  const sign = ev > 0 ? '+' : '−';
  return `${sign}${Math.round(Math.abs(ev) * 10) / 10} EV`;
}

export function formatMegapixels(width: number, height: number): string {
  return `${width} × ${height} (${((width * height) / 1e6).toFixed(1)} MP)`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Joins make and model without repeating the brand ("NIKON CORPORATION" + "NIKON D5600" → "Nikon D5600"). */
export function formatCamera(
  make: string | undefined,
  model: string | undefined,
): string | undefined {
  const cleanMake = make
    ?.replace(/\b(corporation|corp\.?|co\.,?\s*ltd\.?|imaging|company)\b/gi, '')
    .trim();
  const cleanModel = model?.trim();
  if (!cleanModel) return cleanMake ? titleCase(cleanMake) : undefined;
  if (!cleanMake || cleanModel.toLowerCase().startsWith(cleanMake.toLowerCase())) {
    return titleCaseBrand(cleanModel, cleanMake);
  }
  return `${titleCase(cleanMake)} ${cleanModel}`;
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCaseBrand(model: string, make: string | undefined): string {
  if (!make) return model;
  return titleCase(make) + model.slice(make.length);
}

/** Readable lens name, falling back to the focal/aperture range when the name is unknown. */
export function describeLensRange(
  minFocal?: number,
  maxFocal?: number,
  minAperture?: number,
  maxAperture?: number,
): string | undefined {
  if (!minFocal || minFocal <= 0) return undefined;
  const focal =
    maxFocal && Math.round(maxFocal) !== Math.round(minFocal)
      ? `${Math.round(minFocal)}–${Math.round(maxFocal)} mm`
      : `${Math.round(minFocal)} mm`;
  if (!minAperture || minAperture <= 0) return focal;
  const ap =
    maxAperture && Math.abs(maxAperture - minAperture) > 0.05
      ? `f/${round1(minAperture)}–${round1(maxAperture)}`
      : `f/${round1(minAperture)}`;
  return `${focal} ${ap}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** EXIF fields we read with exifr (names follow the EXIF standard). */
export interface ExifFields {
  Make?: string;
  Model?: string;
  LensModel?: string;
  Lens?: string;
  FocalLength?: number;
  FNumber?: number;
  ExposureTime?: number;
  ISO?: number;
  ExposureCompensation?: number;
  DateTimeOriginal?: Date;
}

export function infoFromExif(exif: ExifFields | undefined): PhotoInfo {
  if (!exif) return {};
  return {
    camera: formatCamera(exif.Make, exif.Model),
    lens: exif.LensModel || exif.Lens || undefined,
    focalLength: exif.FocalLength,
    aperture: exif.FNumber,
    shutter: exif.ExposureTime,
    iso: exif.ISO,
    exposureBias: exif.ExposureCompensation,
    takenAt: exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : undefined,
  };
}

/** Fills gaps in `primary` with values from `fallback`. */
export function mergeInfo(primary: PhotoInfo, fallback: PhotoInfo): PhotoInfo {
  const merged: PhotoInfo = { ...fallback };
  for (const [key, value] of Object.entries(primary) as [keyof PhotoInfo, unknown][]) {
    if (
      value !== undefined &&
      value !== '' &&
      !(typeof value === 'number' && value <= 0 && key !== 'exposureBias')
    ) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}
