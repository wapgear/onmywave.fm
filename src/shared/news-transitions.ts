import type { NewsTransitionSettings } from './types';
export type { NewsTransitionSettings } from './types';

export const defaultNewsTransitionSettings = (): NewsTransitionSettings => ({
  mode: 'over-music',
  fadeOutSeconds: 1.5,
  leadInSeconds: 0.8,
  postSpeechSeconds: 0.5,
  fadeInSeconds: 1.5,
});
const limits = { fadeOutSeconds: 5, leadInSeconds: 3, postSpeechSeconds: 3, fadeInSeconds: 5 } as const;

export function isNewsTransitionSettings(value: unknown): value is NewsTransitionSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return (
    ['over-music', 'between-songs'].includes(String(settings.mode)) &&
    Object.entries(limits).every(
      ([key, max]) =>
        typeof settings[key] === 'number' &&
        Number.isFinite(settings[key]) &&
        (settings[key] as number) >= 0 &&
        (settings[key] as number) <= max,
    )
  );
}

export function normalizeNewsTransitionSettings(value: unknown): NewsTransitionSettings {
  const result = defaultNewsTransitionSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const settings = value as Record<string, unknown>;
  if (settings.mode === 'over-music' || settings.mode === 'between-songs') result.mode = settings.mode;
  for (const [key, max] of Object.entries(limits)) {
    const number = settings[key];
    if (typeof number === 'number' && Number.isFinite(number))
      result[key as keyof typeof limits] = Math.max(0, Math.min(max, number));
  }
  return result;
}
