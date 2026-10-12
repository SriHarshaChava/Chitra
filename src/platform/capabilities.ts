/**
 * Browser capability detection.
 *
 * Chitra runs in the browser on very different devices (a Windows PC in Chrome/Edge,
 * an iPad in Safari). Features such as WebGPU or folder access are not available
 * everywhere, so the app checks what the current browser supports and adapts.
 *
 * Every check reads from an injected `CapabilityEnv` instead of touching `window`
 * directly. That keeps the checks easy to unit-test with fake browsers.
 */

export type SupportStatus = 'yes' | 'no' | 'unknown';

export interface Capability {
  id: string;
  label: string;
  status: SupportStatus;
  /** Extra information, such as the GPU name or storage quota. */
  detail?: string;
  /** Why Chitra cares about this capability, in plain language. */
  why: string;
}

/** Minimal shape of the WebGPU API that we use (TypeScript's DOM types do not include it yet). */
interface GpuAdapterLike {
  info?: { vendor?: string; architecture?: string; description?: string };
}
interface GpuLike {
  requestAdapter(): Promise<GpuAdapterLike | null>;
}

interface StorageLike {
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ quota?: number; usage?: number }>;
  getDirectory?: () => Promise<unknown>;
}

/** The parts of the browser environment that capability checks read. */
export interface CapabilityEnv {
  navigator: {
    gpu?: GpuLike;
    storage?: StorageLike;
  };
  window: object;
  /** Returns true if a WebGL2 context can be created. */
  hasWebGL2: () => boolean;
  /** Evaluates a CSS media query, e.g. `(color-gamut: p3)`. */
  matchMedia: (query: string) => boolean;
}

export function browserEnv(): CapabilityEnv {
  return {
    navigator: navigator as unknown as CapabilityEnv['navigator'],
    window,
    hasWebGL2: () => {
      try {
        return document.createElement('canvas').getContext('webgl2') !== null;
      } catch {
        return false;
      }
    },
    matchMedia: (query) => window.matchMedia?.(query).matches ?? false,
  };
}

const yesNo = (value: boolean): SupportStatus => (value ? 'yes' : 'no');

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function checkWebGPU(env: CapabilityEnv): Promise<Capability> {
  const base = {
    id: 'webgpu',
    label: 'WebGPU',
    why: 'Fast, high-precision GPU image processing. Without it Chitra falls back to WebGL2.',
  };
  if (!env.navigator.gpu) return { ...base, status: 'no' };
  try {
    const adapter = await env.navigator.gpu.requestAdapter();
    if (!adapter) return { ...base, status: 'no', detail: 'API present but no GPU adapter' };
    const info = adapter.info;
    // Some browsers repeat the same word in each field (e.g. "apple"), so drop duplicates.
    const parts = [info?.vendor, info?.architecture, info?.description].filter(
      (part): part is string => Boolean(part),
    );
    const detail = [...new Set(parts)].join(' · ');
    return { ...base, status: 'yes', detail: detail || undefined };
  } catch (error) {
    return { ...base, status: 'no', detail: String(error) };
  }
}

async function checkPersistentStorage(env: CapabilityEnv): Promise<Capability> {
  const base = {
    id: 'persistent-storage',
    label: 'Persistent storage',
    why: 'Stops the browser from clearing your catalog and edits when space is low or the site is unused.',
  };
  const persisted = env.navigator.storage?.persisted;
  if (!persisted) return { ...base, status: 'unknown' };
  try {
    const granted = await persisted.call(env.navigator.storage);
    return {
      ...base,
      status: yesNo(granted),
      detail: granted ? 'Granted' : 'Not granted yet',
    };
  } catch {
    return { ...base, status: 'unknown' };
  }
}

async function checkStorageQuota(env: CapabilityEnv): Promise<Capability> {
  const base = {
    id: 'storage-quota',
    label: 'Storage space',
    why: 'Imported photos, previews and the catalog are stored locally in the browser.',
  };
  const estimate = env.navigator.storage?.estimate;
  if (!estimate) return { ...base, status: 'unknown' };
  try {
    const { quota, usage } = await estimate.call(env.navigator.storage);
    if (quota === undefined) return { ...base, status: 'unknown' };
    return {
      ...base,
      status: 'yes',
      detail: `${formatBytes(usage ?? 0)} used of ${formatBytes(quota)} available`,
    };
  } catch {
    return { ...base, status: 'unknown' };
  }
}

export async function detectCapabilities(env: CapabilityEnv = browserEnv()): Promise<Capability[]> {
  const [webgpu, persistent, quota] = await Promise.all([
    checkWebGPU(env),
    checkPersistentStorage(env),
    checkStorageQuota(env),
  ]);

  return [
    webgpu,
    {
      id: 'webgl2',
      label: 'WebGL2',
      status: yesNo(env.hasWebGL2()),
      why: 'GPU fallback for image processing on browsers without WebGPU.',
    },
    {
      id: 'wasm',
      label: 'WebAssembly',
      status: yesNo(typeof WebAssembly === 'object'),
      why: 'Runs the LibRaw RAW decoder (for Nikon NEF files) at near-native speed.',
    },
    {
      id: 'webcodecs',
      label: 'WebCodecs (video)',
      status: yesNo('VideoDecoder' in env.window && 'VideoEncoder' in env.window),
      why: 'Hardware-accelerated video decoding and encoding for the video editor.',
    },
    {
      id: 'folder-access',
      label: 'Open folders directly',
      status: yesNo('showDirectoryPicker' in env.window),
      why: 'Lets Chitra read a photo folder in place and save edit files next to your RAWs (Chrome/Edge on Windows). Safari imports copies instead.',
    },
    {
      id: 'opfs',
      label: 'Private file storage (OPFS)',
      status: yesNo(typeof env.navigator.storage?.getDirectory === 'function'),
      why: 'Fast private storage for imported photos, previews and the catalog database.',
    },
    persistent,
    quota,
    {
      id: 'display-p3',
      label: 'Wide-colour display (P3)',
      status: yesNo(env.matchMedia('(color-gamut: p3)')),
      why: 'Shows more saturated colours accurately, as on iPad and many modern screens.',
    },
  ];
}

/** Plain-text report the user can paste into a bug report or chat. */
export function formatReport(capabilities: Capability[], userAgent: string): string {
  const lines = capabilities.map(
    (c) => `${c.status.padEnd(7)} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`,
  );
  return [`Chitra system check`, `Browser: ${userAgent}`, '', ...lines].join('\n');
}
