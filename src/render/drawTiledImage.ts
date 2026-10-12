import type { TiledImage } from './tiledImage';
import type { View } from './viewTransform';
import { orientedSize } from './viewTransform';

/** Above this zoom, pixels are drawn as crisp squares (useful for checking focus). */
const PIXELATED_FROM_SCALE = 2;

/** Draws `image` onto a canvas whose size is in device pixels. */
export function drawTiledImage(ctx: CanvasRenderingContext2D, image: TiledImage, view: View) {
  const { width, height, rotation } = image;
  const oriented = orientedSize(image, rotation);

  ctx.save();
  ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
  // Rotate around the centre of the oriented image.
  ctx.translate(oriented.width / 2, oriented.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);

  const pixelated = view.scale >= PIXELATED_FROM_SCALE;
  ctx.imageSmoothingEnabled = !pixelated;
  ctx.imageSmoothingQuality = 'high';

  if (view.scale <= image.overviewScale) {
    ctx.drawImage(image.overview, 0, 0, width, height);
  } else {
    for (const { rect, bitmap } of image.tiles) {
      ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
    }
  }
  ctx.restore();
}
