/**
 * 16-bit "half" floating-point numbers.
 *
 * The GPU stores the photo as half floats: 16 bits per value like the RAW data, but
 * able to hold values above 1.0 (needed when exposure is pushed up) and filtered
 * smoothly when zooming. JavaScript has no built-in half type everywhere yet, so we
 * convert manually and pass the raw bits to WebGL.
 */

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** Converts a number to the bit pattern of the nearest half float. */
export function toHalf(value: number): number {
  f32[0] = value;
  const bits = u32[0]!;
  const sign = (bits >>> 16) & 0x8000;
  const exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  const mantissa = bits & 0x7fffff;

  if (exponent >= 31) return sign | 0x7c00; // too large: infinity
  if (exponent <= 0) {
    if (exponent < -10) return sign; // too small: zero
    const m = (mantissa | 0x800000) >> (1 - exponent);
    return sign | ((m + 0x1000) >> 13); // subnormal
  }
  // Addition (not OR) lets rounding carry into the exponent correctly.
  return sign | ((exponent << 10) + ((mantissa + 0x1000) >> 13));
}

/** Converts half-float bits back to a number (used by tests). */
export function fromHalf(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 31) return mantissa ? Number.NaN : sign * Infinity;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

let uint16Lut: Uint16Array | null = null;

/**
 * Lookup table from 16-bit integer sample (0..65535, as LibRaw outputs) to the half
 * float of value/65535. Converting 72 million samples becomes one table lookup each.
 */
export function uint16ToHalfLut(): Uint16Array {
  if (!uint16Lut) {
    uint16Lut = new Uint16Array(65536);
    for (let i = 0; i < 65536; i++) uint16Lut[i] = toHalf(i / 65535);
  }
  return uint16Lut;
}
