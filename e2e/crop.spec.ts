import { expect, test, type Page } from '@playwright/test';
import UTIF from 'utif';
import { setSlider, importAndOpen } from './helpers';

/** 600×400 TIFF: left half red, right half blue. */
function splitTiff(): Buffer {
  const width = 600;
  const height = 400;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rgba.set(x < width / 2 ? [200, 30, 30, 255] : [30, 30, 200, 255], (y * width + x) * 4);
    }
  }
  return Buffer.from(UTIF.encodeImage(rgba, width, height));
}

/** Colour at a point given as fractions of the viewer canvas. */
function pixelAt(page: Page, fx: number, fy: number): Promise<number[]> {
  return page.locator('canvas.viewer-canvas').evaluate(
    (canvas: HTMLCanvasElement, [x, y]) => {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      const px = Math.floor(canvas.width * x!);
      const py = Math.floor(canvas.height * y!);
      return Array.from(ctx.getImageData(px, py, 1, 1).data);
    },
    [fx, fy],
  );
}

const info = (page: Page) =>
  page.getByRole('complementary', { name: 'Develop' }).locator('.info-list');

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await importAndOpen(page, {
    name: 'split.tif',
    mimeType: 'image/tiff',
    buffer: splitTiff(),
  });
  await expect(page.getByText(/split\.tif · .* · opened in/)).toBeVisible();
});

test('crop to a square, then undo', async ({ page }) => {
  await page.getByRole('button', { name: 'Crop' }).click();
  await expect(page.getByRole('region', { name: 'Crop and straighten' })).toBeVisible();
  await page.getByLabel('Aspect ratio').selectOption('1:1');
  await page.getByRole('button', { name: 'Done' }).first().click();

  await expect(info(page)).toContainText('Cropped400 × 400');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(info(page)).not.toContainText('Cropped');
});

test('rotate, flip and straighten', async ({ page }) => {
  await page.keyboard.press('r'); // shortcut opens the crop tool
  const panel = page.getByRole('region', { name: 'Crop and straighten' });
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: 'Rotate right' }).click();
  await expect(panel).toContainText('Result: 400 × 600');
  await panel.getByRole('button', { name: 'Rotate left' }).click();
  await expect(panel).toContainText('Result: 600 × 400');

  // Before flipping, the left side of the photo is red.
  await page.keyboard.press('Enter'); // leave crop mode
  await expect.poll(async () => (await pixelAt(page, 0.35, 0.5))[0]).toBeGreaterThan(150);
  await page.keyboard.press('r');
  await panel.getByRole('button', { name: /Flip/ }).click();
  await page.keyboard.press('Escape');
  // After flipping, the left side is blue.
  await expect.poll(async () => (await pixelAt(page, 0.35, 0.5))[2]).toBeGreaterThan(150);

  // Straightening shrinks the crop so no empty corners appear.
  await page.keyboard.press('r');
  await setSlider(page.locator('#slider-straighten'), 10);
  await expect(page.locator('output[for=slider-straighten]')).toHaveText('10.0°');
  const result = await panel.locator('.panel-note').textContent();
  const [w, h] = result!
    .match(/(\d+) × (\d+)/)!
    .slice(1)
    .map(Number);
  expect(w).toBeLessThan(600);
  expect(h).toBeLessThan(400);

  // Reset gives back the full frame.
  await panel.getByRole('button', { name: 'Reset' }).click();
  await expect(panel).toContainText('Result: 600 × 400');

  // Within one drag, going back to 0° also gives back the full frame (the crop was
  // only shrunk for the angle).
  await setSlider(page.locator('#slider-straighten'), 8, 3, 0);
  await expect(panel).toContainText('Result: 600 × 400');
});
