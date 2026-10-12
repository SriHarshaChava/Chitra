// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RECIPE, type Recipe } from '../develop/recipe';
import { applyGroups, DEFAULT_COPY_GROUPS } from '../develop/settingsGroups';
import { crc32, makeZip, uniqueNames } from '../export/zip';
import { backupFileName, makeBackup, parseBackup, planRestore } from './backup';
import * as db from './db';
import { applyPreset, BUILT_IN_PRESETS, presetSettings, sanitizePreset } from './presets';
import type { CatalogPhoto } from './types';

const recipe = (r: Partial<Recipe>): Recipe => ({ ...DEFAULT_RECIPE, ...r });
const cropped = recipe({
  exposure: 1,
  temperature: 20,
  vibrance: 30,
  geometry: { ...DEFAULT_RECIPE.geometry, crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } },
});

function photo(overrides: Partial<CatalogPhoto>): CatalogPhoto {
  return {
    id: 'id',
    name: 'DSC_0001.NEF',
    size: 100,
    lastModified: 1,
    kind: 'raw',
    importedAt: 1,
    info: {},
    rating: 0,
    flag: null,
    label: null,
    keywords: [],
    recipe: DEFAULT_RECIPE,
    ...overrides,
  };
}

describe('copy settings by group', () => {
  it('copies everything but the crop by default', () => {
    const target = recipe({ contrast: 50 });
    const result = applyGroups(target, cropped, DEFAULT_COPY_GROUPS);
    expect(result).toMatchObject({ exposure: 1, temperature: 20, vibrance: 30, contrast: 0 });
    expect(result.geometry).toEqual(DEFAULT_RECIPE.geometry);
  });

  it('can copy only the crop', () => {
    const result = applyGroups(DEFAULT_RECIPE, cropped, ['geometry']);
    expect(result.exposure).toBe(0);
    expect(result.geometry.crop.width).toBe(0.5);
  });
});

describe('presets', () => {
  it('only change the sliders they contain', () => {
    const bw = BUILT_IN_PRESETS.find((p) => p.name === 'Black & white')!;
    expect(applyPreset(recipe({ exposure: 0.7 }), bw)).toMatchObject({
      exposure: 0.7,
      saturation: -100,
    });
  });

  it('save the chosen groups', () => {
    expect(presetSettings(cropped, ['whiteBalance'])).toEqual({
      values: { temperature: 20, tint: 0 },
    });
  });

  it('are cleaned when loaded from a file', () => {
    expect(
      sanitizePreset({ id: 'x', name: '  Mine ', values: { exposure: 99, bogus: 1 } }),
    ).toMatchObject({
      name: 'Mine',
      builtIn: false,
      values: { exposure: 5 },
    });
    expect(sanitizePreset({ id: 'x', name: '' })).toBeNull();
  });
});

describe('library backup', () => {
  const library = [
    photo({
      id: 'a',
      name: 'A.NEF',
      size: 10,
      lastModified: 5,
      rating: 4,
      keywords: ['owl'],
      recipe: cropped,
    }),
    photo({ id: 'b', name: 'B.NEF', size: 20, lastModified: 6, flag: 'reject' }),
  ];

  it('round-trips through a file and restores by name and size', () => {
    const text = makeBackup(library, [
      ...BUILT_IN_PRESETS,
      { ...BUILT_IN_PRESETS[0]!, id: 'u', builtIn: false },
    ]);
    const backup = parseBackup(text);
    expect(backup.photos).toHaveLength(2);
    expect(backup.presets.map((p) => p.id)).toEqual(['u']); // built-ins aren't saved

    // A fresh library (new ids, re-imported files with a different date) plus an extra photo.
    const fresh = [
      photo({ id: 'x', name: 'A.NEF', size: 10, lastModified: 999 }),
      photo({ id: 'y', name: 'C.NEF', size: 30 }),
    ];
    const plan = planRestore(fresh, backup);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ id: 'x', changes: { rating: 4, keywords: ['owl'] } });
    expect(plan.updates[0]!.changes.recipe).toEqual(cropped);
    expect(plan.missing).toEqual(['B.NEF']);
  });

  it('rejects files that are not backups and repairs bad values', () => {
    expect(() => parseBackup('not json')).toThrow(/not a Chitra library backup/);
    expect(() => parseBackup('{"photos": []}')).toThrow();
    const repaired = parseBackup(
      JSON.stringify({
        app: 'chitra',
        photos: [
          { name: 'A', size: 1, rating: 9, flag: 'maybe', label: 'pink', recipe: { exposure: 50 } },
        ],
      }),
    );
    expect(repaired.photos[0]).toMatchObject({ rating: 5, flag: null, label: null });
    expect(repaired.photos[0]!.recipe.exposure).toBe(5);
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date('2026-10-12T10:00:00Z'))).toBe('chitra-library-2026-10-12.json');
  });
});

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a valid archive', async () => {
    const blob = makeZip([
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'b.txt', data: new TextEncoder().encode('world!') },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2); // two files
    // The first file's data follows its 30-byte header and name.
    expect(new TextDecoder().decode(bytes.subarray(35, 40))).toBe('hello');
  });

  it('makes names unique', () => {
    expect(uniqueNames(['a.jpg', 'a.jpg', 'b.jpg', 'a.jpg'])).toEqual([
      'a.jpg',
      'a-2.jpg',
      'b.jpg',
      'a-3.jpg',
    ]);
  });
});

describe('database upgrade', () => {
  beforeEach(() => db.deleteCatalog());

  it('keeps photos from a version 1 catalog and adds the presets store', async () => {
    // Create a catalog the way the previous version did.
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('chitra', 1);
      request.onupgradeneeded = () => {
        const v1 = request.result;
        v1.createObjectStore('photos', { keyPath: 'id' }).put(photo({ id: 'old' }));
        v1.createObjectStore('originals');
        v1.createObjectStore('thumbnails');
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });

    expect((await db.getAllPhotos()).map((p) => p.id)).toEqual(['old']);
    await db.putPreset({ ...BUILT_IN_PRESETS[0]!, id: 'mine', builtIn: false });
    expect((await db.getAllPresets()).map((p) => p.id)).toEqual(['mine']);
    await db.deletePreset('mine');
    expect(await db.getAllPresets()).toEqual([]);
  });
});
