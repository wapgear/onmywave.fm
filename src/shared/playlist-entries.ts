import type { PlaylistEntry } from './types';

export function playlistEntryIdentity(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) return null;
  return /^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value)
    ? value.replaceAll('-', '').toLowerCase() : value;
}

export function editablePlaylistEntryIds(entries: readonly PlaylistEntry[]): Set<string> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const identity = playlistEntryIdentity(entry.entryId);
    if (identity !== null) counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return new Set(entries.filter(entry => {
    const identity = playlistEntryIdentity(entry.entryId);
    return identity !== null && counts.get(identity) === 1;
  }).map(entry => entry.entryId));
}
