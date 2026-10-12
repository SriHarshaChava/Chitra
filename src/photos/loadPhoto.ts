/**
 * Loads one photo for viewing, step by step:
 *   1. read shooting info (EXIF),
 *   2. for RAW files, show the camera's embedded JPEG preview right away,
 *   3. develop the full image and replace the preview.
 *
 * Progress is reported through callbacks so the viewer can update after each step.
 * The original file is only read, never modified.
 */
import exifr from 'exifr';
import type { DisplayColorSpace } from '../color/colorSpaces';
import { convertInWorker } from '../decode/convertClient';
import { decoderFor } from '../decode/fileTypes';
import { infoFromExif, mergeInfo, type ExifFields, type PhotoInfo } from '../decode/photoInfo';
import { openRaw } from '../decode/raw';
import {
  tiledImageFromBitmap,
  tiledImageFromBuffers,
  type Rotation,
  type TiledImage,
} from '../render/tiledImage';

export interface LoadCallbacks {
  onInfo(info: PhotoInfo): void;
  onPreview(image: TiledImage): void;
  onFull(image: TiledImage, decodeMs: number): void;
}

const EXIF_FIELDS: (keyof ExifFields)[] = [
  'Make',
  'Model',
  'LensModel',
  'Lens',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ISO',
  'ExposureCompensation',
  'DateTimeOriginal',
];

export async function readExif(file: Blob): Promise<PhotoInfo> {
  try {
    const exif = (await exifr.parse(file, { pick: EXIF_FIELDS })) as ExifFields | undefined;
    return infoFromExif(exif);
  } catch {
    return {};
  }
}

/**
 * Loads `file`. If `signal` is aborted (the user picked another photo) any images
 * created after that point are closed instead of being reported.
 */
export async function loadPhoto(
  file: File,
  displaySpace: DisplayColorSpace,
  callbacks: LoadCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const kind = decoderFor(file.name);
  if (!kind) throw new Error(`Chitra can't open "${file.name}" yet.`);

  const deliver = (image: TiledImage, report: (image: TiledImage) => void) => {
    if (signal.aborted) image.close();
    else report(image);
  };

  const started = performance.now();
  const exifPromise = readExif(file);

  if (kind === 'browser') {
    const bitmap = await createImageBitmap(file);
    const exif = await exifPromise;
    if (!signal.aborted) callbacks.onInfo({ ...exif, width: bitmap.width, height: bitmap.height });
    const image = await tiledImageFromBitmap(bitmap, 0, displaySpace);
    deliver(image, (img) => callbacks.onFull(img, performance.now() - started));
    return;
  }

  if (kind === 'tiff') {
    const [result, exif] = await Promise.all([
      convertInWorker({ type: 'tiff', bytes: await file.arrayBuffer() }),
      exifPromise,
    ]);
    if (!signal.aborted) callbacks.onInfo({ ...exif, width: result.width, height: result.height });
    const image = await tiledImageFromBuffers(
      result.width,
      result.height,
      result.tiles,
      result.colorSpace,
      0,
      displaySpace,
    );
    deliver(image, (img) => callbacks.onFull(img, performance.now() - started));
    return;
  }

  // RAW
  const raw = await openRaw(await file.arrayBuffer());
  try {
    const exif = await exifPromise;
    if (signal.aborted) return;
    // LibRaw's metadata is the primary source; EXIF fills gaps such as exposure compensation.
    callbacks.onInfo(mergeInfo(raw.info, exif));

    if (raw.preview) {
      try {
        const bitmap = await createImageBitmap(raw.preview);
        const preview = await tiledImageFromBitmap(bitmap, raw.previewRotation, displaySpace);
        deliver(preview, callbacks.onPreview);
      } catch {
        // A broken preview is not fatal; continue with the full decode.
      }
    }
    if (signal.aborted) return;

    const decoded = await raw.decode();
    if (signal.aborted) return;
    const converted = await convertInWorker({
      type: 'linear-rec2020',
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
      target: displaySpace,
    });
    const image = await tiledImageFromBuffers(
      converted.width,
      converted.height,
      converted.tiles,
      converted.colorSpace,
      fullRotation(raw.previewRotation, raw.info, converted.width),
      displaySpace,
    );
    deliver(image, (img) => callbacks.onFull(img, performance.now() - started));
  } finally {
    raw.dispose();
  }
}

/**
 * LibRaw normally rotates portrait photos itself. If the decoded image still has the
 * landscape width, apply the rotation when drawing instead.
 */
export function fullRotation(rotation: Rotation, info: PhotoInfo, decodedWidth: number): Rotation {
  if (rotation % 180 === 0 || !info.width || !info.height) return 0;
  const alreadyRotated = decodedWidth === info.width;
  return alreadyRotated ? 0 : rotation;
}
