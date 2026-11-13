import type {
  AppearancePreferences,
  ColorFavorite,
  ColorSelection,
  DynamicBarPreferences,
  Favorite,
  GradientColors,
  SavedColorFavorite,
  SavedFavorite,
  StaticColorChoice,
  Theme,
} from './theme.types';

const storageKey = 'wave:theme';

const appearanceKey = 'wave:appearance';

const colorFavorites: Record<ColorFavorite, { label: string; accent: string; gradient: GradientColors }> = {
  green: { label: 'Green', accent: 'oklch(65% 0.13 155)', gradient: { start: '#54bd87', end: '#23746e' } },
  lime: { label: 'Lime', accent: 'oklch(65% 0.15 120)', gradient: { start: '#b5d04c', end: '#5b963c' } },
  blue: { label: 'Blue', accent: 'oklch(65% 0.15 250)', gradient: { start: '#559ee6', end: '#4552aa' } },
  purple: { label: 'Purple', accent: 'oklch(65% 0.15 305)', gradient: { start: '#9b6cd6', end: '#5c4eae' } },
};

const favoriteColors = Object.keys(colorFavorites) as ColorFavorite[];

const defaultAppearance: AppearancePreferences = {
  accent: { mode: 'dynamic', choice: 'purple' },
  gradient: { mode: 'dynamic', choice: 'blue' },
  dynamicBar: { mode: 'none', progress: 'soft-fill', spectrum: 'bars' },
  customAccent: '#9b6cd6',
  customGradient: colorFavorites.blue.gradient,
  favoriteAccents: [],
  favoriteGradients: [],
};

export function favoriteId(...colors: string[]): SavedColorFavorite {
  return `favorite:${colors.join('/')}`;
}

export function accentFavorites(saved: SavedFavorite<string>[]): Favorite<string>[] {
  return [
    ...favoriteColors.map((id) => ({ id, label: colorFavorites[id].label, color: colorFavorites[id].accent })),
    ...saved.map(({ color, name }) => ({
      id: favoriteId(color),
      label: name ?? color.toUpperCase(),
      color,
      saved: true,
    })),
  ];
}

export function gradientFavorites(saved: SavedFavorite<GradientColors>[]): Favorite<GradientColors>[] {
  return [
    ...favoriteColors.map((id) => ({ id, label: colorFavorites[id].label, color: colorFavorites[id].gradient })),
    ...saved.map(({ color, name }) => ({
      id: favoriteId(color.start, color.end),
      label: name ?? `${color.start.toUpperCase()} → ${color.end.toUpperCase()}`,
      color,
      saved: true,
    })),
  ];
}

export function favoriteColor<T>(choice: StaticColorChoice, favorites: Favorite<T>[]): T | undefined {
  return favorites.find((favorite) => favorite.id === choice)?.color;
}

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

function readStaticChoice(value: unknown, favorites: Favorite<unknown>[]): StaticColorChoice | undefined {
  return value === 'custom' ? value : favorites.find((favorite) => favorite.id === value)?.id;
}

function readColorSelection(value: unknown, favorites: Favorite<unknown>[], fallback: ColorSelection): ColorSelection {
  if (typeof value === 'object' && value !== null) {
    const saved = value as Partial<ColorSelection>;

    return {
      mode: saved.mode === 'static' ? 'static' : 'dynamic',
      choice: readStaticChoice(saved.choice, favorites) ?? fallback.choice,
    };
  }

  const choice = readStaticChoice(value, favorites);

  return choice ? { mode: 'static', choice } : fallback;
}

export function parseHexColor(value: unknown): string | undefined {
  if (typeof value === 'string' && /^#?[0-9a-f]{6}$/i.test(value)) {
    return `#${value.replace(/^#/, '').toLowerCase()}`;
  }
}

export const favoriteNameMaxLength = 20;

export function readFavoriteName(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim().slice(0, favoriteNameMaxLength) || undefined : undefined;
}

function readFavoriteAccents(value: unknown): SavedFavorite<string>[] {
  if (!Array.isArray(value)) return [];
  const accents = new Map<string, SavedFavorite<string>>();
  for (const item of value) {
    const color = parseHexColor(typeof item === 'string' ? item : item?.color);
    if (color) accents.set(color, { color, name: readFavoriteName(item?.name) });
  }

  return [...accents.values()];
}

function readFavoriteGradients(value: unknown): SavedFavorite<GradientColors>[] {
  if (!Array.isArray(value)) return [];
  const gradients = new Map<SavedColorFavorite, SavedFavorite<GradientColors>>();
  for (const item of value) {
    const color = item?.color ?? item;
    const start = parseHexColor(color?.start);
    const end = parseHexColor(color?.end);
    if (start && end)
      gradients.set(favoriteId(start, end), { color: { start, end }, name: readFavoriteName(item?.name) });
  }

  return [...gradients.values()];
}

function readDynamicBar(value: Partial<DynamicBarPreferences> | undefined): DynamicBarPreferences {
  return {
    mode: value?.mode === 'progress' || value?.mode === 'spectrum' ? value.mode : 'none',
    progress: value?.progress === 'bottom-wash' || value?.progress === 'border-fill' ? value.progress : 'soft-fill',
    spectrum: value?.spectrum === 'segments' ? 'segments' : 'bars',
  };
}

export function readAppearancePreferences(): AppearancePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(appearanceKey) ?? 'null') as Partial<AppearancePreferences> | null;
    const favoriteAccents = readFavoriteAccents(saved?.favoriteAccents);
    const favoriteGradients = readFavoriteGradients(saved?.favoriteGradients);
    const accents = accentFavorites(favoriteAccents);

    return {
      accent: readColorSelection(
        saved?.accent ?? localStorage.getItem('wave:accent'),
        accents,
        defaultAppearance.accent,
      ),
      gradient: readColorSelection(saved?.gradient, gradientFavorites(favoriteGradients), defaultAppearance.gradient),
      dynamicBar: readDynamicBar(saved?.dynamicBar),
      customAccent: parseHexColor(saved?.customAccent) ?? defaultAppearance.customAccent,
      customGradient: {
        start: parseHexColor(saved?.customGradient?.start) ?? defaultAppearance.customGradient.start,
        end: parseHexColor(saved?.customGradient?.end) ?? defaultAppearance.customGradient.end,
      },
      favoriteAccents,
      favoriteGradients,
    };
  } catch {
    return defaultAppearance;
  }
}

export function saveAppearancePreferences(appearance: AppearancePreferences): boolean {
  try {
    localStorage.setItem(appearanceKey, JSON.stringify(appearance));
    return true;
  } catch {
    return false;
  }
}
