/**
 * White balance as a physically based colour adaptation.
 *
 * LibRaw has already applied the camera's white balance, so a neutral grey in the
 * photo is neutral in our working space (white point D65). The Temperature and Tint
 * sliders say "the light was actually a bit warmer/cooler/greener than that". We
 * compute that light's white point and adapt it back to neutral with the Bradford
 * method — the same idea cameras and Lightroom use, expressed as one 3×3 matrix.
 */
import {
  invert,
  multiply,
  PRIMARIES,
  rgbToXyzMatrix,
  transform,
  type Matrix3,
} from '../color/colorSpaces';

interface Xy {
  x: number;
  y: number;
}

const D65: Xy = PRIMARIES.rec2020.white;
const D65_KELVIN = 6504;

/** Temperature slider ±100 moves the light by up to ±110 mired (micro reciprocal degrees). */
const MIRED_PER_STEP = 1.1;
/** Tint slider ±100 moves the light by ±0.015 away from the black-body curve. */
const DUV_PER_STEP = 0.00015;

/** Black-body (Planckian) light colour for 1667–25000 K (Kim et al., 2002). */
export function planckianXy(kelvin: number): Xy {
  const t = Math.min(25000, Math.max(1667, kelvin));
  const t2 = t * t;
  const t3 = t2 * t;
  const x =
    t <= 4000
      ? -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / t + 0.24039;
  const x2 = x * x;
  const x3 = x2 * x;
  const y =
    t <= 2222
      ? -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483;
  return { x, y };
}

// CIE 1960 uv coordinates, where "distance from the black-body curve" (tint) is defined.
function toUv({ x, y }: Xy): { u: number; v: number } {
  const d = -2 * x + 12 * y + 3;
  return { u: (4 * x) / d, v: (6 * y) / d };
}

function fromUv(u: number, v: number): Xy {
  const d = 2 * u - 8 * v + 4;
  return { x: (3 * u) / d, y: (2 * v) / d };
}

/**
 * White point of the light implied by the sliders. At 0/0 this is exactly D65.
 * Positive temperature means the light was bluer, so correcting it warms the photo.
 */
export function sliderWhitePoint(temperature: number, tint: number): Xy {
  const mired = 1e6 / D65_KELVIN - temperature * MIRED_PER_STEP;
  const kelvin = 1e6 / mired;

  // Follow the shape of the black-body curve, shifted so that 0 lands exactly on D65.
  const here = toUv(planckianXy(kelvin));
  const ref = toUv(planckianXy(D65_KELVIN));
  const d65 = toUv(D65);
  let u = here.u + (d65.u - ref.u);
  let v = here.v + (d65.v - ref.v);

  // Tint: move perpendicular to the curve. "Above" the curve is greener light, which
  // the correction turns more magenta — so positive tint moves the light greener.
  const ahead = toUv(planckianXy(1e6 / (mired - 1)));
  const behind = toUv(planckianXy(1e6 / (mired + 1)));
  const du = ahead.u - behind.u;
  const dv = ahead.v - behind.v;
  const length = Math.hypot(du, dv) || 1;
  const normal = { u: -dv / length, v: du / length };
  const sign = normal.v >= 0 ? 1 : -1; // make "+normal" point towards green (higher v)
  u += sign * normal.u * tint * DUV_PER_STEP;
  v += sign * normal.v * tint * DUV_PER_STEP;
  return fromUv(u, v);
}

const BRADFORD: Matrix3 = [
  0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296,
];

const xyToXyz = ({ x, y }: Xy): [number, number, number] => [x / y, 1, (1 - x - y) / y];

/** Bradford chromatic adaptation from one white point to another, in XYZ. */
export function bradfordAdaptation(from: Xy, to: Xy): Matrix3 {
  const [s0, s1, s2] = transform(BRADFORD, xyToXyz(from));
  const [d0, d1, d2] = transform(BRADFORD, xyToXyz(to));
  const scale: Matrix3 = [d0 / s0, 0, 0, 0, d1 / s1, 0, 0, 0, d2 / s2];
  return multiply(invert(BRADFORD), multiply(scale, BRADFORD));
}

const REC2020_TO_XYZ = rgbToXyzMatrix(PRIMARIES.rec2020);
const XYZ_TO_REC2020 = invert(REC2020_TO_XYZ);

/** White-balance matrix acting on linear Rec.2020 RGB. */
export function whiteBalanceMatrix(temperature: number, tint: number): Matrix3 {
  if (temperature === 0 && tint === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const adapt = bradfordAdaptation(sliderWhitePoint(temperature, tint), D65);
  return multiply(XYZ_TO_REC2020, multiply(adapt, REC2020_TO_XYZ));
}
