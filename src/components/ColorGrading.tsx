/**
 * Colour grading: three colour wheels (shadows, midtones, highlights) plus Balance
 * and Blending. Drag the dot away from the centre to tint those tones; the direction
 * picks the colour, the distance the strength. Double-click a wheel to reset it.
 */
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  DEFAULT_RECIPE,
  GRADING_SLIDERS,
  GRADING_WHEELS,
  type Recipe,
  type SliderSpec,
} from '../develop/recipe';
import { Slider } from './Slider';

interface ColorGradingProps {
  recipe: Recipe;
  disabled: boolean;
  onPreview: (recipe: Recipe) => void;
  onCommit: (recipe: Recipe) => void;
}

export function ColorGrading({ recipe, disabled, onPreview, onCommit }: ColorGradingProps) {
  const sliderProps = { recipe, disabled, onPreview, onCommit };
  return (
    <>
      {GRADING_WHEELS.map((wheel) => (
        <div key={wheel.id} className="grading-row">
          <ColorWheel label={wheel.label} hue={wheel.hue} amount={wheel.amount} {...sliderProps} />
          <div className="grading-sliders">
            <div className="grading-label">{wheel.label}</div>
            <Slider spec={wheel.hue} {...sliderProps} />
            <Slider spec={wheel.amount} {...sliderProps} />
          </div>
        </div>
      ))}
      {GRADING_SLIDERS.map((spec) => (
        <Slider key={spec.key} spec={spec} {...sliderProps} />
      ))}
    </>
  );
}

/** Colours around the wheel: OKLCh hue, counter-clockwise from the right. */
const WHEEL_GRADIENT = `conic-gradient(from 90deg, ${Array.from(
  { length: 13 },
  (_, i) => `oklch(0.72 0.14 ${(360 - i * 30) % 360})`,
).join(', ')})`;

interface ColorWheelProps extends ColorGradingProps {
  label: string;
  hue: SliderSpec;
  amount: SliderSpec;
}

function ColorWheel({
  label,
  hue,
  amount,
  recipe,
  disabled,
  onPreview,
  onCommit,
}: ColorWheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const h = recipe[hue.key];
  const r = recipe[amount.key] / 100;
  const angle = (h * Math.PI) / 180;

  const fromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = ref.current!.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    let degrees = Math.round((Math.atan2(-dy, dx) * 180) / Math.PI);
    if (degrees < 0) degrees += 360;
    const strength = Math.round(Math.min(1, Math.hypot(dx, dy) / (box.width / 2)) * 100);
    onPreview({ ...recipe, [hue.key]: degrees % 360, [amount.key]: strength });
  };

  return (
    <div
      ref={ref}
      className={`color-wheel${disabled ? ' color-wheel-disabled' : ''}`}
      style={{
        backgroundImage: `radial-gradient(circle, #808080, transparent 70%), ${WHEEL_GRADIENT}`,
      }}
      role="img"
      aria-label={`${label} colour wheel`}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        fromPointer(event);
      }}
      onPointerMove={(event) => {
        if (dragging.current) fromPointer(event);
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        onCommit(recipe);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        onCommit(recipe);
      }}
      onDoubleClick={() => {
        if (disabled) return;
        onCommit({
          ...recipe,
          [hue.key]: DEFAULT_RECIPE[hue.key],
          [amount.key]: DEFAULT_RECIPE[amount.key],
        });
      }}
    >
      <span
        className="color-wheel-puck"
        style={{
          left: `${50 + 50 * r * Math.cos(angle)}%`,
          top: `${50 - 50 * r * Math.sin(angle)}%`,
        }}
      />
    </div>
  );
}
