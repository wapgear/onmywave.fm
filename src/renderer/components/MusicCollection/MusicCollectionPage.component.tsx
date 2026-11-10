import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Search } from 'iconoir-react/regular';
import { useEffect, useRef, useState } from 'react';

import { unwrap } from '../../api';
import { catalogInlineError } from '../../catalog';
import { usePlayer } from '../../player';
import { useRetryFocus } from '../../useRetryFocus';
import { CollectionHeading } from '../CollectionHeading/CollectionHeading.component';
import { CollectionPlaybackActions } from '../CollectionPlaybackActions/CollectionPlaybackActions.component';
import { Empty, ErrorNotice, PageHeading } from '../Shared';
import { songRows, TrackTable } from '../TrackTable/TrackTable.component';
import { useCollectionPlayback } from './hooks/useCollectionPlayback';
import type {
  CollectionItem,
  MusicCollectionPageProps,
  MusicCollectionView,
  MusicCollectionDetailProps,
} from './MusicCollection.types';
import { VirtualCollectionGrid } from './VirtualCollectionGrid.component';

import './MusicCollection.styles.css';

export const initialMusicCollectionView = <T extends CollectionItem>(): MusicCollectionView<T> => ({
  item: null,
  draft: '',
  selected: new Map(),
});

export function MusicCollectionPage<T extends CollectionItem>({
  add,
  details,
  view,
  setView,
  onOpenDetail,
  label,
  loadPage,
  loadTracks,
  loadMetadata,
  subtitle,
  detailSubtitle,
}: MusicCollectionPageProps<T>) {
  const { item, draft, selected } = view;
  const noun = `${label.toLowerCase()}s`;
  const title = `${label}s`;
  const client = useQueryClient();
  const [returnFocus, setReturnFocus] = useState<string | null>(null);
  const [search, setSearch] = useState(draft.trim());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft]);

  const catalog = useInfiniteQuery({
    queryKey: [noun, 'infinite', search],
    queryFn: ({ pageParam, signal }) => loadPage({ search, start: pageParam, limit: 48 }, signal, client),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.items.length && last.start + last.items.length < last.total ? last.start + last.items.length : undefined,
    enabled: !item,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  useEffect(() => {
    if (item) void client.cancelQueries({ queryKey: [noun, 'infinite', search], exact: true });
  }, [item, search, client, noun]);

  const retryFocus = useRetryFocus({
    ownerKey: `${noun}:${item?.id ?? 'browse'}:${search}`,
    target: () => resultsRef.current?.querySelector<HTMLElement>('[data-collection-id]') ?? headingRef.current,
    canFocusSuccess: () => catalog.isSuccess && !catalog.isFetching,
  });
  const items = [...new Map(catalog.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()];
  if (item)
    return (
      <MusicCollectionDetail
        key={item.id}
        item={item}
        label={label}
        loadTracks={loadTracks}
        loadMetadata={loadMetadata}
        subtitle={subtitle}
        detailSubtitle={detailSubtitle}
        selected={selected}
        select={(selected) => setView((old) => (old.item?.id === item.id ? { ...old, selected } : old))}
        back={() => {
          setReturnFocus(item.id);
          setView((old) => ({ ...old, item: null, selected: new Map() }));
        }}
        add={add}
        details={details}
      />
    );

  return (
    <>
      <PageHeading headingRef={headingRef} title={title}>
        <div className="search-field">
          <Search width={17} height={17} aria-hidden="true" />
          <input
            placeholder={`Search ${noun}`}
            aria-label={`Search ${noun}`}
            value={draft}
            onChange={(event) => setView((old) => ({ ...old, draft: event.target.value }))}
          />
        </div>
      </PageHeading>
      {!catalog.isFetchNextPageError && (
        <ErrorNotice
          key={`error:${search}`}
          error={catalogInlineError(catalog.error)}
          retryRef={retryFocus.retryRef}
          retrying={catalog.isFetching}
          retry={() => retryFocus.retry(() => catalog.refetch())}
        />
      )}
      {catalog.isPending ? (
        <p className="loading" role="status">
          Loading {noun}…
        </p>
      ) : items.length ? (
        <VirtualCollectionGrid
          onResultsElement={(node) => {
            resultsRef.current = node;
          }}
          key={search}
          items={items}
          label={label}
          subtitle={subtitle}
          total={catalog.data?.pages[0]?.total ?? items.length}
          hasNext={catalog.hasNextPage}
          fetching={catalog.isFetching}
          nextError={catalog.isFetchNextPageError ? catalog.error : null}
          loadNext={() => catalog.fetchNextPage()}
          returnFocus={returnFocus}
          focused={() => setReturnFocus(null)}
          open={(item, origin) => {
            onOpenDetail(item.id, origin);
            setView((old) => ({ ...old, item, selected: new Map() }));
          }}
        />
      ) : (
        !catalog.error && (
          <Empty title={search ? `No matching ${noun}` : `No ${noun} yet`}>
            {search
              ? label === 'Album'
                ? 'Try a different album title or artist.'
                : 'Try a different artist name.'
              : `${title} from your selected Jellyfin libraries will appear here.`}
          </Empty>
        )
      )}
    </>
  );
}

function MusicCollectionDetail<T extends CollectionItem>({
  item,
  selected,
  select,
  back,
  add,
  details,
  label,
  loadTracks,
  loadMetadata,
  subtitle,
  detailSubtitle,
}: MusicCollectionDetailProps<T>) {
  const kind = label === 'Album' ? 'album' : 'artist';
  const backRef = useRef<HTMLButtonElement>(null);
  const detail = useQuery({
    queryKey: [kind, item.id],
    queryFn: async () => (loadMetadata ? unwrap(await loadMetadata(item.id)) : item),
  });
  const metadata = detail.data ?? item;
  const tracks = useQuery({
    queryKey: [`${kind}Tracks`, item.id],
    queryFn: async () => unwrap(await loadTracks(item.id)),
  });
  const detailRetryFocus = useRetryFocus({
    ownerKey: `${kind}:${item.id}:metadata`,
    target: () => backRef.current,
    canFocusSuccess: () => detail.isSuccess && !detail.isFetching,
  });
  const tracksRetryFocus = useRetryFocus({
    ownerKey: `${kind}:${item.id}:tracks`,
    target: () => backRef.current,
    canFocusSuccess: () => tracks.isSuccess && !tracks.isFetching,
  });
  const player = usePlayer();
  const playback = useCollectionPlayback(kind, item.id, tracks.data ?? []);

  return (
    <>
      <div className="collection-navigation">
        <button ref={backRef} aria-label={`Back to ${kind}s`} className="back-button" onClick={back}>
          <ArrowLeft width={17} height={17} aria-hidden="true" />
          {label}s
        </button>
        <label className="collection-mix">
          <span className="collection-mix-copy">
            <span>Mix with your library</span>
            <small>{playback.mixWithLibrary ? 'Repeat all can include other songs' : `Play only this ${kind}`}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Mix with your library"
            aria-checked={playback.mixWithLibrary}
            checked={playback.mixWithLibrary}
            disabled={!tracks.data?.length}
            onChange={(event) => playback.changeMix(event.target.checked)}
          />
        </label>
      </div>
      <CollectionHeading
        artwork={metadata.imageUrl}
        eyebrow={label}
        title={metadata.name}
        subtitle={detailSubtitle ? detailSubtitle(metadata) : subtitle?.(metadata)}
      >
        <CollectionPlaybackActions
          playLabel={`Play ${kind}`}
          disabled={!tracks.data?.length}
          onPlay={() => playback.play(tracks.data!)}
          onPlayNext={() => player.playNext(tracks.data!)}
          onEnqueue={() => player.enqueue(tracks.data!)}
        />
        <button disabled={!tracks.data?.length} onClick={() => add(tracks.data!)}>
          <Plus width={17} height={17} aria-hidden="true" />
          Add to playlist
        </button>
      </CollectionHeading>
      <ErrorNotice
        error={catalogInlineError(detail.error)}
        retryRef={detailRetryFocus.retryRef}
        retrying={detail.isFetching}
        retry={() => detailRetryFocus.retry(() => detail.refetch())}
      />
      <ErrorNotice
        error={catalogInlineError(tracks.error)}
        retryRef={tracksRetryFocus.retryRef}
        retrying={tracks.isFetching}
        retry={() => tracksRetryFocus.retry(() => tracks.refetch())}
      />
      {tracks.isPending ? (
        <p className="loading" role="status">
          Loading {kind} tracks…
        </p>
      ) : tracks.data?.length ? (
        <TrackTable
          rows={songRows(tracks.data)}
          selected={selected}
          select={select}
          play={playback.play}
          playNext={player.playNext}
          enqueue={player.enqueue}
          add={add}
          details={details}
          currentId={player.current?.id}
          requestedPlaying={player.requestedPlaying}
          togglePlayback={playback.toggle}
        />
      ) : (
        !tracks.error && <Empty title="No tracks available">This {kind} has no accessible music tracks.</Empty>
      )}
    </>
  );
}
