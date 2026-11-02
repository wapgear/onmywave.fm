export const announcementStyles = [
  { value: 'varied', label: 'A little of everything' },
  { value: 'warm', label: 'Warm & laid-back' },
  { value: 'energetic', label: 'Upbeat & playful' },
  { value: 'minimal', label: 'Short & simple' },
  { value: 'custom', label: 'My own lines' },
] as const;

export type AnnouncementStyle = (typeof announcementStyles)[number]['value'];

export const ANNOUNCEMENT_LINES_MAX_LENGTH = 2400;

const templates = {
  warm: [
    'A little company for the next few minutes: {track}.',
    'Settle in. Here’s {track}.',
    'Let’s spend a little time with {track}.',
    'Keeping you company, {track}.',
    'Let the world wait a moment. Here’s {track}.',
    'Room for one more? Here’s {track}.',
    'Stay a while. Coming up, {track}.',
    'Wherever you are, take this one with you: {track}.',
  ],
  energetic: [
    'Ready for another? Here’s {track}!',
    'Let’s keep it moving with {track}.',
    'Your next few minutes belong to {track}.',
    'Time to turn it up. Here’s {track}!',
    'Less talk, more music. {track}.',
    'Let’s hand it over to {track}.',
    'Here we go: {track}!',
    'Make a little room for {track}.',
  ],
  minimal: [
    'Up next, {track}.',
    'This is {track}.',
    'Now playing: {track}.',
    '{track}. Enjoy.',
    'Coming up: {track}.',
    'Next on your wave, {track}.',
    'Here’s {track}.',
    'On to {track}.',
  ],
};

export function isAnnouncementStyle(value: unknown): value is AnnouncementStyle {
  return announcementStyles.some((style) => style.value === value);
}

export function customAnnouncementLines(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

export function announcementLinesError(style: AnnouncementStyle, text: string): string | null {
  if (text.length > ANNOUNCEMENT_LINES_MAX_LENGTH) return 'Keep your lines within 2,400 characters.';
  const lines = customAnnouncementLines(text);
  if (style === 'custom' && !lines.length) return 'Add at least one line containing {track}.';
  if (lines.length > 12) return 'Use up to 12 different announcement lines.';
  if (lines.some((line) => line.length > 200)) return 'Keep each line within 200 characters.';
  if (lines.some((line) => line.split('{track}').length !== 2 || /[{}]/u.test(line.replace('{track}', ''))))
    return 'Include {track} once in every line. It is the only supported placeholder.';
  if (lines.some((line) => /[<>[\]\p{Cc}]/u.test(line))) return 'Use plain spoken text without markup or voice tags.';
  return null;
}

export function announcementTemplates(style: AnnouncementStyle, customLines: string): readonly string[] {
  if (style === 'custom') return customAnnouncementLines(customLines);
  return style === 'varied'
    ? templates.warm.flatMap((line, index) => [line, templates.energetic[index], templates.minimal[index]])
    : templates[style];
}

export function formatSongAnnouncement(template: string, title: string, artists: string): string {
  return template.replaceAll('{track}', `${title}${artists ? ` by ${artists}` : ''}`);
}
