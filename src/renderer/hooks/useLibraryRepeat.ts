import { useCallback, useLayoutEffect, useRef } from 'react';

import type { Song } from '../../shared/types';
import { readCatalog } from '../catalog';
import type { LibraryRepeatState } from './useLibraryRepeat.types';

const PAGE_SIZE = 500;

// Match the persisted playback queue limit.
const MAX_TRACKS = 100_000;

function abortError(): DOMException {
  return new DOMException('Library load was superseded.', 'AbortError');
}

/** Load and cache the full unfiltered catalog for one active connection. */
export function useLibraryRepeat(connectionId: string | null, enabled: boolean) {
  const state = useRef<LibraryRepeatState>({
    connectionId,
    enabled,
    generation: 0,
    cache: null,
    flight: null,
    controller: null,
  });

  useLayoutEffect(() => {
    const current = state.current;
    if (current.connectionId !== connectionId || current.enabled !== enabled) {
      current.controller?.abort();
      current.controller = null;
      current.connectionId = connectionId;
      current.enabled = enabled;
      current.generation += 1;
      current.cache = null;
      current.flight = null;
    }
    const generation = current.generation;
    return () => {
      if (current.generation === generation) {
        current.controller?.abort();
        current.controller = null;
        current.generation += 1;
        current.cache = null;
        current.flight = null;
      }
    };
  }, [connectionId, enabled]);

  const load = useCallback((): Promise<Song[]> => {
    const current = state.current;
    if (!current.enabled || !current.connectionId) return Promise.reject(abortError());
    if (current.cache) return Promise.resolve(current.cache);
    if (current.flight) return current.flight;

    const generation = current.generation;
    const controller = new AbortController();
    current.controller = controller;
    const activeConnectionId = current.connectionId;
    const isCurrent = () =>
      state.current.generation === generation &&
      state.current.connectionId === activeConnectionId &&
      state.current.enabled;
    const flight = (async () => {
      const songs = new Map<string, Song>();
      let start = 0;
      let total: number | null = null;

      while (total === null || start < total) {
        if (!isCurrent()) throw abortError();
        const page = await readCatalog(
          window.wave.songs,
          { start, limit: PAGE_SIZE, sort: 'name', descending: false },
          controller.signal,
        );
        if (!isCurrent()) throw abortError();
        if (
          page.start !== start ||
          !Number.isSafeInteger(page.total) ||
          page.total < 0 ||
          (total !== null && page.total !== total)
        )
          throw new Error('The library changed while it was loading. Retry to continue.');
        total ??= page.total;
        if (total > MAX_TRACKS) throw new Error('This library is too large to repeat as one collection.');
        if (!page.items.length && start < total)
          throw new Error('The library stopped loading before all tracks were received. Retry to continue.');
        for (const song of page.items) songs.set(song.id, song);
        if (songs.size > MAX_TRACKS) throw new Error('This library is too large to repeat as one collection.');
        start += page.items.length;
      }

      if (!isCurrent()) throw abortError();
      const result = [...songs.values()];
      state.current.cache = result;
      return result;
    })();
    current.flight = flight;
    void flight.then(
      () => {
        if (state.current.generation === generation) state.current.controller = null;
      },
      () => {
        if (state.current.generation === generation) {
          state.current.flight = null;
          state.current.controller = null;
        }
      },
    );
    return flight;
  }, []);

  return { load };
}
