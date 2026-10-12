# Chitra — project plan

## Goal

Chitra is a free, local-first photo and video editor, similar in purpose to Lightroom and Photoshop.

- **Main priority:** high-quality RAW editing for Nikon DSLR (D-series) NEF files.
- **Secondary:** video editing.
- **Platform:** a website used on a Windows PC and an iPad. Why it's a website: [decisions/0001-web-app.md](decisions/0001-web-app.md).

**Principles**

- Free forever.
- Photos stay on the device.
- Originals are never modified.
- Image quality first.
- A clean, professional interface.

## Architecture

```
┌─────────────────────────── UI (React) ─────────────────────────────┐
│ Library │ Develop view (sliders, histogram) │ Video timeline        │
└────┬────────────────────┬──────────────────────────┬───────────────┘
     │ edit recipe (JSON) │                          │
┌────▼──────┐  ┌──────────▼───────────┐   ┌──────────▼─────────┐
│ Catalog   │  │ Image pipeline (GPU) │   │ Video engine       │
│ IndexedDB │  │ linear float, wide   │   │ WebCodecs decode → │
│ (browser) │  │ gamut, fixed order   │   │ same colour ops →  │
└────┬──────┘  └──────────▲───────────┘   │ encode MP4         │
     │                    │               └────────────────────┘
     │         ┌──────────┴───────────┐
     └────────►│ Decoders (Workers)   │  LibRaw-WASM (NEF), JPEG/PNG/TIFF,
               │ off the UI thread    │  video demuxing
               └──────────────────────┘
```

Key ideas:

1. **Non-destructive editing.** An edit is a small JSON "recipe", for example `{ "exposure": 0.7, "wb": { "temp": 5600 } }`. The original file plus the recipe produces the result. This makes undo, presets, copy/paste of settings and virtual copies easy. Recipes can be exported as `.chitra.json` files.
2. **Professional colour.**
   - RAW data is processed in **linear, wide-gamut floating point**, which gives natural highlight roll-off.
   - Output is converted to Display P3 for the screen and to sRGB, P3 or Adobe RGB for export.
3. **Fixed processing order, like Lightroom:** white balance → exposure → tone → colour → detail → output.
4. **Speed.**
   - The NEF's embedded JPEG is shown instantly while the full RAW decodes in a background Web Worker.
   - Sliders work on a screen-sized preview. Full resolution is used only for zooming and export.
5. **A platform layer** (`src/platform/`) hides the differences between browsers (folder access or imports, display colour space).

## Technology and licences

Everything is free.

| Purpose            | Choice                                                   | Licence                                     |
| ------------------ | -------------------------------------------------------- | ------------------------------------------- |
| Language           | TypeScript                                               | Apache-2.0                                  |
| Build / dev server | Vite                                                     | MIT                                         |
| UI                 | React                                                    | MIT                                         |
| GPU processing     | WebGL2 (GLSL shaders); WebGPU later for heavy processing | Built into browsers                         |
| RAW decoding       | LibRaw compiled to WebAssembly with Emscripten           | LibRaw LGPL-2.1 or CDDL-1.0; Emscripten MIT |
| Lens corrections   | Lensfun database                                         | LGPL-3 library, CC-BY-SA data               |
| Catalog            | IndexedDB (built into the browser)                       | Browser API                                 |
| Video              | WebCodecs + Mediabunny / mp4box.js                       | Browser API; MPL-2.0 / BSD-3                |
| Local AI (later)   | ONNX Runtime Web                                         | MIT (each model checked separately)         |
| Debug console      | Eruda                                                    | MIT                                         |
| Tests              | Vitest, Testing Library, Playwright                      | MIT / MIT / Apache-2.0                      |
| CI and hosting     | GitHub Actions, GitHub Pages                             | Free for public repositories                |

Full list: [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). How RAW decoding works: [decisions/0002-raw-pipeline.md](decisions/0002-raw-pipeline.md). How editing works: [decisions/0003-gpu-develop-pipeline.md](decisions/0003-gpu-develop-pipeline.md). How the library is stored: [decisions/0004-catalog.md](decisions/0004-catalog.md). How the colour tools work: [decisions/0005-colour-tools.md](decisions/0005-colour-tools.md). How sharpening and noise reduction work: [decisions/0006-detail.md](decisions/0006-detail.md).

**Licence rule:** Chitra is MIT-licensed. darktable and RawTherapee are GPL. We may learn from their published algorithms but must not copy their code.

## Phases

Each phase ends with something usable on both Windows and iPad.

| #   | Phase             | Delivers                                                                                                                                                                 |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | Foundations ✅    | Project setup, editor layout, system check, debug console, CI, GitHub Pages deployment                                                                                   |
| 1   | RAW viewer ✅     | LibRaw WASM in a Worker, instant embedded preview, zoom/pan, histogram, EXIF panel, JPEG/PNG/TIFF                                                                        |
| 2a  | Basic editing ✅  | GPU develop pipeline, white balance, exposure, contrast, highlights/shadows, whites/blacks, vibrance/saturation, undo/redo, before/after, edits remembered on the device |
| 2b  | Crop ✅           | Crop with aspect ratios, straighten (auto-trims corners), rotate 90°, flip                                                                                               |
| 2c  | Export ✅         | Export JPEG and 16-bit TIFF at full or reduced size (long edge, megapixels, %), with colour profile                                                                      |
| 3a  | Library ✅        | Catalog in IndexedDB (originals copied), grid view, ratings/flags/colour labels, keywords, filters and sorting, thumbnails that show edits                               |
| 3b  | Library tools ✅  | Copy/paste settings, presets, batch export, catalog backup/restore                                                                                                       |
| 4a  | Colour ✅         | Tone curve, colour mixer (HSL), colour grading, collapsible Develop sections                                                                                             |
| 4b  | Detail ✅         | Sharpening (amount, radius, masking), luminance and colour noise reduction                                                                                               |
| 4c  | Corrections       | Lens corrections, auto white balance and tone                                                                                                                            |
| 5   | Local adjustments | Brush, linear and radial gradients, mask combining; later AI subject/sky masks on-device                                                                                 |
| 6   | Video v1          | Import Nikon MP4/MOV, playback, trim/split, single-track timeline, shared colour pipeline, MP4 export                                                                    |
| 7   | Advanced          | Spot heal/clone, AI denoise, HDR/panorama merge, layers, DCP camera profiles, more RAW formats                                                                           |

## Known limitations

- **iPad Safari storage.** Website data can be cleared, so the app relies on persistent-storage requests, exportable recipes and catalog backups.
- **iPad folder access.** Safari can't open folders, so photos are imported as copies.
- **Memory.** Large RAW files need a tile-based, memory-aware pipeline.
- **Unsupported formats.** Nikon N-RAW and ProRes RAW video, and Nikon HE/HE★ NEF, have no free decoders.
- **Colour matching.** Exact Adobe colour rendition is not a goal. Chitra uses LibRaw's colour matrices and its own tone curve.

## How we work

1. One small feature per branch.
2. Code with explanations and tests.
3. `npm run check` passes.
4. Test on Windows and iPad.
5. Merge to `main`, which deploys automatically.
