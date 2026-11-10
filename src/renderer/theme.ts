import type { ArtworkAppearance, Theme } from './theme.types';

const storageKey = 'wave:theme';

const artworkKeys = { gradient: 'wave:artwork-gradient', accent: 'wave:artwork-accent' };

export const themes = [
  { id: 'light', label: 'Light', description: 'Bright panels and a pale gray sidebar' },
  { id: 'coffee', label: 'Coffee', description: 'Warm beige panels and brown text' },
  { id: 'dark', label: 'Dark', description: 'Charcoal panels and light text' },
] as const;

function isTheme(value: unknown): value is Theme {
  return themes.some((theme) => theme.id === value);
}

export function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : 'light';
}

export function restoreTheme() {
  let theme: Theme = 'light';
  try {
    const saved = localStorage.getItem(storageKey);
    if (isTheme(saved)) theme = saved;
  } catch {
    // Appearance remains available when browser storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
}

export function applyTheme(theme: Theme): boolean {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(storageKey, theme);
    return true;
  } catch {
    return false;
  }
}

export function readArtworkAppearance(): ArtworkAppearance {
  try {
    return {
      gradient: localStorage.getItem(artworkKeys.gradient) === 'true',
      accent: localStorage.getItem(artworkKeys.accent) === 'true',
    };
  } catch {
    return { gradient: false, accent: false };
  }
}

export function saveArtworkAppearance(option: keyof ArtworkAppearance, enabled: boolean): boolean {
  try {
    localStorage.setItem(artworkKeys[option], String(enabled));
    return true;
  } catch {
    return false;
  }
}
