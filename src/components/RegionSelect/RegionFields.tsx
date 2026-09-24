import { Maximize } from 'lucide-react';
import { useId } from 'react';

import { FULL_REGION, fromPixelRect, isFullRegion, toPixelRect, type PixelRect, type Region } from '../../lib/region';

interface RegionFieldsProps {
  frameWidth: number;
  frameHeight: number;
  region: Region;
  onChange: (region: Region) => void;
  disabled?: boolean;
}

const FIELDS: Array<{ key: keyof PixelRect; label: string }> = [
  { key: 'x', label: 'Left' },
  { key: 'y', label: 'Top' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
];

/** The crop box as four pixel fields (applied on Enter or leaving the field), for exact sizes and keyboard users. */
export function RegionFields({ frameWidth, frameHeight, region, onChange, disabled }: RegionFieldsProps) {
  const id = useId();
  const rect = toPixelRect(region, frameWidth, frameHeight);

  /** Applies a typed value on blur or Enter, then shows what the frame actually allows. */
  const commit = (key: keyof PixelRect, input: HTMLInputElement) => {
    const value = Number(input.value);
    if (input.value.trim() === '' || !Number.isFinite(value)) {
      input.value = String(rect[key]);
      return;
    }
    const next = fromPixelRect({ ...rect, [key]: value }, frameWidth, frameHeight);
    input.value = String(toPixelRect(next, frameWidth, frameHeight)[key]);
    onChange(next);
  };

  return (
    <fieldset className="region-fields" disabled={disabled}>
      <legend>Area in pixels</legend>
      <div className="region-fields-grid">
        {FIELDS.map(({ key, label }) => (
          <label className="field-label" key={key} htmlFor={`${id}-${key}`}>
            {label}
            <input
              // Uncontrolled while typing; a new value from dragging remounts it.
              key={rect[key]}
              id={`${id}-${key}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={key === 'x' || key === 'width' ? frameWidth : frameHeight}
              step={2}
              defaultValue={rect[key]}
              onBlur={(event) => commit(key, event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit(key, event.currentTarget);
              }}
            />
          </label>
        ))}
      </div>
      <button
        className="button button-secondary"
        type="button"
        disabled={isFullRegion(region)}
        onClick={() => onChange(FULL_REGION)}
      >
        <Maximize aria-hidden="true" size={15} /> Select everything
      </button>
    </fieldset>
  );
}
