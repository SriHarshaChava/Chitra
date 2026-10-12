/**
 * File writers for exported photos: JPEG (8-bit) and TIFF (16-bit), both with an
 * embedded colour profile.
 */
import jpeg from 'jpeg-js';
import { encodeSrgb } from '../color/colorSpaces';
import type { OutputColorSpace } from './iccProfiles';

/** Adobe RGB (1998) uses a pure power curve: 2 + 51/256. */
const ADOBE_GAMMA = 563 / 256;

/** Linear light (0..1) → encoded value (0..1) for the output colour space. */
export function encodeForOutput(linear: number, space: OutputColorSpace): number {
  if (space === 'adobe-rgb') return Math.pow(Math.min(1, Math.max(0, linear)), 1 / ADOBE_GAMMA);
  return encodeSrgb(linear);
}

/**
 * Returns a function turning a linear value (0..1) into an integer code for the given
 * bit depth. 8-bit uses a lookup table; 16-bit computes exactly.
 */
export function makeQuantizer(space: OutputColorSpace, bits: 8 | 16): (linear: number) => number {
  if (bits === 16) {
    return (v) => Math.round(encodeForOutput(v, space) * 65535);
  }
  const steps = 8192;
  const lut = new Uint8Array(steps + 1);
  for (let i = 0; i <= steps; i++) lut[i] = Math.round(encodeForOutput(i / steps, space) * 255);
  return (v) => lut[Math.round((v <= 0 ? 0 : v >= 1 ? 1 : v) * steps)]!;
}

// ---------- JPEG ----------

export function encodeJpeg(
  rgba: Uint8Array,
  width: number,
  height: number,
  quality: number,
  icc: Uint8Array,
): Uint8Array {
  const { data } = jpeg.encode({ data: rgba, width, height }, quality);
  return insertJpegIcc(new Uint8Array(data), icc);
}

/**
 * Inserts an ICC profile into a JPEG as APP2 "ICC_PROFILE" segments, right after the
 * start-of-image marker (and after APP0/JFIF if present).
 */
export function insertJpegIcc(jpegBytes: Uint8Array, icc: Uint8Array): Uint8Array {
  const MAX_CHUNK = 65519; // 65535 − 2 (length) − 14 (signature + sequence numbers)
  const chunks = Math.ceil(icc.length / MAX_CHUNK);
  const segments: Uint8Array[] = [];
  for (let i = 0; i < chunks; i++) {
    const part = icc.subarray(i * MAX_CHUNK, (i + 1) * MAX_CHUNK);
    const length = part.length + 16;
    const seg = new Uint8Array(length + 2);
    seg.set([0xff, 0xe2, length >> 8, length & 0xff]);
    seg.set(new TextEncoder().encode('ICC_PROFILE\0'), 4);
    seg[16] = i + 1;
    seg[17] = chunks;
    seg.set(part, 18);
    segments.push(seg);
  }
  // Skip SOI (2 bytes) and an APP0 segment if it comes next.
  let insertAt = 2;
  if (jpegBytes[2] === 0xff && jpegBytes[3] === 0xe0) {
    insertAt = 4 + ((jpegBytes[4]! << 8) | jpegBytes[5]!);
  }
  const extra = segments.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(jpegBytes.length + extra);
  out.set(jpegBytes.subarray(0, insertAt), 0);
  let offset = insertAt;
  for (const seg of segments) {
    out.set(seg, offset);
    offset += seg.length;
  }
  out.set(jpegBytes.subarray(insertAt), offset);
  return out;
}

// ---------- TIFF ----------

const ROWS_PER_STRIP = 64;

/**
 * Writes a 16-bit RGB TIFF with Deflate (zlib) compression and a horizontal predictor,
 * which together make photos roughly half the uncompressed size, losslessly.
 */
export async function encodeTiff16(
  rgb: Uint16Array,
  width: number,
  height: number,
  icc: Uint8Array,
): Promise<Uint8Array> {
  const strips: Uint8Array[] = [];
  for (let y = 0; y < height; y += ROWS_PER_STRIP) {
    const rows = Math.min(ROWS_PER_STRIP, height - y);
    strips.push(await deflate(predictStrip(rgb, width, y, rows)));
  }
  return buildTiff(width, height, strips, icc);
}

