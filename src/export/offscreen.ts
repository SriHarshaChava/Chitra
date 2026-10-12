/**
 * Develops photos in the background, without showing them: used for batch export and
 * for refreshing thumbnails after settings are pasted onto many photos.
 *
 * It has its own hidden WebGL canvas and handles one photo at a time, so memory use
 * stays at one photo even when exporting hundreds.
 */
import { BASE_CONTRAST } from '../color/colorSpaces';
import { developParams, type DevelopParams } from '../develop/developMath';
import type { ImageLayout } from '../develop/geometry';
import type { Recipe } from '../develop/recipe';
import { DevelopRenderer, type GpuImage } from '../gpu/renderer';
import { decodeFull } from '../photos/loadPhoto';

export interface DevelopedPhoto {
  renderer: DevelopRenderer;
  gpu: GpuImage;
  layout: ImageLayout;
  develop: DevelopParams;
}

let renderer: DevelopRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getRenderer(): DevelopRenderer {
  if (!renderer || renderer.gl.isContextLost()) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    renderer = new DevelopRenderer(canvas, 'srgb');
  }
  return renderer;
}

/** Decodes `file`, applies `recipe` on the GPU and runs `task`; jobs run one at a time. */
export function withDevelopedPhoto<T>(
  file: File,
  recipe: Recipe,
  task: (photo: DevelopedPhoto) => Promise<T>,
): Promise<T> {
  const job = queue.then(async () => {
    const source = await decodeFull(file);
    const r = getRenderer();
    let gpu: GpuImage | null = null;
    try {
      gpu = r.upload(source);
      const layout = { width: source.width, height: source.height, rotation: source.rotation };
      const develop = developParams(recipe, source.kind === 'linear' ? BASE_CONTRAST : 0);
      return await task({ renderer: r, gpu, layout, develop });
    } finally {
      source.release();
      if (gpu) r.disposeImage(gpu);
    }
  });
  queue = job.catch(() => undefined);
  return job;
}
