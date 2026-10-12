import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import type { Capability } from './platform/capabilities';

const fakeCapabilities: Capability[] = [
  { id: 'webgpu', label: 'WebGPU', status: 'yes', detail: 'apple', why: 'GPU processing' },
  { id: 'persistent-storage', label: 'Persistent storage', status: 'no', why: 'Keep data' },
];

const detect = async () => fakeCapabilities;

afterEach(cleanup);

describe('App', () => {
  it('shows the editor shell', () => {
    render(<App detectCapabilities={detect} />);
    expect(screen.getByText('Chitra')).toBeInTheDocument();
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
