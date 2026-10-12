/**
 * Exports several photos one after another with the same export settings. Each photo
 * is decoded and developed in the background (one at a time) and written to a file;
 * several files are packed into one ZIP download.
 */
import type { CatalogPhoto } from '../catalog/types';
import { exportFileName, type ExportSettings } from './exportSettings';
import { withDevelopedPhoto } from './offscreen';
import { runExport } from './runExport';
import { makeZip, uniqueNames } from './zip';

export interface BatchResult {
  file: File;
  /** The individual files (for "Share…" on iPad, which can save them to Photos). */
  files: File[];
  failed: string[];
}

export async function exportPhotos(
  photos: CatalogPhoto[],
  getFile: (id: string) => Promise<File>,
  settings: ExportSettings,
  onProgress: (fraction: number, current: string) => void,
): Promise<BatchResult> {
  const files: File[] = [];
  const failed: string[] = [];
  const names = uniqueNames(photos.map((p) => exportFileName(p.name, settings.format)));

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!;
    const step = (f: number) => onProgress((i + f) / photos.length, photo.name);
    step(0);
    try {
      const original = await getFile(photo.id);
      const result = await withDevelopedPhoto(original, photo.recipe, (developed) =>
        runExport({
          ...developed,
          geometry: photo.recipe.geometry,
          settings,
          onProgress: (f) => step(0.1 + f * 0.9),
        }),
      );
      files.push(
        new File([result.bytes as Uint8Array<ArrayBuffer>], names[i]!, { type: result.mimeType }),
      );
    } catch (error) {
      console.error(error);
      failed.push(photo.name);
    }
  }
  onProgress(1, '');

  if (files.length === 0) throw new Error('None of the photos could be exported.');
  if (files.length === 1) return { file: files[0]!, files, failed };

  const entries = await Promise.all(
    files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })),
  );
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const zip = new File([makeZip(entries)], `chitra-export-${stamp}.zip`, {
    type: 'application/zip',
  });
  return { file: zip, files, failed };
}
