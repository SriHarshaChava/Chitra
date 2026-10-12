import type { Locator, Page } from '@playwright/test';

/** Reads the colour of the viewer's centre pixel (0..255 RGBA). */
export function centerPixel(page: Page): Promise<number[]> {
  return page.locator('canvas.viewer-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    return Array.from(ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data);
  });
}

/** Counts non-background pixels on a coarse grid of the viewer canvas. */
export function litPixels(page: Page): Promise<number> {
  return page.locator('canvas.viewer-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4 * 101) {
      if (Math.abs(data[i]! - 0x16) > 3 || Math.abs(data[i + 1]! - 0x16) > 3) count++;
    }
    return count;
  });
}

/** Moves a slider like a user would: live input events, then release. */
export async function setSlider(slider: Locator, value: number) {
  await slider.evaluate((input: HTMLInputElement, v: number) => {
    // React tracks the value property, so use the native setter to simulate typing.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, value);
}
