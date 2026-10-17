import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ListPlus, Play, Plus, Search } from 'lucide-react';
import type { Album, Song } from '../../../shared/types';
import { unwrap } from '../../api';
import { usePlayer } from '../../player';
import { Empty, ErrorNotice, PageHeading } from '../../components/Shared';
import { CollectionHeading } from '../../components/CollectionHeading/CollectionHeading.component';
import { songRows, TrackTable } from '../../components/TrackTable/TrackTable.component';
import { VirtualAlbums } from './VirtualAlbums.component';
import { useRetryFocus } from '../../useRetryFocus';
export type AlbumsView = { album: Album | null; draft: string; selected: Map<string, Song> };
export const initialAlbumsView = (): AlbumsView => ({ album: null, draft: '', selected: new Map() });
export function AlbumsPage({ add, details, view, setView, onOpenDetail }: { onOpenDetail: (id: string, origin: HTMLButtonElement) => void; view: AlbumsView; setView: React.Dispatch<React.SetStateAction<AlbumsView>>; add: (songs: Song[]) => void; details: (song: Song) => void }) {
  const { album, draft, selected } = view;
  const [returnFocus, setReturnFocus] = useState<string | null>(null);
  const [search, setSearch] = useState(draft.trim());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  useEffect(() => { const timer = setTimeout(() => setSearch(draft.trim()), 300); return () => clearTimeout(timer); }, [draft]);
  const albums = useInfiniteQuery({
    queryKey: ['albums', 'infinite', search],
    queryFn: async ({ pageParam }) => unwrap(await window.wave.albums({ search, start: pageParam, limit: 48 })),
    initialPageParam: 0,
    getNextPageParam: last => last.items.length && last.start + last.items.length < last.total ? last.start + last.items.length : undefined,
    enabled: !album,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
  const retryFocus = useRetryFocus({ ownerKey: `albums:${album?.id ?? 'browse'}:${search}`, target: () => resultsRef.current?.querySelector<HTMLElement>('[data-album-id]') ?? headingRef.current, canFocusSuccess: () => albums.isSuccess && !albums.isFetching });
  const items = [...new Map(albums.data?.pages.flatMap(page => page.items).map(item => [item.id, item])).values()];
  if (album) return <AlbumDetail key={album.id} album={album} selected={selected} select={selected => setView(old => old.album?.id === album.id ? { ...old, selected } : old)} back={() => { setReturnFocus(album.id); setView(old => ({ ...old, album: null, selected: new Map() })); }} add={add} details={details} />;
  return <><PageHeading headingRef={headingRef} title="Albums" subtitle="A closer listen"><div className="search-field"><Search size={17} /><input placeholder="Search albums" aria-label="Search albums" value={draft} onChange={event => setView(old => ({ ...old, draft: event.target.value }))} /></div></PageHeading>
    {!albums.isFetchNextPageError && <ErrorNotice key={`error:${search}`} error={albums.error} retryRef={retryFocus.retryRef} retrying={albums.isFetching} retry={() => retryFocus.retry(() => albums.refetch())} />}
    {albums.isPending ? <p className="loading" role="status">Loading albums…</p> : items.length ? <VirtualAlbums onResultsElement={node => { resultsRef.current = node; }} key={search} albums={items} total={albums.data?.pages[0]?.total ?? items.length} hasNext={albums.hasNextPage} fetching={albums.isFetching} nextError={albums.isFetchNextPageError ? albums.error : null} loadNext={() => albums.fetchNextPage()} returnFocus={returnFocus} focused={() => setReturnFocus(null)} open={(item, origin) => { onOpenDetail(item.id, origin); setView(old => ({ ...old, album: item, selected: new Map() })); }} /> : !albums.error && <Empty title={search ? 'No matching albums' : 'No albums yet'}>{search ? 'Try a different album title or artist.' : 'Albums from your selected Jellyfin libraries will appear here.'}</Empty>}
  </>;
}
function AlbumDetail({ album, selected, select, back, add, details }: { album: Album; selected: Map<string, Song>; select: (selected: Map<string, Song>) => void; back: () => void; add: (songs: Song[]) => void; details: (song: Song) => void }) {
  const backRef = useRef<HTMLButtonElement>(null);
  const detail = useQuery({ queryKey: ['album', album.id], queryFn: async () => unwrap(await window.wave.album(album.id)) });
  const metadata = detail.data ?? album;
  const tracks = useQuery({ queryKey: ['albumTracks', album.id], queryFn: async () => unwrap(await window.wave.albumTracks(album.id)) });
  const detailRetryFocus = useRetryFocus({ ownerKey: `album:${album.id}:metadata`, target: () => backRef.current, canFocusSuccess: () => detail.isSuccess && !detail.isFetching });
  const tracksRetryFocus = useRetryFocus({ ownerKey: `album:${album.id}:tracks`, target: () => backRef.current, canFocusSuccess: () => tracks.isSuccess && !tracks.isFetching });
  const player = usePlayer();
  return <><button ref={backRef} aria-label="Back to albums" className="back-button" onClick={back}><ArrowLeft size={17} />Albums</button><CollectionHeading artwork={metadata.imageUrl} eyebrow="Album" title={metadata.name} subtitle={<>{metadata.artist || 'Unknown artist'}{metadata.year ? ` · ${metadata.year}` : ''}</>}><button className="primary" disabled={!tracks.data?.length} onClick={() => player.play(tracks.data!)}><Play size={16} fill="currentColor" />Play album</button><button disabled={!tracks.data?.length} onClick={() => player.enqueue(tracks.data!)}><ListPlus size={17} />Queue</button><button disabled={!tracks.data?.length} onClick={() => add(tracks.data!)}><Plus size={17} />Add to playlist</button></CollectionHeading><ErrorNotice error={detail.error} retryRef={detailRetryFocus.retryRef} retrying={detail.isFetching} retry={() => detailRetryFocus.retry(() => detail.refetch())} /><ErrorNotice error={tracks.error} retryRef={tracksRetryFocus.retryRef} retrying={tracks.isFetching} retry={() => tracksRetryFocus.retry(() => tracks.refetch())} />
    {tracks.isPending ? <p className="loading" role="status">Loading album tracks…</p> : tracks.data?.length ? <TrackTable rows={songRows(tracks.data)} selected={selected} select={select} play={player.play} queue={player.enqueue} add={add} details={details} currentId={player.current?.id} /> : !tracks.error && <Empty title="No tracks available">This album has no accessible music tracks.</Empty>}
  </>;
}
