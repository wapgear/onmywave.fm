import { useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';

import type { Connection, Page, PlaylistDetail, Song, SongRemovalStatus } from '../../../../shared/types';
import { unwrap } from '../../../api';

const catalogKeys = ['songs', 'song', 'albumTracks', 'artistTracks', 'playlist'];

const identity = (id: string) => id.replaceAll('-', '').toLowerCase();

const affected = {
  predicate: (query: { queryKey: readonly unknown[] }) => catalogKeys.includes(String(query.queryKey[0])),
};

function hideSong(client: QueryClient, songId: string) {
  const keep = (song: Song) => identity(song.id) !== songId;
  for (const query of client.getQueryCache().findAll(affected)) {
    const key = query.queryKey;
    if (key[0] === 'songs') {
      client.setQueryData<InfiniteData<Page<Song>>>(key, (data) => {
        if (!data) return data;
        const count = data.pages.some((page) => page.items.some((song) => !keep(song))) ? 1 : 0;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter(keep),
            total: Math.max(0, page.total - count),
          })),
        };
      });
    } else if (key[0] === 'albumTracks' || key[0] === 'artistTracks')
      client.setQueryData<Song[]>(key, (songs) => songs?.filter(keep));
    else if (key[0] === 'playlist')
      client.setQueryData<PlaylistDetail>(
        key,
        (playlist) => playlist && { ...playlist, entries: playlist.entries.filter((entry) => keep(entry.song)) },
      );
  }
}

export function useSongRemovalStatus() {
  const client = useQueryClient();
  return useQuery({
    queryKey: ['songRemovals'],
    queryFn: async () => {
      const connection = client.getQueryData<Connection>(['connection']);
      const result = unwrap(await window.wave.removedSongs());
      if (client.getQueryData<Connection>(['connection'])?.authRevision !== connection?.authRevision)
        throw new Error('The connection changed.');
      const previous = new Set(
        client.getQueryData<SongRemovalStatus>(['songRemovals'])?.songs.map((song) => song.songId),
      );
      const imported = result.songs.filter((song) => !previous.has(song.songId));
      if (imported.length) {
        await client.cancelQueries(affected);
        if (client.getQueryData<Connection>(['connection'])?.authRevision !== connection?.authRevision)
          throw new Error('The connection changed.');
        imported.forEach((song) => hideSong(client, song.songId));
        void client.invalidateQueries(affected);
      }
      return result;
    },
    refetchInterval: 60_000,
  });
}

export function useSongRemoval() {
  const client = useQueryClient();
  const removal = useMutation({
    mutationKey: ['removeSong'],
    mutationFn: async (id: string) => {
      const connection = client.getQueryData<Connection>(['connection']);
      return { record: unwrap(await window.wave.removeSong(id)), connection };
    },
    onSuccess: async ({ record, connection }) => {
      if (client.getQueryData<Connection>(['connection'])?.authRevision !== connection?.authRevision) return;
      await client.cancelQueries({ queryKey: ['songRemovals'] });
      await client.cancelQueries(affected);
      if (client.getQueryData<Connection>(['connection'])?.authRevision !== connection?.authRevision) return;
      client.setQueryData<SongRemovalStatus>(['songRemovals'], (old) => {
        const songs = [...(old?.songs.filter((song) => song.songId !== record.songId) ?? []), record];
        return { songs, pending: songs.filter((song) => song.purgeAfter === null).length };
      });
      hideSong(client, record.songId);
      void client.invalidateQueries(affected);
      void client.invalidateQueries({ queryKey: ['songRemovals'] });
    },
  });
  return removal;
}
