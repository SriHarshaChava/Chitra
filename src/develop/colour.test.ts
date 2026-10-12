import { describe, expect, it } from 'vitest';
import { rec2020From, transform } from '../color/colorSpaces';
import { hueDegrees, oklabToRec2020, rec2020ToOklab } from '../color/oklab';
import { developParams, developPixel, toneChannel } from './developMath';
import { applyGrading, gradingParams, gradingWeights } from './grading';
import { applyMixer, BAND_CENTERS, bandWeights, type MixerParams } from './hsl';
import {
  DEFAULT_RECIPE,
  isDefaultRecipe,
  RECIPE_VERSION,
  sanitizeRecipe,
  type Recipe,
} from './recipe';
import { applyGroups, DEFAULT_COPY_GROUPS } from './settingsGroups';
import {
  CURVE_PRESETS,
  curveFunction,
  curveLut,
  LINEAR_CURVE,
  lookupCurve,
  MAX_CURVE_POINTS,
  sanitizeCurve,
} from './toneCurve';

type Vec3 = [number, number, number];
const recipe = (changes: Partial<Recipe>): Recipe => ({ ...DEFAULT_RECIPE, ...changes });
const fromSrgb = (rgb: Vec3) => transform(rec2020From('srgb'), rgb);
const hueOf = (rgb: Vec3) => {
  const [, a, b] = rec2020ToOklab(rgb);
  return hueDegrees(a, b);
};
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

describe('OKLab', () => {
  it('round-trips colours', () => {
    for (const rgb of [
      [0.2, 0.5, 0.1],
      [1, 1, 1],
      [0.01, 0.002, 0.3],
      [2, 1.5, 0.5],
    ] as Vec3[]) {
      const back = oklabToRec2020(rec2020ToOklab(rgb));
      back.forEach((v, i) => expect(v).toBeCloseTo(rgb[i]!, 6));
    }
  });

  it('keeps greys neutral', () => {
    for (const v of [0.01, 0.18, 1]) {
      const [L, a, b] = rec2020ToOklab([v, v, v]);
      expect(Math.abs(a)).toBeLessThan(1e-4);
      expect(Math.abs(b)).toBeLessThan(1e-4);
      expect(L).toBeGreaterThan(0);
    }
    expect(rec2020ToOklab([1, 1, 1])[0]).toBeCloseTo(1, 3);
  });

  it('places the named colours near their band centres', () => {
    expect(hueOf(fromSrgb([1, 0, 0]))).toBeCloseTo(BAND_CENTERS[0], -1);
    expect(hueOf(fromSrgb([0, 1, 0]))).toBeCloseTo(BAND_CENTERS[3], -1);
    expect(hueOf(fromSrgb([0, 0, 1]))).toBeCloseTo(BAND_CENTERS[5], -1);
  });
});

describe('tone curve', () => {
  it('passes through its points and keeps the ends', () => {
    for (const { points } of CURVE_PRESETS) {
      const f = curveFunction(points);
      for (const p of points) expect(f(p.x)).toBeCloseTo(p.y, 9);
    }
  });

  it('never overshoots a rising set of points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0.5 },
      { x: 0.12, y: 0.52 },
      { x: 0.9, y: 0.6 },
      { x: 1, y: 1 },
    ];
    const f = curveFunction(points);
    let previous = -Infinity;
    for (let x = 0; x <= 1; x += 0.001) {
      const y = f(x);
      expect(y).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(y).toBeLessThanOrEqual(1);
      previous = y;
    }
  });

  it('is flat outside the first and last point', () => {
    const f = curveFunction([
      { x: 0.2, y: 0.1 },
      { x: 0.8, y: 0.9 },
    ]);
    expect(f(0)).toBe(0.1);
    expect(f(1)).toBe(0.9);
  });

  it('a straight line changes nothing', () => {
    const lut = curveLut(LINEAR_CURVE);
    for (const v of [-0.1, 0, 0.123, 0.5, 0.999, 1, 1.4]) {
      expect(lookupCurve(lut, v)).toBeCloseTo(v, 6);
    }
    expect(developParams(DEFAULT_RECIPE, 0).curve).toBeNull();
  });

  it('a strong S-curve darkens shadows and brightens highlights', () => {
    const p = developParams(recipe({ toneCurve: CURVE_PRESETS[2]!.points }), 0);
    expect(toneChannel(0.25, p)).toBeLessThan(0.2);
    expect(toneChannel(0.75, p)).toBeGreaterThan(0.8);
  });

  it('sanitizes untrusted points', () => {
    expect(sanitizeCurve('nope')).toBe(LINEAR_CURVE);
    expect(sanitizeCurve([{ x: 0.5, y: 0.5 }])).toBe(LINEAR_CURVE);
    expect(
      sanitizeCurve([
        { x: 1, y: 2 },
        { x: 0.5, y: 0.4 },
        { x: 0.505, y: 0.9 },
        { x: -1, y: 0 },
        { x: 'a', y: 0 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.4 },
      { x: 1, y: 1 },
    ]);
    const many = Array.from({ length: 40 }, (_, i) => ({ x: i / 39, y: i / 39 }));
    const wavy = many.map((p, i) => ({ ...p, y: i % 2 ? p.x * 0.9 : p.x }));
    expect(sanitizeCurve(wavy)).toHaveLength(MAX_CURVE_POINTS);
  });
});

