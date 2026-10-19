import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { atomicWrite } from './storage';
import { ServiceError } from './jellyfin';
import type { Playlist, PlaylistEditRecovery } from '../shared/types';

type Marker = { key: string; markerId: string };
let markers: Marker[] | undefined;
let updates = Promise.resolve();
let epoch = 0;
const active = new Set<string>();
const receipts = new Map<string, { markerId: string; receipt: string }>();
const unavailable = () =>
  new ServiceError(
    'server',
    'Playlist editing recovery could not be saved or read. Your music remains available. Refresh the playlist before editing again.',
  );
export const playlistRecoveryKey = (serverUrl: string, userId: string, playlistId: string) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        'playlist-recovery-v1',
        serverUrl,
        userId.toLowerCase().replaceAll('-', ''),
        playlistId.toLowerCase().replaceAll('-', ''),
      ]),
    )
    .digest('hex');
export const playlistCreationRecoveryKey = (serverUrl: string, userId: string) =>
  createHash('sha256')
    .update(JSON.stringify(['playlist-create-recovery-v1', serverUrl, userId.toLowerCase().replaceAll('-', '')]))
    .digest('hex');
export function invalidatePlaylistReceipts() {
  ++epoch;
  receipts.clear();
}
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const result = updates.then(work);
  updates = result.then(
    () => {},
    () => {},
  );
  return result;
}
async function readMarkers() {
  if (markers) return markers;
  try {
    const value: unknown = JSON.parse(await readFile(join(app.getPath('userData'), 'playlist-recovery.json'), 'utf8'));
    if (
      !Array.isArray(value) ||
      value.length > 10000 ||
      value.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          typeof item.key !== 'string' ||
          !/^[a-f0-9]{64}$/.test(item.key) ||
          typeof item.markerId !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(item.markerId),
      ) ||
      new Set(value.map((item) => item.key)).size !== value.length
    )
      throw unavailable();
    markers = value.map((item) => ({ key: item.key, markerId: item.markerId }));
    return markers;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      markers = [];
      return markers;
    }
    throw unavailable();
  }
}
async function saveMarkers(value: Marker[]) {
  try {
    await atomicWrite('playlist-recovery.json', JSON.stringify(value));
    markers = value;
  } catch {
    throw unavailable();
  }
}
export async function withPlaylistRecovery(
  key: string,
  reserve: boolean,
  operation: () => Promise<void>,
  creation = false,
  canStart = () => true,
) {
  const review = creation
    ? 'Refresh and check your playlists before creating another.'
    : 'Refresh and check the playlist before editing again.';
  const markerId = await serialized(async () => {
    const current = await readMarkers();
    if (!canStart()) throw new ServiceError('invalid', 'The connection changed. Refresh before editing this playlist.');
    if (current.some((marker) => marker.key === key))
      throw new ServiceError('uncertain-write', `A previous change may already be saved. ${review}`);
    if (!reserve) return null;
    if (current.length >= 10000) throw unavailable();
    const markerId = randomUUID();
    await saveMarkers([...current, { key, markerId }]);
    active.add(key);
    receipts.delete(key);
    return markerId;
  });
  try {
    try {
      await operation();
    } catch (error) {
      // Only a definite rejection can remove an intent after dispatch was possible.
      if (markerId) {
        if (
          error instanceof ServiceError &&
          ['invalid', 'unauthorized', 'forbidden', 'not-found', 'unsupported'].includes(error.code)
        ) {
          try {
            await clearMarker(key, markerId);
          } catch {
            throw new ServiceError('uncertain-write', `The playlist change could not be confirmed. ${review}`);
          }
        } else
          throw new ServiceError(
            'uncertain-write',
            error instanceof ServiceError ? error.message : `The playlist change could not be confirmed. ${review}`,
          );
      }
      throw error;
    }
    if (markerId) {
      try {
        await clearMarker(key, markerId);
      } catch {
        throw new ServiceError(
          'uncertain-write',
          `Jellyfin confirmed the change, but its recovery record could not be saved. ${review}`,
        );
      }
    }
  } finally {
    if (markerId) active.delete(key);
  }
}
function clearMarker(key: string, markerId: string) {
  return serialized(async () => {
    const current = await readMarkers();
    if (current.find((marker) => marker.key === key)?.markerId !== markerId)
      throw new ServiceError('invalid', 'The playlist recovery state changed. Refresh it before editing again.');
    await saveMarkers(current.filter((marker) => marker.key !== key));
    receipts.delete(key);
  });
}
export function beginPlaylistRead(key: string) {
  return serialized(async () => {
    receipts.delete(key);
    return {
      markerId: (await readMarkers()).find((marker) => marker.key === key)?.markerId,
      epoch,
      pending: active.has(key),
    };
  });
}
export function finishPlaylistRead(
  key: string,
  before: { markerId?: string; epoch: number; pending: boolean },
): Promise<PlaylistEditRecovery | undefined> {
  return serialized(async () => {
    const marker = (await readMarkers()).find((marker) => marker.key === key);
    if (!marker) return undefined;
    if (active.has(key)) return { status: 'pending', markerId: marker.markerId };
    if (before.pending || before.epoch !== epoch || before.markerId !== marker.markerId)
      return { status: 'review', markerId: marker.markerId };
    const receipt = randomUUID();
    receipts.set(key, { markerId: marker.markerId, receipt });
    return { status: 'review', markerId: marker.markerId, receipt };
  });
}
export function acknowledgePlaylistRecovery(key: string, markerId: string, receipt: string, isCurrent: () => boolean) {
  return serialized(async () => {
    const current = await readMarkers(),
      observed = receipts.get(key);
    if (
      !isCurrent() ||
      active.has(key) ||
      observed?.markerId !== markerId ||
      observed.receipt !== receipt ||
      current.find((marker) => marker.key === key)?.markerId !== markerId
    )
      throw new ServiceError('invalid', 'Refresh and check the current playlist results before confirming.');
    await saveMarkers(current.filter((marker) => marker.key !== key));
    receipts.delete(key);
  });
}

export function playlistRecoveryStatuses(keys: string[]): Promise<Playlist['recoveryStatus'][]> {
  return serialized(async () => {
    try {
      const unresolved = new Set((await readMarkers()).map((marker) => marker.key));
      return keys.map((key) => (unresolved.has(key) ? (active.has(key) ? 'pending' : 'review') : undefined));
    } catch {
      return keys.map(() => 'unavailable');
    }
  });
}
