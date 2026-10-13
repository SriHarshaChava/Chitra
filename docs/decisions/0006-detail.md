# 0006 — Detail: sharpening and noise reduction

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

Wildlife photos need crisp feathers and fur, and the D5600 gets noisy at high ISO. Sharpening and noise reduction are different from the other adjustments: they look at each pixel's neighbours. They still have to update live on an iPad and match exactly between the screen and the export.

## Decision

1. **They run first, on the photo data,** before white balance and exposure, inside the same GPU shader.
   - Reading neighbours there is just a few extra texture reads. Running them after the rest of the develop would mean developing every neighbour again, which is 25–50 times the work.
   - Removing sensor noise before the tone curve stretches it is also the physically right order.

2. **Filters** (reference maths in `src/develop/detail.ts`; the shader mirrors it):
   - **Luminance noise reduction:** a 5×5 bilateral filter. It averages with neighbours of similar brightness, so grain smooths out but edges stay.
   - **Colour noise reduction:** averages the colour of neighbours up to 4 pixels away (a wider grid, because colour noise is blotchy). It keeps each pixel's brightness and only mixes with neighbours of similar brightness, so colours don't bleed across edges.
   - **Sharpening:** an unsharp mask on perceptual brightness, so shadows and highlights sharpen evenly.
     - **Radius** sets the blur size.
     - **Masking** uses an edge detector (Sobel) to sharpen only edges.
     - A limit near the neighbours' brightest and darkest values prevents bright or dark halos.
   - Brightness changes are applied as a ratio, so colours keep their hue.

3. **Only at full resolution.** The filters run when the photo is drawn from its full-resolution tiles: zoomed in, and for exports. The small overview image used when zoomed out, and for thumbnails and the histogram, skips them. A 1-pixel sharpen means nothing on a downsized image. Lightroom asks you to zoom to 1:1 for the same reason.

4. **Tiles borrow 8 pixels** from their neighbours (was 4), so the widest filter (4 pixels) never reads past a tile's edge and no seams appear.

5. **Off by default.** Existing edits look exactly as before. The built-in **Sharpen & clean (RAW)** preset gives a typical starting point.

## Consequences

- A browser test exports a noisy test image and checks every pixel against the reference maths.
- Strengths and preset values will be tuned on real D5600 high-ISO and feather photos.
- Deeper AI-based denoising is a later option (Phase 7).
