/** Writes exported pixels into a JPEG or TIFF file, off the main thread. */
import './bufferShim';
import { encodeJpeg, encodeTiff16 } from './encoders';
import type { EncodeRequest, EncodeResponse } from './exportMessages';
import { iccProfile } from './iccProfiles';

async function handle(r: EncodeRequest): Promise<Uint8Array> {
  const icc = iccProfile(r.colorSpace);
  if (r.format === 'jpeg') return encodeJpeg(r.pixels, r.width, r.height, r.quality, icc);
  return encodeTiff16(r.pixels, r.width, r.height, icc);
}

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  let response: EncodeResponse;
  try {
    response = { id: event.data.id, ok: true, bytes: await handle(event.data) };
  } catch (error) {
    response = { id: event.data.id, ok: false, error: String(error) };
  }
  (self as unknown as Worker).postMessage(response, response.ok ? [response.bytes.buffer] : []);
};
