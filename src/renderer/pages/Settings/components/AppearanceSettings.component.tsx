import { useRef, useState } from 'react';

import { SectionHeading } from '../../../components/SectionHeading/SectionHeading.component';
import {
  accentFavorites,
  applyTheme,
  currentTheme,
  favoriteId,
  gradientFavorites,
  saveAppearancePreferences,
  themes,
} from '../../../theme';
import type { AppearancePreferences } from '../../../theme.types';
import type { SettingsPageProps } from '../Settings.types';
import { AppearanceColorChoices, CustomColorInput, SaveColorFavorite } from './AppearanceColorChoices.component';
import { DynamicBarSettings } from './DynamicBarSettings.component';

function ThemeChoice({
  value,
  preview,
  label,
  description,
  checked,
  onChange,
}: {
  value: string;
  preview: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = `theme-${value}`;

  return (
    <label className="theme-choice">
      <img className="theme-preview" src={`/appearance-previews/${preview}.webp`} alt="" width={640} height={360} />
      <span className="theme-choice-label">
        <input
          type="radio"
          name="theme"
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

export function AppearanceSettings({
  appearance,
  onAppearanceChange,
}: Pick<SettingsPageProps, 'appearance' | 'onAppearanceChange'>) {
  const [theme, setTheme] = useState(currentTheme);
  const [themeSaved, setThemeSaved] = useState(true);
  const [appearanceSaved, setAppearanceSaved] = useState(true);
  const latestAppearance = useRef(appearance);
  const { customAccent, customGradient, favoriteAccents, favoriteGradients } = appearance;
  const accentIsFavorite = favoriteAccents.some(({ color }) => color === customAccent);
  const gradientIsFavorite = favoriteGradients.some(
    ({ color }) => color.start === customGradient.start && color.end === customGradient.end,
  );

  function updateAppearance(
    changes: Partial<AppearancePreferences> | ((current: AppearancePreferences) => Partial<AppearancePreferences>),
  ) {
    const current = latestAppearance.current;
    const next = { ...current, ...(typeof changes === 'function' ? changes(current) : changes) };

    latestAppearance.current = next;
    onAppearanceChange(next);
    setAppearanceSaved(saveAppearancePreferences(next));
  }

  return (
    <>
      <section aria-labelledby="appearance-title">
        <SectionHeading title="Color theme" helpLabel="About color themes" id="appearance-title">
          <p>Theme changes apply throughout the app and are saved on this device.</p>
        </SectionHeading>
        <fieldset className="theme-picker" aria-labelledby="appearance-title">
          {themes.map((option) => (
            <ThemeChoice
              key={option.id}
              value={option.id}
              preview={`${option.id}-theme`}
              label={option.label}
              description={option.description}
              checked={theme === option.id}
              onChange={() => {
                setTheme(option.id);
                setThemeSaved(applyTheme(option.id));
              }}
            />
          ))}
        </fieldset>
        {!themeSaved && (
          <p className="settings-footnote" role="status">
            Theme applied for now. It could not be saved on this device. Choose another theme to retry.
          </p>
        )}
      </section>
      <section>
        <AppearanceColorChoices
          name="accent"
          title="Accent color"
          value={appearance.accent}
          favorites={accentFavorites(favoriteAccents)}
          swatch={(color) => `oklch(from ${color} var(--accent-lightness, l) min(c, 0.15) h)`}
          onChange={(accent) => updateAppearance({ accent })}
          onRename={({ color }, name) =>
            updateAppearance((current) => ({
              favoriteAccents: current.favoriteAccents.map((saved) =>
                saved.color === color ? { ...saved, name } : saved,
              ),
            }))
          }
          onRemove={({ id, color }) =>
            updateAppearance((current) => ({
              ...(current.accent.choice === id && {
                accent: { ...current.accent, choice: 'custom' },
                customAccent: color,
              }),
              favoriteAccents: current.favoriteAccents.filter((saved) => saved.color !== color),
            }))
          }
        />
        {appearance.accent.mode === 'static' && appearance.accent.choice === 'custom' && (
          <>
            <div className="appearance-custom-colors">
              <CustomColorInput
                label="Custom accent"
                value={appearance.customAccent}
                onChange={(customAccent) => updateAppearance({ customAccent })}
              />
              <SaveColorFavorite
                kind="accent"
                saved={accentIsFavorite}
                onSave={(name) =>
                  updateAppearance((current) => ({
                    accent: { ...current.accent, choice: favoriteId(customAccent) },
                    favoriteAccents: [...current.favoriteAccents, { color: customAccent, name }],
                  }))
                }
              />
            </div>
            <p className="settings-footnote">The accent shade adapts to the theme for readability.</p>
          </>
        )}
      </section>
      <section>
        <AppearanceColorChoices
          name="gradient"
          title="Backdrop gradient"
          value={appearance.gradient}
          favorites={gradientFavorites(favoriteGradients)}
          swatch={({ start, end }) => `linear-gradient(${start}, ${end})`}
          onChange={(gradient) => updateAppearance({ gradient })}
          onRename={({ id }, name) =>
            updateAppearance((current) => ({
              favoriteGradients: current.favoriteGradients.map((saved) =>
                favoriteId(saved.color.start, saved.color.end) === id ? { ...saved, name } : saved,
              ),
            }))
          }
          onRemove={({ id, color }) =>
            updateAppearance((current) => ({
              ...(current.gradient.choice === id && {
                gradient: { ...current.gradient, choice: 'custom' },
                customGradient: color,
              }),
              favoriteGradients: current.favoriteGradients.filter(
                ({ color }) => favoriteId(color.start, color.end) !== id,
              ),
            }))
          }
        />
        {appearance.gradient.mode === 'static' && appearance.gradient.choice === 'custom' && (
          <div className="appearance-custom-colors">
            <CustomColorInput
              label="Start color"
              value={appearance.customGradient.start}
              onChange={(start) => updateAppearance({ customGradient: { ...appearance.customGradient, start } })}
            />
            <CustomColorInput
              label="End color"
              value={appearance.customGradient.end}
              onChange={(end) => updateAppearance({ customGradient: { ...appearance.customGradient, end } })}
            />
            <SaveColorFavorite
              kind="gradient"
              saved={gradientIsFavorite}
              onSave={(name) =>
                updateAppearance((current) => ({
                  gradient: { ...current.gradient, choice: favoriteId(customGradient.start, customGradient.end) },
                  favoriteGradients: [...current.favoriteGradients, { color: customGradient, name }],
                }))
              }
            />
          </div>
        )}
      </section>
      <DynamicBarSettings value={appearance.dynamicBar} onChange={(dynamicBar) => updateAppearance({ dynamicBar })} />
      {!appearanceSaved && (
        <p className="settings-footnote" role="status">
          Appearance changes applied for now. They could not be saved on this device.
        </p>
      )}
    </>
  );
}
