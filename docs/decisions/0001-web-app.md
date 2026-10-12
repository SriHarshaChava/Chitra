# 0001 — Chitra is a website that runs in the browser

- **Status:** Accepted
- **Date:** 2026-10-12

## Context

Chitra must:

- cost nothing to build, host or run;
- be developed on Windows;
- be usable on an iPad for photo and video editing;
- keep photos on the device.

Options considered:

| Option                                   | Problem                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Python desktop app                       | Cannot run on iPad.                                                                                          |
| Native iPad app (Swift)                  | Needs a Mac to build. A free Apple ID only keeps the app installed for 7 days. The App Store costs $99/year. |
| Flutter / React Native / Tauri for iOS   | Still need a Mac and Apple signing to install on an iPad.                                                    |
| **Website** (TypeScript + WebGPU + WASM) | Runs on both devices from one codebase, free to host, all processing local.                                  |

## Decision

Build Chitra as a **plain website**:

- written in TypeScript and React, built with Vite;
- hosted for free on GitHub Pages;
- used in Chrome/Edge on Windows and Safari on iPad, with no install step.

Heavy work runs locally in the browser:

- image processing on the GPU (WebGPU, with WebGL2 as the fallback);
- RAW decoding with LibRaw compiled to WebAssembly;
- video decoding and encoding with the browser's WebCodecs.

## Consequences

**Good**

- One codebase for Windows and iPad, and no Mac needed.
- Free hosting. Updates go live with a `git push`.
- Photos never leave the device: the website only delivers code.

**Limitations, and how we handle them**

- **Safari may clear website data.** It can do this after about 7 days without a visit, or when the iPad is low on storage.
  - We request persistent storage.
  - Edits are portable `.chitra.json` recipe files that can be exported.
  - A one-click catalog backup will be provided.
  - Browser storage is treated as a cache, never as the only copy.
- **No direct folder access on iPad Safari.** Photos are imported (copied) into the site's private storage. Chrome/Edge on Windows can open folders in place.
- **Memory limits per tab.** This matters for large RAW files (a 45 MP image is several hundred MB in floating point). The image pipeline must work on tiles and screen-sized previews.
- **Debugging on iPad.** Safari Web Inspector needs a Mac, so we use the on-page Eruda console (`?debug=1`).
- **Some formats can't be read at all:** Nikon N-RAW and ProRes RAW video, and Nikon HE/HE★ NEF. No free decoders exist for these. This does not affect D-series DSLR NEF files.

If a Mac becomes available later, the same code can be wrapped as a native app with Capacitor or Tauri without a rewrite.
