# 0003 — Editing on the GPU with WebGL2

- **Status:** Accepted (changes the WebGPU plan in 0001/PLAN for now)
- **Date:** 2026-10-12

## Context

Phase 2 adds sliders that must update a 24 MP photo instantly while you drag them. Doing that on the CPU means recomputing about 72 million values per change, which is too slow. The GPU is built for exactly this kind of work.

## Decision

1. **WebGL2, not WebGPU (for now).**
   - WebGL2 is supported by every browser Chitra targets (Chrome/Edge on Windows, Safari on iPad).
   - It is fast enough for per-pixel adjustments.
   - It can be tested automatically in a headless browser, so CI checks the real shader on every push. WebGPU cannot be tested that way in our test environment.
   - We will revisit WebGPU when we need heavier processing (AI denoise, large blurs for local contrast).

2. **The GPU stores the photo, the shader develops it.**
   - RAW data is uploaded once as 16-bit floating-point tiles (`RGB16F`) with smaller mipmap levels prepared in a worker.
   - Finished images (JPEG, PNG, TIFF, camera previews) are uploaded as sRGB textures, and the GPU converts them to linear light when reading them.
   - Each frame, the visible tiles are drawn and the fragment shader develops every screen pixel. Moving a slider only changes a few numbers sent to the GPU.

3. **One set of maths, written twice.**
   - `src/develop/developMath.ts` is the readable reference and is unit-tested.
   - `src/gpu/shaders.ts` is the same maths in GLSL.
   - A browser test (`e2e/develop.spec.ts`) sets every slider and checks that the GPU output matches the reference within 2/255.

4. **Develop order**, in a linear wide-gamut working space:
   1. White balance and exposure, as one 3×3 matrix. White balance is a Bradford adaptation from the light implied by Temperature/Tint to D65.
   2. Vibrance and saturation, keeping brightness.
   3. Whites/Blacks, Highlights/Shadows, Contrast and the default curve, applied on a perceptual scale.
   4. Conversion to the display's colour space.

   Highlights/Shadows are tone curves for now. Lightroom's versions also look at neighbouring pixels (local contrast); that comes with Phase 4.

5. **Edits are recipes.**
   - Each photo has its own undo/redo history. Dragging previews live; releasing the slider records one undo step.
   - Committed recipes are saved in the browser, keyed by file name, size and date, until the catalog arrives in Phase 3.

## Consequences

- Slider changes redraw instantly even for 24 MP photos. The histogram is recomputed from a small developed copy shortly after each change.
- GPU memory use is about 240 MB for a 24 MP RAW. This is fine on desktop and iPad Pro.
- If the system resets the GPU (possible when an iPad app goes to the background), the photo is decoded again automatically.
