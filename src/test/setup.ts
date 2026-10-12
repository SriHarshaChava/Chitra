import '@testing-library/jest-dom/vitest';

// requestPersistentStorage and crypto.randomUUID are used during import.
if (typeof crypto !== 'undefined' && !('randomUUID' in crypto)) {
  (crypto as Crypto).randomUUID = () =>
    `${Date.now()}-${Math.random()}` as `${string}-${string}-${string}-${string}-${string}`;
}

// jsdom (the fake browser used by unit tests) has no ResizeObserver; a no-op is enough.
if (typeof window !== 'undefined' && !('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
