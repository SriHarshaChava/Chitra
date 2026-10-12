import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { litPixels, setSlider } from './helpers';

const NEF = 'samples/iss030e122639.NEF';

test('opens a Nikon NEF: preview first, then the developed RAW', async ({ page }) => {
  test.skip(!existsSync(NEF), 'Run `npm run samples` first');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles(NEF);

  // Shooting info comes from the RAW metadata.
  const develop = page.getByRole('complementary', { name: 'Develop' });
  await expect(develop).toContainText('Nikon D3S');
  await expect(develop).toContainText('ISO 3200');

  // The developed RAW replaces the camera preview.
  await expect(page.getByText(/opened in \d+(\.\d+)? s/)).toBeVisible({ timeout: 90_000 });
  await expect(develop).toContainText('4284 × 2844');

  // The canvas shows real pixels, not an empty frame.
  expect(await litPixels(page)).toBeGreaterThan(1000);

  // The developed RAW can be edited.
  const exposure = page.locator('#slider-exposure');
  await expect(exposure).toBeEnabled();
  await setSlider(exposure, 1.5);
  await expect(page.locator('output[for=slider-exposure]')).toHaveText('+1.50');

  // Zoom controls.
  await page.getByRole('button', { name: 'Zoom to 100 percent' }).click();
  await expect(page.getByLabel('Zoom level')).toHaveText('100%');
  await page.getByRole('button', { name: 'Fit to screen' }).click();
  await expect(page.getByLabel('Zoom level')).not.toHaveText('100%');

  expect(errors).toEqual([]);
});

test('opens a JPEG and shows it straight away', async ({ page }) => {
  await page.goto('./');
  // Build a small JPEG in the browser so the test needs no extra files.
  const jpeg = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(640, 480);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3a7';
    ctx.fillRect(0, 0, 640, 480);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'green.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(jpeg),
  });
  await expect(page.getByText(/green\.jpg · .* · opened in/)).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Develop' })).toContainText('640 × 480');
});

test('opens a TIFF', async ({ page }) => {
  const { default: UTIF } = await import('utif');
  const width = 300;
  const height = 200;
  const rgba = new Uint8Array(width * height * 4).map((_, i) => (i % 4 === 3 ? 255 : 120));
  const tiff = Buffer.from(UTIF.encodeImage(rgba, width, height));
  await page.goto('./');
  await page
    .getByTestId('file-input')
    .setInputFiles({ name: 'grey.tif', mimeType: 'image/tiff', buffer: tiff });
  await expect(page.getByText(/grey\.tif · .* · opened in/)).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Develop' })).toContainText('300 × 200');
});
