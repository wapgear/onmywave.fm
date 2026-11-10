import { useState } from 'react';

import { SectionHeading } from '../../../components/SectionHeading/SectionHeading.component';
import { applyTheme, currentTheme, saveArtworkAppearance, themes } from '../../../theme';
import type { ArtworkAppearance, Theme } from '../../../theme.types';
import type { SettingsPageProps } from '../Settings.types';

const artworkOptions = {
  gradient: {
    title: 'Now Playing gradient',
    off: 'Use the solid theme backdrop',
    on: 'Tint the area behind the sidebar and player with cover art',
  },
  accent: {
    title: 'Now Playing accent',
    off: 'Use the theme color for highlights and controls',
    on: 'Use cover art to color the selected song, icons, and slider fills',
  },
};

function AppearanceChoice({
  name,
  value,
  preview,
  label,
  description,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  preview: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = `${name}-${value}`;

  return (
    <label className="theme-choice">
      <img className="theme-preview" src={`/appearance-previews/${preview}.webp`} alt="" width={640} height={360} />
      <span className="theme-choice-label">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-description`}
          onChange={onChange}
        />
        <span id={`${id}-label`}>{label}</span>
      </span>
      <span className="theme-choice-description" id={`${id}-description`}>
        {description}
      </span>
    </label>
  );
}

function ArtworkPicker({
  option,
  theme,
  enabled,
  onChange,
}: {
  option: keyof ArtworkAppearance;
  theme: Theme;
  enabled: boolean;
  onChange: (option: keyof ArtworkAppearance, enabled: boolean) => void;
}) {
  const [saved, setSaved] = useState(true);
  const copy = artworkOptions[option];

  return (
    <section>
      <fieldset className="theme-picker artwork-picker">
        <legend>{copy.title}</legend>
        {(['off', 'on'] as const).map((value) => (
          <AppearanceChoice
            key={value}
            name={`artwork-${option}`}
            value={value}
            preview={`${theme}-${value === 'on' ? option : 'theme'}`}
            label={value === 'on' ? 'On' : 'Off'}
            description={copy[value]}
            checked={enabled === (value === 'on')}
            onChange={() => {
              const next = value === 'on';
              onChange(option, next);
              setSaved(saveArtworkAppearance(option, next));
            }}
          />
        ))}
      </fieldset>
      {!saved && (
        <p className="settings-footnote" role="status">
          This choice applies for now. It could not be saved on this device.
        </p>
      )}
    </section>
  );
}

export function AppearanceSettings({
  artworkAppearance,
  onArtworkAppearanceChange,
}: Pick<SettingsPageProps, 'artworkAppearance' | 'onArtworkAppearanceChange'>) {
  const [theme, setTheme] = useState(currentTheme);
  const [saved, setSaved] = useState(true);

  return (
    <>
      <section aria-labelledby="appearance-title">
        <SectionHeading title="Color theme" helpLabel="About color themes" id="appearance-title">
          <p>Theme changes apply throughout the app and are saved on this device.</p>
        </SectionHeading>
        <fieldset className="theme-picker" aria-labelledby="appearance-title">
          {themes.map((option) => (
            <AppearanceChoice
              key={option.id}
              name="theme"
              value={option.id}
              preview={`${option.id}-theme`}
              label={option.label}
              description={option.description}
              checked={theme === option.id}
              onChange={() => {
                setTheme(option.id);
                setSaved(applyTheme(option.id));
              }}
            />
          ))}
        </fieldset>
        {!saved && (
          <p className="settings-footnote" role="status">
            Theme applied for now. It could not be saved on this device. Choose another theme to retry.
          </p>
        )}
      </section>
      <ArtworkPicker
        option="gradient"
        theme={theme}
        enabled={artworkAppearance.gradient}
        onChange={onArtworkAppearanceChange}
      />
      <ArtworkPicker
        option="accent"
        theme={theme}
        enabled={artworkAppearance.accent}
        onChange={onArtworkAppearanceChange}
      />
    </>
  );
}
