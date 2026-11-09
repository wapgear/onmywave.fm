import { announcementLinesError, isAnnouncementStyle, type AnnouncementStyle } from './song-announcements';
import { isSongIntervalRange, MAX_SONG_INTERVAL } from './song-intervals';

export type DJPlaybackSettings = {
  enabled: boolean;
  roomId: string | null;
  everySongs: number;
  everySongsMax: number;
  keepOnSeek: boolean;
  voiceVolume: number;
  announceTracks: boolean;
  announceEverySongs: number;
  announceEverySongsMax: number;
  announcementStyle: AnnouncementStyle;
  announcementLines: string;
};

export type DJPlaybackSettingsPatch = Partial<DJPlaybackSettings>;

export const defaultDJPlaybackSettings = (): DJPlaybackSettings => ({
  enabled: false,
  roomId: null,
  everySongs: 3,
  everySongsMax: 3,
  keepOnSeek: true,
  voiceVolume: 0.7,
  announceTracks: false,
  announceEverySongs: 2,
  announceEverySongsMax: 6,
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
    isSongIntervalRange(
      settings.everySongs,
      settings.everySongsMax === undefined ? settings.everySongs : settings.everySongsMax,
    ) &&
    (settings.announceTracks === undefined || typeof settings.announceTracks === 'boolean') &&
    isSongIntervalRange(
      settings.announceEverySongs === undefined ? 6 : settings.announceEverySongs,
      settings.announceEverySongsMax === undefined
        ? settings.announceEverySongs === undefined
          ? 6
          : settings.announceEverySongs
        : settings.announceEverySongsMax,
    ) &&
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
          'everySongsMax',
          'keepOnSeek',
          'voiceVolume',
          'announceTracks',
          'announceEverySongs',
          'announceEverySongsMax',
          'announcementStyle',
          'announcementLines',
        ].includes(key),
    ) ||
    Object.keys(value).length !== keys.length
  )
    return false;
  const patch = value as Record<string, unknown>;
  if (keys.some((key) => patch[key as string] === undefined)) return false;
  return isDJPlaybackSettings({
    ...defaultDJPlaybackSettings(),
    ...patch,
    everySongs: Object.hasOwn(patch, 'everySongs') ? patch.everySongs : 1,
    everySongsMax: Object.hasOwn(patch, 'everySongsMax')
      ? patch.everySongsMax
      : (patch.everySongs ?? MAX_SONG_INTERVAL),
    announceEverySongs: Object.hasOwn(patch, 'announceEverySongs') ? patch.announceEverySongs : 1,
    announceEverySongsMax: Object.hasOwn(patch, 'announceEverySongsMax')
      ? patch.announceEverySongsMax
      : (patch.announceEverySongs ?? MAX_SONG_INTERVAL),
  });
}

export function normalizeDJPlaybackSettings(value: unknown): DJPlaybackSettings {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const migrated = { ...value } as Record<string, unknown>;
    for (const key of ['everySongs', 'everySongsMax', 'announceEverySongs', 'announceEverySongsMax']) {
      const count = migrated[key];
      if (typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 100)
        migrated[key] = Math.min(count, MAX_SONG_INTERVAL);
    }
    value = migrated;
  }
  return isDJPlaybackSettings(value)
    ? {
        enabled: value.enabled,
        roomId: value.roomId,
        everySongs: value.everySongs,
        everySongsMax: value.everySongsMax ?? value.everySongs,
        keepOnSeek: value.keepOnSeek ?? true,
        voiceVolume: value.voiceVolume ?? 0.7,
        announceTracks: value.announceTracks ?? false,
        announceEverySongs: value.announceEverySongs ?? 6,
        announceEverySongsMax: value.announceEverySongsMax ?? value.announceEverySongs ?? 6,
        announcementStyle: value.announcementStyle ?? 'varied',
        announcementLines: value.announcementLines ?? '',
      }
    : defaultDJPlaybackSettings();
}
