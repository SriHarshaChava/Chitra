import { describe, expect, it } from 'vitest';
import { applyToPoint } from '../gpu/transform';
import {
  aspectRatio,
  constrainCrop,
  cropFits,
  cropForRatio,
  cropPixelSize,
  DEFAULT_GEOMETRY,
  dragCrop,
  flipGeometry,
  frameSize,
  imageToCropMatrix,
  imageToFrameMatrix,
  largestCenteredCrop,
  rotateGeometry,
  rotationMatrix,
  sanitizeGeometry,
  straightenGeometry,
  toPixels,
  type Geometry,
} from './geometry';
import { DEFAULT_RECIPE, sanitizeRecipe } from './recipe';

const frame = { width: 6000, height: 4000 };
const geometry = (g: Partial<Geometry>): Geometry => ({ ...DEFAULT_GEOMETRY, ...g });
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe('rotationMatrix', () => {
  it.each([
    [0, [0, 0], [0, 0]],
    [90, [0, 0], [400, 0]], // top-left → top-right
    [180, [0, 0], [600, 400]],
    [270, [0, 0], [0, 600]], // top-left → bottom-left
    [90, [600, 400], [0, 600]],
  ] as const)('rotation %i maps %j to %j', (rotation, from, to) => {
    expect(applyToPoint(rotationMatrix(600, 400, rotation), from[0], from[1])).toEqual(to);
  });
});

describe('imageToFrameMatrix', () => {
  const image = { width: 600, height: 400, rotation: 0 as const };

  it('is the identity by default', () => {
    close(applyToPoint(imageToFrameMatrix(image, DEFAULT_GEOMETRY), 10, 20), [10, 20]);
  });

  it('applies the user rotation after the camera rotation', () => {
    const portrait = { ...image, rotation: 90 as const }; // oriented 400×600
    const m = imageToFrameMatrix(portrait, geometry({ rotate: 90 })); // frame 600×400
    close(applyToPoint(m, 0, 0), [600, 400]); // 180° in total
  });

  it('mirrors with flip', () => {
    close(
      applyToPoint(imageToFrameMatrix(image, geometry({ flipHorizontal: true })), 0, 0),
      [600, 0],
    );
  });

  it('turns around the frame centre when straightening', () => {
    const m = imageToFrameMatrix(image, geometry({ straighten: 90 }));
    close(applyToPoint(m, 300, 200), [300, 200]); // the centre stays
    close(applyToPoint(m, 400, 200), [300, 300]); // right of centre → below (clockwise)
  });

  it('shifts by the crop origin', () => {
    const m = imageToCropMatrix(
      image,
      geometry({ crop: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 } }),
    );
    close(applyToPoint(m, 300, 100), [0, 0]);
  });
});

describe('sizes', () => {
  it('swaps the frame for quarter turns', () => {
    expect(frameSize(frame, 90)).toEqual({ width: 4000, height: 6000 });
  });

  it('computes the cropped size', () => {
    expect(cropPixelSize(frame, { x: 0, y: 0, width: 0.5, height: 0.25 })).toEqual({
      width: 3000,
      height: 1000,
    });
  });
});

describe('fitting the crop', () => {
  it('accepts the full frame when not straightened', () => {
    expect(cropFits(toPixels({ x: 0, y: 0, width: 1, height: 1 }, frame), frame, 0)).toBe(true);
  });

  it('rejects the full frame when straightened (it would show empty corners)', () => {
    expect(cropFits(toPixels({ x: 0, y: 0, width: 1, height: 1 }, frame), frame, 5)).toBe(false);
  });

  it('finds the largest centred crop for an angle', () => {
    const rect = largestCenteredCrop(frame, 5, 1.5);
    expect(cropFits(rect, frame, 5)).toBe(true);
    // 0.1% bigger no longer fits: it really is the largest.
    const bigger = { x: rect.x - 3, y: rect.y - 2, width: rect.width + 6, height: rect.height + 4 };
    expect(cropFits(bigger, frame, 5)).toBe(false);
    expect(rect.width / rect.height).toBeCloseTo(1.5);
  });

  it('is the whole frame at 0°', () => {
    const rect = largestCenteredCrop(frame, 0, 1.5);
    close([rect.x, rect.y, rect.width, rect.height], [0, 0, 6000, 4000]);
  });

  it('stops a drag at the photo edge', () => {
    const valid = { x: 1000, y: 1000, width: 2000, height: 1000 };
    const result = constrainCrop(valid, { ...valid, x: -500 }, frame, 0);
    expect(result.x).toBeCloseTo(0, 1); // within a hundredth of a pixel
  });
});

