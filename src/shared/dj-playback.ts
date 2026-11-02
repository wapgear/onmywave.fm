import { announcementLinesError, isAnnouncementStyle, type AnnouncementStyle } from './song-announcements';

export type DJPlaybackSettings = {
  enabled: boolean;
  roomId: string | null;
  everySongs: number;
  keepOnSeek: boolean;
  voiceVolume: number;
  announceTracks: boolean;
  announceEverySongs: number;
  announcementStyle: AnnouncementStyle;
  announcementLines: string;
};

export type DJPlaybackSettingsPatch = Partial<DJPlaybackSettings>;

export const defaultDJPlaybackSettings = (): DJPlaybackSettings => ({
  enabled: false,
  roomId: null,
  everySongs: 3,
  keepOnSeek: true,
  voiceVolume: 0.7,
  announceTracks: false,
  announceEverySongs: 6,
  announcementStyle: 'varied',
  announcementLines: '',
});

export function isDJPlaybackSettings(value: unknown): value is DJPlaybackSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as DJPlaybackSettings;
  return (
    typeof settings.enabled === 'boolean' &&
    (settings.roomId === null ||
      (typeof settings.roomId === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(settings.roomId))) &&
    Number.isInteger(settings.everySongs) &&
    settings.everySongs >= 1 &&
    settings.everySongs <= 100 &&
    (settings.announceTracks === undefined || typeof settings.announceTracks === 'boolean') &&
    (settings.announceEverySongs === undefined ||
      (Number.isInteger(settings.announceEverySongs) &&
        settings.announceEverySongs >= 1 &&
        settings.announceEverySongs <= 100)) &&
    (settings.announcementStyle === undefined || isAnnouncementStyle(settings.announcementStyle)) &&
    (settings.announcementLines === undefined || typeof settings.announcementLines === 'string') &&
    announcementLinesError(settings.announcementStyle ?? 'varied', settings.announcementLines ?? '') === null &&
    (settings.keepOnSeek === undefined || typeof settings.keepOnSeek === 'boolean') &&
    (settings.voiceVolume === undefined ||
      (typeof settings.voiceVolume === 'number' &&
        Number.isFinite(settings.voiceVolume) &&
        settings.voiceVolume >= 0 &&
        settings.voiceVolume <= 1))
  );
}

export function isDJPlaybackSettingsPatch(value: unknown): value is DJPlaybackSettingsPatch {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return false;
  const keys = Reflect.ownKeys(value);
  if (
    !keys.length ||
    keys.some(
      (key) =>
        typeof key !== 'string' ||
        ![
          'enabled',
          'roomId',
          'everySongs',
          'keepOnSeek',
          'voiceVolume',
          'announceTracks',
          'announceEverySongs',
          'announcementStyle',
          'announcementLines',
        ].includes(key),
    ) ||
    Object.keys(value).length !== keys.length
  )
    return false;
  const patch = value as Record<string, unknown>;
  if (keys.some((key) => patch[key as string] === undefined)) return false;
  return isDJPlaybackSettings({ ...defaultDJPlaybackSettings(), ...patch });
}

export function normalizeDJPlaybackSettings(value: unknown): DJPlaybackSettings {
  return isDJPlaybackSettings(value)
    ? {
        enabled: value.enabled,
        roomId: value.roomId,
        everySongs: value.everySongs,
        keepOnSeek: value.keepOnSeek ?? true,
        voiceVolume: value.voiceVolume ?? 0.7,
        announceTracks: value.announceTracks ?? false,
        announceEverySongs: value.announceEverySongs ?? 6,
        announcementStyle: value.announcementStyle ?? 'varied',
        announcementLines: value.announcementLines ?? '',
      }
    : defaultDJPlaybackSettings();
}
