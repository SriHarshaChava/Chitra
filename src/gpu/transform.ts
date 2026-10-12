/**
 * Maps frame pixels (the straightened, cropped photo as shown) to WebGL "clip space"
 * (−1…+1 across the canvas), including the current zoom and pan.
 */
import { multiply, transform, type Matrix3 } from '../color/colorSpaces';
import type { View } from '../render/viewTransform';

/** Display pixel → clip space, after applying the zoom/pan `view`. */
export function viewToClipMatrix(view: View, canvasWidth: number, canvasHeight: number): Matrix3 {
  const toDevice: Matrix3 = [view.scale, 0, view.x, 0, view.scale, view.y, 0, 0, 1];
  const toClip: Matrix3 = [2 / canvasWidth, 0, -1, 0, -2 / canvasHeight, 1, 0, 0, 1];
  return multiply(toClip, toDevice);
}

/** Applies an affine matrix to a 2D point. */
export function applyToPoint(m: Matrix3, x: number, y: number): [number, number] {
  const [px, py] = transform(m, [x, y, 1]);
  return [px, py];
}
