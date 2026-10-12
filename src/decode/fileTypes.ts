/**
 * Decides which decoder handles a file.
 *
 * - `raw`: camera RAW files, decoded by LibRaw (Nikon NEF/NRW first; others LibRaw supports).
 * - `tiff`: TIFF files, decoded by UTIF (Chrome cannot display TIFF natively).
 * - `browser`: formats every browser decodes itself (JPEG, PNG, WebP, AVIF, GIF, and HEIC on Safari).
 *
 * New formats are added here, so the rest of the app never inspects file names.
 */

export type DecoderKind = 'raw' | 'tiff' | 'browser';

const RAW_EXTENSIONS = [
  'nef',
  'nrw',
  'dng',
  'cr2',
  'cr3',
  'arw',
  'raf',
  'orf',
  'rw2',
  'pef',
  'srw',
] as const;
const TIFF_EXTENSIONS = ['tif', 'tiff'] as const;
const BROWSER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'heic', 'heif'] as const;

/** Value for `<input type="file" accept>`. */
export const ACCEPTED_FILE_TYPES = [...RAW_EXTENSIONS, ...TIFF_EXTENSIONS, ...BROWSER_EXTENSIONS]
  .map((ext) => `.${ext}`)
  .join(',');

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function decoderFor(name: string): DecoderKind | null {
  const ext = extensionOf(name);
  if ((RAW_EXTENSIONS as readonly string[]).includes(ext)) return 'raw';
  if ((TIFF_EXTENSIONS as readonly string[]).includes(ext)) return 'tiff';
  if ((BROWSER_EXTENSIONS as readonly string[]).includes(ext)) return 'browser';
  return null;
}
