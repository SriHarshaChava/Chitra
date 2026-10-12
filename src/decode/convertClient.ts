/** Main-thread side of the conversion worker: send a request, get a Promise back. */
import type { ConvertRequest, ConvertResponse } from './convertMessages';

type Success = Extract<ConvertResponse, { ok: true }>;

// Distributes `Omit` over each request variant so their fields stay distinct.
type RequestWithoutId = ConvertRequest extends infer R
  ? R extends ConvertRequest
    ? Omit<R, 'id'>
    : never
  : never;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: Success) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<ConvertResponse>) => {
      const response = event.data;
      const entry = pending.get(response.id);
      if (!entry) return;
      pending.delete(response.id);
      if (response.ok) entry.resolve(response);
      else entry.reject(new Error(response.error));
    };
    worker.onerror = (event) => {
      for (const entry of pending.values())
        entry.reject(new Error(event.message || 'Worker failed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export function convertInWorker(request: RequestWithoutId): Promise<Success> {
  const id = nextId++;
  const message = { ...request, id } as ConvertRequest;
  const transfer = message.type === 'tiff' ? [message.bytes] : [message.data.buffer];
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(message, transfer);
  });
}
