import { describe, expect, it } from 'vitest';
import { ACCEPTED_FILE_TYPES, decoderFor, extensionOf } from './fileTypes';

describe('decoderFor', () => {
  it.each([
    ['DSC_0001.NEF', 'raw'],
    ['dsc_0001.nef', 'raw'],
    ['photo.dng', 'raw'],
    ['scan.TIF', 'tiff'],
    ['scan.tiff', 'tiff'],
    ['IMG_1.JPG', 'browser'],
    ['image.png', 'browser'],
    ['notes.txt', null],
    ['no-extension', null],
  ])('%s -> %s', (name, expected) => {
    expect(decoderFor(name)).toBe(expected);
  });
});

describe('extensionOf', () => {
  it('handles names with several dots', () => {
    expect(extensionOf('trip.2024.final.NEF')).toBe('nef');
  });
});

describe('ACCEPTED_FILE_TYPES', () => {
  it('includes Nikon RAW files', () => {
    expect(ACCEPTED_FILE_TYPES.split(',')).toEqual(expect.arrayContaining(['.nef', '.nrw']));
  });
});
