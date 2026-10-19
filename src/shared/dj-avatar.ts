import type { DJ } from './types';

export const djAvatarIcons = [
  { id: 'host', name: 'Host' },
  { id: 'headphones', name: 'Headphones' },
  { id: 'microphone', name: 'Microphone' },
  { id: 'radio', name: 'Radio' },
  { id: 'music', name: 'Music' },
  { id: 'sparkles', name: 'Sparkles' },
] as const;
export const djAvatarPortraits = [
  { id: 'fox', name: 'Fox' },
  { id: 'owl', name: 'Owl' },
] as const;
export const djAvatarColors = [
  { id: 'neutral', name: 'Cloud', background: '#efeff3', foreground: '#555963' },
  { id: 'peach', name: 'Peach', background: '#f6e1d3', foreground: '#724331' },
  { id: 'sage', name: 'Sage', background: '#dce8dc', foreground: '#36533f' },
  { id: 'sand', name: 'Sand', background: '#eee4cb', foreground: '#5f512b' },
  { id: 'rose', name: 'Rose', background: '#f0dfe3', foreground: '#743e50' },
  { id: 'slate', name: 'Slate', background: '#dee5ed', foreground: '#3b506b' },
] as const;

type Color = (typeof djAvatarColors)[number]['id'];
export type DJAvatarChoice = (
  | { kind: 'initials' }
  | { kind: 'icon'; id: (typeof djAvatarIcons)[number]['id'] }
  | { kind: 'portrait'; id: (typeof djAvatarPortraits)[number]['id'] }
) & { color: Color };

export function isDJAvatar(value: unknown): value is DJAvatarChoice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!djAvatarColors.some((color) => color.id === item.color)) return false;
  const keys = item.kind === 'initials' ? ['kind', 'color'] : ['kind', 'id', 'color'];
  if (Object.keys(item).some((key) => !keys.includes(key))) return false;
  return (
    item.kind === 'initials' ||
    (item.kind === 'icon' && djAvatarIcons.some((icon) => icon.id === item.id)) ||
    (item.kind === 'portrait' && djAvatarPortraits.some((portrait) => portrait.id === item.id))
  );
}

export function resolveDJAvatar(value: unknown): DJAvatarChoice {
  return isDJAvatar(value) ? value : { kind: 'icon', id: 'host', color: 'neutral' };
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function djInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = (word: string) => graphemes.segment(word)[Symbol.iterator]().next().value?.segment ?? '';
  return words.length
    ? [words[0], ...(words.length > 1 ? [words[words.length - 1]] : [])].map(first).join('').toLocaleUpperCase()
    : 'DJ';
}

/** Appearance never changes the setup that prepared a story or its playback. */
export function djPreparationKey(dj: DJ | null | undefined): string {
  return JSON.stringify(dj ? { ...dj, avatar: undefined } : null);
}