describe('dragCrop', () => {
  const start = { x: 1000, y: 1000, width: 2000, height: 1000 };

  it('moves one edge freely', () => {
    expect(dragCrop(start, 'e', { x: 3500, y: 0 }, { x: 0, y: 0 }, null)).toEqual({
      ...start,
      width: 2500,
    });
  });

  it('keeps the ratio from a corner', () => {
    const r = dragCrop(start, 'se', { x: 4000, y: 1500 }, { x: 0, y: 0 }, 2);
    expect(r.width / r.height).toBeCloseTo(2);
    expect(r.x).toBe(1000); // the opposite corner stays
    expect(r.y).toBe(1000);
  });

  it('keeps the ratio from an edge, centred', () => {
    const r = dragCrop(start, 'e', { x: 4000, y: 0 }, { x: 0, y: 0 }, 2);
    expect(r).toEqual({ x: 1000, y: 750, width: 3000, height: 1500 });
  });

  it('never gets smaller than the minimum', () => {
    const r = dragCrop(start, 'w', { x: 9999, y: 0 }, { x: 0, y: 0 }, null);
    expect(r.width).toBeGreaterThanOrEqual(32);
  });

  it('moves the whole crop', () => {
    expect(dragCrop(start, 'move', { x: 0, y: 0 }, { x: 10, y: -5 }, null)).toEqual({
      ...start,
      x: 1010,
      y: 995,
    });
  });
});

describe('aspect ratios', () => {
  const landscape = { x: 0, y: 0, width: 300, height: 200 };
  const portrait = { x: 0, y: 0, width: 200, height: 300 };

  it('follows the crop orientation', () => {
    expect(aspectRatio('4:3', landscape, frame)).toBeCloseTo(4 / 3);
    expect(aspectRatio('4:3', portrait, frame)).toBeCloseTo(3 / 4);
    expect(aspectRatio('free', landscape, frame)).toBeNull();
    expect(aspectRatio('original', landscape, frame)).toBeCloseTo(1.5);
  });

  it('applies a ratio around the current centre', () => {
    const r = cropForRatio(toPixels({ x: 0, y: 0, width: 1, height: 1 }, frame), frame, 0, 1);
    expect(r.width).toBeCloseTo(r.height);
    expect(cropFits(r, frame, 0)).toBe(true);
  });
});

describe('rotate, flip, straighten', () => {
  const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

  it('carries the crop around when rotating, and back again', () => {
    const turned = rotateGeometry(geometry({ crop }), 1);
    expect(turned.rotate).toBe(90);
    close(Object.values(turned.crop), [0.4, 0.1, 0.4, 0.3]);
    const back = rotateGeometry(turned, -1);
    expect(back.rotate).toBe(0);
    close(Object.values(back.crop), Object.values(crop));
  });

  it('four turns make a full circle', () => {
    let g = geometry({ crop });
    for (let i = 0; i < 4; i++) g = rotateGeometry(g, 1);
    expect(g.rotate).toBe(0);
    close(Object.values(g.crop), Object.values(crop));
  });

  it('mirrors the crop and angle when flipping', () => {
    const flipped = flipGeometry(geometry({ crop, straighten: 3 }));
    expect(flipped.flipHorizontal).toBe(true);
    expect(flipped.straighten).toBe(-3);
    expect(flipped.crop.x).toBeCloseTo(0.6);
  });

  it('shrinks the crop when straightening so no corners are empty', () => {
    const g = straightenGeometry(DEFAULT_GEOMETRY, frame, 4);
    expect(g.straighten).toBe(4);
    expect(g.crop.width).toBeLessThan(1);
    expect(cropFits(toPixels(g.crop, frame), frame, 4)).toBe(true);
  });

  it('limits the angle', () => {
    expect(straightenGeometry(DEFAULT_GEOMETRY, frame, 80).straighten).toBe(45);
  });
});

describe('sanitizing', () => {
  it('repairs bad geometry', () => {
    expect(
      sanitizeGeometry({ rotate: 45, straighten: 99, crop: { x: 2, width: 0.5 }, aspect: 'x' }),
    ).toEqual({
      rotate: 0,
      flipHorizontal: false,
      straighten: 45,
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
      aspect: 'free',
    });
  });

  it('loads version 1 recipes without geometry', () => {
    expect(sanitizeRecipe({ version: 1, exposure: 1 }).geometry).toEqual(DEFAULT_RECIPE.geometry);
  });
});
