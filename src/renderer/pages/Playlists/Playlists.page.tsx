import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ListMusic, ListPlus, LockKeyhole, Pencil, Play, Plus } from 'lucide-react';
import type { Song } from '../../../shared/types';
import { unwrap } from '../../api';
import { usePlayer } from '../../player';
import { Artwork, Dialog, Empty, ErrorNotice, PageHeading } from '../../components/Shared';
import { playlistRows, TrackTable } from '../../components/TrackTable/TrackTable.component';
export function PlaylistsPage({ add, details, id, setId }: { id: string | null; setId: (id: string | null) => void; add: (songs: Song[]) => void; details: (song: Song) => void }) {
  const [creating, setCreating] = useState(false);
  const client = useQueryClient();
  const playlists = useQuery({ queryKey: ['playlists'], queryFn: async () => unwrap(await window.wave.playlists()) });
  if (id) return <PlaylistDetail key={id} id={id} back={() => setId(null)} add={add} details={details} />;
  return <><PageHeading title="Playlists" subtitle="Your collections, on every Jellyfin client"><button className="primary" onClick={() => setCreating(true)}><Plus size={17} />New playlist</button></PageHeading><ErrorNotice error={playlists.error} retry={() => void playlists.refetch()} />
    {playlists.isPending ? <p className="loading" role="status">Loading playlists…</p> : playlists.data?.length ? <div className="playlist-grid">{playlists.data.map(item => <button className="playlist-tile" key={item.id} onClick={() => setId(item.id)}><Artwork url={item.imageUrl} name={item.name} /><div><strong>{item.name}</strong><span><ListMusic size={14} />{item.songCount === undefined ? 'Playlist' : `${item.songCount} songs`}</span></div></button>)}</div> : !playlists.error && <Empty title="Make room for your favorites">Create a playlist, then add songs from your library.</Empty>}
    {creating && <PlaylistNameDialog title="New playlist" initial="" close={() => setCreating(false)} save={async name => { const value = unwrap(await window.wave.createPlaylist({ name, trackIds: [] })); await client.invalidateQueries({ queryKey: ['playlists'] }); setId(value.id); }} />}
  </>;
}
function PlaylistDetail({ id, back, add, details }: { id: string; back: () => void; add: (songs: Song[]) => void; details: (song: Song) => void }) {
  const client = useQueryClient();
  const player = usePlayer();
  const playlist = useQuery({ queryKey: ['playlist', id], queryFn: async () => unwrap(await window.wave.playlist(id)) });
  const [selected, setSelected] = useState<Map<string, Song>>(new Map());
  const [renaming, setRenaming] = useState(false);
  const change = useMutation({ mutationFn: async (action: { type: 'remove'; entryId: string } | { type: 'move'; entryId: string; index: number }) => {
    if (action.type === 'remove') return unwrap(await window.wave.removePlaylistEntries({ id, entryIds: [action.entryId] }));
    return unwrap(await window.wave.movePlaylistEntry({ id, entryId: action.entryId, index: action.index }));
  }, onSuccess: async (_, action) => { if (action.type === 'remove') setSelected(old => { const next = new Map(old); next.delete(action.entryId); return next; }); await refresh(); }, onError: async () => { await refresh(); } });
  async function refresh() { await Promise.all([client.invalidateQueries({ queryKey: ['playlist', id] }), client.invalidateQueries({ queryKey: ['playlists'] })]); }
  const data = playlist.data;
  return <><button className="back-button" onClick={back}><ArrowLeft size={17} />Playlists</button>{data && <><div className="collection-heading"><Artwork url={data.imageUrl} name={data.name} /><div><span className="eyebrow">Playlist · {data.entries.length} songs</span><h1>{data.name}</h1><div className="action-group"><button className="primary" disabled={!data.entries.length} onClick={() => player.play(data.entries.map(entry => entry.song))}><Play size={16} fill="currentColor" />Play playlist</button><button disabled={!data.entries.length} onClick={() => player.enqueue(data.entries.map(entry => entry.song))}><ListPlus size={17} />Queue</button><button disabled={data.canEdit !== true || change.isPending} onClick={() => setRenaming(true)}><Pencil size={15} />Rename</button></div></div></div>
    {data.canEdit !== true && <p className="notice"><LockKeyhole size={17} />{data.restriction || (data.canEdit === false ? 'You can listen to this playlist, but your account cannot edit it.' : 'Editing permissions could not be confirmed. Refresh to try again.')}</p>}
    <ErrorNotice error={change.error} />{change.isPending && <p role="status" className="form-hint">Saving changes to Jellyfin…</p>}
    {data.entries.length ? <TrackTable rows={playlistRows(data.entries)} selected={selected} select={setSelected} play={player.play} queue={player.enqueue} add={add} details={details} currentId={player.current?.id} editable={data.canEdit === true} busy={change.isPending || playlist.isFetching} remove={entryId => change.mutate({ type: 'remove', entryId })} move={(entryId, index) => change.mutate({ type: 'move', entryId, index })} /> : <Empty title="This playlist is waiting for music">Select songs or an album in your library and choose Add to playlist.</Empty>}
    {renaming && <PlaylistNameDialog title="Rename playlist" initial={data.name} close={() => setRenaming(false)} save={async name => { unwrap(await window.wave.renamePlaylist({ id, name })); await refresh(); }} />}</>}
    {playlist.isPending && <p className="loading" role="status">Loading playlist…</p>}<ErrorNotice error={playlist.error} retry={() => void playlist.refetch()} />
  </>;
}
function PlaylistNameDialog({ title, initial, close, save }: { title: string; initial: string; close: () => void; save: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: () => save(name.trim()), onSuccess: close, onError: async () => { await client.invalidateQueries({ queryKey: ['playlists'] }); await client.invalidateQueries({ queryKey: ['playlist'] }); } });
  return <Dialog title={title} close={() => { if (!mutation.isPending) close(); }}><form onSubmit={event => { event.preventDefault(); mutation.mutate(); }}><label>Playlist name<input autoFocus required maxLength={160} value={name} onChange={event => setName(event.target.value)} /></label><ErrorNotice error={mutation.error} /><div className="modal-actions"><button type="button" disabled={mutation.isPending} onClick={close}>Cancel</button><button className="primary" disabled={!name.trim() || mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save playlist'}</button></div></form></Dialog>;
}
