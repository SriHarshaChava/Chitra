/**
 * The Develop panel: where photo adjustments live.
 *
 * In Phase 0 the sliders are placeholders that show the planned layout. They become
 * real in Phase 2, when each one will update the photo's edit recipe.
 */

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

export function DevelopPanel() {
  return (
    <aside className="panel panel-right" aria-label="Develop">
      <h2 className="panel-title">Develop</h2>
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
