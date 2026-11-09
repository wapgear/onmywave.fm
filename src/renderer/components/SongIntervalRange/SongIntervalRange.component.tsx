import { MAX_SONG_INTERVAL, MIN_SONG_INTERVAL } from '../../../shared/song-intervals';
import { RangeSlider } from '../Slider/RangeSlider.component';

import './SongIntervalRange.styles.css';

export function SongIntervalRange({
  id,
  label,
  minimum,
  maximum,
  disabled = false,
  inputRef,
  onChange,
}: {
  id: string;
  label: string;
  minimum: number;
  maximum: number;
  disabled?: boolean;
  inputRef?: (element: HTMLInputElement | null) => void;
  onChange: (minimum: number, maximum: number) => void;
}) {
  return (
    <div className="preference-row song-interval-range" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="song-interval-label">
        {label}
      </span>
      <RangeSlider
        id={id}
        className="song-interval-track"
        min={MIN_SONG_INTERVAL}
        max={MAX_SONG_INTERVAL}
        value={[minimum, maximum]}
        minimumLabel={`${label}: minimum completed songs`}
        maximumLabel={`${label}: maximum completed songs`}
        formatValue={(value) => `${value} completed ${value === 1 ? 'song' : 'songs'}`}
        disabled={disabled}
        inputRef={inputRef}
        onChange={onChange}
      />
      <span className="song-interval-value" aria-hidden="true">
        {minimum === maximum ? `${minimum} ${minimum === 1 ? 'song' : 'songs'}` : `${minimum}–${maximum} songs`}
      </span>
    </div>
  );
}
