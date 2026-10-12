import '@testing-library/jest-dom/vitest';

// jsdom (the fake browser used by unit tests) has no ResizeObserver; a no-op is enough.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
