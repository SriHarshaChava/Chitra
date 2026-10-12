import { expect, test } from '@playwright/test';
import UTIF from 'utif';
import { setSlider } from './helpers';

function tiff(value: number): Buffer {
  const width = 120;
  const height = 80;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([value, value, value, 255], i);
  return Buffer.from(UTIF.encodeImage(rgba, width, height));
}

test('the library, ratings and edits survive a page reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Your library is empty')).toBeVisible();
  await page.getByTestId('file-input').setInputFiles([
    { name: 'dark.tif', mimeType: 'image/tiff', buffer: tiff(40) },
    { name: 'light.tif', mimeType: 'image/tiff', buffer: tiff(200) },
  ]);
  const grid = page.getByRole('listbox', { name: 'Photos' });
  await expect(grid.getByRole('option')).toHaveCount(2);

  // Rate and pick the first photo, add keywords.
  await grid.getByRole('option', { name: /dark\.tif/ }).click();
  await page.keyboard.press('5');
  await page.keyboard.press('p');
  const keywords = page.getByPlaceholder('e.g. kingfisher, river, morning');
  await keywords.fill('Night, test');
  await keywords.press('Enter');

  // Edit it in Develop.
  await grid.getByRole('option', { name: /dark\.tif/ }).dblclick();
  await expect(page.getByText(/dark\.tif · .* · opened in/)).toBeVisible();
  await setSlider(page.locator('#slider-exposure'), 1.25);
  await expect(page.locator('output[for=slider-exposure]')).toHaveText('+1.25');
  await page.waitForTimeout(1200); // thumbnail refresh happens shortly after an edit

  await page.reload();
  const gridAfter = page.getByRole('listbox', { name: 'Photos' });
  await expect(gridAfter.getByRole('option')).toHaveCount(2);
  const dark = gridAfter.getByRole('option', { name: /dark\.tif/ });
  await expect(dark.getByLabel('5 of 5 stars')).toBeVisible();
  await expect(dark.getByLabel('pick')).toBeVisible();
  await expect(dark.getByLabel('edited')).toBeVisible();
  // The TIFF got a thumbnail from its developed version.
  await expect(dark.locator('img')).toBeVisible();

  // Search finds it by keyword.
  await page.getByLabel('Search').fill('night');
  await expect(gridAfter.getByRole('option')).toHaveCount(1);
  await page.getByLabel('Search').fill('');

  // The edit is still there.
  await dark.dblclick();
  await expect(page.locator('output[for=slider-exposure]')).toHaveText('+1.25');

  // Remove the other photo.
  await page.keyboard.press('g');
  page.once('dialog', (dialog) => dialog.accept());
  await gridAfter.getByRole('option', { name: /light\.tif/ }).click();
  await page.getByRole('button', { name: 'Remove from library' }).click();
  await expect(gridAfter.getByRole('option')).toHaveCount(1);
});
