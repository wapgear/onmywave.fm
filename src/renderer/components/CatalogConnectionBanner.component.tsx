import { useIsFetching, useQueryClient, type Query } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

import type { PageName } from '../App.types';
import { isCatalogConnectionError } from '../catalog';
import { useRetryFocus } from '../useRetryFocus';
import { ErrorNotice } from './Shared';

const catalogQueries: Partial<Record<PageName, readonly string[]>> = {
  songs: ['songs', 'libraryFilters'],
  artists: ['artists', 'artist', 'artistTracks'],
  albums: ['albums', 'album', 'albumTracks'],
  playlists: ['playlists', 'playlist'],
};

export function CatalogConnectionBanner({
  page,
  location,
  focusTarget,
}: {
  page: PageName | null;
  location: string;
  focusTarget: () => HTMLElement | null;
}) {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const keys = page && catalogQueries[page];
  const isPageQuery = (query: Query) => !!keys?.includes(String(query.queryKey[0]));
  const failedQueries = {
    type: 'active' as const,
    predicate: (query: Query) =>
      isPageQuery(query) && !query.state.fetchMeta?.fetchMore && isCatalogConnectionError(query.state.error),
  };

  const subscribe = useCallback((notify: () => void) => cache.subscribe(notify), [cache]);

  const getError = () => cache.findAll(failedQueries)[0]?.state.error ?? null;
  const error = useSyncExternalStore(subscribe, getError);
  const retrying = useIsFetching({ type: 'active', predicate: isPageQuery }) > 0;
  const retryFocus = useRetryFocus({
    ownerKey: location,
    target: focusTarget,
    canFocusSuccess: () => !error && !retrying,
  });

  return (
    <ErrorNotice
      header
      error={error}
      retryRef={retryFocus.retryRef}
      retrying={retrying}
      retry={() =>
        retryFocus.retry(async () => {
          await client.refetchQueries(failedQueries, { cancelRefetch: false });
          return { isError: !!getError() };
        })
      }
    />
  );
}
