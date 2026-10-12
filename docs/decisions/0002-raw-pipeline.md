# 0002 — How RAW photos are decoded and displayed

- **Status:** Accepted
- **Date:** 2026-10-12

## Decision

1. **Decoder: LibRaw via the `libraw-wasm` package** (ISC wrapper; LibRaw is LGPL-2.1/CDDL-1.0).
   - LibRaw is the most widely used open-source RAW decoder and supports every Nikon DSLR, including the D5600.
   - The package already provides LibRaw compiled to WebAssembly and runs it in a Web Worker.
   - It works without special server headers, which GitHub Pages cannot send.
   - The version is pinned exactly (`1.6.0`) so decoding cannot change unexpectedly.
   - If we ever need a custom build, we can compile LibRaw with Emscripten in GitHub Actions.

2. **Show the camera's embedded JPEG first.** Opening a NEF and extracting its full-size preview takes about 0.1 s. Developing the RAW takes a few seconds, and it replaces the preview when ready, keeping the current zoom.

3. **Working data is linear, 16-bit, Rec.2020** (`outputColor: 8`, `outputBps: 16`, `noAutoBright`).
   - **Linear** values are proportional to light, so exposure and white balance behave physically.
   - **Rec.2020** is wide enough that saturated colours are not clipped before editing.
   - **No auto-brightening** means the image reflects the real exposure. Exposure becomes a user control in Phase 2.

4. **Display conversion happens in a worker:** linear Rec.2020 → (3×3 matrix) → linear Display P3 or sRGB → sRGB curve → default contrast curve → 8-bit.
   - Display P3 is used when the screen and browser support it, as on iPad.
   - The **default contrast curve** (`BASE_CONTRAST`) gives the look people expect from a camera JPEG. Phase 2 makes it editable.

5. **Tiles.** Photos are stored as 2048 px tiles with a 2 px overlap, plus a downscaled overview of up to 3072 px.
   - iPad Safari limits a single canvas to about 16.7 megapixels, and a D5600 photo is 24 MP.
   - The overview is drawn when zoomed out; the full-resolution tiles are drawn when zoomed in.

6. **Drawing uses Canvas 2D for now.** Viewing only needs scaling and moving, which Canvas 2D does on the GPU. WebGPU arrives in Phase 2, when every slider change must re-process pixels in real time.

## Consequences

- Developing a 24 MP NEF takes a few seconds (single-threaded WebAssembly). The embedded preview hides most of that wait.
- Out-of-gamut colours are simply clipped for display. Better gamut mapping is future work.
- Memory peaks at roughly 350 MB while a 24 MP photo is developed. This is fine on desktop and iPad Pro; very old iPads may struggle.
