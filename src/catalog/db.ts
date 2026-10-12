/**
 * The catalog database, stored in the browser with IndexedDB.
 *
 * Three stores (like three tables):
 *   photos     – one CatalogPhoto record per photo (metadata, ratings, edit recipe)
 *   originals  – the original file, copied at import (key: photo id)
 *   thumbnails – a small JPEG showing the photo with its edits (key: photo id)
 *
 * Originals are copied because Safari on iPad cannot re-open a file later; a copy is
 * the only way the photo is still there tomorrow. See docs/decisions/0004-catalog.md.
 */
import type { CatalogPhoto } from './types';

const DB_NAME = 'chitra';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openCatalog(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('photos', { keyPath: 'id' });
        db.createObjectStore('originals');
        db.createObjectStore('thumbnails');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('The catalog is open in another tab.'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** For tests: close the connection and delete the whole catalog. */
export async function deleteCatalog(factory: IDBFactory = indexedDB): Promise<void> {
  const open = dbPromise;
  dbPromise = null;
  if (open) (await open.catch(() => null))?.close();
  await new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

type StoreName = 'photos' | 'originals' | 'thumbnails';

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Catalog write was cancelled'));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name: StoreName, mode: IDBTransactionMode) {
  const db = await openCatalog();
  const tx = db.transaction(name, mode);
  return { tx, store: tx.objectStore(name) };
}

export async function getAllPhotos(): Promise<CatalogPhoto[]> {
  const { store: s } = await store('photos', 'readonly');
  return result(s.getAll() as IDBRequest<CatalogPhoto[]>);
}

export async function putPhoto(photo: CatalogPhoto): Promise<void> {
  const { tx, store: s } = await store('photos', 'readwrite');
  s.put(photo);
  return done(tx);
}

/** Adds a new photo together with its original file, in one transaction. */
export async function addPhoto(photo: CatalogPhoto, original: Blob): Promise<void> {
  const db = await openCatalog();
  const tx = db.transaction(['photos', 'originals'], 'readwrite');
  tx.objectStore('photos').put(photo);
  tx.objectStore('originals').put(original, photo.id);
  return done(tx);
}

export async function getOriginal(id: string): Promise<Blob | undefined> {
  const { store: s } = await store('originals', 'readonly');
  return result(s.get(id) as IDBRequest<Blob | undefined>);
}

export async function putThumbnail(id: string, thumbnail: Blob): Promise<void> {
  const { tx, store: s } = await store('thumbnails', 'readwrite');
  s.put(thumbnail, id);
  return done(tx);
}

export async function getThumbnail(id: string): Promise<Blob | undefined> {
  const { store: s } = await store('thumbnails', 'readonly');
  return result(s.get(id) as IDBRequest<Blob | undefined>);
}

/** Removes photos, their originals and thumbnails from the catalog. */
export async function deletePhotos(ids: string[]): Promise<void> {
  const db = await openCatalog();
  const tx = db.transaction(['photos', 'originals', 'thumbnails'], 'readwrite');
  for (const id of ids) {
    tx.objectStore('photos').delete(id);
    tx.objectStore('originals').delete(id);
    tx.objectStore('thumbnails').delete(id);
  }
  return done(tx);
}
