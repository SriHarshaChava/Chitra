# Chitra

A free, open-source photo and video editor focused on professional RAW processing, creative control, and cross-platform editing.

Chitra is a **website that runs entirely in your browser**. Photos are processed on your own device and are never uploaded.

- **Live site:** https://sriharshachava.github.io/Chitra/
- **Works in:** Chrome or Edge on Windows, and Safari on iPad (iPadOS 26 or later recommended, for WebGPU).
- **Focus:** Nikon RAW (NEF) editing. JPEG, PNG, TIFF and video support are planned.

> **Status: Phase 0 (foundations).** The editor layout and system check are in place. Opening photos arrives in Phase 1. See [docs/PLAN.md](docs/PLAN.md).

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
  components/          UI pieces (panels, viewer, system check)
  platform/            Browser feature detection, storage, debug console
docs/
  PLAN.md              Roadmap and architecture
  decisions/           Short records of important technical decisions
.github/workflows/     CI (tests on every push) and GitHub Pages deployment
```

## Your photos and Git

Never commit personal photos. Keep test files in a `samples/` folder. Git ignores that folder and all `.NEF`, `.DNG`, `.MOV` and `.MP4` files.

## License

Chitra is released under the [MIT license](LICENSE). Third-party libraries keep their own licenses; see [docs/PLAN.md](docs/PLAN.md#technology-and-licences).