describe('colour mixer', () => {
  const zero = (): MixerParams => ({
    hue: new Array<number>(8).fill(0),
    saturation: new Array<number>(8).fill(0),
    luminance: new Array<number>(8).fill(0),
  });

  it('band weights split smoothly between neighbours', () => {
    expect(bandWeights(BAND_CENTERS[2])).toEqual([2, 3, 0]);
    const [i, j, w] = bandWeights((BAND_CENTERS[5] + BAND_CENTERS[6]) / 2);
    expect([i, j]).toEqual([5, 6]);
    expect(w).toBeCloseTo(0.5);
    // Between magenta and red the bands wrap around.
    const [i2, j2] = bandWeights(5);
    expect([i2, j2]).toEqual([7, 0]);
  });

  it('at zero leaves colours unchanged', () => {
    const c: Vec3 = [0.3, 0.1, 0.05];
    applyMixer(c, zero()).forEach((v, k) => expect(v).toBeCloseTo(c[k]!, 6));
    expect(developParams(DEFAULT_RECIPE, 0).mixer).toBeNull();
  });

  it('changes only the chosen colour', () => {
    const p = developParams(recipe({ saturationBlue: -100, luminanceBlue: -100 }), 0).mixer!;
    const h = (BAND_CENTERS[5] * Math.PI) / 180;
    const blue = oklabToRec2020([0.5, 0.12 * Math.cos(h), 0.12 * Math.sin(h)]);
    const red = fromSrgb([0.5, 0.05, 0.03]);
    const grey: Vec3 = [0.2, 0.2, 0.2];
    const [L, a, b] = rec2020ToOklab(applyMixer(blue, p));
    expect(Math.hypot(a, b)).toBeLessThan(1e-6); // blue turned grey…
    expect(L).toBeLessThan(rec2020ToOklab(blue)[0]); // …and darker
    applyMixer(red, p).forEach((v, k) => expect(v).toBeCloseTo(red[k]!, 6));
    applyMixer(grey, p).forEach((v, k) => expect(v).toBeCloseTo(grey[k]!, 9));
  });

  it('shifts hue towards the neighbouring colour', () => {
    const p = developParams(recipe({ hueGreen: 100 }), 0).mixer!;
    const green = fromSrgb([0.1, 0.5, 0.1]);
    expect(hueOf(applyMixer(green, p))).toBeGreaterThan(hueOf(green) + 20);
  });
});

