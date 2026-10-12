// @vitest-environment node
// (Node's File/Blob can be stored by the in-memory IndexedDB used here.)
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RECIPE } from '../develop/recipe';
import * as db from './db';
import { applyFilter, DEFAULT_FILTER, parseKeywords } from './filters';
import type { CatalogPhoto } from './types';

// EXIF reading isn't needed for these tests.
vi.mock('../photos/loadPhoto', () => ({ readExif: async () => ({ camera: 'Nikon D5600' }) }));
const { importFile, isDuplicate } = await import('./importPhotos');

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

// A fresh, empty database for every test.
beforeEach(() => db.deleteCatalog());

describe('catalog database', () => {
  it('stores photos, originals and thumbnails, and removes them together', async () => {
    const original = new Blob(['raw bytes']);
    await db.addPhoto(photo({ id: 'a' }), original);
    await db.putThumbnail('a', new Blob(['jpeg']));

    expect((await db.getAllPhotos()).map((p) => p.id)).toEqual(['a']);
    expect(await (await db.getOriginal('a'))!.text()).toBe('raw bytes');
    expect(await (await db.getThumbnail('a'))!.text()).toBe('jpeg');

    await db.putPhoto(photo({ id: 'a', rating: 4 }));
    expect((await db.getAllPhotos())[0]!.rating).toBe(4);

    await db.deletePhotos(['a']);
    expect(await db.getAllPhotos()).toEqual([]);
    expect(await db.getOriginal('a')).toBeUndefined();
    expect(await db.getThumbnail('a')).toBeUndefined();
  });
});

describe('importFile', () => {
  it('imports a TIFF with its info and a copy of the original', async () => {
    const file = new File(['tiff bytes'], 'scan.tif', { lastModified: 42 });
    const outcome = await importFile(file, []);
    expect(outcome.status).toBe('imported');
    if (outcome.status !== 'imported') return;
    expect(outcome.photo).toMatchObject({
      name: 'scan.tif',
      kind: 'tiff',
      lastModified: 42,
      rating: 0,
      info: { camera: 'Nikon D5600' },
    });
    expect(await (await db.getOriginal(outcome.photo.id))!.text()).toBe('tiff bytes');
  });

  it('skips duplicates and unsupported files', async () => {
    const file = new File(['x'], 'a.tif', { lastModified: 1 });
    const existing = [photo({ name: 'a.tif', size: 1, lastModified: 1 })];
    expect(isDuplicate(file, existing)).toBe(true);
    expect((await importFile(file, existing)).status).toBe('duplicate');
    expect((await importFile(new File(['x'], 'notes.txt'), [])).status).toBe('unsupported');
  });
});

describe('filters', () => {
  const photos = [
    photo({ id: '1', name: 'DSC_2.NEF', rating: 5, flag: 'pick', keywords: ['kingfisher'] }),
    photo({ id: '2', name: 'DSC_10.NEF', rating: 2, label: 'red', lastModified: 5 }),
    photo({
      id: '3',
      name: 'DSC_1.NEF',
      rating: 0,
      flag: 'reject',
      info: { camera: 'Nikon D5600' },
    }),
  ];
  const ids = (list: CatalogPhoto[]) => list.map((p) => p.id);

  it('filters by rating, flag, label and text', () => {
    expect(ids(applyFilter(photos, { ...DEFAULT_FILTER, minRating: 2 }))).toEqual(['1', '2']);
    expect(ids(applyFilter(photos, { ...DEFAULT_FILTER, flag: 'pick' }))).toEqual(['1']);
    expect(ids(applyFilter(photos, { ...DEFAULT_FILTER, flag: 'unflagged' }))).toEqual(['2']);
    expect(ids(applyFilter(photos, { ...DEFAULT_FILTER, label: 'red' }))).toEqual(['2']);
    expect(ids(applyFilter(photos, { ...DEFAULT_FILTER, text: 'KINGFISHER' }))).toEqual(['1']);
    expect(ids(applyFilter(photos, { ...DEFAULT_FILTER, text: 'd5600' }))).toEqual(['3']);
  });

  it('sorts names naturally (2 before 10) and by rating', () => {
    expect(ids(applyFilter(photos, { ...DEFAULT_FILTER, sort: 'name' }))).toEqual(['3', '1', '2']);
    expect(ids(applyFilter(photos, { ...DEFAULT_FILTER, sort: 'rating' }))).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('parses keywords', () => {
    expect(parseKeywords('Bird, kingfisher  ,, river, bird')).toEqual([
      'bird',
      'kingfisher',
      'river',
    ]);
  });
});
