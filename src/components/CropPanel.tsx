/**
 * Crop & straighten controls, shown in the right panel while the crop tool is open.
 */
import { useRef } from 'react';
import {
  ASPECT_PRESETS,
  aspectRatio,
  cropForRatio,
  cropPixelSize,
  DEFAULT_GEOMETRY,
  flipGeometry,
  isDefaultGeometry,
  rotateGeometry,
  STRAIGHTEN_LIMIT,
  straightenGeometry,
  toNormalized,
  toPixels,
  type AspectPreset,
  type Geometry,
  type Size,
} from '../develop/geometry';

interface CropPanelProps {
  geometry: Geometry;
  /** Size of the frame (photo after 90° rotation), in pixels. */
  frame: Size;
  onPreview: (geometry: Geometry) => void;
  onCommit: (geometry: Geometry) => void;
  onDone: () => void;
}

export function CropPanel({ geometry, frame, onPreview, onCommit, onDone }: CropPanelProps) {
  // Straightening starts from the crop as it was when the drag began, so going back
  // to 0° restores the original crop instead of keeping a shrunken one.
  const straightenBase = useRef<Geometry | null>(null);
  const current = toPixels(geometry.crop, frame);
  const size = cropPixelSize(frame, geometry.crop);

  const setAspect = (aspect: AspectPreset) => {
    const ratio = aspectRatio(aspect, current, frame);
    const crop =
      ratio === null
        ? geometry.crop
        : toNormalized(cropForRatio(current, frame, geometry.straighten, ratio), frame);
    onCommit({ ...geometry, aspect, crop });
  };

  const swapOrientation = () => {
    const ratio = current.height / current.width;
    const crop = toNormalized(cropForRatio(current, frame, geometry.straighten, ratio), frame);
    onCommit({ ...geometry, crop });
  };

  const straighten = (degrees: number) => {
    const base = straightenBase.current ?? geometry;
    straightenBase.current = base;
    onPreview(straightenGeometry(base, frame, degrees));
  };

  const finishStraighten = () => {
    if (!straightenBase.current) return;
    straightenBase.current = null;
    onCommit(geometry);
  };

  return (
    <section className="panel-section crop-panel" aria-label="Crop and straighten">
      <div className="crop-panel-header">
        <h3 className="section-title">Crop &amp; straighten</h3>
        <button type="button" className="small-button small-button-active" onClick={onDone}>
          Done
        </button>
      </div>

      <label className="field">
        <span className="field-label">Aspect ratio</span>
        <span className="field-row">
          <select
            value={geometry.aspect}
            onChange={(event) => setAspect(event.target.value as AspectPreset)}
          >
            {ASPECT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="small-button"
            onClick={swapOrientation}
            title="Switch between portrait and landscape"
            aria-label="Switch crop between portrait and landscape"
          >
            ⇄
          </button>
        </span>
      </label>

      <div className={`slider${geometry.straighten !== 0 ? ' slider-changed' : ''}`}>
        <label
          htmlFor="slider-straighten"
          className="slider-label"
          onDoubleClick={() => onCommit(straightenGeometry(geometry, frame, 0))}
          title="Double-click to reset"
        >
          Straighten
        </label>
        <output htmlFor="slider-straighten" className="slider-value">
          {geometry.straighten.toFixed(1)}°
        </output>
        <input
          id="slider-straighten"
          type="range"
          min={-STRAIGHTEN_LIMIT}
          max={STRAIGHTEN_LIMIT}
          step={0.1}
          value={geometry.straighten}
          onChange={(event) => straighten(Number(event.target.value))}
          onPointerUp={finishStraighten}
          onKeyUp={finishStraighten}
          onBlur={finishStraighten}
        />
      </div>

      <div className="crop-buttons">
        <button
          type="button"
          className="small-button"
          onClick={() => onCommit(rotateGeometry(geometry, -1))}
          aria-label="Rotate left"
          title="Rotate left"
        >
          ⟲ Left
        </button>
        <button
          type="button"
          className="small-button"
          onClick={() => onCommit(rotateGeometry(geometry, 1))}
          aria-label="Rotate right"
          title="Rotate right"
        >
          ⟳ Right
        </button>
        <button
          type="button"
          className={`small-button${geometry.flipHorizontal ? ' small-button-on' : ''}`}
          onClick={() => onCommit(flipGeometry(geometry))}
          aria-pressed={geometry.flipHorizontal}
          title="Mirror left–right"
        >
          ⇋ Flip
        </button>
        <button
          type="button"
          className="small-button"
          onClick={() => onCommit({ ...DEFAULT_GEOMETRY, aspect: geometry.aspect })}
          disabled={isDefaultGeometry(geometry)}
        >
          Reset
        </button>
      </div>

      <p className="panel-note">
        Result: {size.width} × {size.height} px ({((size.width * size.height) / 1e6).toFixed(1)} MP)
      </p>
    </section>
  );
}
