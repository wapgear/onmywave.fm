export type Theme = 'light' | 'coffee' | 'dark';

export type ColorFavorite = 'green' | 'lime' | 'blue' | 'purple';

export type SavedColorFavorite = `favorite:${string}`;

export type StaticColorChoice = 'custom' | ColorFavorite | SavedColorFavorite;

export type ColorSelection = {
  mode: 'dynamic' | 'static';
  choice: StaticColorChoice;
};

export type Favorite<T> = {
  id: ColorFavorite | SavedColorFavorite;
  label: string;
  color: T;
  saved?: boolean;
};

export type SavedFavorite<T> = { color: T; name?: string };

export type GradientColors = { start: string; end: string };

export type DynamicBarMode = 'none' | 'progress' | 'spectrum';

export type DynamicBarPreferences = {
  mode: DynamicBarMode;
  progress: 'soft-fill' | 'bottom-wash' | 'border-fill';
  spectrum: 'bars' | 'segments';
};

export type AppearancePreferences = {
  accent: ColorSelection;
  gradient: ColorSelection;
  dynamicBar: DynamicBarPreferences;
  customAccent: string;
  customGradient: GradientColors;
  favoriteAccents: SavedFavorite<string>[];
  favoriteGradients: SavedFavorite<GradientColors>[];
};
