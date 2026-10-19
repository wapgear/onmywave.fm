import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useIsFetching, useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ListMusic, ListPlus, LockKeyhole, Pencil, Play, Plus } from 'lucide-react';
import type { PlaylistEditRecovery, PlaylistLibrary, Song } from '../../../shared/types';
import { unwrap, WaveError } from '../../api';
import { usePlayer } from '../../player';
import { Artwork, Dialog, Empty, ErrorNotice, PageHeading } from '../../components/Shared';
import { CollectionHeading } from '../../components/CollectionHeading/CollectionHeading.component';
import { playlistRows, TrackTable } from '../../components/TrackTable/TrackTable.component';
import { useRetryFocus } from '../../useRetryFocus';
type PlaylistEdit = { pending: boolean; error: unknown; needsReview: boolean; reviewReady: boolean };
const emptyEdit: PlaylistEdit = { pending: false, error: null, needsReview: false, reviewReady: false };
export function usePlaylistRecovery() {
  const active = useRef(true);
  const records = useRef<Record<string, PlaylistEdit>>({});
  const [edits, setEdits] = useState<Record<string, PlaylistEdit>>({});
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const update = useCallback((id: string, patch: Partial<PlaylistEdit>) => {
    if (!active.current) return;
    records.current = { ...records.current, [id]: { ...emptyEdit, ...records.current[id], ...patch } };
    setEdits(records.current);
  }, []);
  return { edits, update, isCurrent: () => active.current, begin: (id: string) => {
    const edit = records.current[id];
    if (!active.current || edit?.pending || edit?.needsReview) return false;
    update(id, { pending: true, error: null });
    return true;
  } };
}
type PlaylistRecovery = ReturnType<typeof usePlaylistRecovery>;
export function PlaylistsPage({ add, details, id, setId, recovery, onOpenDetail, onCreateDetail, onReturnFromDetail }: { onReturnFromDetail: (id: string, origin: HTMLButtonElement) => void; onOpenDetail: (id: string, origin: HTMLButtonElement) => void; onCreateDetail: (id: string, origin: HTMLElement | null) => void; recovery: PlaylistRecovery; id: string | null; setId: (id: string | null) => void; add: (songs: Song[]) => void; details: (song: Song) => void }) {
  const [creating, setCreating] = useState(false);
  const [creationActionPending, setCreationActionPending] = useState<'refresh' | 'ack' | null>(null);
  const creationActionBusy = useRef(false);
  const client = useQueryClient();
  const accountId = client.getQueryData<{ id: string } | null>(['connection'])?.id ?? 'signed-out';
  const creationAcknowledgeKey = ['playlistCreationAcknowledge', accountId] as const;
  const creationAcknowledgePending = useIsMutating({ mutationKey: creationAcknowledgeKey, exact: true }) > 0;
  const playlists = useQuery({ queryKey: ['playlists'], queryFn: async () => unwrap(await window.wave.playlists()) });
  const creation = playlists.data?.creationRecovery;
  const heading = useRef<HTMLHeadingElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const newPlaylist = useRef<HTMLButtonElement>(null);
  const creationReviewButton = useRef<HTMLButtonElement>(null);
  const creationAcknowledgeButton = useRef<HTMLButtonElement>(null);
  const listTarget = () => {
    const firstPlaylist = results.current?.querySelector<HTMLButtonElement>('.playlist-tile');
    if (firstPlaylist) return firstPlaylist;
    if (creation?.status === 'review' && creationReviewButton.current && !creationReviewButton.current.matches(':disabled')) return creationReviewButton.current;
    return newPlaylist.current && !newPlaylist.current.matches(':disabled') ? newPlaylist.current : heading.current;
  };
  const creationRetryFocus = useRetryFocus({
    ownerKey: `playlists:creation-recovery:${id ?? 'browse'}`,
    target: () => listTarget(),
    canFocusSuccess: () => !playlists.isError && !playlists.isFetching && creation?.status !== 'unavailable',
  });
  const listRetryFocus = useRetryFocus({
    ownerKey: `playlists:list:${id ?? 'browse'}`,
    target: () => {
      const recoveryRetry = creationRetryFocus.retryRef.current;
      return creation?.status === 'unavailable' && recoveryRetry && !recoveryRetry.matches(':disabled') ? recoveryRetry : listTarget();
    },
    canFocusSuccess: () => !playlists.isError && !playlists.isFetching,
  });
  const { retryFrom: retryCreationAction } = useRetryFocus({
    ownerKey: 'playlists:creation-actions',
    target: () => listTarget(),
    canFocusSuccess: () => !playlists.isError && !playlists.isFetching,
  });
  const creationBlocked = !!creation || playlists.isPending || playlists.isFetching || !!playlists.error;
  const acknowledgeCreation = useMutation({ mutationKey: creationAcknowledgeKey, mutationFn: async (recovery: { markerId: string; receipt: string }) => {
    unwrap(await window.wave.acknowledgePlaylistCreation(recovery));
  }, onSuccess: async () => { if (recovery.isCurrent()) await playlists.refetch(); } });
  if (id) return <PlaylistDetail key={id} id={id} listError={playlists.error} recovery={recovery} back={origin => { onReturnFromDetail(id, origin); setId(null); }} add={add} details={details} />;
  return <><PageHeading title="Playlists" subtitle="Your collections, on every Jellyfin client" headingRef={heading}><button ref={newPlaylist} className="primary" disabled={creationBlocked} onClick={() => setCreating(true)}><Plus size={17} />New playlist</button></PageHeading>
    <ErrorNotice key="playlists:list-error" error={playlists.error} retryRef={listRetryFocus.retryRef} retrying={playlists.isFetching} retry={() => listRetryFocus.retry(() => playlists.refetch())} />
    <ErrorNotice error={acknowledgeCreation.error} />
    {creation?.status === 'unavailable' && <ErrorNotice key="playlists:creation-error" error={new Error('Playlist creation recovery is unavailable. You can still open and play your playlists. Refresh before creating another.')} retryRef={creationRetryFocus.retryRef} retrying={playlists.isFetching} retry={() => creationRetryFocus.retry(async () => {
      const result = await playlists.refetch();
      return { isError: result.isError || result.data?.creationRecovery?.status === 'unavailable' };
    })} />}
    {(creation?.status === 'review' || creation?.status === 'pending') && <div className="notice playlist-recovery"><span role="status">A playlist may already have been created. Review your refreshed playlists before creating another.</span><button ref={creationReviewButton} aria-disabled={!!creationActionPending || creation.status === 'pending' || playlists.isFetching || creationAcknowledgePending || undefined} aria-busy={creationActionPending === 'refresh' || playlists.isFetching || undefined} onClick={() => {
      if (creationActionBusy.current || creation.status === 'pending' || playlists.isFetching || creationAcknowledgePending) return;
      creationActionBusy.current = true;
      setCreationActionPending('refresh');
      void retryCreationAction(creationReviewButton.current, async () => {
        const result = await playlists.refetch();
        return { isError: result.isError || result.data?.creationRecovery?.status === 'unavailable' };
      }, () => {
        const current = client.getQueryData<PlaylistLibrary>(['playlists'])?.creationRecovery;
        if (current?.status === 'unavailable') return creationRetryFocus.retryRef.current;
        return current?.status === 'review' ? creationReviewButton.current : listTarget();
      }, () => {
        creationActionBusy.current = false;
        setCreationActionPending(null);
      }, () => {
        const current = client.getQueryData<PlaylistLibrary>(['playlists'])?.creationRecovery;
        if (current?.status === 'unavailable') return creationRetryFocus.retryRef.current;
        if (current?.status === 'pending') return listTarget();
        return creationReviewButton.current;
      });
    }}>{creationActionPending === 'refresh' || playlists.isFetching ? 'Refreshing…' : 'Refresh playlists'}</button><button ref={creationAcknowledgeButton} aria-disabled={!!creationActionPending || creation.status !== 'review' || !creation.receipt || playlists.isFetching || !!playlists.error || creationAcknowledgePending || undefined} aria-busy={creationActionPending === 'ack' || creationAcknowledgePending || undefined} onClick={() => {
      if (creationActionBusy.current || creation.status !== 'review' || !creation.receipt || playlists.isFetching || playlists.error || creationAcknowledgePending) return;
      const markerId = creation.markerId;
      const receipt = creation.receipt;
      creationActionBusy.current = true;
      setCreationActionPending('ack');
      void retryCreationAction(creationAcknowledgeButton.current, async () => {
        await acknowledgeCreation.mutateAsync({ markerId, receipt });
        const current = client.getQueryData<PlaylistLibrary>(['playlists']);
        return { isError: !!current?.creationRecovery };
      }, () => listTarget(), () => {
        creationActionBusy.current = false;
        setCreationActionPending(null);
      }, () => {
        const current = client.getQueryData<PlaylistLibrary>(['playlists'])?.creationRecovery;
        if (current?.status === 'review' && current.markerId === markerId && current.receipt === receipt && creationAcknowledgeButton.current?.isConnected) return creationAcknowledgeButton.current;
        if (current?.status === 'unavailable') return creationRetryFocus.retryRef.current;
        return current?.status === 'review' ? creationReviewButton.current : listTarget();
      });
    }}>{creationActionPending === 'ack' || creationAcknowledgePending ? 'Confirming…' : 'I checked my playlists'}</button></div>}
    {playlists.isPending ? <p className="loading" role="status">Loading playlists…</p> : playlists.data?.items.length ? <div className="playlist-grid" ref={results}>{playlists.data.items.map(item => <button className="playlist-tile" data-playlist-id={item.id} key={item.id} onClick={event => { onOpenDetail(item.id, event.currentTarget); setId(item.id); }}><Artwork url={item.imageUrl} name={item.name} /><div><strong>{item.name}</strong><span><ListMusic size={14} />{item.songCount === undefined ? 'Playlist' : `${item.songCount} songs`}</span>{item.recoveryStatus && <span>{item.recoveryStatus === 'pending' ? 'Saving changes…' : item.recoveryStatus === 'review' ? 'Review needed' : 'Editing unavailable'}</span>}</div></button>)}</div> : !playlists.error && <Empty title="Make room for your favorites">Create a playlist, then add songs from your library.</Empty>}
    {creating && <PlaylistNameDialog title="New playlist" initial="" close={() => setCreating(false)} save={async name => { const value = unwrap(await window.wave.createPlaylist({ name, trackIds: [] })); if (!recovery.isCurrent()) return; await client.invalidateQueries({ queryKey: ['playlists'] }); return recovery.isCurrent() ? value.id : undefined; }} created={(createdId, origin) => { onCreateDetail(createdId, origin); setCreating(false); setId(createdId); }} />}
  </>;
}
function PlaylistDetail({ id, listError, back, add, details, recovery }: { recovery: PlaylistRecovery; id: string; listError: unknown; back: (origin: HTMLButtonElement) => void; add: (songs: Song[]) => void; details: (song: Song) => void }) {
  const client = useQueryClient();
  const player = usePlayer();
  const accountId = client.getQueryData<{ id: string } | null>(['connection'])?.id ?? 'signed-out';
  const recoveryAcknowledgeKey = ['playlistRecoveryAcknowledge', accountId, id] as const;
  const recoveryAcknowledgePending = useIsMutating({ mutationKey: recoveryAcknowledgeKey, exact: true }) > 0;
  const playlist = useQuery({ queryKey: ['playlist', id], queryFn: async () => unwrap(await window.wave.playlist(id)) });
  const backButton = useRef<HTMLButtonElement>(null);
  const reviewRefreshButton = useRef<HTMLButtonElement>(null);
  const reviewAcknowledgeButton = useRef<HTMLButtonElement>(null);
  const [reviewActionPending, setReviewActionPending] = useState<'refresh' | 'ack' | null>(null);
  const reviewActionBusy = useRef(false);
  const [selected, setSelected] = useState<Map<string, Song>>(new Map());
  const listFetching = useIsFetching({ queryKey: ['playlists'] }) > 0;
  const entries = playlist.data?.entries;
  const rows = useMemo(() => playlistRows(entries ?? []), [entries]);
  const [selectionEntries, setSelectionEntries] = useState(entries);
  if (selectionEntries !== entries) {
    const stableKeys = new Set(rows.filter(row => row.editable).map(row => row.key));
    setSelectionEntries(entries);
    setSelected(current => {
      const kept = new Map([...current].filter(([key]) => stableKeys.has(key)));
      return kept.size === current.size ? current : kept;
    });
  }
  const [renaming, setRenaming] = useState(false);
  const edit = recovery.edits[id] ?? emptyEdit;
  const editRecoveryRef = useRef(edit);
  useLayoutEffect(() => { editRecoveryRef.current = edit; }, [edit]);
  const durable = playlist.data?.editRecovery;
  const detailRetryFocus = useRetryFocus({
    ownerKey: `playlist:${id}:reads`,
    target: () => backButton.current,
    canFocusSuccess: () => readsSucceeded() && durable?.status !== 'unavailable',
  });
  const recoveryRetryFocus = useRetryFocus({
    ownerKey: `playlist:${id}:edit-recovery`,
    target: () => backButton.current,
    canFocusSuccess: () => readsSucceeded() && durable?.status !== 'unavailable',
  });
  const needsReview = edit.needsReview || durable?.status === 'pending' || durable?.status === 'review';
  const reviewReady = durable ? durable.status === 'review' && !!durable.receipt : edit.reviewReady;
  const { retryFrom: retryReviewAction } = useRetryFocus({
    ownerKey: `playlist:${id}:recovery-actions`,
    target: () => backButton.current,
    canFocusSuccess: () => readsSucceeded() && client.getQueryData<{ editRecovery?: PlaylistEditRecovery }>(['playlist', id])?.editRecovery?.status !== 'unavailable',
  });
  const { retryFrom: retryRemoval } = useRetryFocus({
    ownerKey: `playlist:${id}:entry-removal`,
    target: () => backButton.current,
    canFocusSuccess: () => recovery.isCurrent(),
  });
  const change = useMutation({ mutationFn: async (action: { type: 'remove'; entryId: string } | { type: 'move'; entryId: string; index: number }) => {
    if (action.type === 'remove') return unwrap(await window.wave.removePlaylistEntries({ id, entryIds: [action.entryId] }));
    return unwrap(await window.wave.movePlaylistEntry({ id, entryId: action.entryId, index: action.index }));
  }, onSuccess: async (_, action) => {
    if (!recovery.isCurrent()) return;
    if (action.type === 'remove') setSelected(old => { const next = new Map(old); next.delete(action.entryId); return next; });
    await refresh();
    recovery.update(id, { pending: false, error: null });
  }, onError: async error => {
    if (!recovery.isCurrent()) return;
    const uncertain = error instanceof WaveError && error.code === 'uncertain-write';
    recovery.update(id, { error, needsReview: uncertain, reviewReady: false });
    const refreshed = await refresh();
    recovery.update(id, { pending: false, reviewReady: uncertain && refreshed });
  } });
  function readsSucceeded() {
    const detailState = client.getQueryState(['playlist', id]);
    const listState = client.getQueryState(['playlists']);
    return !!detailState && detailState.status === 'success' && detailState.fetchStatus === 'idle' && detailState.error === null
      && !!listState && listState.status === 'success' && listState.fetchStatus === 'idle' && listState.error === null;
  }
  async function refresh() {
    if (!recovery.isCurrent()) return false;
    const [detailResult] = await Promise.all([playlist.refetch(), client.invalidateQueries({ queryKey: ['playlists'], exact: true })]);
    return recovery.isCurrent() && detailResult.isSuccess && readsSucceeded();
  }
  const retryReads = async () => {
    const readsReady = await refresh();
    if (edit.needsReview && recovery.isCurrent()) recovery.update(id, { reviewReady: readsReady });
    const currentRecovery = client.getQueryData<{ editRecovery?: PlaylistEditRecovery }>(['playlist', id])?.editRecovery;
    return { isError: !readsReady || currentRecovery?.status === 'unavailable' };
  };
  const acknowledge = useMutation({ mutationKey: recoveryAcknowledgeKey, mutationFn: async (receipt: { markerId?: string; receipt?: string }) => {
    if (receipt.markerId || receipt.receipt) {
      const current = client.getQueryData<{ editRecovery?: PlaylistEditRecovery }>(['playlist', id])?.editRecovery;
      if (!receipt.markerId || !receipt.receipt || current?.status !== 'review' || current.markerId !== receipt.markerId || current.receipt !== receipt.receipt) {
        throw new Error('Refresh this playlist and check its current order before confirming.');
      }
      unwrap(await window.wave.acknowledgePlaylistRecovery({ id, markerId: receipt.markerId, receipt: receipt.receipt }));
    }
  }, onSuccess: async () => {
    if (!recovery.isCurrent()) return;
    recovery.update(id, { needsReview: false, reviewReady: false, error: null });
    await refresh();
  }, onError: error => { if (recovery.isCurrent()) recovery.update(id, { error }); } });
  function focusEntryAction(key: string) {
    const row = [...document.querySelectorAll<HTMLElement>('.song-table [data-track-key]')].find(candidate => candidate.dataset.trackKey === key);
    return row?.querySelector<HTMLButtonElement>('.track-menu-trigger') ?? null;
  }
  function removalFallback(source: HTMLButtonElement | null, order: string[], removedKey: string) {
    if (source?.isConnected) return source;
    const index = order.indexOf(removedKey);
    const candidates = index < 0 ? [] : [...order.slice(index + 1), ...order.slice(0, index).reverse()];
    for (const key of candidates) {
      const target = focusEntryAction(key);
      if (target) return target;
    }
    return backButton.current;
  }
  function recoveryFocusTarget() {
    const current = client.getQueryData<{ editRecovery?: PlaylistEditRecovery }>(['playlist', id])?.editRecovery;
    if (current?.status === 'pending') return backButton.current;
    if (current?.status === 'review' || editRecoveryRef.current.needsReview) return reviewRefreshButton.current;
    if (current?.status === 'unavailable') return recoveryRetryFocus.retryRef.current;
    return backButton.current;
  }
  async function removeEntry(entryId: string, source: HTMLButtonElement | null) {
    if (editBlocked || !recovery.begin(id)) return;
    const order = rows.map(row => row.key);
    await retryRemoval(source, async () => {
      await change.mutateAsync({ type: 'remove', entryId });
      return { isError: false };
    }, () => removalFallback(source, order, entryId), undefined, () => {
      if (source?.isConnected) return source;
      const current = client.getQueryData<{ editRecovery?: PlaylistEditRecovery }>(['playlist', id])?.editRecovery;
      if (current?.status === 'pending') return backButton.current;
      if (current?.status === 'review' || editRecoveryRef.current.needsReview) {
        return reviewRefreshButton.current && !reviewRefreshButton.current.matches(':disabled') ? reviewRefreshButton.current : backButton.current;
      }
      if (current?.status === 'unavailable') return recoveryRetryFocus.retryRef.current ?? backButton.current;
      return removalFallback(source, order, entryId);
    });
  }
  function submit(action: { type: 'remove'; entryId: string } | { type: 'move'; entryId: string; index: number }) {
    if (!editBlocked && recovery.begin(id)) change.mutate(action);
  }
  const data = playlist.data;
  const editBlocked = edit.pending || !!durable || recoveryAcknowledgePending || playlist.isFetching || !!playlist.error || needsReview;
  return <><button ref={backButton} aria-label="Back to playlists" className="back-button" onClick={event => back(event.currentTarget)}><ArrowLeft size={17} />Playlists</button>{data && <><CollectionHeading artwork={data.imageUrl} eyebrow={`Playlist · ${data.entries.length} ${data.entries.length === 1 ? 'song' : 'songs'}`} title={data.name}><button className="primary" disabled={!data.entries.length} onClick={() => player.play(data.entries.map(entry => entry.song))}><Play size={16} fill="currentColor" />Play playlist</button><button disabled={!data.entries.length} onClick={() => player.enqueue(data.entries.map(entry => entry.song))}><ListPlus size={17} />Queue</button><button disabled={data.canEdit === false || editBlocked} onClick={() => setRenaming(true)}><Pencil size={15} />Rename</button></CollectionHeading>
    {data.canEdit !== true && <p className="notice"><LockKeyhole size={17} />{data.restriction || (data.canEdit === false ? 'You can listen to this playlist, but your account cannot edit it.' : 'Editing permissions could not be confirmed. Jellyfin will check each change.')}</p>}
    {rows.some(row => row.editable === false) && <p className="notice">Jellyfin cannot identify some playlist entries separately. You can select, play, queue, or add these songs elsewhere, but their Move and Remove actions are unavailable. Their selection resets when the playlist changes.</p>}
    <ErrorNotice error={edit.error} />{durable?.status === 'unavailable' && <ErrorNotice error={new Error('Playlist editing recovery is unavailable. You can still play or queue its songs. Refresh before editing again.')} retryRef={recoveryRetryFocus.retryRef} retrying={playlist.isFetching || listFetching} retry={() => recoveryRetryFocus.retry(retryReads)} />}{needsReview && <div className="notice playlist-recovery"><span role="status">The change may already be saved. Review the refreshed playlist before editing again.</span><button ref={reviewRefreshButton} aria-disabled={!!reviewActionPending || recoveryAcknowledgePending || edit.pending || durable?.status === 'pending' || playlist.isFetching || undefined} aria-busy={reviewActionPending === 'refresh' || playlist.isFetching || undefined} onClick={() => {
      if (reviewActionBusy.current || recoveryAcknowledgePending || edit.pending || durable?.status === 'pending' || playlist.isFetching) return;
      reviewActionBusy.current = true;
      setReviewActionPending('refresh');
      void retryReviewAction(reviewRefreshButton.current, async () => {
        const readsReady = await refresh();
        if (edit.needsReview && recovery.isCurrent()) recovery.update(id, { reviewReady: readsReady });
        const current = client.getQueryData<{ editRecovery?: PlaylistEditRecovery }>(['playlist', id])?.editRecovery;
        return { isError: !readsReady || current?.status === 'unavailable' };
      }, () => recoveryFocusTarget(), () => {
        reviewActionBusy.current = false;
        setReviewActionPending(null);
      }, () => recoveryFocusTarget());
    }}>{reviewActionPending === 'refresh' || playlist.isFetching ? 'Refreshing…' : 'Refresh playlist'}</button><button ref={reviewAcknowledgeButton} aria-disabled={!!reviewActionPending || !reviewReady || edit.pending || recoveryAcknowledgePending || playlist.isFetching || !!playlist.error || undefined} aria-busy={reviewActionPending === 'ack' || recoveryAcknowledgePending || undefined} onClick={() => {
      if (reviewActionBusy.current || !reviewReady || edit.pending || recoveryAcknowledgePending || playlist.isFetching || playlist.error) return;
      const markerId = durable?.status === 'review' ? durable.markerId : undefined;
      const receipt = durable?.status === 'review' ? durable.receipt : undefined;
      reviewActionBusy.current = true;
      setReviewActionPending('ack');
      void retryReviewAction(reviewAcknowledgeButton.current, async () => {
        await acknowledge.mutateAsync({ markerId, receipt });
        const current = client.getQueryData<{ editRecovery?: PlaylistEditRecovery }>(['playlist', id])?.editRecovery;
        return { isError: !!current };
      }, () => backButton.current, () => {
        reviewActionBusy.current = false;
        setReviewActionPending(null);
      }, () => {
        const current = client.getQueryData<{ editRecovery?: PlaylistEditRecovery }>(['playlist', id])?.editRecovery;
        if (markerId && receipt && current?.status === 'review' && current.markerId === markerId && current.receipt === receipt && reviewAcknowledgeButton.current?.isConnected) return reviewAcknowledgeButton.current;
        return recoveryFocusTarget();
      });
    }}>{reviewActionPending === 'ack' || recoveryAcknowledgePending ? 'Confirming…' : 'I checked the playlist'}</button></div>}{(edit.pending || durable?.status === 'pending') && <p role="status" className="form-hint">Saving changes to Jellyfin…</p>}
    {data.entries.length ? <TrackTable rows={rows} selected={selected} select={setSelected} play={player.play} queue={player.enqueue} add={add} details={details} currentId={player.current?.id} requestedPlaying={player.requestedPlaying} togglePlayback={player.toggle} editable={data.canEdit !== false} busy={editBlocked} remove={(entryId, source) => void removeEntry(entryId, source)} move={(entryId, index) => submit({ type: 'move', entryId, index })} /> : <Empty title="This playlist is waiting for music">Select songs or an album in your library and choose Add to playlist.</Empty>}
    {renaming && <PlaylistNameDialog title="Rename playlist" initial={data.name} close={() => setRenaming(false)} save={async name => { unwrap(await window.wave.renamePlaylist({ id, name })); await refresh(); }} />}</>}
    {playlist.isPending && <p className="loading" role="status">Loading playlist…</p>}<ErrorNotice error={playlist.error ?? listError} retryRef={detailRetryFocus.retryRef} retrying={playlist.isFetching || listFetching} retry={() => detailRetryFocus.retry(retryReads)} />
  </>;
}
function PlaylistNameDialog({ title, initial, close, save, created }: { title: string; initial: string; close: () => void; save: (name: string) => Promise<string | void>; created?: (id: string, origin: HTMLElement | null) => void }) {
  const [name, setName] = useState(initial);
  const client = useQueryClient();
  const mounted = useRef(true);
  const nameInput = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(true);
  const inFlight = useRef(false);
  const stopTracking = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => () => { stopTracking.current?.(); }, []);
  const mutation = useMutation({ mutationFn: () => save(name.trim()), onSuccess: id => {
    if (!mounted.current) return;
    stopTracking.current?.();
    inFlight.current = false;
    if (id && created) {
      const dialog = nameInput.current?.closest('dialog') ?? null;
      const origin = focusOwner.current?.dialog === dialog && focusOwner.current.ownsFocus && dialog && document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement) && document.hasFocus() && document.visibilityState === 'visible' && !document.querySelector(':popover-open') && document.querySelector('dialog[open]') === dialog ? document.activeElement : null;
      restoreFocusRef.current = false;
      created(id, origin);
    } else close();
  }, onError: async () => {
    try {
      if (mounted.current) {
        await client.invalidateQueries({ queryKey: ['playlists'] });
        if (mounted.current) await client.invalidateQueries({ queryKey: ['playlist'] });
      }
    } finally {
      stopTracking.current?.();
      inFlight.current = false;
    }
  } });
  const uncertain = mutation.error instanceof WaveError && mutation.error.code === 'uncertain-write';
  const focusOwner = useRef<{ dialog: HTMLDialogElement; ownsFocus: boolean } | null>(null);
  function startTracking() {
    const dialog = nameInput.current?.closest('dialog');
    if (!dialog) return;
    const owner = { dialog, ownsFocus: document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement) && document.hasFocus() && document.visibilityState === 'visible' && !document.querySelector(':popover-open') && document.querySelector('dialog[open]') === dialog };
    focusOwner.current = owner;
    const cancel = () => { owner.ownsFocus = false; };
    const onFocusIn = (event: FocusEvent) => { if (!(event.target instanceof Node) || !dialog.contains(event.target)) cancel(); };
    const onPointerDown = (event: PointerEvent) => {
      const rect = dialog.getBoundingClientRect();
      if (!(event.target instanceof Node) || !dialog.contains(event.target)
        || (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom))) cancel();
    };
    const onBeforeToggle = (event: Event) => {
      const toggle = event as ToggleEvent;
      if (toggle.newState === 'open') cancel();
    };
    const checkScope = () => {
      if (!dialog.open || document.querySelector('dialog[open]') !== dialog || document.querySelector(':popover-open')) cancel();
    };
    const onBlur = () => cancel();
    const onVisibility = () => { if (document.visibilityState !== 'visible') cancel(); };
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('beforetoggle', onBeforeToggle, true);
    document.addEventListener('toggle', checkScope, true);
    document.addEventListener('close', checkScope, true);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    stopTracking.current = () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('beforetoggle', onBeforeToggle, true);
      document.removeEventListener('toggle', checkScope, true);
      document.removeEventListener('close', checkScope, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      if (stopTracking.current) stopTracking.current = null;
    };
  }
  const cancel = () => { if (!inFlight.current && !mutation.isPending) close(); };
  return <Dialog title={title} close={cancel} closeDisabled={mutation.isPending} initialFocusRef={nameInput} restoreFocusRef={restoreFocusRef}><form onSubmit={event => { event.preventDefault(); if (inFlight.current || mutation.isPending || uncertain || !name.trim()) return; inFlight.current = true; startTracking(); mutation.mutate(); }}><label>Playlist name<input ref={nameInput} autoFocus required maxLength={160} readOnly={mutation.isPending || uncertain} value={name} onChange={event => setName(event.target.value)} /></label><ErrorNotice error={mutation.error} />{uncertain && <p className="form-hint">The change may already be saved. Close this dialog and check Jellyfin's refreshed playlists before trying again.</p>}<div className="modal-actions"><button type="button" aria-disabled={mutation.isPending || undefined} onClick={cancel}>{uncertain ? 'Close and check playlists' : 'Cancel'}</button><button className="primary" disabled={!name.trim()} aria-disabled={mutation.isPending || uncertain || undefined} aria-busy={mutation.isPending || undefined}>{mutation.isPending ? 'Saving…' : 'Save playlist'}</button></div></form></Dialog>;
}
