/**
 * Rating, flag, colour label and keywords for one or more photos.
 * Keyboard shortcuts (handled in App): 0–5 stars, P pick, X reject, U unflag,
 * 6–9 red/yellow/green/blue label.
 */
import { useState } from 'react';
import { parseKeywords } from '../catalog/filters';
import { COLOR_LABELS, type CatalogPhoto, type PhotoChanges } from '../catalog/types';

interface RatingProps {
  value: number;
  onChange?: (rating: number) => void;
  size?: 'small' | 'normal';
}

/** Five stars; clicking the current rating again clears it. Read-only without `onChange`. */
export function RatingStars({ value, onChange, size = 'normal' }: RatingProps) {
  if (!onChange) {
    return (
      <span className={`stars stars-${size}`} aria-label={`${value} of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= value ? 'star star-on' : 'star'} aria-hidden="true">
            ★
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={`stars stars-${size}`} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'star star-on' : 'star'}
          onClick={() => onChange(value === n ? 0 : n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

interface PhotoMetaProps {
  /** The photos being edited; values shown are those of the first. */
  photos: CatalogPhoto[];
  onChange: (changes: PhotoChanges) => void;
}

export function PhotoMeta({ photos, onChange }: PhotoMetaProps) {
  const first = photos[0];
  const keywordText = first?.keywords.join(', ') ?? '';
  const [draft, setDraft] = useState<{ text: string; base: string } | null>(null);
  if (!first) return null;
  // Typing edits a draft; leaving the field saves it.
  const text = draft && draft.base === keywordText ? draft.text : keywordText;

  const saveKeywords = () => {
    if (draft) onChange({ keywords: parseKeywords(draft.text) });
    setDraft(null);
  };

  return (
    <div className="photo-meta">
      {photos.length > 1 && <p className="panel-note">{photos.length} photos selected</p>}
      <div className="meta-row">
        <RatingStars value={first.rating} onChange={(rating) => onChange({ rating })} />
        <span className="flag-buttons">
          <button
            type="button"
            className={`small-button${first.flag === 'pick' ? ' small-button-on' : ''}`}
            aria-pressed={first.flag === 'pick'}
            onClick={() => onChange({ flag: first.flag === 'pick' ? null : 'pick' })}
            title="Pick (P)"
          >
            ⚑ Pick
          </button>
          <button
            type="button"
            className={`small-button${first.flag === 'reject' ? ' small-button-on' : ''}`}
            aria-pressed={first.flag === 'reject'}
            onClick={() => onChange({ flag: first.flag === 'reject' ? null : 'reject' })}
            title="Reject (X)"
          >
            ✕ Reject
          </button>
        </span>
      </div>
      <div className="label-chips" role="radiogroup" aria-label="Colour label">
        {COLOR_LABELS.map((label) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={first.label === label}
            aria-label={`${label} label`}
            className={`label-chip label-${label}${first.label === label ? ' label-chip-on' : ''}`}
            onClick={() => onChange({ label: first.label === label ? null : label })}
          />
        ))}
      </div>
      <label className="field">
        <span className="field-label">Keywords (comma separated)</span>
        <input
          className="text-input"
          value={text}
          placeholder="e.g. kingfisher, river, morning"
          onChange={(event) => setDraft({ text: event.target.value, base: keywordText })}
          onBlur={saveKeywords}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
          }}
        />
      </label>
    </div>
  );
}
