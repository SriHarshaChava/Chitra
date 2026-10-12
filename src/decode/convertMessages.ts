/** Messages exchanged with `convert.worker.ts`. */
import type { DisplayColorSpace } from '../color/colorSpaces';
import type { TileRect } from '../render/tiles';

export type ConvertRequest =
  | {
      type: 'linear-rec2020';
      id: number;
      width: number;
      height: number;
      /** Linear Rec.2020 RGB, 3 values per pixel. */
      data: Uint16Array;
      target: DisplayColorSpace;
    }
  | {
      type: 'tiff';
      id: number;
      bytes: ArrayBuffer;
    };

export interface TileBuffer {
  rect: TileRect;
  data: Uint8ClampedArray<ArrayBuffer>;
}

export type ConvertResponse =
  | {
      id: number;
      ok: true;
      width: number;
      height: number;
      colorSpace: DisplayColorSpace;
      tiles: TileBuffer[];
    }
  | { id: number; ok: false; error: string };
