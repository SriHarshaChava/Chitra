/**
 * The right-hand panel: histogram, photo info, and (from Phase 2) the adjustments.
 *
 * The sliders are still placeholders showing the planned layout. In Phase 2 each one
 * will update the photo's edit recipe.
 */
import type { CurrentPhoto } from '../photos/usePhotoSession';
import { HistogramView } from './HistogramView';
import { InfoPanel } from './InfoPanel';

interface SliderSpec {
  label: string;
  min: number;
  max: number;
}

interface SectionSpec {
  title: string;
  sliders: SliderSpec[];
}

const SECTIONS: SectionSpec[] = [
  {
    title: 'White balance',
    sliders: [
      { label: 'Temperature', min: -100, max: 100 },
      { label: 'Tint', min: -100, max: 100 },
    ],
  },
  {
    title: 'Tone',
    sliders: [
      { label: 'Exposure', min: -5, max: 5 },
      { label: 'Contrast', min: -100, max: 100 },
      { label: 'Highlights', min: -100, max: 100 },
      { label: 'Shadows', min: -100, max: 100 },
      { label: 'Whites', min: -100, max: 100 },
      { label: 'Blacks', min: -100, max: 100 },
    ],
  },
  {
    title: 'Presence',
    sliders: [
      { label: 'Vibrance', min: -100, max: 100 },
      { label: 'Saturation', min: -100, max: 100 },
    ],
  },
];

interface DevelopPanelProps {
  current: CurrentPhoto | null;
  fileName?: string;
  fileSize?: number;
}

export function DevelopPanel({ current, fileName, fileSize }: DevelopPanelProps) {
  return (
    <aside className="panel panel-right" aria-label="Develop">
      <HistogramView histogram={current?.image?.histogram} />

      <section className="panel-section">
        <h2 className="section-title">Info</h2>
        <InfoPanel info={current?.info} fileName={fileName} fileSize={fileSize} />
      </section>

      <h2 className="panel-title panel-title-spaced">Develop</h2>
      <p className="panel-note">Adjustments arrive in Phase 2.</p>
      {SECTIONS.map((section) => (
        <section key={section.title} className="panel-section">
          <h3 className="section-title">{section.title}</h3>
          {section.sliders.map((slider) => (
            <label key={slider.label} className="slider">
              <span className="slider-label">{slider.label}</span>
              <input type="range" min={slider.min} max={slider.max} defaultValue={0} disabled />
            </label>
          ))}
        </section>
      ))}
    </aside>
  );
}
