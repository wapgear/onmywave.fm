import { useState } from 'react';

import { SectionHeading } from '../../../components/SectionHeading/SectionHeading.component';
import { applyTheme, currentTheme, themes } from '../../../theme';

export function AppearanceSettings() {
  const [theme, setTheme] = useState(currentTheme);
  const [saved, setSaved] = useState(true);

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
    </section>
  );
}
