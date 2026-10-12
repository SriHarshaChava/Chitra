# Chitra

A free, open-source photo and video editor focused on professional RAW processing, creative control, and cross-platform editing.

Chitra is a **website that runs entirely in your browser**. Photos are processed on your own device and are never uploaded.

- **Live site:** https://sriharshachava.github.io/Chitra/
- **Works in:** Chrome or Edge on Windows, and Safari on iPad (iPadOS 26 or later recommended, for WebGPU).
- **Focus:** Nikon RAW (NEF) editing. JPEG, PNG, TIFF and video support are planned.

> **Status: Phase 2a (Basic editing).** Open Nikon NEF, JPEG, PNG and TIFF files and adjust white balance, exposure, tone and colour with live preview, undo/redo and before/after. Crop and export come next. See [docs/PLAN.md](docs/PLAN.md).

## Using Chitra

- **Open photos:** tap **Open photos…** or drag files onto the window. You can open several at once; they appear in the Library panel.
- **On iPad:** in the file picker choose **Browse** (the Files app) rather than **Photo Library**, because the photo library may hand over a JPEG copy instead of the original NEF. Files copied from the camera's SD card (for example with Apple's SD card reader) are in Files.
- **RAW files** first show the camera's built-in preview, then the fully developed RAW after a few seconds. The status bubble at the top tells you which one you are looking at.
- **Zoom:** pinch, scroll wheel or trackpad pinch, or use the toolbar (**Fit**, **1:1** = 100 %, **−**, **+**). Double-tap or double-click toggles between fit and 100 %. Drag to move around.
- **Next/previous photo:** ← and → keys.
- **Edit:** drag the sliders in the Develop panel. The photo updates while you drag. Double-click (or double-tap) a slider's name to reset it.
- **Undo / redo:** the ↶ ↷ buttons, or Ctrl+Z / Ctrl+Shift+Z (⌘ on a Mac keyboard). **Reset** clears all adjustments.
- **Before / after:** the **Before** button or the `\` key shows the photo without your edits.
- Edits are remembered in this browser when you open the same file again. Your original files are only read, never changed.

## Run it on your Windows PC

One-time setup:

1. Install **Node.js 22 LTS** from https://nodejs.org (free) and accept the defaults.
2. Install **Git** (you already have it) and **VS Code** (free and recommended).
3. Clone the repository and install its dependencies:
   ```powershell
   git clone https://github.com/SriHarshaChava/chitra.git
   cd chitra
   npm install
   ```

Every day:

```powershell
npm run dev
```

Then open http://localhost:5173/. The page reloads automatically whenever the code changes.

### Try the development version on your iPad

`npm run dev` also prints a **Network** address, such as `http://192.168.1.20:5173/`.

1. Put the iPad on the same Wi-Fi as the PC.
2. Open that address in Safari.
3. If the page doesn't load, allow Node.js through the Windows Firewall when prompted.

Some browser features, such as WebGPU and private file storage, need HTTPS. The plain-HTTP development address can't provide that, so do the full iPad test on the live GitHub Pages site.

## Useful commands

| Command             | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | Start the local development server                                  |
| `npm test`          | Run the unit tests once (`npm run test:watch` re-runs them on save) |
| `npm run lint`      | Check the code for common mistakes                                  |
| `npm run format`    | Format all files with Prettier                                      |
| `npm run typecheck` | Check TypeScript types                                              |
| `npm run check`     | Run lint, format check, typecheck and tests                         |
| `npm run build`     | Build the production site into `dist/`                              |
| `npm run preview`   | Serve the production build locally                                  |

## Debugging on iPad

Safari's own Web Inspector needs a Mac. Instead, add `?debug=1` to the URL to open an on-page developer console, for example https://sriharshachava.github.io/Chitra/?debug=1.

The **System check** button shows which features your browser supports. **Copy report** copies the results so you can share them.

## Project layout

```
src/
  App.tsx              App shell: top bar, panels, viewer
  components/          UI pieces (viewer, library, histogram, info, system check)
  color/               Colour-space maths (Rec.2020, Display P3, sRGB, tone curve)
  develop/             Edit recipes, develop maths, white balance, undo/redo
  gpu/                 WebGL2 renderer and shaders
  decode/              File types, LibRaw RAW decoding, EXIF, background worker
  render/              Tiles, zoom/pan maths, drawing, histogram
  photos/              Loading photos and the list of opened photos
  platform/            Browser feature detection, storage, debug console
e2e/                   Browser tests that open real photos
scripts/               Helper scripts (downloading test photos)
docs/
  PLAN.md              Roadmap and architecture
  decisions/           Short records of important technical decisions
.github/workflows/     CI (tests on every push) and GitHub Pages deployment
```

## Your photos and Git

Never commit personal photos. Keep test files in a `samples/` folder. Git ignores that folder and all `.NEF`, `.DNG`, `.MOV` and `.MP4` files.

## License

Chitra is released under the [MIT license](LICENSE). Third-party libraries keep their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
