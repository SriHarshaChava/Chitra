import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

// Decoding needs real browser workers; these UI tests only check the interface.
vi.mock('./photos/loadPhoto', () => ({ loadPhoto: () => new Promise(() => {}) }));
vi.mock('./photos/thumbnail', () => ({ makeThumbnail: async () => null }));
import type { Capability } from './platform/capabilities';

const fakeCapabilities: Capability[] = [
  { id: 'webgpu', label: 'WebGPU', status: 'yes', detail: 'apple', why: 'GPU processing' },
  { id: 'persistent-storage', label: 'Persistent storage', status: 'no', why: 'Keep data' },
];

const detect = async () => fakeCapabilities;

afterEach(cleanup);

describe('App', () => {
  it('lists opened photos and skips unsupported files', async () => {
    render(<App detectCapabilities={detect} />);
    const input = screen.getByTestId('file-input');
    const files = [new File(['x'], 'DSC_0001.NEF'), new File(['x'], 'notes.txt')];
    fireEvent.change(input, { target: { files } });
    const list = await screen.findByRole('list', { name: 'Opened photos' });
    expect(list).toHaveTextContent('DSC_0001.NEF');
    expect(list).not.toHaveTextContent('notes.txt');
    expect(screen.getByText(/Opening DSC_0001.NEF/)).toBeInTheDocument();
    expect(screen.getByText(/Skipped unsupported file: notes.txt/)).toBeInTheDocument();
  });

  it('shows the editor shell', () => {
    render(<App detectCapabilities={detect} />);
    expect(screen.getByText('Chitra')).toBeInTheDocument();
    expect(screen.getByText('No photo open')).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Photo viewer' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Develop' })).toBeInTheDocument();
  });

  it('toggles the side panels', () => {
    render(<App detectCapabilities={detect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide library panel' }));
    expect(screen.queryByRole('complementary', { name: 'Library' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide develop panel' }));
    expect(screen.queryByRole('complementary', { name: 'Develop' })).not.toBeInTheDocument();
  });

  it('opens and closes the system check', async () => {
    render(<App detectCapabilities={detect} />);
    fireEvent.click(screen.getByRole('button', { name: 'System check' }));

    const dialog = await screen.findByRole('dialog', { name: 'System check' });
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByText('WebGPU')).toBeInTheDocument();
    expect(screen.getByText('apple')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request persistent storage' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
