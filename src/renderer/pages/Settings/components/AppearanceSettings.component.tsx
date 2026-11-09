import { useState } from 'react';

import { SectionHeading } from '../../../components/SectionHeading/SectionHeading.component';
import { applyTheme, currentTheme, saveArtworkGradient, themes } from '../../../theme';

export function AppearanceSettings({
  artworkGradientEnabled,
  onArtworkGradientChange,
}: {
  artworkGradientEnabled: boolean;
  onArtworkGradientChange: (enabled: boolean) => void;
}) {
  const [theme, setTheme] = useState(currentTheme);
  const [saved, setSaved] = useState(true);
  const [gradientSaved, setGradientSaved] = useState(true);

  return (
    <section aria-labelledby="appearance-title">
      <SectionHeading title="Appearance" helpLabel="About appearance" id="appearance-title">
        <p>Theme changes apply throughout the app and are saved on this Mac.</p>
      </SectionHeading>
      <fieldset className="theme-picker">
        <legend className="sr-only">Color theme</legend>
        {themes.map((option) => (
          <label key={option.id} className="theme-choice" data-preview={option.id}>
            <span className="theme-preview" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="theme-choice-label">
              <input
                type="radio"
                name="theme"
                value={option.id}
                checked={theme === option.id}
                onChange={() => {
                  setTheme(option.id);
                  setSaved(applyTheme(option.id));
                }}
              />
              <span>{option.label}</span>
            </span>
            <span className="theme-choice-description">{option.description}</span>
          </label>
        ))}
      </fieldset>
      {!saved && (
        <p className="settings-footnote" role="status">
          Theme applied for now. It could not be saved on this Mac. Choose another theme to retry.
        </p>
      )}
      <label className="theme-choice-label appearance-gradient">
        <input
          type="checkbox"
          checked={artworkGradientEnabled}
          aria-describedby="appearance-gradient-description"
          onChange={(event) => {
            const enabled = event.target.checked;
            onArtworkGradientChange(enabled);
            setGradientSaved(saveArtworkGradient(enabled));
          }}
        />
        Now Playing gradient
      </label>
      <p className="theme-choice-description appearance-gradient-description" id="appearance-gradient-description">
        Use the current song’s cover art to tint the app background.
      </p>
      {!gradientSaved && (
        <p className="settings-footnote" role="status">
          The gradient setting applies for now. It could not be saved on this device.
        </p>
      )}
    </section>
  );
}
