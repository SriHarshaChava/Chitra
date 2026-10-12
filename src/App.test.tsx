import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogPhoto } from './catalog/types';
import type { Capability } from './platform/capabilities';

// An in-memory catalog instead of IndexedDB (jsdom files can't be stored in the fake DB).
const memory = vi.hoisted(() => ({
  photos: new Map<string, unknown>(),
  originals: new Map<string, Blob>(),
}));
vi.mock('./catalog/db', () => ({
  getAllPhotos: async () => [...memory.photos.values()],
  putPhoto: async (p: { id: string }) => void memory.photos.set(p.id, p),
  addPhoto: async (p: { id: string }, original: Blob) => {
    memory.photos.set(p.id, p);
    memory.originals.set(p.id, original);
  },
  getOriginal: async (id: string) => memory.originals.get(id),
  putThumbnail: async () => {},
  getThumbnail: async () => undefined,
  deletePhotos: async (ids: string[]) => ids.forEach((id) => memory.photos.delete(id)),
  getAllPresets: async () => [],
  putPreset: async () => {},
  deletePreset: async () => {},
}));
// Decoding and EXIF need real browser features; these tests only check the interface.
vi.mock('./photos/loadPhoto', () => ({
  loadPhoto: () => new Promise(() => {}),
  readExif: async () => ({}),
}));

const { App } = await import('./App');

const fakeCapabilities: Capability[] = [
  { id: 'webgpu', label: 'WebGPU', status: 'yes', detail: 'apple', why: 'GPU processing' },
  { id: 'persistent-storage', label: 'Persistent storage', status: 'no', why: 'Keep data' },
];
const detect = async () => fakeCapabilities;

afterEach(() => {
  cleanup();
  memory.photos.clear();
  memory.originals.clear();
});

async function importTiffs(...names: string[]) {
  const input = screen.getByTestId('file-input');
  await act(async () => {
    fireEvent.change(input, {
      target: { files: names.map((n, i) => new File(['x'], n, { lastModified: i })) },
    });
  });
  return screen.findByRole('listbox', { name: 'Photos' });
}

describe('App', () => {
  it('starts in the Library with an empty-library message', async () => {
    render(<App detectCapabilities={detect} />);
    expect(screen.getByText('Chitra')).toBeInTheDocument();
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Develop/ })).toBeDisabled();
  });

  it('imports photos into the grid and reports skipped files', async () => {
    render(<App detectCapabilities={detect} />);
    await screen.findByText('Your library is empty');
    const grid = await importTiffs('scan1.tif', 'notes.txt', 'scan2.tif');
    expect(within(grid).getAllByRole('option')).toHaveLength(2);
    expect(await screen.findByText(/Not supported: notes.txt/)).toBeInTheDocument();
  });

  it('rates, flags and filters with the keyboard', async () => {
    render(<App detectCapabilities={detect} />);
    await screen.findByText('Your library is empty');
    const grid = await importTiffs('a.tif', 'b.tif');
    const [first] = within(grid).getAllByRole('option');
    fireEvent.click(first!);
    fireEvent.keyDown(window, { key: '4' });
    fireEvent.keyDown(window, { key: 'p' });
    expect(within(first!).getByLabelText('4 of 5 stars')).toBeInTheDocument();
    expect(within(first!).getByLabelText('pick')).toBeInTheDocument();
    // Saved to the catalog.
    const saved = [...memory.photos.values()] as CatalogPhoto[];
    expect(saved.find((p) => p.name === 'a.tif')).toMatchObject({ rating: 4, flag: 'pick' });

    fireEvent.change(screen.getByLabelText('Minimum rating'), { target: { value: '3' } });
    expect(within(grid).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('opens a photo in Develop on double-click', async () => {
    render(<App detectCapabilities={detect} />);
    await screen.findByText('Your library is empty');
    const grid = await importTiffs('a.tif');
    fireEvent.doubleClick(within(grid).getAllByRole('option')[0]!);
    expect(await screen.findByRole('main', { name: 'Photo viewer' })).toBeInTheDocument();
    expect(screen.getByText(/Opening a.tif/)).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Develop' })).toBeInTheDocument();
  });

  it('opens and closes the system check', async () => {
    render(<App detectCapabilities={detect} />);
    fireEvent.click(screen.getByRole('button', { name: 'System check' }));
    expect(await screen.findByRole('dialog', { name: 'System check' })).toBeInTheDocument();
    expect(await screen.findByText('WebGPU')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
