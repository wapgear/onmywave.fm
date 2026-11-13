import type { DynamicBarMode, DynamicBarPreferences } from '../../../theme.types';

const modes = [
  { id: 'none', label: 'None' },
  { id: 'progress', label: 'Progress' },
  { id: 'spectrum', label: 'Spectrum' },
] as const;

const progressStyles = [
  { id: 'soft-fill', label: 'Soft fill' },
  { id: 'bottom-wash', label: 'Bottom wash' },
  { id: 'border-fill', label: 'Border fill' },
] as const;

const spectrumStyles = [
  { id: 'bars', label: 'Bars' },
  { id: 'segments', label: 'Segments' },
] as const;

const descriptions: Record<DynamicBarMode, string> = {
  none: 'Keep the player background still.',
  progress: 'Fill the player background as the song advances.',
  spectrum: 'Show the frequencies in the music as it plays.',
};

function BarChoices<T extends string>({
  name,
  title,
  value,
  options,
  onChange,
}: {
  name: string;
  title: string;
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="appearance-color-choices" role="radiogroup" aria-label={title}>
      {options.map(({ id, label }) => (
        <label className="theme-choice theme-choice-label appearance-color-choice" key={id}>
          <input type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} />
          {label}
        </label>
      ))}
    </div>
  );
}

export function DynamicBarSettings({
  value,
  onChange,
}: {
  value: DynamicBarPreferences;
  onChange: (value: DynamicBarPreferences) => void;
}) {
  return (
    <fieldset className="appearance-color-picker" aria-describedby="dynamic-bar-description">
      <legend>Dynamic bar</legend>
      <BarChoices
        name="dynamic-bar-mode"
        title="Dynamic bar mode"
        options={modes}
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
      />
      <p className="appearance-dynamic-hint" id="dynamic-bar-description">
        {descriptions[value.mode]}
      </p>
      {value.mode === 'progress' && (
        <BarChoices
          name="dynamic-bar-progress"
          title="Progress style"
          options={progressStyles}
          value={value.progress}
          onChange={(progress) => onChange({ ...value, progress })}
        />
      )}
      {value.mode === 'spectrum' && (
        <BarChoices
          name="dynamic-bar-spectrum"
          title="Spectrum style"
          options={spectrumStyles}
          value={value.spectrum}
          onChange={(spectrum) => onChange({ ...value, spectrum })}
        />
      )}
    </fieldset>
  );
}
