/**
 * Exports the edited photo: renders the final (cropped, developed) image on the GPU at
 * full resolution, chunk by chunk, resizes it if asked, and writes a file.
 */
import { rec2020To } from '../color/colorSpaces';
import {
  frameSize,
  imageToCropMatrix,
  toPixels,
  type Geometry,
  type ImageLayout,
} from '../develop/geometry';
import type { DevelopRenderer, GpuImage, RenderSettings } from '../gpu/renderer';
import { encodeInWorker } from './encodeClient';
import { makeQuantizer } from './encoders';
import { outputSize, type ExportSettings } from './exportSettings';

/** Square chunk rendered at a time (keeps GPU and memory use small). */
const CHUNK = 1024;

export interface ExportJob {
  renderer: DevelopRenderer;
  gpu: GpuImage;
  layout: ImageLayout;
  geometry: Geometry;
  develop: RenderSettings;
  settings: ExportSettings;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
}

export interface ExportResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: string;
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function runExport(job: ExportJob): Promise<ExportResult> {
  const { renderer, gpu, settings, onProgress } = job;
  const frame = frameSize(frameSize(job.layout, job.layout.rotation), job.geometry.rotate);
  const cropRect = toPixels(job.geometry.crop, frame);
  const full = { width: Math.round(cropRect.width), height: Math.round(cropRect.height) };
  const out = outputSize(full, settings);
  const sameSize = out.width === full.width && out.height === full.height;

  const imageToCrop = imageToCropMatrix(job.layout, job.geometry);
  const outputMatrix = rec2020To(settings.colorSpace);
  const bits = settings.format === 'jpeg' ? 8 : 16;
  const quantize = makeQuantizer(settings.colorSpace, bits);
  const channels = bits === 8 ? 4 : 3;
  const pixels =
    bits === 8
      ? new Uint8Array(out.width * out.height * 4).fill(255)
      : new Uint16Array(out.width * out.height * 3);

  // When shrinking, each full-resolution pixel is added to the output pixel it falls
  // into, and the sum is averaged at the end (an area filter, done in linear light).
  const sums = sameSize ? null : new Float32Array(out.width * out.height * 3);
  const counts = sameSize ? null : new Float32Array(out.width * out.height);
  const sx = out.width / full.width;
  const sy = out.height / full.height;

  const target = renderer.createExportTarget(CHUNK);
  try {
    const chunksX = Math.ceil(full.width / CHUNK);
    const chunksY = Math.ceil(full.height / CHUNK);
    let done = 0;
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const region = {
          x: cx * CHUNK,
          y: cy * CHUNK,
          width: Math.min(CHUNK, full.width - cx * CHUNK),
          height: Math.min(CHUNK, full.height - cy * CHUNK),
        };
        const rgba = renderer.renderExportChunk(
          gpu,
          imageToCrop,
          region,
          job.develop,
          outputMatrix,
          target,
        );
        for (let y = 0; y < region.height; y++) {
          const fy = region.y + y;
          for (let x = 0; x < region.width; x++) {
            const fx = region.x + x;
            const i = (y * region.width + x) * 4;
            if (sums && counts) {
              const ox = Math.min(out.width - 1, Math.floor((fx + 0.5) * sx));
              const oy = Math.min(out.height - 1, Math.floor((fy + 0.5) * sy));
              const o = oy * out.width + ox;
              sums[o * 3] = sums[o * 3]! + rgba[i]!;
              sums[o * 3 + 1] = sums[o * 3 + 1]! + rgba[i + 1]!;
              sums[o * 3 + 2] = sums[o * 3 + 2]! + rgba[i + 2]!;
              counts[o] = counts[o]! + 1;
            } else {
              const o = (fy * out.width + fx) * channels;
              pixels[o] = quantize(rgba[i]!);
              pixels[o + 1] = quantize(rgba[i + 1]!);
              pixels[o + 2] = quantize(rgba[i + 2]!);
            }
          }
        }
        done++;
        onProgress?.((done / (chunksX * chunksY)) * 0.8);
        await nextTask(); // let the interface update between chunks
      }
    }
  } finally {
    renderer.disposeExportTarget(target);
  }

  if (sums && counts) {
    for (let p = 0; p < out.width * out.height; p++) {
      const n = counts[p]! || 1;
      const o = p * channels;
      pixels[o] = quantize(sums[p * 3]! / n);
      pixels[o + 1] = quantize(sums[p * 3 + 1]! / n);
      pixels[o + 2] = quantize(sums[p * 3 + 2]! / n);
    }
  }

  onProgress?.(0.85);
  const bytes =
    settings.format === 'jpeg'
      ? await encodeInWorker({
          format: 'jpeg',
          quality: settings.quality,
          colorSpace: settings.colorSpace,
          width: out.width,
          height: out.height,
          pixels: pixels as Uint8Array,
        })
      : await encodeInWorker({
          format: 'tiff16',
          colorSpace: settings.colorSpace,
          width: out.width,
          height: out.height,
          pixels: pixels as Uint16Array,
        });
  onProgress?.(1);
  return {
    bytes,
    width: out.width,
    height: out.height,
    mimeType: settings.format === 'jpeg' ? 'image/jpeg' : 'image/tiff',
  };
}
