import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import UTIF from 'utif';
import { decodeSrgb, rec2020From, rec2020To, transform } from '../src/color/colorSpaces';
import { clampedSampler, detailPixel, type FloatImage } from '../src/develop/detail';
import { developParams, developPixel } from '../src/develop/developMath';
import { DEFAULT_RECIPE, type Recipe } from '../src/develop/recipe';
import { importAndOpen, setSlider } from './helpers';

const WIDTH = 96;
const HEIGHT = 64;

/** A noisy, slightly colourful image with a vertical edge in the middle. */
function noisyEdge(): Uint8Array {
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const base = x < WIDTH / 2 ? [70, 60, 50] : [190, 170, 150];
      const o = (y * WIDTH + x) * 4;
      for (let c = 0; c < 3; c++) {
        rgba[o + c] = Math.max(0, Math.min(255, Math.round(base[c]! + (rand() - 0.5) * 30)));
      }
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

/** What the reference maths says the exported (16-bit sRGB) TIFF should contain. */
function reference(rgba: Uint8Array, recipe: Recipe): Float64Array {
  const toRec2020 = rec2020From('srgb');
  const image: FloatImage = {
    width: WIDTH,
    height: HEIGHT,
    data: new Float32Array(WIDTH * HEIGHT * 3),
  };
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const linear = [0, 1, 2].map((c) => decodeSrgb(rgba[i * 4 + c]! / 255)) as [
      number,
      number,
      number,
    ];
    image.data.set(transform(toRec2020, linear), i * 3);
  }
  const params = developParams(recipe, 0);
  const output = rec2020To('srgb');
  const out = new Float64Array(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const sample = clampedSampler(image, x, y);
      const c = params.detail ? detailPixel(sample, params.detail) : sample(0, 0);
      out.set(developPixel(c, params, output), (y * WIDTH + x) * 3);
    }
  }
  return out;
}

test('sharpening and noise reduction in an export match the reference maths', async ({ page }) => {
  const rgba = noisyEdge();
  await page.goto('./');
  await importAndOpen(page, {
    name: 'edge.tif',
    mimeType: 'image/tiff',
    buffer: Buffer.from(UTIF.encodeImage(rgba, WIDTH, HEIGHT)),
  });
  await expect(page.getByText(/edge\.tif · .* · opened in/)).toBeVisible();

  await page.getByRole('button', { name: 'Detail', exact: true }).click();
  const recipe: Recipe = {
    ...DEFAULT_RECIPE,
    sharpenAmount: 80,
    sharpenRadius: 1.2,
    sharpenMasking: 30,
    noiseLuminance: 40,
    noiseColor: 60,
  };
  for (const key of [
    'sharpenAmount',
    'sharpenRadius',
    'sharpenMasking',
    'noiseLuminance',
    'noiseColor',
  ] as const) {
    await setSlider(page.locator(`#slider-${key}`), recipe[key]);
  }

  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await page.getByRole('radio', { name: 'TIFF 16-bit' }).click();
  await page.getByLabel('Size mode').selectOption('full');
  await page.getByLabel('Colour space').selectOption('srgb');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const bytes = readFileSync(await (await downloadPromise).path());

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const [ifd] = UTIF.decode(buffer);
  UTIF.decodeImage(buffer, ifd!);
  const raw = (ifd as unknown as { data: Uint8Array }).data;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  const want = reference(rgba, recipe);
  const plain = reference(rgba, DEFAULT_RECIPE);
  let worst = 0;
  let changed = 0;
  for (let i = 0; i < want.length; i++) {
    const got = view.getUint16(i * 2, true) / 65535;
    worst = Math.max(worst, Math.abs(got - want[i]!));
    changed = Math.max(changed, Math.abs(want[i]! - plain[i]!));
  }
  expect(worst).toBeLessThan(2 / 255);
  // The settings really change the photo, so the comparison means something.
  expect(changed).toBeGreaterThan(20 / 255);
});
