# Chitra

A free, open-source photo and video editor focused on professional RAW processing, creative control, and cross-platform editing.

Chitra is a **website that runs entirely in your browser**. Photos are processed on your own device and are never uploaded.

- **Live site:** https://sriharshachava.github.io/Chitra/
- **Works in:** Chrome or Edge on Windows, and Safari on iPad (iPadOS 26 or later recommended, for WebGPU).
- **Focus:** Nikon RAW (NEF) editing. JPEG, PNG, TIFF and video support are planned.

> **Status: Phase 4a complete (Colour).** Import Nikon NEF, JPEG, PNG and TIFF files into a library that stays in your browser; rate, flag, label, tag, filter and sort; edit tone and colour with sliders, a tone curve, a colour mixer and colour grading; crop and straighten; copy/paste settings and use presets; export one or many photos as JPEG or 16-bit TIFF; back up and restore your library. See [docs/PLAN.md](docs/PLAN.md).

## Using Chitra

- **Import photos:** tap **Import photos…** or drag files onto the window. Chitra keeps a copy in this browser's storage, so your photos, ratings and edits are still there next time (your original files are never changed). Already-imported files are skipped.
- **Library** (`G`): all photos as a grid. Click to select (Ctrl/⌘-click to add, Shift-click for a range, Ctrl/⌘ A for all). Rate with `0`–`5`, flag with `P` (pick), `X` (reject), `U` (unflag), colour label with `6`–`9` — or use the panel on the right, which also has **keywords**. Filter by rating, flag, label or search text, and sort by capture time, import time, name, rating or recently edited. Double-click (or `Enter`/`D`) to edit. **Remove from library** deletes Chitra's copy.
- **On iPad:** in the file picker choose **Browse** (the Files app) rather than **Photo Library**, because the photo library may hand over a JPEG copy instead of the original NEF. Files copied from the camera's SD card (for example with Apple's SD card reader) are in Files.
- **RAW files** first show the camera's built-in preview, then the fully developed RAW after a few seconds. The status bubble at the top tells you which one you are looking at.
- **Zoom:** pinch, scroll wheel or trackpad pinch, or use the toolbar (**Fit**, **1:1** = 100 %, **−**, **+**). Double-tap or double-click toggles between fit and 100 %. Drag to move around.
- **Next/previous photo:** ← and → keys (in both Library and Develop).
- **Edit:** drag the sliders in the Develop panel. The photo updates while you drag. Double-click (or double-tap) a slider's name to reset it.
- **Develop sections:** tap a section title (Presets, Basic, Tone curve, Colour mixer, Colour grading) to fold it away or open it. A dot next to the title means that section has changes; its **Reset** button clears just that section. Chitra remembers which sections you keep open.
- **Tone curve:** tap the line to add a point, drag points to reshape it (raise a point to brighten those tones; an S shape adds contrast), double-tap a point to remove it. **Linear**, **Medium contrast** and **Strong contrast** are quick starting points.
- **Colour mixer:** choose **Hue**, **Saturation** or **Luminance**, then move the slider of a colour — for example Blue saturation up and Blue luminance down for a deeper sky, or Orange luminance up for brighter skin. Other colours aren't affected.
- **Colour grading:** drag the dot in a wheel to tint the **Shadows**, **Midtones** or **Highlights** — the direction picks the colour, the distance the strength (or use the Hue and Saturation sliders). **Balance** moves the split between shadows and highlights, **Blending** how softly they mix. Double-click a wheel to reset it.
- **Undo / redo:** the ↶ ↷ buttons, or Ctrl+Z / Ctrl+Shift+Z (⌘ on a Mac keyboard). **Reset** clears all adjustments.
- **Crop:** press **Crop** in the bottom toolbar (or the `R` key). Drag the corners or edges to resize, drag inside to move. Choose an aspect ratio (1:1, 4:5, 3:2, 16:9…) and ⇄ to switch portrait/landscape. **Straighten** levels the horizon and automatically trims the empty corners. **Left/Right** rotate by 90°, **Flip** mirrors. Press **Done**, Enter or Esc to finish. The Info panel shows the cropped size.
- **Export:** **Export…** in the top bar (or Ctrl/⌘ E). Choose JPEG (with quality) or 16-bit TIFF, the picture size (full size, long edge in pixels, megapixels or percentage — photos are never enlarged) and the colour space (sRGB for sharing, Display P3, or Adobe RGB for printing). The file downloads as `NAME-chitra.jpg`/`.tif`; on iPad, **Share…** offers _Save Image_ to put it in Photos.
- **Presets:** in Develop, click a preset (Wildlife pop, Soft portrait, Recover highlights, Black & white, Blue sky, Teal & orange, Matte) to apply it; **Save as preset…** keeps your own. Presets only change the sliders they contain. In the Library, **Apply preset…** works on all selected photos.
- **Copy / paste settings:** **Copy settings** (Ctrl/⌘ Shift C) lets you choose what to copy (white balance, tone, presence, tone curve, colour mixer, colour grading, crop); **Paste** (Ctrl/⌘ Shift V) applies it to the open photo, or in the Library to every selected photo. Undo takes a paste back.
- **Export many photos:** select photos in the Library and choose **Export N photos…** (or Ctrl/⌘ E). Several photos download as one ZIP; on iPad, **Share…** saves them all to Photos.
- **Back up your library:** **Back up** in the Library saves ratings, keywords, edits and presets to a small `.json` file (not the photos themselves); **Restore…** puts them back, matching photos by file name and size — for example after re-importing on another device. A reminder appears if you haven't backed up for two weeks.
- **Before / after:** the **Before** button or the `\` key shows the photo without your edits.
- Edits, ratings and keywords are saved automatically in the library. Your original files are only read, never changed.

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
  catalog/             The library: IndexedDB storage, import, filters
  photos/              Loading a photo for viewing
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