describe('colour grading', () => {
  it('weights shadows, midtones and highlights by lightness', () => {
    const g = gradingParams(
      [
        { hue: 0, saturation: 0 },
        { hue: 0, saturation: 0 },
        { hue: 0, saturation: 0 },
      ],
      0,
      50,
    );
    expect(gradingWeights(0.05, g)).toEqual([1, 0, 0]);
    expect(gradingWeights(0.5, g)).toEqual([0.5, 1, 0.5]);
    expect(gradingWeights(0.95, g)).toEqual([0, 0, 1]);
    // Positive balance moves the split down, so more of the picture counts as highlights.
    const brighter = gradingParams([], 60, 50);
    expect(gradingWeights(0.4, brighter)[2]).toBeGreaterThan(gradingWeights(0.4, g)[2]);
  });

  it('tints shadows and highlights separately and keeps black black', () => {
    const p = developParams(
      recipe({
        gradeShadowsHue: 250,
        gradeShadowsSaturation: 80,
        gradeHighlightsHue: 70,
        gradeHighlightsSaturation: 80,
      }),
      0,
    ).grading!;
    const dark = applyGrading([0.02, 0.02, 0.02], p);
    const bright = applyGrading([0.8, 0.8, 0.8], p);
    expect(dark[2]).toBeGreaterThan(dark[0]); // bluish shadows
    expect(bright[0]).toBeGreaterThan(bright[2]); // warm highlights
    expect(applyGrading([0, 0, 0], p)).toEqual([0, 0, 0]);
    expect(developParams(DEFAULT_RECIPE, 0).grading).toBeNull();
  });

  it('develops a grey with no grading exactly as before', () => {
    const grey: Vec3 = [0.18, 0.18, 0.18];
    const graded = developPixel(grey, developParams(recipe({ gradeBalance: 40 }), 0), [
      ...IDENTITY,
    ]);
    const plain = developPixel(grey, developParams(DEFAULT_RECIPE, 0), [...IDENTITY]);
    expect(graded).toEqual(plain);
  });
});

describe('recipe version 3', () => {
  it('upgrades a version 2 recipe', () => {
    const v2 = {
      version: 2,
      exposure: 0.4,
      geometry: { ...DEFAULT_RECIPE.geometry, rotate: 90 },
    };
    const r = sanitizeRecipe(v2);
    expect(r.version).toBe(RECIPE_VERSION);
    expect(r.exposure).toBe(0.4);
    expect(r.geometry.rotate).toBe(90);
    expect(r.toneCurve).toBe(LINEAR_CURVE);
    expect(r.gradeBlending).toBe(50);
    expect(r.hueBlue).toBe(0);
  });

  it('clamps the new sliders and counts them as edits', () => {
    const r = sanitizeRecipe({ saturationRed: 500, gradeShadowsHue: -20, gradeBlending: 'x' });
    expect(r.saturationRed).toBe(100);
    expect(r.gradeShadowsHue).toBe(0);
    expect(r.gradeBlending).toBe(50);
    expect(isDefaultRecipe(r)).toBe(false);
    expect(isDefaultRecipe(recipe({ toneCurve: CURVE_PRESETS[1]!.points }))).toBe(false);
  });

  it('copies the new groups', () => {
    const source = recipe({
      toneCurve: CURVE_PRESETS[1]!.points,
      luminanceOrange: 30,
      gradeMidtonesSaturation: 20,
      geometry: { ...DEFAULT_RECIPE.geometry, rotate: 180 },
    });
    const pasted = applyGroups(DEFAULT_RECIPE, source, DEFAULT_COPY_GROUPS);
    expect(pasted.toneCurve).toEqual(CURVE_PRESETS[1]!.points);
    expect(pasted.luminanceOrange).toBe(30);
    expect(pasted.gradeMidtonesSaturation).toBe(20);
    expect(pasted.geometry.rotate).toBe(0);
    expect(applyGroups(DEFAULT_RECIPE, source, ['tone']).toneCurve).toBe(LINEAR_CURVE);
  });
});

describe('presets with the new sections', () => {
  it('save and apply a tone curve', async () => {
    const { applyPreset, presetSettings, sanitizePreset, BUILT_IN_PRESETS } =
      await import('../catalog/presets');
    const curve = CURVE_PRESETS[1]!.points;
    const saved = presetSettings(recipe({ toneCurve: curve, hueBlue: 10 }), [
      'toneCurve',
      'colorMixer',
    ]);
    expect(saved.toneCurve).toEqual(curve);
    expect(saved.values.hueBlue).toBe(10);
    expect(presetSettings(recipe({ toneCurve: curve }), ['tone']).toneCurve).toBeUndefined();

    const preset = sanitizePreset({ id: 'p', name: 'Mine', ...saved, toneCurve: [{ x: 2 }] });
    expect(preset?.toneCurve).toBe(LINEAR_CURVE);

    const matte = BUILT_IN_PRESETS.find((p) => p.name === 'Matte')!;
    const applied = applyPreset(recipe({ exposure: 1 }), matte);
    expect(applied.exposure).toBe(1);
    expect(applied.toneCurve[0]!.y).toBeGreaterThan(0);
    // Presets without a curve leave the photo's curve alone.
    const wildlife = BUILT_IN_PRESETS[0]!;
    expect(applyPreset(applied, wildlife).toneCurve).toBe(applied.toneCurve);
  });
});
