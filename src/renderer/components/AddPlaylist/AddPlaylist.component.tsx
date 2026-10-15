import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Song } from '../../../shared/types';
import { unwrap } from '../../api';
import { Dialog, ErrorNotice } from '../Shared';
export function AddPlaylist({ songs, close }: { songs: Song[]; close: () => void }) {
  const client = useQueryClient();
  const playlists = useQuery({ queryKey: ['playlists'], queryFn: async () => unwrap(await window.wave.playlists()) });
  const [destination, setDestination] = useState('new');
  const [name, setName] = useState('');
  const [skipExisting, setSkipExisting] = useState(true);
  const save = useMutation({ mutationFn: async () => {
    const trackIds = songs.map(song => song.id);
    if (destination === 'new') return unwrap(await window.wave.createPlaylist({ name: name.trim(), trackIds }));
    return unwrap(await window.wave.addPlaylistItems({ id: destination, trackIds, skipExisting }));
  }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['playlists'] }); await client.invalidateQueries({ queryKey: ['playlist'] }); close(); }, onError: async () => { await client.invalidateQueries({ queryKey: ['playlist'] }); await client.invalidateQueries({ queryKey: ['playlists'] }); } });
  return <Dialog title={`Add ${songs.length === 1 ? 'song' : `${songs.length} songs`} to playlist`} close={() => { if (!save.isPending) close(); }}><form onSubmit={event => { event.preventDefault(); save.mutate(); }}>
    <label>Playlist<select value={destination} onChange={event => setDestination(event.target.value)}><option value="new">Create a new playlist</option>{playlists.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {destination === 'new' && <label>Playlist name<input autoFocus required maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder="A name for your collection" /></label>}
    {destination !== 'new' && <label className="checkbox-label"><input type="checkbox" checked={skipExisting} onChange={event => setSkipExisting(event.target.checked)} />Skip songs already in this playlist</label>}
    <p className="form-hint">Changes are saved to Jellyfin. Your account must have permission to edit the selected playlist.</p>
    <ErrorNotice error={playlists.error} retry={() => void playlists.refetch()} /><ErrorNotice error={save.error} />
    <div className="modal-actions"><button type="button" disabled={save.isPending} onClick={close}>Cancel</button><button className="primary" disabled={save.isPending || (destination === 'new' && !name.trim())}>{save.isPending ? 'Saving…' : destination === 'new' ? 'Create playlist' : 'Add songs'}</button></div>
  </form></Dialog>;
}
