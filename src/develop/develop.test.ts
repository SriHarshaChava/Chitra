import { describe, expect, it } from 'vitest';
import { baseCurve, encodeSrgb, rec2020To, transform, type Matrix3 } from '../color/colorSpaces';
import {
  decodeExtended,
  developParams,
  developPixel,
  encodeExtended,
  highlightWeight,
  sCurve,
  shadowWeight,
  toneChannel,
} from './developMath';
import { canRedo, canUndo, commit, createHistory, preview, redo, undo } from './history';
import { DEFAULT_RECIPE, isDefaultRecipe, sanitizeRecipe, type Recipe } from './recipe';
import { loadRecipe, photoKey } from './recipeStore';
import { planckianXy, sliderWhitePoint, whiteBalanceMatrix } from './whiteBalance';

const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const recipe = (changes: Partial<Recipe>): Recipe => ({ ...DEFAULT_RECIPE, ...changes });
const grey = (v: number) => [v, v, v] as const;

describe('recipe', () => {
  it('starts at defaults', () => expect(isDefaultRecipe(DEFAULT_RECIPE)).toBe(true));

  it('sanitizes untrusted data', () => {
    expect(
      sanitizeRecipe({ exposure: 99, contrast: 'high', shadows: 40, evil: '<script>' }),
    ).toEqual(recipe({ exposure: 5, shadows: 40 }));
    expect(sanitizeRecipe(null)).toEqual(DEFAULT_RECIPE);
    expect(sanitizeRecipe({ tint: Number.NaN })).toEqual(DEFAULT_RECIPE);
  });
});

describe('white balance', () => {
  it('follows the black-body curve (2856 K ≈ illuminant A)', () => {
    const { x, y } = planckianXy(2856);
    expect(x).toBeCloseTo(0.4476, 2);
    expect(y).toBeCloseTo(0.4074, 2);
  });

  it('is exactly D65 at zero', () => {
    const { x, y } = sliderWhitePoint(0, 0);
    expect(x).toBeCloseTo(0.3127, 6);
    expect(y).toBeCloseTo(0.329, 6);
  });

  it('is the identity at zero', () => {
    expect(whiteBalanceMatrix(0, 0)).toEqual(IDENTITY);
  });

  it('warms a grey with positive temperature and cools it with negative', () => {
    const [r, , b] = transform(whiteBalanceMatrix(50, 0), grey(0.2));
    expect(r).toBeGreaterThan(b);
    const [r2, , b2] = transform(whiteBalanceMatrix(-50, 0), grey(0.2));
    expect(b2).toBeGreaterThan(r2);
  });

  it('adds magenta with positive tint and green with negative', () => {
    const [r, g, b] = transform(whiteBalanceMatrix(0, 60), grey(0.2));
    expect(g).toBeLessThan(Math.min(r, b));
    const [r2, g2, b2] = transform(whiteBalanceMatrix(0, -60), grey(0.2));
    expect(g2).toBeGreaterThan(Math.max(r2, b2));
  });

  it('keeps the overall brightness of grey roughly the same', () => {
    const [r, g, b] = transform(whiteBalanceMatrix(80, 30), grey(0.2));
    const luma = 0.2627 * r + 0.678 * g + 0.0593 * b;
    expect(luma).toBeCloseTo(0.2, 1);
  });
});

describe('tone helpers', () => {
  it('weights shadows and highlights in the right places', () => {
    expect(shadowWeight(1 / 3)).toBeCloseTo(1);
    expect(shadowWeight(0)).toBe(0);
    expect(shadowWeight(0.9)).toBeLessThan(0.1);
    expect(highlightWeight(2 / 3)).toBeCloseTo(1);
    expect(highlightWeight(1.4)).toBe(1);
    expect(highlightWeight(0.1)).toBeLessThan(0.1);
  });

  it('S-curve keeps black, mid-grey and white', () => {
    for (const strength of [-0.8, 0, 0.8]) {
      expect(sCurve(0, strength)).toBe(0);
      expect(sCurve(0.5, strength)).toBeCloseTo(0.5);
      expect(sCurve(1, strength)).toBe(1);
    }
  });

  it('extended encoding round-trips above white', () => {
    for (const v of [0.01, 0.5, 1, 2, 4])
      expect(decodeExtended(encodeExtended(v))).toBeCloseTo(v, 6);
  });
});

