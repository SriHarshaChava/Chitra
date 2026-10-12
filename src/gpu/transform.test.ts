import { describe, expect, it } from 'vitest';
import { applyToPoint, imageToClipMatrix, orientationMatrix } from './transform';

describe('orientationMatrix', () => {
  it.each([
    [0, [0, 0], [0, 0]],
    [90, [0, 0], [400, 0]], // top-left → top-right
    [180, [0, 0], [600, 400]],
    [270, [0, 0], [0, 600]], // top-left → bottom-left
    [90, [600, 400], [0, 600]],
  ] as const)('rotation %i maps %j to %j', (rotation, from, to) => {
    expect(applyToPoint(orientationMatrix(600, 400, rotation), from[0], from[1])).toEqual(to);
  });
});

describe('imageToClipMatrix', () => {
  it('maps a fitted image onto the canvas corners', () => {
    const m = imageToClipMatrix(
      { width: 200, height: 100, rotation: 0 },
      { scale: 2, x: 0, y: 0 },
      400,
      200,
    );
    expect(applyToPoint(m, 0, 0)).toEqual([-1, 1]); // top-left
    expect(applyToPoint(m, 200, 100)).toEqual([1, -1]); // bottom-right
  });
});
