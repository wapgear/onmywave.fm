import { createHash } from 'node:crypto';

import type { PlaybackPreferences, PlaybackSnapshot } from '../shared/types';

export const playbackPreferenceKey = (connectionId: string) => createHash('sha256').update(connectionId).digest('hex');

export const defaultPlaybackPreferences = (): PlaybackPreferences => ({ volume: 0.75, shuffle: false, repeat: 'off' });

function preferences(value: unknown): PlaybackPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { volume, shuffle, repeat } = value as Record<string, unknown>;
  if (
    typeof volume !== 'number' ||
    !Number.isFinite(volume) ||
    volume < 0 ||
    volume > 1 ||
    typeof shuffle !== 'boolean' ||
    (repeat !== 'off' && repeat !== 'all' && repeat !== 'one')
  )
    return null;
  return { volume, shuffle, repeat };
}

export function normalizePlaybackPreferences(
  value: unknown,
  snapshot: PlaybackSnapshot | null,
): Record<string, PlaybackPreferences> {
  const entries = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
  const result = Object.fromEntries(
    entries.flatMap(([key, value]) => {
      const options = preferences(value);
      return /^[a-f0-9]{64}$/.test(key) && options ? [[key, options]] : [];
    }),
  );
  if (
    snapshot &&
    typeof snapshot.connectionId === 'string' &&
    snapshot.connectionId &&
    snapshot.connectionId.length <= 4096
  ) {
    const options = preferences(snapshot);
    const key = playbackPreferenceKey(snapshot.connectionId);
    if (options && !Object.hasOwn(result, key)) result[key] = options;
  }
  return result;
}
