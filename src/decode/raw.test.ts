import { describe, expect, it, vi } from 'vitest';
import type { Metadata } from 'libraw-wasm';

// The real LibRaw needs a browser Web Worker; these tests only cover our own logic.
vi.mock('libraw-wasm', () => ({ default: class {} }));

const { infoFromRawMetadata, rotationFromFlip, RAW_DECODE_SETTINGS } = await import('./raw');

function meta(overrides: Partial<Metadata> = {}): Metadata {
  return {
    width: 6000,
    height: 4000,
    raw_width: 6016,
    raw_height: 4016,
    top_margin: 0,
    left_margin: 0,
    flip: 0,
    camera_make: 'Nikon',
    camera_model: 'D5600',
    iso_speed: 400,
    shutter: 1 / 1000,
    aperture: 5.6,
    focal_len: 300,
    timestamp: new Date('2024-05-01T06:30:00Z'),
    shot_order: 0,
    desc: '',
    artist: '',
    thumb_width: 6000,
    thumb_height: 4000,
    thumb_format: 'jpeg',
    ...overrides,
  };
}

describe('rotationFromFlip', () => {
  it.each([
    [0, 0],
    [3, 180],
    [5, 270],
    [6, 90],
  ])('flip %i -> %i°', (flip, degrees) => {
    expect(rotationFromFlip(flip)).toBe(degrees);
  });
});

describe('infoFromRawMetadata', () => {
  it('maps LibRaw metadata', () => {
    expect(infoFromRawMetadata(meta())).toMatchObject({
      camera: 'Nikon D5600',
      iso: 400,
      aperture: 5.6,
      shutter: 0.001,
      focalLength: 300,
      width: 6000,
      height: 4000,
    });
  });

  it('swaps dimensions for portrait photos', () => {
    expect(infoFromRawMetadata(meta({ flip: 6 }))).toMatchObject({ width: 4000, height: 6000 });
  });

  it('describes the lens from its focal and aperture range when it has no name', () => {
    const info = infoFromRawMetadata(
      meta({
        lens: {
          Lens: '',
          MinFocal: 70,
          MaxFocal: 300,
          MaxAp4MinFocal: 4.5,
          MaxAp4MaxFocal: 6.3,
        } as Metadata['lens'],
      }),
    );
    expect(info.lens).toBe('70–300 mm f/4.5–6.3');
  });

  it('drops zero placeholders', () => {
    const info = infoFromRawMetadata(meta({ aperture: 0, iso_speed: 0, timestamp: new Date(0) }));
    expect(info.aperture).toBeUndefined();
    expect(info.iso).toBeUndefined();
    expect(info.takenAt).toBeUndefined();
  });
});

describe('RAW_DECODE_SETTINGS', () => {
  it('decodes to linear 16-bit Rec.2020 without auto-brightening', () => {
    expect(RAW_DECODE_SETTINGS).toMatchObject({
      outputBps: 16,
      outputColor: 8,
      noAutoBright: true,
    });
  });
});
