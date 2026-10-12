/**
 * The colour mixer: Hue, Saturation and Luminance tabs, each with one slider per
 * colour range (red, orange, yellow, green, aqua, blue, purple, magenta).
 */
import { useState } from 'react';
import { BAND_CENTERS, BANDS } from '../develop/hsl';
import { MIXER_SLIDERS, MIXER_TABS, type Recipe } from '../develop/recipe';
import { Slider } from './Slider';

interface ColorMixerProps {
  recipe: Recipe;
  disabled: boolean;
  onPreview: (recipe: Recipe) => void;
  onCommit: (recipe: Recipe) => void;
}

type Tab = (typeof MIXER_TABS)[number]['id'];

export function ColorMixer({ recipe, disabled, onPreview, onCommit }: ColorMixerProps) {
  const [tab, setTab] = useState<Tab>('saturation');
  const sliders = MIXER_SLIDERS.filter((s) => s.key.startsWith(tab));
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Colour mixer">
        {MIXER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sliders.map((spec, i) => (
        <Slider
          key={spec.key}
          spec={spec}
          recipe={recipe}
          disabled={disabled}
          onPreview={onPreview}
          onCommit={onCommit}
          icon={<BandSwatch band={i} />}
        />
      ))}
    </>
  );
}

/** A small dot in the band's colour. */
function BandSwatch({ band }: { band: number }) {
  return (
    <span
      className="band-swatch"
      aria-hidden="true"
      title={BANDS[band]}
      style={{ background: `oklch(0.7 0.16 ${BAND_CENTERS[band]})` }}
    />
  );
}
