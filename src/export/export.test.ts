import jpeg from 'jpeg-js';
import UTIF from 'utif';
import { describe, expect, it } from 'vitest';
import { encodeSrgb } from '../color/colorSpaces';
import {
  encodeForOutput,
  encodeJpeg,
  encodeTiff16,
  insertJpegIcc,
  makeQuantizer,
} from './encoders';
import { estimateBytes, exportFileName, outputSize } from './exportSettings';
import { iccProfile } from './iccProfiles';

const crop = { width: 6000, height: 4000 };

describe('outputSize', () => {
  it('keeps full size', () => {
    expect(outputSize(crop, { sizeMode: 'full', sizeValue: 0 })).toEqual(crop);
  });

  it('fits the long edge', () => {
    expect(outputSize(crop, { sizeMode: 'long-edge', sizeValue: 2048 })).toEqual({
      width: 2048,
      height: 1365,
    });
    expect(
      outputSize({ width: 4000, height: 6000 }, { sizeMode: 'long-edge', sizeValue: 3000 }),
    ).toEqual({
      width: 2000,
      height: 3000,
    });
  });

  it('targets megapixels', () => {
    const size = outputSize(crop, { sizeMode: 'megapixels', sizeValue: 6 });
    expect((size.width * size.height) / 1e6).toBeCloseTo(6, 1);
    expect(size.width / size.height).toBeCloseTo(1.5, 2);
  });

  it('scales by percent', () => {
    expect(outputSize(crop, { sizeMode: 'percent', sizeValue: 25 })).toEqual({
      width: 1500,
      height: 1000,
    });
  });

  it('never enlarges', () => {
    expect(outputSize(crop, { sizeMode: 'long-edge', sizeValue: 99999 })).toEqual(crop);
    expect(outputSize(crop, { sizeMode: 'percent', sizeValue: 0 })).toEqual(crop);
  });
});

describe('names and estimates', () => {
  it('names the exported file', () => {
    expect(exportFileName('DSC_0401.NEF', 'jpeg')).toBe('DSC_0401-chitra.jpg');
    expect(exportFileName('scan.final.tif', 'tiff16')).toBe('scan.final-chitra.tif');
  });

  it('estimates larger files for higher quality', () => {
    expect(estimateBytes(crop, { format: 'jpeg', quality: 100 })).toBeGreaterThan(
      estimateBytes(crop, { format: 'jpeg', quality: 50 }),
    );
  });
});

describe('quantizing', () => {
  it('uses the sRGB curve for sRGB and P3', () => {
    expect(makeQuantizer('srgb', 8)(0.18)).toBe(Math.round(encodeSrgb(0.18) * 255));
    expect(makeQuantizer('display-p3', 16)(0.18)).toBe(Math.round(encodeSrgb(0.18) * 65535));
  });

  it('uses gamma 2.2 for Adobe RGB', () => {
    expect(encodeForOutput(0.5, 'adobe-rgb')).toBeCloseTo(Math.pow(0.5, 256 / 563), 6);
  });

  it('clamps', () => {
    const q = makeQuantizer('srgb', 8);
    expect(q(-1)).toBe(0);
    expect(q(2)).toBe(255);
  });
});

describe('ICC profiles', () => {
  it.each(['srgb', 'display-p3', 'adobe-rgb'] as const)('%s is a valid ICC profile', (space) => {
    const icc = iccProfile(space);
    const view = new DataView(icc.buffer);
    expect(view.getUint32(0)).toBe(icc.length); // size field
    expect(new TextDecoder().decode(icc.subarray(36, 40))).toBe('acsp'); // signature
  });
});

describe('JPEG', () => {
  it('encodes, embeds the profile and decodes back', () => {
    const width = 16;
    const height = 8;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([200, 100, 50, 255], i);
    const icc = iccProfile('srgb');
    const bytes = encodeJpeg(rgba, width, height, 95, icc);

    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]); // start of image
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('ICC_PROFILE');

    const decoded = jpeg.decode(bytes, { useTArray: true });
    expect(decoded.width).toBe(width);
    expect(Math.abs(decoded.data[0]! - 200)).toBeLessThanOrEqual(3);
    expect(Math.abs(decoded.data[1]! - 100)).toBeLessThanOrEqual(3);
  });

  it('places the profile after the JFIF header', () => {
    const fake = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x01, 0x02, 0xff, 0xd9]);
    const out = insertJpegIcc(fake, new Uint8Array([1, 2, 3]));
    expect([out[8], out[9]]).toEqual([0xff, 0xe2]);
    expect(out.length).toBe(fake.length + 2 + 16 + 3);
  });
});

describe('TIFF 16-bit', () => {
  it('writes a compressed file that a TIFF reader decodes exactly', async () => {
    const width = 37;
    const height = 70; // more than one strip
    const rgb = new Uint16Array(width * height * 3);
    for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 2731) % 65536;
    const bytes = await encodeTiff16(rgb, width, height, iccProfile('adobe-rgb'));

    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const [ifd] = UTIF.decode(buffer);
    UTIF.decodeImage(buffer, ifd!);
    expect(ifd!.width).toBe(width);
    expect(ifd!.height).toBe(height);
    expect((ifd as unknown as Record<string, number[]>).t258).toEqual([16, 16, 16]);
    expect((ifd as unknown as Record<string, unknown>).t34675).toBeDefined(); // ICC profile tag

    // UTIF keeps the raw (big- or little-endian) bytes in `data`; compare 16-bit values.
    const raw = (ifd as unknown as { data: Uint8Array }).data;
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (const i of [0, 1, 2, 3, 500, rgb.length - 1]) {
      expect(view.getUint16(i * 2, true)).toBe(rgb[i]);
    }
  });
});
