export type DJPlaybackSettings = { enabled: boolean; roomId: string | null; everySongs: number; keepOnSeek: boolean; voiceVolume: number };
export const defaultDJPlaybackSettings = (): DJPlaybackSettings => ({ enabled: false, roomId: null, everySongs: 3, keepOnSeek: true, voiceVolume: 0.7 });
export function isDJPlaybackSettings(value: unknown): value is DJPlaybackSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as DJPlaybackSettings;
  return typeof settings.enabled === 'boolean' && (settings.roomId === null || (typeof settings.roomId === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(settings.roomId)))
    && Number.isInteger(settings.everySongs) && settings.everySongs >= 1 && settings.everySongs <= 100
    && (settings.keepOnSeek === undefined || typeof settings.keepOnSeek === 'boolean')
    && (settings.voiceVolume === undefined || (typeof settings.voiceVolume === 'number' && Number.isFinite(settings.voiceVolume) && settings.voiceVolume >= 0 && settings.voiceVolume <= 1));
}
export function normalizeDJPlaybackSettings(value: unknown): DJPlaybackSettings {
  return isDJPlaybackSettings(value) ? { enabled: value.enabled, roomId: value.roomId, everySongs: value.everySongs, keepOnSeek: value.keepOnSeek ?? true, voiceVolume: value.voiceVolume ?? 0.7 } : defaultDJPlaybackSettings();
}
