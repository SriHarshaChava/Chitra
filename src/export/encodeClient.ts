import type { EncodeRequest, EncodeResponse } from './exportMessages';

let nextId = 1;

/** Encodes pixels in a short-lived worker (freed as soon as the file is ready). */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

export function encodeInWorker(request: WithoutId<EncodeRequest>): Promise<Uint8Array> {
  const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;
  return new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<EncodeResponse>) => {
      if (event.data.ok) resolve(event.data.bytes);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => reject(new Error(event.message || 'Export failed'));
    worker.postMessage({ ...request, id }, [request.pixels.buffer]);
  }).finally(() => worker.terminate());
}
