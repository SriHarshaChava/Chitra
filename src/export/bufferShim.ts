/**
 * jpeg-js returns `Buffer.from(bytes)` when it thinks it runs in Node.js (it checks
 * for `module`, which the bundler defines). Browsers have no `Buffer`, so provide the
 * one method it uses. Must be imported before jpeg-js.
 */
const g = globalThis as unknown as { Buffer?: { from(data: ArrayLike<number>): Uint8Array } };
if (!g.Buffer) g.Buffer = { from: (data) => Uint8Array.from(data) };
export {};