/**
 * Horizontal predictor (TIFF predictor 2): store each sample as the difference from
 * the same channel of the pixel to its left. Smooth photos then compress much better.
 * Samples are written little-endian.
 */
export function predictStrip(
  rgb: Uint16Array,
  width: number,
  y0: number,
  rows: number,
): Uint8Array {
  const out = new Uint8Array(rows * width * 6);
  const view = new DataView(out.buffer);
  let o = 0;
  for (let row = 0; row < rows; row++) {
    const start = (y0 + row) * width * 3;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        const i = start + x * 3 + c;
        const value = x === 0 ? rgb[i]! : (rgb[i]! - rgb[i - 3]!) & 0xffff;
        view.setUint16(o, value, true);
        o += 2;
      }
    }
  }
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(data as Uint8Array<ArrayBuffer>);
      controller.close();
    },
  });
  const compressed = input.pipeThrough(new CompressionStream('deflate'));
  const chunks: Uint8Array[] = [];
  const reader = compressed.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function buildTiff(
  width: number,
  height: number,
  strips: Uint8Array[],
  icc: Uint8Array,
): Uint8Array {
  const software = new TextEncoder().encode('Chitra\0');
  type Entry = [tag: number, type: number, count: number, value: number | Uint8Array];
  const SHORT = 3;
  const LONG = 4;
  const ASCII = 2;
  const UNDEFINED = 7;

  // Layout: header | strip data | bits-per-sample | strip offsets | strip byte counts | software | icc | IFD
  const header = 8;
  let offset = header;
  const stripOffsets: number[] = [];
  for (const s of strips) {
    stripOffsets.push(offset);
    offset += s.length + (s.length & 1); // keep word alignment
  }
  const bpsOffset = offset;
  offset += 6;
  const offsetsOffset = offset;
  offset += strips.length * 4;
  const countsOffset = offset;
  offset += strips.length * 4;
  const softwareOffset = offset;
  offset += software.length + (software.length & 1);
  const iccOffset = offset;
  offset += icc.length + (icc.length & 1);
  const ifdOffset = offset;

  const entries: Entry[] = [
    [256, LONG, 1, width], // ImageWidth
    [257, LONG, 1, height], // ImageLength
    [258, SHORT, 3, bpsOffset], // BitsPerSample = 16,16,16
    [259, SHORT, 1, 8], // Compression = Deflate
    [262, SHORT, 1, 2], // PhotometricInterpretation = RGB
    [273, LONG, strips.length, strips.length === 1 ? stripOffsets[0]! : offsetsOffset],
    [277, SHORT, 1, 3], // SamplesPerPixel
    [278, LONG, 1, ROWS_PER_STRIP],
    [279, LONG, strips.length, strips.length === 1 ? strips[0]!.length : countsOffset],
    [284, SHORT, 1, 1], // PlanarConfiguration = contiguous
    [305, ASCII, software.length, softwareOffset], // Software
    [317, SHORT, 1, 2], // Predictor = horizontal
    [34675, UNDEFINED, icc.length, iccOffset], // ICC profile
  ];
  const total = ifdOffset + 2 + entries.length * 12 + 4;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  // Little-endian header: "II", 42, offset of the first IFD.
  view.setUint16(0, 0x4949, false);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  strips.forEach((s, i) => out.set(s, stripOffsets[i]!));
  for (let c = 0; c < 3; c++) view.setUint16(bpsOffset + c * 2, 16, true);
  strips.forEach((s, i) => {
    view.setUint32(offsetsOffset + i * 4, stripOffsets[i]!, true);
    view.setUint32(countsOffset + i * 4, s.length, true);
  });
  out.set(software, softwareOffset);
  out.set(icc, iccOffset);

  view.setUint16(ifdOffset, entries.length, true);
  entries.forEach(([tag, type, count, value], i) => {
    const p = ifdOffset + 2 + i * 12;
    view.setUint16(p, tag, true);
    view.setUint16(p + 2, type, true);
    view.setUint32(p + 4, count, true);
    if (type === SHORT && count === 1) view.setUint16(p + 8, value as number, true);
    else view.setUint32(p + 8, value as number, true);
  });
  view.setUint32(ifdOffset + 2 + entries.length * 12, 0, true); // no next IFD
  return out;
}
