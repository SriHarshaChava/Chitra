/**
 * Camera RAW decoding with LibRaw (compiled to WebAssembly by the `libraw-wasm` package).
 *
 * LibRaw runs in its own Web Worker. Opening a file is fast (~0.1 s) and gives us the
 * metadata and the camera's embedded JPEG preview, which we show immediately. Full
 * decoding (demosaicing the sensor data) takes a few seconds and happens afterwards.
 *
 * Licences: libraw-wasm wrapper — ISC; LibRaw — LGPL-2.1 or CDDL-1.0.
 */
import LibRaw, { type LibRawSettings, type Metadata } from 'libraw-wasm';
import { describeLensRange, formatCamera, type PhotoInfo } from './photoInfo';

/**
 * How LibRaw develops the RAW data:
 * - camera white balance (what the camera recorded),
 * - linear 16-bit output (LibRaw's 16-bit output is not gamma-encoded),
 * - Rec.2020 primaries (outputColor 8) so no colours are clipped before editing,
 * - no automatic brightening, so the result reflects the real exposure,
 * - AHD demosaicing (userQual 3), a good balance of quality and speed.
 */
export const RAW_DECODE_SETTINGS: LibRawSettings = {
  useCameraWb: true,
  outputBps: 16,
  outputColor: 8,
  noAutoBright: true,
  userQual: 3,
  highlight: 0,
};

/** LibRaw `flip` values → clockwise rotation in degrees. */
export function rotationFromFlip(flip: number): 0 | 90 | 180 | 270 {
  switch (flip) {
    case 3:
      return 180;
    case 5:
      return 270;
    case 6:
      return 90;
    default:
      return 0;
  }
}

export function infoFromRawMetadata(meta: Metadata): PhotoInfo {
  const lens = meta.lens;
  const lensName =
    lens?.Lens?.trim() ||
    lens?.makernotes?.Lens?.trim() ||
    describeLensRange(lens?.MinFocal, lens?.MaxFocal, lens?.MaxAp4MinFocal, lens?.MaxAp4MaxFocal);
  const rotated = rotationFromFlip(meta.flip) % 180 !== 0;
  return {
    camera: formatCamera(meta.camera_make, meta.camera_model),
    lens: lensName || undefined,
    focalLength: meta.focal_len > 0 ? meta.focal_len : undefined,
    aperture: meta.aperture > 0 ? meta.aperture : undefined,
    shutter: meta.shutter > 0 ? meta.shutter : undefined,
    iso: meta.iso_speed > 0 ? meta.iso_speed : undefined,
    takenAt:
      meta.timestamp instanceof Date &&
      !Number.isNaN(meta.timestamp.getTime()) &&
      meta.timestamp.getTime() > 0
        ? meta.timestamp
        : undefined,
    width: rotated ? meta.height : meta.width,
    height: rotated ? meta.width : meta.height,
  };
}

export interface DecodedRaw {
  width: number;
  height: number;
  /** Linear Rec.2020 RGB, 3 values per pixel, already rotated upright. */
  data: Uint16Array;
}

export interface OpenedRaw {
  info: PhotoInfo;
  /** The camera's embedded JPEG, if the file has one. */
  preview: Blob | null;
  /** Rotation to apply to the embedded preview so it appears upright. */
  previewRotation: 0 | 90 | 180 | 270;
  /** Develops the full RAW. Can be called once. */
  decode(): Promise<DecodedRaw>;
  /** Frees LibRaw's memory. Always call this when finished. */
  dispose(): void;
}

/**
 * Opens a RAW file and reads its metadata and embedded preview.
 * `bytes` is copied, so the caller's buffer stays usable.
 */
export async function openRaw(bytes: ArrayBuffer): Promise<OpenedRaw> {
  const libraw = new LibRaw();
  try {
    // LibRaw takes ownership of (transfers) the buffer it is given, so give it a copy.
    await libraw.open(new Uint8Array(bytes.slice(0)), RAW_DECODE_SETTINGS);
    const meta = await libraw.metadata(true);
    if (!meta) throw new Error('LibRaw could not read this file.');

    let preview: Blob | null = null;
    try {
      const thumb = await libraw.thumbnailData();
      if (thumb && thumb.format === 'jpeg' && thumb.data.length > 0) {
        preview = new Blob([thumb.data as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
      }
    } catch {
      // Some files have no usable preview; the full decode will still work.
    }

    const rotation = rotationFromFlip(meta.flip);
    return {
      info: infoFromRawMetadata(meta),
      preview,
      previewRotation: rotation,
      async decode() {
        const image = await libraw.imageData();
        if (!image || !(image.data instanceof Uint16Array) || image.colors !== 3) {
          throw new Error('LibRaw returned no 16-bit RGB image.');
        }
        return { width: image.width, height: image.height, data: image.data };
      },
      dispose: () => libraw.dispose(),
    };
  } catch (error) {
    libraw.dispose();
    throw friendlyRawError(error);
  }
}

function friendlyRawError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/unsupported|not supported|file format/i.test(message)) {
    return new Error(
      'This RAW format is not supported by LibRaw (for example Nikon "High Efficiency" NEF).',
    );
  }
  return new Error(`Could not read RAW file: ${message}`);
}
