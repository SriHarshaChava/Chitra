/**
 * Loads the active photo for viewing: reads the original from the catalog, then
 * decodes it step by step (camera preview first for RAW files).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhotoInfo } from '../decode/photoInfo';
import type { SourceImage } from '../render/sourceImage';
import { loadPhoto } from './loadPhoto';

export type LoadStatus = 'loading' | 'preview' | 'ready' | 'error';

export interface CurrentPhoto {
  id: string;
  status: LoadStatus;
  info?: PhotoInfo;
  /** Decoded pixels; the viewer uploads them to the GPU. */
  image?: SourceImage;
  /** True while showing the camera's embedded preview instead of the developed RAW. */
  isPreview: boolean;
  decodeMs?: number;
  error?: string;
}

export function usePhotoLoader(id: string | null, getFile: (id: string) => Promise<File>) {
  const [current, setCurrent] = useState<CurrentPhoto | null>(null);
  // Incremented to decode the photo again (after a GPU reset).
  const [reloadCount, setReloadCount] = useState(0);
  const shownImage = useRef<SourceImage | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const replaceImage = (image: SourceImage | undefined) => {
      const old = shownImage.current;
      shownImage.current = image ?? null;
      if (old && old !== image) old.release();
    };
    // Merges a change into this photo's state (starting fresh if needed).
    const update = (patch: Partial<CurrentPhoto>) =>
      setCurrent((c) => ({
        ...(c?.id === id ? c : { id, status: 'loading', isPreview: false }),
        ...patch,
      }));

    getFile(id)
      .then((file) =>
        loadPhoto(
          file,
          {
            onInfo: (info) => update({ info }),
            onPreview: (image) => {
              replaceImage(image);
              update({ image, status: 'preview', isPreview: true });
            },
            onFull: (image, decodeMs) => {
              replaceImage(image);
              update({ image, status: 'ready', isPreview: false, decodeMs });
            },
          },
          controller.signal,
        ),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        update({ status: 'error', error: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      controller.abort();
      replaceImage(undefined);
      // The image was just released, so forget this photo's state.
      setCurrent((c) => (c?.id === id ? null : c));
    };
  }, [id, getFile, reloadCount]);

  return {
    // Until the photo reports progress, show it as loading.
    current:
      current && current.id === id
        ? current
        : id
          ? { id, status: 'loading' as const, isPreview: false }
          : null,
    reload: useCallback(() => setReloadCount((n) => n + 1), []),
  };
}
