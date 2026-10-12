/**
 * Export dialog: choose format, picture size and colour space, then save the file(s).
 * Works for one photo or many (batch). Originals are never changed.
 */
import { useEffect, useState } from 'react';
import { formatFileSize } from '../decode/photoInfo';
import type { Size } from '../develop/geometry';
import {
  COLOR_SPACES,
  estimateBytes,
  loadExportSettings,
  outputSize,
  saveExportSettings,
  SIZE_MODES,
  type ExportSettings,
  type SizeMode,
} from '../export/exportSettings';

/** What an export produced. */
export interface ExportOutput {
  /** The file to download: the photo, or a ZIP of several photos. */
  file: File;
  /** The individual photos (iPad "Share…" can save these straight to Photos). */
  files: File[];
  /** Photos that could not be exported. */
  failed: string[];
  width?: number;
  height?: number;
}

interface ExportDialogProps {
  /** How many photos are being exported. */
  count: number;
  /** Size of the cropped photo at full resolution, when exporting one photo. */
  fullSize?: Size;
  onExport: (
    settings: ExportSettings,
    onProgress: (fraction: number, current?: string) => void,
  ) => Promise<ExportOutput>;
  onClose: () => void;
}

type Status =
  | { state: 'idle' }
  | { state: 'working'; progress: number; current?: string }
  | { state: 'done'; output: ExportOutput; url: string }
  | { state: 'error'; message: string };

export function ExportDialog({ count, fullSize, onExport, onClose }: ExportDialogProps) {
  const [settings, setSettings] = useState<ExportSettings>(loadExportSettings);
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const size = fullSize ? outputSize(fullSize, settings) : null;
  const mode = SIZE_MODES.find((m) => m.id === settings.sizeMode)!;
  const update = (change: Partial<ExportSettings>) => setSettings((s) => ({ ...s, ...change }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Free the file's memory when the dialog closes.
  useEffect(() => {
    return () => {
      if (status.state === 'done') URL.revokeObjectURL(status.url);
    };
  }, [status]);

  async function start() {
    saveExportSettings(settings);
    setStatus({ state: 'working', progress: 0 });
    try {
      const output = await onExport(settings, (progress, current) =>
        setStatus({ state: 'working', progress, current }),
      );
      const url = URL.createObjectURL(output.file);
      setStatus({ state: 'done', output, url });
      download(url, output.file.name);
    } catch (error) {
      setStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const canShare =
    status.state === 'done' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: status.output.files });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="export-title">{count === 1 ? 'Export' : `Export ${count} photos`}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <fieldset className="export-group" disabled={status.state === 'working'}>
          <legend>File type</legend>
          <div className="segmented" role="radiogroup" aria-label="File type">
            {(
              [
                ['jpeg', 'JPEG', 'Small files for sharing and the web (8-bit)'],
                ['tiff16', 'TIFF 16-bit', 'Maximum quality for printing or further editing'],
              ] as const
            ).map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={settings.format === id}
                className={`segment${settings.format === id ? ' segment-on' : ''}`}
                onClick={() => update({ format: id })}
                title={hint}
              >
                {label}
              </button>
            ))}
          </div>
          {settings.format === 'jpeg' && (
            <label className="slider">
              <span className="slider-label">Quality</span>
              <output className="slider-value">{settings.quality}</output>
              <input
                type="range"
                min={1}
                max={100}
                value={settings.quality}
                aria-label="JPEG quality"
                onChange={(event) => update({ quality: Number(event.target.value) })}
              />
            </label>
          )}
        </fieldset>

        <fieldset className="export-group" disabled={status.state === 'working'}>
          <legend>Picture size</legend>
          <div className="field-row">
            <select
              aria-label="Size mode"
              value={settings.sizeMode}
              onChange={(event) => {
                const sizeMode = event.target.value as SizeMode;
                const defaults: Record<SizeMode, number> = {
                  full: 0,
                  'long-edge': 2048,
                  megapixels: 4,
                  percent: 50,
                };
                update({ sizeMode, sizeValue: defaults[sizeMode] });
              }}
            >
              {SIZE_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {settings.sizeMode !== 'full' && (
              <label className="number-field">
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={mode.label}
                  min={mode.min}
                  max={mode.max}
                  step={settings.sizeMode === 'megapixels' ? 0.1 : 1}
                  value={settings.sizeValue}
                  onChange={(event) => update({ sizeValue: Number(event.target.value) })}
                />
                <span>{mode.unit}</span>
              </label>
            )}
          </div>
          <p className="panel-note" data-testid="export-size">
            {size && fullSize ? (
              <>
                {size.width} × {size.height} px · {((size.width * size.height) / 1e6).toFixed(1)} MP
                · about {formatFileSize(estimateBytes(size, settings))}
                {size.width === fullSize.width && settings.sizeMode !== 'full'
                  ? ' (photos are never enlarged)'
                  : ''}
              </>
            ) : (
              <>
                Each photo is sized separately; photos are never enlarged.
                {count > 1 ? ' Several photos are saved together as one ZIP file.' : ''}
              </>
            )}
          </p>
        </fieldset>

        <fieldset className="export-group" disabled={status.state === 'working'}>
          <legend>Colour space</legend>
          <select
            aria-label="Colour space"
            value={settings.colorSpace}
            onChange={(event) =>
              update({ colorSpace: event.target.value as ExportSettings['colorSpace'] })
            }
          >
            {COLOR_SPACES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="panel-note">
            {COLOR_SPACES.find((c) => c.id === settings.colorSpace)?.hint}
          </p>
        </fieldset>

        {status.state === 'working' && (
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={Math.round(status.progress * 100)}
          >
            <div className="progress-bar" style={{ width: `${status.progress * 100}%` }} />
          </div>
        )}
        {status.state === 'working' && status.current && (
          <p className="panel-note">Exporting {status.current}…</p>
        )}
        {status.state === 'error' && (
          <p className="panel-warning" role="alert">
            Export failed: {status.message}
          </p>
        )}
        {status.state === 'done' && (
          <p className="export-done" role="status">
            Saved <strong>{status.output.file.name}</strong> (
            {status.output.width && status.output.height
              ? `${status.output.width} × ${status.output.height}, `
              : status.output.files.length > 1
                ? `${status.output.files.length} photos, `
                : ''}
            {formatFileSize(status.output.file.size)}). If the download didn't start, use the
            buttons below.
            {status.output.failed.length > 0 && (
              <span className="panel-warning">
                {' '}
                Could not export: {status.output.failed.join(', ')}.
              </span>
            )}
          </p>
        )}

        <footer className="modal-footer">
          {status.state === 'done' ? (
            <>
              {canShare && (
                <button
                  type="button"
                  className="button"
                  onClick={() => navigator.share({ files: status.output.files }).catch(() => {})}
                  title="On iPad: Save Image, AirDrop, Mail…"
                >
                  Share…
                </button>
              )}
              <button
                type="button"
                className="button"
                onClick={() => download(status.url, status.output.file.name)}
              >
                Save file
              </button>
              <button type="button" className="button button-primary" onClick={onClose}>
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={start}
                disabled={status.state === 'working'}
              >
                {status.state === 'working' ? 'Exporting…' : 'Export'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
