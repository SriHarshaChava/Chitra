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
│ SQLite +  │  │ linear float, wide   │   │ WebCodecs decode → │
│ OPFS      │  │ gamut, fixed order   │   │ same colour ops →  │
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
5. **A platform layer** (`src/platform/`) hides the differences between browsers (WebGPU or WebGL2, folder access or imports).

## Technology and licences

Everything is free.

| Purpose            | Choice                                         | Licence                                     |
| ------------------ | ---------------------------------------------- | ------------------------------------------- |
| Language           | TypeScript                                     | Apache-2.0                                  |
| Build / dev server | Vite                                           | MIT                                         |
| UI                 | React                                          | MIT                                         |
| GPU processing     | WebGPU (WGSL shaders), WebGL2 fallback         | Built into browsers                         |
| RAW decoding       | LibRaw compiled to WebAssembly with Emscripten | LibRaw LGPL-2.1 or CDDL-1.0; Emscripten MIT |
| Lens corrections   | Lensfun database                               | LGPL-3 library, CC-BY-SA data               |
| Catalog            | SQLite WASM on OPFS                            | Public domain                               |
| Video              | WebCodecs + Mediabunny / mp4box.js             | Browser API; MPL-2.0 / BSD-3                |
| Local AI (later)   | ONNX Runtime Web                               | MIT (each model checked separately)         |
| Debug console      | Eruda                                          | MIT                                         |
| Tests              | Vitest, Testing Library, Playwright            | MIT / MIT / Apache-2.0                      |
| CI and hosting     | GitHub Actions, GitHub Pages                   | Free for public repositories                |

**Licence rule:** Chitra is MIT-licensed. darktable and RawTherapee are GPL. We may learn from their published algorithms but must not copy their code.

## Phases

Each phase ends with something usable on both Windows and iPad.

| #   | Phase             | Delivers                                                                                                                                                                                   |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | Foundations ✅    | Project setup, editor layout, system check, debug console, CI, GitHub Pages deployment                                                                                                     |
| 1   | RAW viewer        | LibRaw WASM in a Worker, instant embedded preview, zoom/pan, histogram, EXIF panel, JPEG/PNG/TIFF                                                                                          |
| 2   | Core Develop      | White balance, exposure, contrast, highlights/shadows, whites/blacks, tone curve, vibrance/saturation, crop/rotate/straighten, before/after, undo/redo, recipes, JPEG + 16-bit TIFF export |
| 3   | Library           | Import, SQLite catalog, thumbnails, ratings/flags/colours, filters, keywords, presets, copy/paste settings, batch export, catalog backup/restore                                           |
| 4   | Detail and colour | Sharpening, noise reduction, HSL/colour mixer, colour grading, lens corrections, auto white balance and tone                                                                               |
| 5   | Local adjustments | Brush, linear and radial gradients, mask combining; later AI subject/sky masks on-device                                                                                                   |
| 6   | Video v1          | Import Nikon MP4/MOV, playback, trim/split, single-track timeline, shared colour pipeline, MP4 export                                                                                      |
| 7   | Advanced          | Spot heal/clone, AI denoise, HDR/panorama merge, layers, DCP camera profiles, more RAW formats                                                                                             |

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
