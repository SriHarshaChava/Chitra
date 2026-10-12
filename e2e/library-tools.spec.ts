import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import UTIF from 'utif';
import { setSlider } from './helpers';

function tiff(value: number): Buffer {
  const width = 90;
  const height = 60;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([value, value, value, 255], i);
  return Buffer.from(UTIF.encodeImage(rgba, width, height));
}

async function importThree(page: Page) {
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles([
    { name: 'one.tif', mimeType: 'image/tiff', buffer: tiff(60) },
    { name: 'two.tif', mimeType: 'image/tiff', buffer: tiff(120) },
    { name: 'three.tif', mimeType: 'image/tiff', buffer: tiff(180) },
  ]);
  const grid = page.getByRole('listbox', { name: 'Photos' });
  await expect(grid.getByRole('option')).toHaveCount(3);
  return grid;
}

test('copy settings from one photo and paste them onto others; apply a preset', async ({
  page,
}) => {
  const grid = await importThree(page);

  // Edit "one" in Develop and copy its settings.
  await grid.getByRole('option', { name: /one\.tif/ }).dblclick();
  await expect(page.getByText(/one\.tif · .* · opened in/)).toBeVisible();
  await setSlider(page.locator('#slider-exposure'), 0.8);
  await setSlider(page.locator('#slider-vibrance'), 30);
  await page.getByRole('button', { name: 'Copy settings' }).click();
  await page
    .getByRole('dialog', { name: 'Copy settings' })
    .getByRole('button', { name: 'Copy' })
    .click();

  // Paste onto "two" and "three" in the Library.
  await page.keyboard.press('g');
  await grid.getByRole('option', { name: /two\.tif/ }).click();
  await grid.getByRole('option', { name: /three\.tif/ }).click({ modifiers: ['ControlOrMeta'] });
  await page.getByRole('button', { name: 'Paste settings' }).click();
  await expect(grid.getByRole('option', { name: /three\.tif/ }).getByLabel('edited')).toBeVisible();

  // Opening "three" shows the pasted values, and Undo takes the paste back.
  await grid.getByRole('option', { name: /three\.tif/ }).dblclick();
  await expect(page.locator('output[for=slider-exposure]')).toHaveText('+0.80');
  await expect(page.locator('output[for=slider-vibrance]')).toHaveText('+30');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('output[for=slider-exposure]')).toHaveText('0.00');

  // Apply a built-in preset.
  await page.getByRole('button', { name: 'Black & white' }).click();
  await expect(page.locator('output[for=slider-saturation]')).toHaveText('-100');

  // Save a preset of our own and see it listed.
  await page.getByRole('button', { name: 'Save as preset…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as preset' });
  await dialog.getByLabel('Name').fill('My mono');
  await dialog.getByRole('button', { name: 'Save preset' }).click();
  await expect(page.getByRole('button', { name: 'My mono', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete preset My mono' })).toBeVisible();
});

test('exports several photos as one ZIP', async ({ page }) => {
  const grid = await importThree(page);
  await grid.getByRole('option').first().click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Export 3 photos…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export 3 photos' });
  await dialog.getByRole('radio', { name: 'JPEG' }).click();
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 });
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^chitra-export-.*\.zip$/);

  const zip = readFileSync(await download.path());
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  expect(view.getUint16(end + 10, true)).toBe(3);
  const names = zip.toString('latin1');
  for (const n of ['one-chitra.jpg', 'two-chitra.jpg', 'three-chitra.jpg'])
    expect(names).toContain(n);
});

test('backs up the library and restores it', async ({ page }) => {
  const grid = await importThree(page);
  await grid.getByRole('option', { name: /two\.tif/ }).click();
  await page.keyboard.press('5');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Back up/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^chitra-library-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = readFileSync(await download.path());

  // Change the rating, then restore the backup.
  await page.keyboard.press('1');
  await expect(
    grid.getByRole('option', { name: /two\.tif/ }).getByLabel('1 of 5 stars'),
  ).toBeVisible();
  await page.getByTestId('restore-input').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await expect(page.getByText(/Restored 3 photos/)).toBeVisible();
  await expect(
    grid.getByRole('option', { name: /two\.tif/ }).getByLabel('5 of 5 stars'),
  ).toBeVisible();
});