describe('developPixel', () => {
  const out = IDENTITY;

  it('with default settings and no base curve only encodes', () => {
    const p = developParams(DEFAULT_RECIPE, 0);
    const [r, g, b] = developPixel(grey(0.18), p, out);
    expect(r).toBeCloseTo(encodeSrgb(0.18), 6);
    expect(g).toBeCloseTo(r, 6);
    expect(b).toBeCloseTo(r, 6);
  });

  it('+1 EV doubles the light', () => {
    const p = developParams(recipe({ exposure: 1 }), 0);
    expect(developPixel(grey(0.1), p, out)[1]).toBeCloseTo(encodeSrgb(0.2), 6);
  });

  it('each tone slider moves mid-tones the expected way', () => {
    const base = developPixel(grey(0.05), developParams(DEFAULT_RECIPE, 0), out)[1];
    const at = (r: Partial<Recipe>) =>
      developPixel(grey(0.05), developParams(recipe(r), 0), out)[1];
    expect(at({ shadows: 60 })).toBeGreaterThan(base);
    expect(at({ shadows: -60 })).toBeLessThan(base);
    expect(at({ blacks: 60 })).toBeGreaterThan(base);
    expect(at({ whites: 60 })).toBeGreaterThan(base);
    expect(at({ contrast: 60 })).toBeLessThan(base); // a dark tone gets darker
  });

  it('negative highlights bring back values pushed past white', () => {
    const clipped = developParams(recipe({ exposure: 1 }), 0);
    const recovered = developParams(recipe({ exposure: 1, highlights: -100 }), 0);
    expect(developPixel(grey(0.7), clipped, out)[1]).toBe(1);
    expect(developPixel(grey(0.7), recovered, out)[1]).toBeLessThan(1);
  });

  it('saturation 0 → −100 turns colour to grey', () => {
    const p = developParams(recipe({ saturation: -100 }), 0);
    const [r, g, b] = developPixel([0.4, 0.1, 0.05], p, out);
    expect(g).toBeCloseTo(r, 6);
    expect(b).toBeCloseTo(r, 6);
  });

  it('vibrance boosts muted colours more than saturated ones', () => {
    const p0 = developParams(DEFAULT_RECIPE, 0);
    const p = developParams(recipe({ vibrance: 100 }), 0);
    const spread = (c: number[]) => Math.max(...c) - Math.min(...c);
    const mutedGain =
      spread(developPixel([0.22, 0.2, 0.18], p, out)) /
      spread(developPixel([0.22, 0.2, 0.18], p0, out));
    const vividGain =
      spread(developPixel([0.4, 0.05, 0.02], p, out)) /
      spread(developPixel([0.4, 0.05, 0.02], p0, out));
    expect(mutedGain).toBeGreaterThan(vividGain);
  });

  it('matches the Phase 1 look for RAW at default settings', () => {
    // Phase 1 applied the base curve after converting to the display; now it is applied
    // before. For neutral greys the result is identical.
    const p = developParams(DEFAULT_RECIPE, 0.6);
    for (const v of [0.02, 0.18, 0.6]) {
      const phase1 = baseCurve(encodeSrgb(v), 0.6);
      expect(developPixel(grey(v), p, rec2020To('srgb'))[0]).toBeCloseTo(phase1, 4);
    }
  });

  it('tone stays monotonic for every slider extreme', () => {
    for (const key of ['contrast', 'highlights', 'shadows', 'whites', 'blacks'] as const) {
      for (const value of [-100, 100]) {
        const p = developParams(recipe({ [key]: value }), 0.6);
        let previous = -Infinity;
        for (let v = 0; v <= 1.0001; v += 0.01) {
          const t = toneChannel(v, p);
          expect(t).toBeGreaterThanOrEqual(previous - 1e-9);
          previous = t;
        }
      }
    }
  });
});

describe('history', () => {
  it('records commits and undoes/redoes them', () => {
    let h = createHistory(DEFAULT_RECIPE);
    expect(canUndo(h)).toBe(false);
    h = preview(h, recipe({ exposure: 0.3 }));
    h = preview(h, recipe({ exposure: 0.6 }));
    h = commit(h, recipe({ exposure: 0.6 }));
    expect(h.past).toHaveLength(2);
    h = commit(h, recipe({ exposure: 0.6, contrast: 20 }));
    h = undo(h);
    expect(h.current.contrast).toBe(0);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.current.contrast).toBe(20);
  });

  it('drops redo steps after a new change', () => {
    let h = commit(createHistory(DEFAULT_RECIPE), recipe({ shadows: 10 }));
    h = undo(h);
    h = commit(h, recipe({ shadows: 50 }));
    expect(canRedo(h)).toBe(false);
    expect(h.past.map((r) => r.shadows)).toEqual([0, 50]);
  });

  it('ignores commits that change nothing', () => {
    const h = commit(createHistory(DEFAULT_RECIPE), { ...DEFAULT_RECIPE });
    expect(h.past).toHaveLength(1);
  });
});

describe('legacy recipe store', () => {
  const memory = (): Storage => {
    const data = new Map<string, string>();
    return {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
      clear: () => data.clear(),
      key: () => null,
      get length() {
        return data.size;
      },
    };
  };

  it('reads recipes remembered by Phase 2', () => {
    const storage = memory();
    const key = photoKey({ name: 'DSC_1.NEF', size: 10, lastModified: 5 });
    storage.setItem(key, JSON.stringify({ version: 1, exposure: 0.5 }));
    expect(loadRecipe(key, storage)?.exposure).toBe(0.5);
    expect(loadRecipe('missing', storage)).toBeNull();
  });

  it('survives corrupt data', () => {
    const storage = memory();
    storage.setItem('k', '{not json');
    expect(loadRecipe('k', storage)).toBeNull();
  });
});

describe('reconcile (changes made outside Develop)', () => {
  it('turns an outside change into an undo step', async () => {
    const { reconcile } = await import('./useDevelop');
    const h = commit(createHistory(DEFAULT_RECIPE), recipe({ exposure: 0.5 }));
    const pasted = recipe({ exposure: 0.5, vibrance: 40 });
    const next = reconcile(h, pasted);
    expect(next.current).toEqual(pasted);
    expect(undo(next).current.vibrance).toBe(0);
  });

  it('leaves an up-to-date history alone', async () => {
    const { reconcile } = await import('./useDevelop');
    const h = commit(createHistory(DEFAULT_RECIPE), recipe({ exposure: 0.5 }));
    expect(reconcile(h, recipe({ exposure: 0.5 }))).toBe(h);
    expect(reconcile(undefined, recipe({ tint: 3 })).current.tint).toBe(3);
  });
});
