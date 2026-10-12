import { describe, expect, it } from 'vitest';
import { applyToPoint, viewToClipMatrix } from './transform';

describe('viewToClipMatrix', () => {
  it('maps a fitted photo onto the canvas corners', () => {
    const m = viewToClipMatrix({ scale: 2, x: 0, y: 0 }, 400, 200);
    expect(applyToPoint(m, 0, 0)).toEqual([-1, 1]); // top-left
    expect(applyToPoint(m, 200, 100)).toEqual([1, -1]); // bottom-right
  });

  it('includes pan', () => {
    const m = viewToClipMatrix({ scale: 1, x: 100, y: 50 }, 400, 200);
    expect(applyToPoint(m, 0, 0)).toEqual([-0.5, 0.5]);
  });
});
