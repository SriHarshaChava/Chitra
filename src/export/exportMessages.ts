import type { OutputColorSpace } from './iccProfiles';

export type EncodeRequest =
  | {
      id: number;
      format: 'jpeg';
      quality: number;
      colorSpace: OutputColorSpace;
      width: number;
      height: number;
      /** Encoded 8-bit RGBA. */
      pixels: Uint8Array;
    }
  | {
      id: number;
      format: 'tiff16';
      colorSpace: OutputColorSpace;
      width: number;
      height: number;
      /** Encoded 16-bit RGB. */
      pixels: Uint16Array;
    };

export type EncodeResponse =
  { id: number; ok: true; bytes: Uint8Array } | { id: number; ok: false; error: string };
