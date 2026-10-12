import { describe, expect, it } from 'vitest';
import {
  centeredView,
  constrainView,
  fitScale,
  fitView,
  minScale,
  orientedSize,
  panBy,
  zoomAt,
  zoomTo,
} from './viewTransform';

const photo = { width: 6000, height: 4000 };
const screen = { width: 1032, height: 732 };

describe('fitView', () => {
  it('fits a large photo inside the padded viewport, centred', () => {
    const view = fitView(photo, screen, 16);
    expect(view.scale).toBeCloseTo(1000 / 6000, 6);
    expect(view.x).toBeCloseTo(16, 6);
    expect(view.y).toBeCloseTo((732 - 4000 * view.scale) / 2, 6);
  });

  it('does not enlarge small photos', () => {
    expect(fitView({ width: 200, height: 100 }, screen).scale).toBe(1);
  });

  it('uses the limiting dimension', () => {
    expect(fitScale({ width: 1000, height: 3000 }, { width: 1000, height: 1000 }, 0)).toBeCloseTo(
      1 / 3,
    );
  });
});

describe('zoomAt', () => {
  it('keeps the image point under the anchor fixed', () => {
    const view = { scale: 0.5, x: 10, y: 20 };
    const anchor = { x: 300, y: 200 };
    const imageX = (anchor.x - view.x) / view.scale;
    const imageY = (anchor.y - view.y) / view.scale;

    const zoomed = zoomAt(view, 2, anchor.x, anchor.y, { min: 0.1, max: 16 });
    expect(zoomed.scale).toBe(1);
    expect(imageX * zoomed.scale + zoomed.x).toBeCloseTo(anchor.x, 6);
    expect(imageY * zoomed.scale + zoomed.y).toBeCloseTo(anchor.y, 6);
  });

  it('respects zoom limits', () => {
    const view = { scale: 8, x: 0, y: 0 };
    expect(zoomAt(view, 4, 0, 0, { min: 0.1, max: 16 }).scale).toBe(16);
    expect(zoomAt(view, 0.0001, 0, 0, { min: 0.1, max: 16 }).scale).toBe(0.1);
  });

  it('zooms to an exact scale', () => {
    expect(zoomTo({ scale: 0.25, x: 0, y: 0 }, 1, 100, 100).scale).toBe(1);
  });
});

describe('constrainView', () => {
  it('centres a photo smaller than the viewport', () => {
    const view = constrainView({ scale: 0.1, x: -500, y: 999 }, photo, screen);
    expect(view.x).toBeCloseTo((1032 - 600) / 2);
    expect(view.y).toBeCloseTo((732 - 400) / 2);
  });

  it('stops a zoomed-in photo from leaving gaps at the edges', () => {
    const tooFarRight = constrainView({ scale: 1, x: 50, y: 0 }, photo, screen);
    expect(tooFarRight.x).toBe(0);
    const tooFarLeft = constrainView({ scale: 1, x: -10000, y: 0 }, photo, screen);
    expect(tooFarLeft.x).toBe(1032 - 6000);
  });
});

describe('helpers', () => {
  it('pans', () => expect(panBy({ scale: 1, x: 1, y: 2 }, 3, 4)).toEqual({ scale: 1, x: 4, y: 6 }));
  it('centres at a given scale', () =>
    expect(centeredView({ width: 100, height: 100 }, { width: 300, height: 200 }, 1)).toEqual({
      scale: 1,
      x: 100,
      y: 50,
    }));
  it('allows zooming out to half the fitted size', () =>
    expect(minScale(photo, screen)).toBeCloseTo(fitScale(photo, screen) / 2));
  it('swaps width and height for portrait rotation', () => {
    expect(orientedSize(photo, 90)).toEqual({ width: 4000, height: 6000 });
    expect(orientedSize(photo, 180)).toEqual(photo);
  });
});
