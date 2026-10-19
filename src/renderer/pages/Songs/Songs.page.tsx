import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Search } from 'lucide-react';
import type { CatalogQuery, Song } from '../../../shared/types';
import { unwrap } from '../../api';
import { usePlayer } from '../../player';
import { Empty, ErrorNotice, PageHeading } from '../../components/Shared';
import { FilterSelect } from '../../components/FilterSelect/FilterSelect.component';
import { songRows } from '../../components/TrackTable/TrackTable.component';
import { VirtualSongs } from './VirtualSongs.component';
import { useRetryFocus } from '../../useRetryFocus';
const PAGE_SIZE = 80;
export type SongsView = { search: string; query: CatalogQuery; selected: Map<string, Song> };
export const initialSongsView = (): SongsView => ({ search: '', query: { start: 0, limit: PAGE_SIZE, sort: 'dateAdded', descending: true, search: '' }, selected: new Map() });
export function SongsPage({ add, details, view, setView }: { view: SongsView; setView: React.Dispatch<React.SetStateAction<SongsView>>; add: (songs: Song[]) => void; details: (song: Song) => void }) {
  const player = usePlayer();
  const client = useQueryClient();
  const { search, query, selected } = view;
  const setSearch = (search: string) => setView(old => ({ ...old, search }));
  const setQuery = (update: (old: CatalogQuery) => CatalogQuery) => setView(old => ({ ...old, query: update(old.query) }));
  const setSelected = (selected: Map<string, Song>) => setView(old => ({ ...old, selected }));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => setView(old => old.query.search === search.trim() ? old : { ...old, query: { ...old.query, start: 0, search: search.trim() }, selected: new Map() }), 300); return () => clearTimeout(timer); }, [search, setView]);
  function change(next: Partial<CatalogQuery>) { setQuery(old => ({ ...old, ...next, start: 0 })); setSelected(new Map()); }
  const catalog = { search: query.search, genre: query.genre, tag: query.tag, sort: query.sort, descending: query.descending };
  const songs = useInfiniteQuery({
    queryKey: ['songs', 'infinite', catalog],
    queryFn: async ({ pageParam }) => unwrap(await window.wave.songs({ ...catalog, start: pageParam, limit: PAGE_SIZE })),
    initialPageParam: 0,
    getNextPageParam: last => last.items.length && last.start + last.items.length < last.total ? last.start + last.items.length : undefined,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
  const filters = useQuery({ queryKey: ['libraryFilters'], queryFn: async () => unwrap(await window.wave.libraryFilters()) });
  const ownerKey = JSON.stringify([catalog, search]);
  const target = () => resultsRef.current?.querySelector<HTMLElement>('tbody tr[data-track-index]') ?? headingRef.current;
  const filtersRetryFocus = useRetryFocus({ ownerKey: `${ownerKey}:filters`, target: () => songs.isError ? headingRef.current : target(), canFocusSuccess: () => filters.isSuccess && !filters.isFetching });
  const songsRetryFocus = useRetryFocus({ ownerKey: `${ownerKey}:songs`, target: () => filters.isError ? headingRef.current : target(), canFocusSuccess: () => songs.isSuccess && !songs.isFetching });
  const refreshInFlight = useRef(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const refreshing = refreshPending || songs.isFetching || filters.isFetching;
  async function refreshLibrary() {
    if (refreshing || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshPending(true);
    try { await client.invalidateQueries({ predicate: query => ['songs', 'song', 'libraryFilters', 'albums', 'album', 'albumTracks', 'playlists', 'playlist'].includes(String(query.queryKey[0])) }); }
    finally { refreshInFlight.current = false; setRefreshPending(false); }
  }
  const items = [...new Map(songs.data?.pages.flatMap(page => page.items).map(song => [song.id, song])).values()];
  return <><PageHeading headingRef={headingRef} title="All songs" subtitle="Your Jellyfin library"><div className="search-field"><Search size={17} /><input aria-label="Search songs, artists and albums" placeholder="Search your library" value={search} onChange={event => setSearch(event.target.value)} /></div></PageHeading>
    <div className="filter-bar">
      <FilterSelect label="Genre" value={query.genre ?? ''} emptyLabel="Any genre" choices={(filters.data?.genres ?? []).map(value => ({ value, label: value }))} onChange={genre => change({ genre: genre || undefined })} allowCustom loading={filters.isPending} />
      <FilterSelect label="Tag" value={query.tag ?? ''} emptyLabel="Any tag" choices={(filters.data?.tags ?? []).map(value => ({ value, label: value }))} onChange={tag => change({ tag: tag || undefined })} allowCustom loading={filters.isPending} />
      <FilterSelect label="Sort" value={query.sort ?? 'name'} choices={[{ value: 'dateAdded', label: 'Date added' }, { value: 'name', label: 'Title' }, { value: 'artist', label: 'Artist' }, { value: 'album', label: 'Album' }, { value: 'year', label: 'Year' }]} onChange={sort => change({ sort: sort as CatalogQuery['sort'], descending: sort === 'dateAdded' })} searchable={false} />
    <button aria-label={query.descending ? 'Sort ascending' : 'Sort descending'} onClick={() => change({ descending: !query.descending })}>{query.sort === 'dateAdded' ? (query.descending ? 'Newest first' : 'Oldest first') : (query.descending ? 'Z–A' : 'A–Z')}</button><button type="button" className="icon-button refresh-button" aria-label="Refresh library" aria-disabled={refreshing || undefined} aria-busy={refreshing} title="Refresh songs, filters, albums and playlists" onClick={() => void refreshLibrary()}><RefreshCw size={17} className={refreshing ? 'spinning' : ''} /></button></div>
    <ErrorNotice error={filters.error} retryRef={filtersRetryFocus.retryRef} retrying={filters.isFetching} retry={() => filtersRetryFocus.retry(() => filters.refetch())} />
    {!songs.isFetchNextPageError && <ErrorNotice key={`error:${JSON.stringify(catalog)}`} error={songs.error} retryRef={songsRetryFocus.retryRef} retrying={songs.isFetching} retry={() => songsRetryFocus.retry(() => songs.refetch())} />}
    {songs.isPending ? <div className="loading" role="status">Loading your songs…</div> : items.length ? <VirtualSongs key={JSON.stringify(catalog)} onResultsElement={node => { resultsRef.current = node; }} total={songs.data?.pages[0]?.total ?? items.length} hasNext={songs.hasNextPage} fetching={songs.isFetching} nextError={songs.isFetchNextPageError ? songs.error : null} loadNext={() => songs.fetchNextPage()} rows={songRows(items)} selected={selected} select={setSelected} play={player.play} queue={player.enqueue} add={add} details={details} currentId={player.current?.id} requestedPlaying={player.requestedPlaying} togglePlayback={player.toggle} /> : !songs.error && <Empty title={query.search || query.genre || query.tag ? 'No matching songs' : 'Your library is empty'}>{query.search || query.genre || query.tag ? 'Try another search or clear your filters.' : 'Add music in Jellyfin, then refresh your library.'}</Empty>}
  </>;
}
