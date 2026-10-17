import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ListMusic, ListPlus, LockKeyhole, Pencil, Play, Plus } from 'lucide-react';
import type { Song } from '../../../shared/types';
import { unwrap, WaveError } from '../../api';
import { usePlayer } from '../../player';
import { Artwork, Dialog, Empty, ErrorNotice, PageHeading } from '../../components/Shared';
import { CollectionHeading } from '../../components/CollectionHeading/CollectionHeading.component';
import { playlistRows, TrackTable } from '../../components/TrackTable/TrackTable.component';
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
export function PlaylistsPage({ add, details, id, setId, recovery }: { recovery: PlaylistRecovery; id: string | null; setId: (id: string | null) => void; add: (songs: Song[]) => void; details: (song: Song) => void }) {
  const [creating, setCreating] = useState(false);
  const client = useQueryClient();
  const playlists = useQuery({ queryKey: ['playlists'], queryFn: async () => unwrap(await window.wave.playlists()) });
  const creation = playlists.data?.creationRecovery;
  const creationBlocked = !!creation || playlists.isPending || playlists.isFetching || !!playlists.error;
  const acknowledgeCreation = useMutation({ mutationFn: async () => {
    if (creation?.status !== 'review' || !creation.receipt) throw new Error('Refresh your playlists and check the list before confirming.');
    unwrap(await window.wave.acknowledgePlaylistCreation({ markerId: creation.markerId, receipt: creation.receipt }));
  }, onSuccess: async () => { if (recovery.isCurrent()) await playlists.refetch(); } });
  if (id) return <PlaylistDetail key={id} id={id} recovery={recovery} back={() => setId(null)} add={add} details={details} />;
  return <><PageHeading title="Playlists" subtitle="Your collections, on every Jellyfin client"><button className="primary" disabled={creationBlocked} onClick={() => setCreating(true)}><Plus size={17} />New playlist</button></PageHeading><ErrorNotice error={playlists.error} retrying={playlists.isFetching} retry={() => playlists.refetch()} />
    <ErrorNotice error={acknowledgeCreation.error} />
    {creation?.status === 'unavailable' && <ErrorNotice error={new Error('Playlist creation recovery is unavailable. You can still open and play your playlists. Refresh before creating another.')} retrying={playlists.isFetching} retry={() => playlists.refetch()} />}
    {(creation?.status === 'review' || creation?.status === 'pending') && <div className="notice playlist-recovery"><span role="status">A playlist may already have been created. Review your refreshed playlists before creating another.</span><button disabled={creation.status === 'pending' || playlists.isFetching || acknowledgeCreation.isPending} onClick={() => void playlists.refetch()}>Refresh playlists</button><button disabled={creation.status !== 'review' || !creation.receipt || playlists.isFetching || !!playlists.error || acknowledgeCreation.isPending} onClick={() => acknowledgeCreation.mutate()}>{acknowledgeCreation.isPending ? 'Confirming…' : 'I checked my playlists'}</button></div>}
    {playlists.isPending ? <p className="loading" role="status">Loading playlists…</p> : playlists.data?.items.length ? <div className="playlist-grid">{playlists.data.items.map(item => <button className="playlist-tile" key={item.id} onClick={() => setId(item.id)}><Artwork url={item.imageUrl} name={item.name} /><div><strong>{item.name}</strong><span><ListMusic size={14} />{item.songCount === undefined ? 'Playlist' : `${item.songCount} songs`}</span>{item.recoveryStatus && <span>{item.recoveryStatus === 'pending' ? 'Saving changes…' : item.recoveryStatus === 'review' ? 'Review needed' : 'Editing unavailable'}</span>}</div></button>)}</div> : !playlists.error && <Empty title="Make room for your favorites">Create a playlist, then add songs from your library.</Empty>}
    {creating && <PlaylistNameDialog title="New playlist" initial="" close={() => setCreating(false)} save={async name => { const value = unwrap(await window.wave.createPlaylist({ name, trackIds: [] })); if (!recovery.isCurrent()) return; await client.invalidateQueries({ queryKey: ['playlists'] }); if (recovery.isCurrent()) setId(value.id); }} />}
  </>;
}
function PlaylistDetail({ id, back, add, details, recovery }: { recovery: PlaylistRecovery; id: string; back: () => void; add: (songs: Song[]) => void; details: (song: Song) => void }) {
  const client = useQueryClient();
  const player = usePlayer();
  const playlist = useQuery({ queryKey: ['playlist', id], queryFn: async () => unwrap(await window.wave.playlist(id)) });
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
  const durable = playlist.data?.editRecovery;
  const needsReview = edit.needsReview || durable?.status === 'pending' || durable?.status === 'review';
  const reviewReady = durable ? durable.status === 'review' && !!durable.receipt : edit.reviewReady;
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
  async function refresh() {
    if (!recovery.isCurrent()) return false;
    const [result] = await Promise.all([playlist.refetch(), client.invalidateQueries({ queryKey: ['playlists'] })]);
    return recovery.isCurrent() && result.isSuccess;
  }
  const acknowledge = useMutation({ mutationFn: async () => {
    if (durable) {
      if (durable.status !== 'review' || !durable.receipt) throw new Error('Refresh this playlist and check its current order before confirming.');
      unwrap(await window.wave.acknowledgePlaylistRecovery({ id, markerId: durable.markerId, receipt: durable.receipt }));
    }
  }, onSuccess: async () => {
    if (!recovery.isCurrent()) return;
    recovery.update(id, { needsReview: false, reviewReady: false, error: null });
    await refresh();
  }, onError: error => { if (recovery.isCurrent()) recovery.update(id, { error }); } });
  function submit(action: { type: 'remove'; entryId: string } | { type: 'move'; entryId: string; index: number }) {
    if (!editBlocked && recovery.begin(id)) change.mutate(action);
  }
  const data = playlist.data;
  const editBlocked = edit.pending || !!durable || acknowledge.isPending || playlist.isFetching || !!playlist.error || needsReview;
  return <><button className="back-button" onClick={back}><ArrowLeft size={17} />Playlists</button>{data && <><CollectionHeading artwork={data.imageUrl} eyebrow={`Playlist · ${data.entries.length} songs`} title={data.name}><button className="primary" disabled={!data.entries.length} onClick={() => player.play(data.entries.map(entry => entry.song))}><Play size={16} fill="currentColor" />Play playlist</button><button disabled={!data.entries.length} onClick={() => player.enqueue(data.entries.map(entry => entry.song))}><ListPlus size={17} />Queue</button><button disabled={data.canEdit === false || editBlocked} onClick={() => setRenaming(true)}><Pencil size={15} />Rename</button></CollectionHeading>
    {data.canEdit !== true && <p className="notice"><LockKeyhole size={17} />{data.restriction || (data.canEdit === false ? 'You can listen to this playlist, but your account cannot edit it.' : 'Editing permissions could not be confirmed. Jellyfin will check each change.')}</p>}
    {rows.some(row => row.editable === false) && <p className="notice">Jellyfin cannot identify some playlist entries separately. You can select, play, queue, or add these songs elsewhere, but their Move and Remove actions are unavailable. Their selection resets when the playlist changes.</p>}
    <ErrorNotice error={edit.error} />{durable?.status === 'unavailable' && <ErrorNotice error={new Error('Playlist editing recovery is unavailable. You can still play or queue its songs. Refresh before editing again.')} retrying={playlist.isFetching || listFetching} retry={() => refresh()} />}{needsReview && <div className="notice playlist-recovery"><span role="status">The change may already be saved. Review the refreshed playlist before editing again.</span><button disabled={edit.pending || durable?.status === 'pending' || acknowledge.isPending || playlist.isFetching} onClick={() => void refresh().then(reviewReady => recovery.update(id, { reviewReady }))}>Refresh playlist</button><button disabled={!reviewReady || edit.pending || acknowledge.isPending || playlist.isFetching || !!playlist.error} onClick={() => acknowledge.mutate()}>{acknowledge.isPending ? 'Confirming…' : 'I checked the playlist'}</button></div>}{(edit.pending || durable?.status === 'pending') && <p role="status" className="form-hint">Saving changes to Jellyfin…</p>}
    {data.entries.length ? <TrackTable rows={rows} selected={selected} select={setSelected} play={player.play} queue={player.enqueue} add={add} details={details} currentId={player.current?.id} editable={data.canEdit !== false} busy={editBlocked} remove={entryId => submit({ type: 'remove', entryId })} move={(entryId, index) => submit({ type: 'move', entryId, index })} /> : <Empty title="This playlist is waiting for music">Select songs or an album in your library and choose Add to playlist.</Empty>}
    {renaming && <PlaylistNameDialog title="Rename playlist" initial={data.name} close={() => setRenaming(false)} save={async name => { unwrap(await window.wave.renamePlaylist({ id, name })); await refresh(); }} />}</>}
    {playlist.isPending && <p className="loading" role="status">Loading playlist…</p>}<ErrorNotice error={playlist.error} retrying={playlist.isFetching || listFetching} retry={() => refresh().then(reviewReady => recovery.update(id, { reviewReady }))} />
  </>;
}
function PlaylistNameDialog({ title, initial, close, save }: { title: string; initial: string; close: () => void; save: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  const client = useQueryClient();
  const mounted = useRef(true);
  const nameInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const mutation = useMutation({ mutationFn: () => save(name.trim()), onSuccess: () => { if (mounted.current) close(); }, onError: async () => { if (!mounted.current) return; await client.invalidateQueries({ queryKey: ['playlists'] }); if (mounted.current) await client.invalidateQueries({ queryKey: ['playlist'] }); } });
  const uncertain = mutation.error instanceof WaveError && mutation.error.code === 'uncertain-write';
  return <Dialog title={title} close={() => { if (!mutation.isPending) close(); }} initialFocusRef={nameInput}><form onSubmit={event => { event.preventDefault(); if (!uncertain && !mutation.isPending) mutation.mutate(); }}><label>Playlist name<input ref={nameInput} autoFocus required maxLength={160} disabled={mutation.isPending || uncertain} value={name} onChange={event => setName(event.target.value)} /></label><ErrorNotice error={mutation.error} />{uncertain && <p className="form-hint">The change may already be saved. Close this dialog and check Jellyfin's refreshed playlists before trying again.</p>}<div className="modal-actions"><button type="button" disabled={mutation.isPending} onClick={close}>{uncertain ? 'Close and check playlists' : 'Cancel'}</button><button className="primary" disabled={!name.trim() || mutation.isPending || uncertain}>{mutation.isPending ? 'Saving…' : 'Save playlist'}</button></div></form></Dialog>;
}
