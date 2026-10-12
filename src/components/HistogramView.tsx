import { useEffect, useRef } from 'react';
import { clippedShares, type Histogram } from '../render/histogram';

const WIDTH = 256;
const HEIGHT = 96;

interface HistogramViewProps {
  histogram?: Histogram;
}

/** RGB histogram in the Lightroom style: overlapping channels, brighter where they overlap. */
export function HistogramView({ histogram }: HistogramViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    if (!histogram || histogram.total === 0) return;

    // Scale to a high percentile rather than the maximum, so one spike (e.g. a black
    // border) doesn't flatten the rest of the graph.
    const peak = Math.max(1, percentile([histogram.red, histogram.green, histogram.blue], 0.995));
    ctx.globalCompositeOperation = 'lighter';
    const channels: [Uint32Array, string][] = [
      [histogram.red, 'rgba(220, 60, 60, 0.75)'],
      [histogram.green, 'rgba(60, 200, 80, 0.75)'],
      [histogram.blue, 'rgba(70, 110, 240, 0.75)'],
    ];
    for (const [values, color] of channels) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT);
      for (let i = 0; i < 256; i++) {
        const h = Math.min(1, values[i]! / peak) * (HEIGHT - 2);
        ctx.lineTo((i / 255) * WIDTH, HEIGHT - h);
      }
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [histogram]);

  const clipping = histogram ? clippedShares(histogram) : null;

  return (
    <div className="histogram">
      <canvas
        ref={canvasRef}
        className="histogram-canvas"
        style={{ width: WIDTH, height: HEIGHT }}
        role="img"
        aria-label="Histogram"
      />
      {clipping && (
        <div className="histogram-clipping">
          <span title="Pixels at pure black">Shadows clipped {formatShare(clipping.shadows)}</span>
          <span title="Pixels at pure white">
            Highlights clipped {formatShare(clipping.highlights)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatShare(share: number): string {
  if (share === 0) return '0%';
  if (share < 0.001) return '<0.1%';
  return `${(share * 100).toFixed(1)}%`;
}

function percentile(channels: Uint32Array[], p: number): number {
  const values: number[] = [];
  for (const channel of channels) for (const v of channel) values.push(v);
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(values.length * p))]!;
}
