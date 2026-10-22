import type { Theme } from './theme.types';

const storageKey = 'wave:theme';

export const themes = [
  { id: 'light', label: 'Light', description: 'Clean and bright' },
  { id: 'coffee', label: 'Coffee', description: 'Warm and mellow' },
  { id: 'dark', label: 'Dark', description: 'Soft charcoal' },
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
