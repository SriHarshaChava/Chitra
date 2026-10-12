import { describe, expect, it } from 'vitest';
import {
  baseCurve,
  decodeSrgb,
  encodeSrgb,
  invert,
  multiply,
  PRIMARIES,
  rec2020To,
  rgbToXyzMatrix,
  transform,
  type Matrix3,
} from './colorSpaces';

const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function expectMatrixClose(actual: Matrix3, expected: Matrix3, digits = 4) {
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, digits));
}

describe('matrix helpers', () => {
  it('inverts a matrix', () => {
    const m: Matrix3 = [2, 0, 1, 1, 3, 0, 0, 1, 4];
    expectMatrixClose(multiply(m, invert(m)), IDENTITY, 10);
  });

  it('rejects a singular matrix', () => {
    expect(() => invert([1, 2, 3, 2, 4, 6, 0, 0, 1])).toThrow();
  });
});

describe('rgbToXyzMatrix', () => {
  it('matches the published sRGB matrix (IEC 61966-2-1)', () => {
    expectMatrixClose(
      rgbToXyzMatrix(PRIMARIES.srgb),
      [0.4124, 0.3576, 0.1805, 0.2126, 0.7152, 0.0722, 0.0193, 0.1192, 0.9505],
      3,
    );
  });

  it('maps RGB white to Y = 1', () => {
    const [, y] = transform(rgbToXyzMatrix(PRIMARIES.rec2020), [1, 1, 1]);
    expect(y).toBeCloseTo(1, 10);
  });
});

describe('rec2020To', () => {
  it.each(['srgb', 'display-p3'] as const)('keeps neutral greys neutral in %s', (space) => {
    const [r, g, b] = transform(rec2020To(space), [0.18, 0.18, 0.18]);
    expect(r).toBeCloseTo(0.18, 6);
    expect(g).toBeCloseTo(0.18, 6);
    expect(b).toBeCloseTo(0.18, 6);
  });

  it('matches the published Rec.2020 → Rec.709 matrix (ITU-R BT.2087)', () => {
    expectMatrixClose(
      rec2020To('srgb'),
      [1.6605, -0.5876, -0.0728, -0.1246, 1.1329, -0.0083, -0.0182, -0.1006, 1.1187],
      3,
    );
  });

  it('shows Rec.2020 red is outside both display gamuts', () => {
    expect(Math.min(...transform(rec2020To('srgb'), [1, 0, 0]))).toBeLessThan(0);
    expect(Math.min(...transform(rec2020To('display-p3'), [1, 0, 0]))).toBeLessThan(0);
  });
});

describe('sRGB transfer curve', () => {
  it.each([0, 0.001, 0.0031308, 0.18, 0.5, 1])('round-trips %f', (v) => {
    expect(decodeSrgb(encodeSrgb(v))).toBeCloseTo(v, 6);
  });

  it('encodes 18% grey to about 46%', () => {
    expect(encodeSrgb(0.18)).toBeCloseTo(0.4614, 3);
  });

  it('clamps out-of-range values', () => {
    expect(encodeSrgb(-0.5)).toBe(0);
    expect(encodeSrgb(2)).toBe(1);
  });
});

describe('baseCurve', () => {
  it('keeps black, mid-grey and white fixed', () => {
    expect(baseCurve(0)).toBe(0);
    expect(baseCurve(0.5)).toBeCloseTo(0.5, 10);
    expect(baseCurve(1)).toBe(1);
  });

  it('darkens shadows and brightens highlights', () => {
    expect(baseCurve(0.2)).toBeLessThan(0.2);
    expect(baseCurve(0.8)).toBeGreaterThan(0.8);
  });

  it('does nothing at strength 0', () => {
    expect(baseCurve(0.3, 0)).toBeCloseTo(0.3, 10);
  });

  it('never decreases', () => {
    for (let v = 0.01; v <= 1; v += 0.01) {
      expect(baseCurve(v)).toBeGreaterThanOrEqual(baseCurve(v - 0.01));
    }
  });
});
