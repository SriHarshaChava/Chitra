import { expect, test } from '@playwright/test';
import UTIF from 'utif';
import { decodeSrgb, rec2020From, rec2020To, transform } from '../src/color/colorSpaces';
import { developParams, developPixel } from '../src/develop/developMath';
import {
  DEFAULT_RECIPE,
  SLIDER_SECTIONS,
  type AdjustmentKey,
  type Recipe,
} from '../src/develop/recipe';
import { CURVE_PRESETS } from '../src/develop/toneCurve';
import { centerPixel, setSlider, importAndOpen } from './helpers';

/** A uniform-colour TIFF, so every pixel has the same known value. */
function solidTiff(rgb: [number, number, number]): Buffer {
  const width = 64;
  const height = 64;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([...rgb, 255], i);
  return Buffer.from(UTIF.encodeImage(rgba, width, height));
}

/** What the reference maths says the screen should show for this colour and recipe. */
function expected(rgb: [number, number, number], recipe: Recipe): number[] {
  const linearSrgb = rgb.map((v) => decodeSrgb(v / 255)) as [number, number, number];
  const rec2020 = transform(rec2020From('srgb'), linearSrgb);
  // TIFFs are finished images: no default contrast curve. Headless Chromium uses sRGB.
  const out = developPixel(rec2020, developParams(recipe, 0), rec2020To('srgb'));
  return out.map((v) => Math.round(v * 255));
}

async function openTiff(page: import('@playwright/test').Page, rgb: [number, number, number]) {
  await page.goto('./');
  await importAndOpen(page, {
    name: 'patch.tif',
    mimeType: 'image/tiff',
    buffer: solidTiff(rgb),
  });
  await expect(page.getByText(/patch\.tif · .* · opened in/)).toBeVisible();
}

test('the GPU shader matches the reference develop maths', async ({ page }) => {
  const colour: [number, number, number] = [180, 120, 60];
  await openTiff(page, colour);

  // Default settings: the photo looks unchanged.
  await expect.poll(() => centerPixel(page)).toEqual([...expected(colour, DEFAULT_RECIPE), 255]);

  const recipe: Recipe = {
    ...DEFAULT_RECIPE,
    temperature: 20,
    tint: -10,
    exposure: 0.5,
    contrast: 40,
    highlights: -30,
    shadows: 30,
    whites: 10,
    blacks: -10,
    vibrance: 30,
    saturation: -20,
  };
  for (const { key } of SLIDER_SECTIONS.flatMap((s) => s.sliders)) {
    await setSlider(page.locator(`#slider-${key}`), recipe[key]);
  }
  await expectReference(page, colour, recipe);
});

async function expectReference(
  page: import('@playwright/test').Page,
  colour: [number, number, number],
  recipe: Recipe,
) {
  const want = expected(colour, recipe);
  await expect
    .poll(async () => {
      const got = await centerPixel(page);
      return Math.max(...want.map((v, i) => Math.abs(v - got[i]!)));
    })
    .toBeLessThanOrEqual(2);
}

test('tone curve, colour mixer and colour grading match the reference maths', async ({ page }) => {
  const colour: [number, number, number] = [190, 110, 70];
  await openTiff(page, colour);
  const open = (title: string) => page.getByRole('button', { name: title, exact: true }).click();

  // Tone curve: a preset button.
  await open('Tone curve');
  await page.getByRole('button', { name: 'Strong contrast' }).click();
  let recipe: Recipe = { ...DEFAULT_RECIPE, toneCurve: CURVE_PRESETS[2]!.points };
  await expectReference(page, colour, recipe);

  // Colour mixer: this patch is orange.
  await open('Colour mixer');
  const mixer: Partial<Record<AdjustmentKey, number>> = {
    saturationOrange: 15,
    saturationRed: -20,
  };
  for (const [key, value] of Object.entries(mixer)) {
    await setSlider(page.locator(`#slider-${key}`), value);
  }
  await page.getByRole('tab', { name: 'Hue' }).click();
  await setSlider(page.locator('#slider-hueOrange'), 30);
  await page.getByRole('tab', { name: 'Luminance' }).click();
  await setSlider(page.locator('#slider-luminanceOrange'), -25);
  recipe = { ...recipe, ...mixer, hueOrange: 30, luminanceOrange: -25 };
  await expectReference(page, colour, recipe);

  // Colour grading.
  await open('Colour grading');
  const grading: Partial<Record<AdjustmentKey, number>> = {
    gradeShadowsHue: 220,
    gradeShadowsSaturation: 60,
    gradeMidtonesHue: 200,
    gradeMidtonesSaturation: 50,
    gradeHighlightsHue: 60,
    gradeHighlightsSaturation: 70,
    gradeBalance: -20,
    gradeBlending: 70,
  };
  for (const [key, value] of Object.entries(grading)) {
    await setSlider(page.locator(`#slider-${key}`), value);
  }
  recipe = { ...recipe, ...grading };
  await expectReference(page, colour, recipe);

  // Each step visibly changes this colour (so the comparisons above mean something):
  // [190,110,70] → curve [213,100,44] → mixer [196,86,14] → grading [186,96,12].
  expect(expected(colour, recipe)).toEqual([186, 96, 12]);
});

test('undo, redo, reset and before/after', async ({ page }) => {
  await openTiff(page, [120, 120, 120]);
  const original = await centerPixel(page);
  const exposure = page.locator('#slider-exposure');

  await setSlider(exposure, 1);
  await expect(page.locator('output[for=slider-exposure]')).toHaveText('+1.00');
  await expect.poll(async () => (await centerPixel(page))[0]).toBeGreaterThan(original[0]! + 20);

  // Before/after shows the original without losing the edit.
  await page.getByRole('button', { name: 'Before' }).click();
  await expect.poll(() => centerPixel(page)).toEqual(original);
  await page.getByRole('button', { name: 'Before' }).click();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('output[for=slider-exposure]')).toHaveText('0.00');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('output[for=slider-exposure]')).toHaveText('+1.00');

  // Keyboard shortcut.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('output[for=slider-exposure]')).toHaveText('0.00');

  await setSlider(page.locator('#slider-contrast'), 50);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('output[for=slider-contrast]')).toHaveText('0');
  await expect.poll(() => centerPixel(page)).toEqual(original);
});

test('tone curve editor: tap to add a point, drag it, double-tap to remove it', async ({
  page,
}) => {
  await openTiff(page, [128, 128, 128]);
  const original = (await centerPixel(page))[0]!;
  await page.getByRole('button', { name: 'Tone curve', exact: true }).click();
  const graph = page.getByRole('img', { name: /Tone curve/ });
  await graph.scrollIntoViewIfNeeded();
  const box = (await graph.boundingBox())!;
  // Curve coordinates (0…1, y up) → screen position; the graph has a 4 % margin.
  const at = (x: number, y: number) => ({
    x: box.x + ((x + 0.04) / 1.08) * box.width,
    y: box.y + ((1 - y + 0.04) / 1.08) * box.height,
  });

  // Tap on the line at mid-grey, then drag the new point up: the photo brightens.
  const start = at(0.5, 0.5);
  const end = at(0.5, 0.7);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await centerPixel(page))[0]).toBeGreaterThan(original + 25);
  await expect(page.locator('.tone-curve-point')).toHaveCount(3);

  // Double-click the point to remove it again.
  await page.mouse.dblclick(end.x, end.y);
  await expect(page.locator('.tone-curve-point')).toHaveCount(2);
  await expect.poll(async () => (await centerPixel(page))[0]).toBe(original);

  // Undo brings the point back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.tone-curve-point')).toHaveCount(3);
});
