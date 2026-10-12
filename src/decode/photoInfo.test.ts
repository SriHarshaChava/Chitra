import { describe, expect, it } from 'vitest';
import {
  describeLensRange,
  formatAperture,
  formatCamera,
  formatExposureBias,
  formatFileSize,
  formatMegapixels,
  formatShutter,
  infoFromExif,
  mergeInfo,
} from './photoInfo';

describe('formatShutter', () => {
  it.each([
    [1 / 250, '1/250 s'],
    [1 / 4000, '1/4000 s'],
    [0.625, '0.6 s'],
    [2, '2 s'],
    [30, '30 s'],
  ])('%f -> %s', (seconds, expected) => {
    expect(formatShutter(seconds)).toBe(expected);
  });
});

describe('simple formatters', () => {
  it('formats aperture', () => expect(formatAperture(5.599999)).toBe('f/5.6'));
  it('formats exposure bias', () => {
    expect(formatExposureBias(0.3333)).toBe('+0.3 EV');
    expect(formatExposureBias(-1)).toBe('−1 EV');
    expect(formatExposureBias(0)).toBe('0 EV');
  });
  it('formats megapixels', () =>
    expect(formatMegapixels(6000, 4000)).toBe('6000 × 4000 (24.0 MP)'));
  it('formats file size', () => {
    expect(formatFileSize(500)).toBe('1 KB');
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25.0 MB');
  });
});

describe('formatCamera', () => {
  it.each([
    ['NIKON CORPORATION', 'NIKON D5600', 'Nikon D5600'],
    ['NIKON CORPORATION', 'D3S', 'Nikon D3S'],
    ['Apple', 'iPhone 15 Pro', 'Apple iPhone 15 Pro'],
    [undefined, 'D5600', 'D5600'],
  ])('%s + %s -> %s', (make, model, expected) => {
    expect(formatCamera(make, model)).toBe(expected);
  });
});

describe('describeLensRange', () => {
  it('describes a zoom', () =>
    expect(describeLensRange(18, 55, 3.5, 5.6)).toBe('18–55 mm f/3.5–5.6'));
  it('describes a prime', () => expect(describeLensRange(28, 28, 1.4, 1.4)).toBe('28 mm f/1.4'));
  it('returns nothing without data', () => expect(describeLensRange(0, 0)).toBeUndefined());
});

describe('infoFromExif', () => {
  it('maps EXIF fields', () => {
    const date = new Date(2024, 0, 1);
    expect(
      infoFromExif({
        Make: 'NIKON CORPORATION',
        Model: 'NIKON D5600',
        FNumber: 8,
        ExposureTime: 0.002,
        ISO: 400,
        DateTimeOriginal: date,
      }),
    ).toMatchObject({
      camera: 'Nikon D5600',
      aperture: 8,
      shutter: 0.002,
      iso: 400,
      takenAt: date,
    });
  });
});

describe('mergeInfo', () => {
  it('prefers primary values and fills gaps', () => {
    expect(mergeInfo({ iso: 800, lens: '' }, { iso: 100, lens: '50 mm f/1.8' })).toEqual({
      iso: 800,
      lens: '50 mm f/1.8',
    });
  });

  it('ignores zero placeholders from RAW metadata', () => {
    expect(mergeInfo({ aperture: 0 }, { aperture: 2.8 })).toEqual({ aperture: 2.8 });
  });
});
