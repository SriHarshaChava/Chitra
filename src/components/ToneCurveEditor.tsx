/**
 * The tone curve editor. Left to right is the original brightness (shadows to
 * highlights), bottom to top the result.
 *
 * - Tap or click the line to add a point, then drag it.
 * - Drag a point to move it; double-click (double-tap) a point to remove it.
 * - Raising a point brightens those tones; an S shape adds contrast.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  CURVE_PRESETS,
  curveFunction,
  isLinearCurve,
  MAX_CURVE_POINTS,
  MIN_POINT_GAP,
  type CurvePoint,
  type ToneCurve,
} from '../develop/toneCurve';

interface ToneCurveEditorProps {
  curve: ToneCurve;
  disabled: boolean;
  onPreview: (curve: ToneCurve) => void;
  onCommit: (curve: ToneCurve) => void;
}

/** Margin around the 0…1 square, so points on the edges are easy to grab. */
const PAD = 0.04;
const SAMPLES = 96;
/** Two taps on the same point within this time count as a double-tap. */
const DOUBLE_TAP_MS = 350;

export function ToneCurveEditor({ curve, disabled, onPreview, onCommit }: ToneCurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const lastTap = useRef({ index: -1, time: 0 });

  const f = curveFunction(curve);
  let path = '';
  for (let i = 0; i <= SAMPLES; i++) {
    const x = i / SAMPLES;
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(4)},${(1 - f(x)).toFixed(4)}`;
  }

  /** Pointer position in curve coordinates (0…1, y upwards). */
  const toCurve = (event: ReactPointerEvent | PointerEvent): CurvePoint => {
    const box = svgRef.current!.getBoundingClientRect();
    const size = 1 + 2 * PAD;
    const x = ((event.clientX - box.left) / box.width) * size - PAD;
    const y = 1 - (((event.clientY - box.top) / box.height) * size - PAD);
    return { x: clamp01(x), y: clamp01(y) };
  };

  const startDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (disabled || event.button !== 0) return;
    const target = event.target as Element;
    let index = Number(target.getAttribute('data-point') ?? NaN);
    if (!Number.isNaN(index)) {
      // Double-click or double-tap (works with touch too) removes the point.
      const now = event.timeStamp;
      const previous = lastTap.current;
      lastTap.current = { index, time: now };
      if (previous.index === index && now - previous.time < DOUBLE_TAP_MS) {
        lastTap.current = { index: -1, time: 0 };
        removePoint(index);
        return;
      }
    } else {
      // Add a new point where the user tapped.
      const p = toCurve(event);
      const tooClose = curve.some((q) => Math.abs(q.x - p.x) < MIN_POINT_GAP);
      if (tooClose || curve.length >= MAX_CURVE_POINTS) return;
      const next = [...curve, p].sort((a, b) => a.x - b.x);
      index = next.indexOf(p);
      onPreview(next);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(index);
  };

  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging === null) return;
    const p = toCurve(event);
    // A point can't pass its neighbours.
    const before = curve[dragging - 1];
    const after = curve[dragging + 1];
    const x = Math.min(
      after ? after.x - MIN_POINT_GAP : 1,
      Math.max(before ? before.x + MIN_POINT_GAP : 0, p.x),
    );
    onPreview(curve.map((q, i) => (i === dragging ? { x, y: p.y } : q)));
  };

  const endDrag = () => {
    if (dragging === null) return;
    setDragging(null);
    onCommit(curve);
  };

  const removePoint = (index: number) => {
    if (disabled || curve.length <= 2) return;
    onCommit(curve.filter((_, i) => i !== index));
  };

  return (
    <div className="tone-curve">
      <svg
        ref={svgRef}
        className={`tone-curve-graph${disabled ? ' tone-curve-disabled' : ''}`}
        viewBox={`${-PAD} ${-PAD} ${1 + 2 * PAD} ${1 + 2 * PAD}`}
        role="img"
        aria-label="Tone curve. Tap to add a point, drag to move, double-tap to remove."
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <rect x={0} y={0} width={1} height={1} className="tone-curve-frame" />
        {[0.25, 0.5, 0.75].map((v) => (
          <g key={v} className="tone-curve-grid">
            <line x1={v} y1={0} x2={v} y2={1} />
            <line x1={0} y1={v} x2={1} y2={v} />
          </g>
        ))}
        <line x1={0} y1={1} x2={1} y2={0} className="tone-curve-diagonal" />
        <path d={path} className="tone-curve-line" />
        {curve.map((p, i) => (
          <g key={i}>
            {/* A larger invisible circle makes the point easy to hit with a finger. */}
            <circle cx={p.x} cy={1 - p.y} r={0.05} className="tone-curve-hit" data-point={i} />
            <circle
              cx={p.x}
              cy={1 - p.y}
              r={0.018}
              className={`tone-curve-point${dragging === i ? ' tone-curve-point-active' : ''}`}
              data-point={i}
            />
          </g>
        ))}
      </svg>
      <div className="crop-buttons" role="group" aria-label="Curve presets">
        {CURVE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="small-button"
            disabled={disabled}
            aria-pressed={sameCurve(curve, preset.points)}
            onClick={() => onCommit(preset.points)}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function sameCurve(a: ToneCurve, b: ToneCurve): boolean {
  if (isLinearCurve(a) && isLinearCurve(b)) return true;
  return a.length === b.length && a.every((p, i) => p.x === b[i]!.x && p.y === b[i]!.y);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
