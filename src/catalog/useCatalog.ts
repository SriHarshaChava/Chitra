/**
 * React state for the catalog: every imported photo, its thumbnail, and actions to
 * import, update and remove photos. Changes are written to IndexedDB straight away.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestPersistentStorage } from '../platform/storage';
import * as db from './db';
import { importFile } from './importPhotos';
import type { CatalogPhoto, PhotoChanges } from './types';

export interface ImportProgress {
  done: number;
  total: number;
  current?: string;
}

export interface ImportReport {
  imported: number;
  duplicates: string[];
  unsupported: string[];
  failed: string[];
}

export function useCatalog() {
  /** null while the catalog is loading. */
  const [photos, setPhotos] = useState<CatalogPhoto[] | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState<ImportProgress | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photosRef = useRef<CatalogPhoto[]>([]);

  const replacePhotos = useCallback((next: CatalogPhoto[]) => {
    photosRef.current = next;
    setPhotos(next);
  }, []);

  const showThumbnail = useCallback((id: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    setThumbnails((t) => {
      if (t[id]) URL.revokeObjectURL(t[id]);
      return { ...t, [id]: url };
    });
  }, []);

  // Load the catalog when the app starts.
  useEffect(() => {
    let cancelled = false;
    db.getAllPhotos()
      .then(async (all) => {
        if (cancelled) return;
        replacePhotos(all);
        for (const photo of all) {
          const blob = await db.getThumbnail(photo.id);
          if (cancelled) return;
          if (blob) showThumbnail(photo.id, blob);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(`The library could not be opened: ${e instanceof Error ? e.message : e}`);
        replacePhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [replacePhotos, showThumbnail]);

  /** Imports files one by one; returns the ids of the newly imported photos. */
  const importFiles = useCallback(
    async (files: File[]): Promise<string[]> => {
      if (files.length === 0) return [];
      // Ask the browser to keep the library safe from automatic clean-up.
      void requestPersistentStorage();
      const result: ImportReport = { imported: 0, duplicates: [], unsupported: [], failed: [] };
      const ids: string[] = [];
      setReport(null);
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        setImporting({ done: i, total: files.length, current: file.name });
        try {
          const outcome = await importFile(file, photosRef.current);
          if (outcome.status === 'imported') {
            replacePhotos([...photosRef.current, outcome.photo]);
            if (outcome.thumbnail) showThumbnail(outcome.photo.id, outcome.thumbnail);
            ids.push(outcome.photo.id);
            result.imported++;
          } else if (outcome.status === 'duplicate') {
            result.duplicates.push(outcome.name);
          } else {
            result.unsupported.push(outcome.name);
          }
        } catch (e) {
          console.error(e);
          result.failed.push(file.name);
        }
      }
      setImporting(null);
      setReport(result);
      return ids;
    },
    [replacePhotos, showThumbnail],
  );

  const update = useCallback(
    (ids: string[], changes: PhotoChanges) => {
      const idSet = new Set(ids);
      const changed: CatalogPhoto[] = [];
      const next = photosRef.current.map((p) => {
        if (!idSet.has(p.id)) return p;
        const updated = { ...p, ...changes };
        changed.push(updated);
        return updated;
      });
      replacePhotos(next);
      for (const photo of changed) {
        db.putPhoto(photo).catch((e: unknown) => {
          console.error(e);
          setError('A change could not be saved. Is the device out of storage space?');
        });
      }
    },
    [replacePhotos],
  );

  const remove = useCallback(
    async (ids: string[]) => {
      await db.deletePhotos(ids);
      const idSet = new Set(ids);
      replacePhotos(photosRef.current.filter((p) => !idSet.has(p.id)));
      setThumbnails((t) => {
        const next = { ...t };
        for (const id of ids) {
          if (next[id]) URL.revokeObjectURL(next[id]);
          delete next[id];
        }
        return next;
      });
    },
    [replacePhotos],
  );

  /** The original file of a photo, read back from the catalog. */
  const getFile = useCallback(async (id: string): Promise<File> => {
    const photo = photosRef.current.find((p) => p.id === id);
    const blob = await db.getOriginal(id);
    if (!photo || !blob) throw new Error('The original file is missing from the library.');
    return new File([blob], photo.name, { lastModified: photo.lastModified });
  }, []);

  const setThumbnail = useCallback(
    (id: string, blob: Blob) => {
      showThumbnail(id, blob);
      db.putThumbnail(id, blob).catch((e: unknown) => console.error(e));
    },
    [showThumbnail],
  );

  return {
    photos,
    thumbnails,
    importing,
    report,
    dismissReport: useCallback(() => setReport(null), []),
    error,
    importFiles,
    update,
    remove,
    getFile,
    setThumbnail,
  };
}
