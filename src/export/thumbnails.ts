/** Small JPEG of a photo as edited, for the library grid. */
import { rec2020To } from '../color/colorSpaces';
import { THUMBNAIL_SIZE } from '../catalog/importPhotos';
import {
  frameSize,
  imageToCropMatrix,
  toPixels,
  type Geometry,
  type ImageLayout,
} from '../develop/geometry';
import type { DevelopRenderer, GpuImage, RenderSettings } from '../gpu/renderer';

export async function renderThumbnail(
  renderer: DevelopRenderer,
  gpu: GpuImage,
  layout: ImageLayout,
  geometry: Geometry,
  develop: RenderSettings,
): Promise<Blob> {
  const frame = frameSize(frameSize(layout, layout.rotation), geometry.rotate);
  const crop = toPixels(geometry.crop, frame);
  const { pixels, width, height } = renderer.renderSmall(
    gpu,
    imageToCropMatrix(layout, geometry),
    { width: crop.width, height: crop.height },
    develop,
    THUMBNAIL_SIZE,
    rec2020To('srgb'), // <img> tags show untagged JPEGs as sRGB
  );
  const canvas = new OffscreenCanvas(width, height);
  canvas
    .getContext('2d')!
    .putImageData(
      new ImageData(new Uint8ClampedArray(pixels.buffer as ArrayBuffer), width, height),
      0,
      0,
    );
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}
