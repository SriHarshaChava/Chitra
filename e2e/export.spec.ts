import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import UTIF from 'utif';
import { decodeSrgb, rec2020From, rec2020To, transform } from '../src/color/colorSpaces';
import { developParams, developPixel } from '../src/develop/developMath';
import { DEFAULT_RECIPE } from '../src/develop/recipe';
import { setSlider, importAndOpen } from './helpers';

const NEF = 'samples/iss030e122639.NEF';

function solidTiff(rgb: [number, number, number], width = 300, height = 200): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([...rgb, 255], i);
  return Buffer.from(UTIF.encodeImage(rgba, width, height));
}

async function exportWith(page: Page, choose: () => Promise<void>) {
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await choose();
  const downloadPromise = page.waitForEvent('download', { timeout: 90_000 });
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise;
  await expect(dialog.locator('.export-done')).toContainText('Saved');
  return { download, bytes: readFileSync(await download.path()) };
}

test('exports an edited photo as a 16-bit TIFF with the exact developed colours', async ({
  page,
}) => {
  const colour: [number, number, number] = [180, 120, 60];
  await page.goto('./');
  await importAndOpen(page, {
    name: 'patch.tif',
    mimeType: 'image/tiff',
    buffer: solidTiff(colour),
  });
  await expect(page.getByText(/patch\.tif · .* · opened in/)).toBeVisible();
  await setSlider(page.locator('#slider-exposure'), 0.5);
  await setSlider(page.locator('#slider-saturation'), 30);

  const { download, bytes } = await exportWith(page, async () => {
    await page.getByRole('radio', { name: 'TIFF 16-bit' }).click();
    await page.getByLabel('Size mode').selectOption('full');
    await page.getByLabel('Colour space').selectOption('srgb');
  });
  expect(download.suggestedFilename()).toBe('patch-chitra.tif');

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const [ifd] = UTIF.decode(buffer);
  UTIF.decodeImage(buffer, ifd!);
  expect([ifd!.width, ifd!.height]).toEqual([300, 200]);
  const raw = (ifd as unknown as { data: Uint8Array }).data;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const centre = (100 * 300 + 150) * 3;
  const got = [0, 1, 2].map((c) => view.getUint16((centre + c) * 2, true));

  const linear = colour.map((v) => decodeSrgb(v / 255)) as [number, number, number];
  const params = developParams({ ...DEFAULT_RECIPE, exposure: 0.5, saturation: 30 }, 0);
  const want = developPixel(transform(rec2020From('srgb'), linear), params, rec2020To('srgb')).map(
    (v) => Math.round(v * 65535),
  );
  got.forEach((v, i) => expect(Math.abs(v - want[i]!)).toBeLessThan(300)); // < 0.5 %
});

test('exports a RAW photo as a resized JPEG', async ({ page }) => {
  test.skip(!existsSync(NEF), 'Run `npm run samples` first');
  await page.goto('./');
  await importAndOpen(page, NEF);
  await expect(page.getByText(/opened in/)).toBeVisible({ timeout: 90_000 });

  const { download, bytes } = await exportWith(page, async () => {
    await page.getByRole('radio', { name: 'JPEG' }).click();
    await page.getByLabel('Size mode').selectOption('long-edge');
    await page.getByLabel('Long edge').fill('1200');
    await expect(page.getByTestId('export-size')).toContainText('1200 × 797');
  });
  expect(download.suggestedFilename()).toBe('iss030e122639-chitra.jpg');
  const decoded = jpeg.decode(bytes, { useTArray: true });
  expect([decoded.width, decoded.height]).toEqual([1200, 797]);
  // Not a blank image: the aurora has plenty of variation.
  let min = 255;
  let max = 0;
  for (let i = 0; i < decoded.data.length; i += 4 * 97) {
    min = Math.min(min, decoded.data[i + 1]!);
    max = Math.max(max, decoded.data[i + 1]!);
  }
  expect(max - min).toBeGreaterThan(100);
});
