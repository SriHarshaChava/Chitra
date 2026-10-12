# 0004 — The catalog: IndexedDB with copied originals

- **Status:** Accepted (replaces "SQLite WASM on OPFS" from the original plan)
- **Date:** 2026-10-12

## Context

Phase 3 needs photos, ratings and edits to survive closing the browser, on both Windows and iPad.

## Decision

1. **IndexedDB, not SQLite.** The fast SQLite-in-the-browser storage needs special server headers (cross-origin isolation) that GitHub Pages cannot send, or it falls back to slower, more complex workarounds. IndexedDB is built into every browser, needs nothing extra, and stores files (Blobs) directly. The catalog is small and simple (one record per photo), so a database query language isn't needed yet.

2. **Originals are copied into the catalog at import.**
   - Safari on iPad cannot open a file again later, so a copy is the only way a photo is still available tomorrow.
   - The original on the card, computer or Files app is never touched.
   - Cost: storage space. Usage is shown in **System check**.

3. **Three stores:**
   - `photos` holds one record per photo: name, size, shooting info, rating, flag, colour label, keywords and edit recipe.
   - `originals` holds the copied file.
   - `thumbnails` holds a 400 px JPEG that is refreshed after edits, so the grid shows edited versions.

4. **Every change is saved immediately.** A rating, keyword or finished slider move is written straight away, so nothing is lost if the tab is closed.

5. **Persistent storage is requested on the first import,** so the browser does not clean up the library when space is low.

## Consequences

- Each imported photo uses its full file size again (about 25 MB per D5600 NEF).
- **Browser data can still be lost,** for example if the user clears website data or uninstalls the browser. Catalog backup/restore comes in Phase 3b, and originals should always also be kept elsewhere.
- **Possible future option on Windows:** Chrome can open folders in place (File System Access API), which would avoid the copy. It could be added for Chrome only.
