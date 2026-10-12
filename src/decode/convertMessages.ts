/** Messages exchanged with `convert.worker.ts`. */
import type { Rect } from '../render/tiles';

export type ConvertRequest =
  | {
      type: 'linear-rec2020';
      id: number;
      width: number;
      height: number;
      /** Linear Rec.2020 RGB from LibRaw, 3 values per pixel (0..65535). */
      data: Uint16Array;
    }
  | {
      type: 'tiff';
      id: number;
      bytes: ArrayBuffer;
    };

/** One resolution level of an RGB half-float image (3 values per pixel). */
export interface HalfLevel {
  width: number;
  height: number;
  data: Uint16Array;
}

export interface HalfTile {
  core: Rect;
  padded: Rect;
  /** Full resolution, then half resolution (for smooth zoomed-out drawing). */
  levels: HalfLevel[];
}

export interface RgbaTile {
  core: Rect;
  padded: Rect;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export type ConvertResponse =
  | {
      id: number;
      ok: true;
      type: 'linear-rec2020';
      width: number;
      height: number;
      tiles: HalfTile[];
      /** Downscaled copy of the whole photo, largest level first. */
      overview: HalfLevel[];
    }
  | {
      id: number;
      ok: true;
      type: 'tiff';
      width: number;
      height: number;
      tiles: RgbaTile[];
    }
  | { id: number; ok: false; error: string };
