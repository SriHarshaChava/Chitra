/**
 * Maps image pixel positions to WebGL "clip space" (−1…+1 across the canvas),
 * including the photo's rotation and the current zoom/pan.
 */
import { multiply, transform, type Matrix3 } from '../color/colorSpaces';
import type { Rotation } from '../render/sourceImage';
import type { View } from '../render/viewTransform';

/** Image pixel → rotated ("oriented") pixel, as a 3×3 affine matrix. */
export function orientationMatrix(width: number, height: number, rotation: Rotation): Matrix3 {
  switch (rotation) {
    case 90: // clockwise: the top-left corner moves to the top-right
      return [0, -1, height, 1, 0, 0, 0, 0, 1];
    case 180:
      return [-1, 0, width, 0, -1, height, 0, 0, 1];
    case 270:
      return [0, 1, 0, -1, 0, width, 0, 0, 1];
    default:
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
}

export function imageToClipMatrix(
  image: { width: number; height: number; rotation: Rotation },
  view: View,
  canvasWidth: number,
  canvasHeight: number,
): Matrix3 {
  const orient = orientationMatrix(image.width, image.height, image.rotation);
  const toDevice: Matrix3 = [view.scale, 0, view.x, 0, view.scale, view.y, 0, 0, 1];
  const toClip: Matrix3 = [2 / canvasWidth, 0, -1, 0, -2 / canvasHeight, 1, 0, 0, 1];
  return multiply(toClip, multiply(toDevice, orient));
}

/** Applies an affine matrix to a 2D point. */
export function applyToPoint(m: Matrix3, x: number, y: number): [number, number] {
  const [px, py] = transform(m, [x, y, 1]);
  return [px, py];
}
