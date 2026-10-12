/**
 * React state for the photos opened in this session: the list, the selected photo,
 * and its loading progress. (A permanent catalog arrives in Phase 3.)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { decoderFor, type DecoderKind } from '../decode/fileTypes';
import type { PhotoInfo } from '../decode/photoInfo';
import { displayColorSpace } from '../render/displayColor';
import type { TiledImage } from '../render/tiledImage';
import { loadPhoto } from './loadPhoto';
import { makeThumbnail } from './thumbnail';

export interface PhotoEntry {
  id: string;
  file: File;
  kind: DecoderKind;
  thumbnailUrl?: string | null;
}

export type LoadStatus = 'loading' | 'preview' | 'ready' | 'error';

export interface CurrentPhoto {
  id: string;
  status: LoadStatus;
  info?: PhotoInfo;
  image?: TiledImage;
  /** True while showing the camera's embedded preview instead of the developed RAW. */
  isPreview: boolean;
  decodeMs?: number;
  error?: string;
}

let idCounter = 0;

export function usePhotoSession() {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [current, setCurrent] = useState<CurrentPhoto | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const shownImage = useRef<TiledImage | null>(null);

  const addFiles = useCallback((files: Iterable<File>) => {
    const accepted: PhotoEntry[] = [];
    const skipped: string[] = [];
    for (const file of files) {
      const kind = decoderFor(file.name);
      if (kind) accepted.push({ id: `photo-${++idCounter}`, file, kind });
      else skipped.push(file.name);
    }
    setRejected(skipped);
    if (accepted.length === 0) return;
    setPhotos((existing) => [...existing, ...accepted]);
    setSelectedId((id) => id ?? accepted[0]!.id);
  }, []);

  const selected = photos.find((p) => p.id === selectedId) ?? null;
  // Depend on the id and file only: the entry object changes when its thumbnail arrives.
  const selectedKey = selected?.id;
  const selectedFile = selected?.file;

  // Load the selected photo.
  useEffect(() => {
    if (!selectedKey || !selectedFile) return;
    const selected = { id: selectedKey, file: selectedFile };
    const controller = new AbortController();
    const replaceImage = (image: TiledImage | undefined) => {
      const old = shownImage.current;
      shownImage.current = image ?? null;
      if (old && old !== image) old.close();
    };

    // Merges a change into the selected photo's state (starting fresh if needed).
    const update = (patch: Partial<CurrentPhoto>) =>
      setCurrent((c) => ({
        ...(c?.id === selected.id ? c : { id: selected.id, status: 'loading', isPreview: false }),
        ...patch,
      }));

    loadPhoto(
      selected.file,
      displayColorSpace(),
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
    ).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      console.error(error);
      update({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    });

    return () => {
      controller.abort();
      replaceImage(undefined);
      // The image was just closed, so forget this photo's state.
      setCurrent((c) => (c?.id === selected.id ? null : c));
    };
  }, [selectedKey, selectedFile]);

  // Create thumbnails one at a time in the background.
  const thumbnailBusy = useRef(false);
  useEffect(() => {
    if (thumbnailBusy.current) return;
    const next = photos.find((p) => p.thumbnailUrl === undefined);
    if (!next) return;
    thumbnailBusy.current = true;
    makeThumbnail(next.file)
      .catch(() => null)
      .then((url) => {
        thumbnailBusy.current = false;
        setPhotos((list) => list.map((p) => (p.id === next.id ? { ...p, thumbnailUrl: url } : p)));
      });
  }, [photos]);

  const selectRelative = useCallback(
    (offset: number) => {
      if (photos.length === 0) return;
      const index = photos.findIndex((p) => p.id === selectedId);
      const nextIndex = Math.min(photos.length - 1, Math.max(0, index + offset));
      setSelectedId(photos[nextIndex]!.id);
    },
    [photos, selectedId],
  );

  return {
    photos,
    selected,
    // Until the selected photo reports progress, show it as loading.
    current:
      current && current.id === selectedId
        ? current
        : selected
          ? { id: selected.id, status: 'loading' as const, isPreview: false }
          : null,
    rejected,
    addFiles,
    select: setSelectedId,
    selectRelative,
  };
}
