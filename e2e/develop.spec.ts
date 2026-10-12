import { expect, test } from '@playwright/test';
import UTIF from 'utif';
import { decodeSrgb, rec2020From, rec2020To, transform } from '../src/color/colorSpaces';
import { developParams, developPixel } from '../src/develop/developMath';
import { DEFAULT_RECIPE, type Recipe } from '../src/develop/recipe';
import { centerPixel, setSlider } from './helpers';

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
  await page.getByTestId('file-input').setInputFiles({
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
  for (const [key, value] of Object.entries(recipe)) {
    if (key === 'version') continue;
    await setSlider(page.locator(`#slider-${key}`), value as number);
  }

  const want = expected(colour, recipe);
  await expect
    .poll(async () => {
      const got = await centerPixel(page);
      return Math.max(...want.map((v, i) => Math.abs(v - got[i]!)));
    })
    .toBeLessThanOrEqual(2);
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
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('output[for=slider-contrast]')).toHaveText('0');
  await expect.poll(() => centerPixel(page)).toEqual(original);
});
