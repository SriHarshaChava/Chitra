import { describe, expect, it } from 'vitest';
import {
  detectCapabilities,
  formatBytes,
  formatReport,
  type Capability,
  type CapabilityEnv,
} from './capabilities';

/** A fake browser with nothing supported; tests switch on what they need. */
function fakeEnv(overrides: Partial<CapabilityEnv> = {}): CapabilityEnv {
  return {
    navigator: {},
    window: {},
    hasWebGL2: () => false,
    matchMedia: () => false,
    ...overrides,
  };
}

function byId(capabilities: Capability[], id: string): Capability {
  const found = capabilities.find((c) => c.id === id);
  if (!found) throw new Error(`capability ${id} missing`);
  return found;
}

describe('detectCapabilities', () => {
  it('reports missing features on a bare browser', async () => {
    const caps = await detectCapabilities(fakeEnv());
    expect(byId(caps, 'webgpu').status).toBe('no');
    expect(byId(caps, 'webgl2').status).toBe('no');
    expect(byId(caps, 'folder-access').status).toBe('no');
    expect(byId(caps, 'opfs').status).toBe('no');
    expect(byId(caps, 'webcodecs').status).toBe('no');
    expect(byId(caps, 'persistent-storage').status).toBe('unknown');
    expect(byId(caps, 'storage-quota').status).toBe('unknown');
  });

  it('detects a desktop Chrome-like browser', async () => {
    const env = fakeEnv({
      navigator: {
        gpu: {
          requestAdapter: async () => ({ info: { vendor: 'nvidia', architecture: 'ampere' } }),
        },
        storage: {
          persisted: async () => true,
          estimate: async () => ({ quota: 10 * 1024 ** 3, usage: 5 * 1024 ** 2 }),
          getDirectory: async () => ({}),
        },
      },
      window: { showDirectoryPicker: () => {}, VideoDecoder: {}, VideoEncoder: {} },
      hasWebGL2: () => true,
      matchMedia: (q) => q === '(color-gamut: p3)',
    });

    const caps = await detectCapabilities(env);
    expect(byId(caps, 'webgpu')).toMatchObject({ status: 'yes', detail: 'nvidia · ampere' });
    expect(byId(caps, 'webgl2').status).toBe('yes');
    expect(byId(caps, 'folder-access').status).toBe('yes');
    expect(byId(caps, 'opfs').status).toBe('yes');
    expect(byId(caps, 'webcodecs').status).toBe('yes');
    expect(byId(caps, 'display-p3').status).toBe('yes');
    expect(byId(caps, 'persistent-storage').status).toBe('yes');
    expect(byId(caps, 'storage-quota').detail).toBe('5.0 MB used of 10.0 GB available');
  });

  it('does not repeat identical GPU details', async () => {
    const env = fakeEnv({
      navigator: {
        gpu: {
          requestAdapter: async () => ({
            info: { vendor: 'apple', architecture: 'apple', description: 'apple' },
          }),
        },
      },
    });
    expect(byId(await detectCapabilities(env), 'webgpu').detail).toBe('apple');
  });

  it('treats a WebGPU API without an adapter as unsupported', async () => {
    const env = fakeEnv({ navigator: { gpu: { requestAdapter: async () => null } } });
    const webgpu = byId(await detectCapabilities(env), 'webgpu');
    expect(webgpu.status).toBe('no');
    expect(webgpu.detail).toMatch(/no GPU adapter/);
  });

  it('does not throw when a browser API rejects', async () => {
    const env = fakeEnv({
      navigator: {
        gpu: {
          requestAdapter: async () => {
            throw new Error('blocked');
          },
        },
        storage: {
          persisted: async () => {
            throw new Error('denied');
          },
        },
      },
    });
    const caps = await detectCapabilities(env);
    expect(byId(caps, 'webgpu').status).toBe('no');
    expect(byId(caps, 'persistent-storage').status).toBe('unknown');
  });

  it('reports persistent storage as not granted', async () => {
    const env = fakeEnv({ navigator: { storage: { persisted: async () => false } } });
    expect(byId(await detectCapabilities(env), 'persistent-storage').status).toBe('no');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('formats %d as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatReport', () => {
  it('lists every capability with its status', () => {
    const report = formatReport(
      [
        { id: 'a', label: 'WebGPU', status: 'yes', detail: 'apple', why: '' },
        { id: 'b', label: 'WebGL2', status: 'no', why: '' },
      ],
      'TestBrowser/1.0',
    );
    expect(report).toContain('Browser: TestBrowser/1.0');
    expect(report).toContain('yes     WebGPU — apple');
    expect(report).toContain('no      WebGL2');
  });
});
