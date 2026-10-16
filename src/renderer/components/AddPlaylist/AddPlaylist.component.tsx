import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Song } from '../../../shared/types';
import { unwrap, WaveError } from '../../api';
import { Dialog, ErrorNotice } from '../Shared';
export function AddPlaylist({ songs, close, checkPlaylists }: { songs: Song[]; close: () => void; checkPlaylists: () => void }) {
  const client = useQueryClient();
  const mounted = useRef(true);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const playlists = useQuery({ queryKey: ['playlists'], queryFn: async () => unwrap(await window.wave.playlists()) });
  const [destination, setDestination] = useState('new');
  const [name, setName] = useState('');
  const [skipExisting, setSkipExisting] = useState(true);
  const save = useMutation({ mutationFn: async () => {
    const trackIds = songs.map(song => song.id);
    if (destination === 'new') return unwrap(await window.wave.createPlaylist({ name: name.trim(), trackIds }));
    return unwrap(await window.wave.addPlaylistItems({ id: destination, trackIds, skipExisting }));
  }, onSuccess: async () => { if (!mounted.current) return; await client.invalidateQueries({ queryKey: ['playlists'] }); if (!mounted.current) return; await client.invalidateQueries({ queryKey: ['playlist'] }); if (mounted.current) close(); }, onError: async () => { if (!mounted.current) return; await client.invalidateQueries({ queryKey: ['playlist'] }); if (mounted.current) await client.invalidateQueries({ queryKey: ['playlists'] }); } });
  const creation = playlists.data?.creationRecovery;
  const creationBlocked = !!creation || playlists.isPending || playlists.isFetching || !!playlists.error;
  const additionBlocked = destination !== 'new' && !!playlists.data?.items.find(item => item.id === destination)?.recoveryStatus;
  const uncertain = save.error instanceof WaveError && save.error.code === 'uncertain-write';
  return <Dialog title={`Add ${songs.length === 1 ? 'song' : `${songs.length} songs`} to playlist`} close={() => { if (!save.isPending) close(); }}><form onSubmit={event => { event.preventDefault(); if (!uncertain && !save.isPending && !additionBlocked && (destination !== 'new' || !creationBlocked)) save.mutate(); }}>
    <label>Playlist<select disabled={save.isPending || uncertain} value={destination} onChange={event => setDestination(event.target.value)}><option value="new" disabled={creationBlocked}>Create a new playlist</option>{playlists.data?.items.map(item => <option key={item.id} value={item.id} disabled={!!item.recoveryStatus}>{item.name}{item.recoveryStatus ? item.recoveryStatus === 'review' ? ' · Review needed' : ' · Editing unavailable' : ''}</option>)}</select></label>
    {destination === 'new' && <label>Playlist name<input autoFocus required maxLength={160} disabled={save.isPending || uncertain} value={name} onChange={event => setName(event.target.value)} placeholder="A name for your collection" /></label>}
    {destination !== 'new' && <label className="checkbox-label"><input type="checkbox" disabled={save.isPending || uncertain} checked={skipExisting} onChange={event => setSkipExisting(event.target.checked)} />Skip songs already in this playlist</label>}
    <p className="form-hint">Changes are saved to Jellyfin. Your account must have permission to edit the selected playlist.</p>
    {additionBlocked && <p className="form-hint">Review this playlist before adding more songs. <button type="button" className="room-link" onClick={checkPlaylists}>Review playlists</button></p>}
    {creation && <p className="form-hint">{creation.status === 'unavailable' ? 'Playlist editing recovery is unavailable. You can still open and play your playlists.' : 'A playlist may already have been created. Review your playlists before creating another. You can choose an existing playlist.'} <button type="button" className="room-link" onClick={checkPlaylists}>Review playlists</button></p>}
    <ErrorNotice error={playlists.error} retry={() => void playlists.refetch()} /><ErrorNotice error={save.error} />{uncertain && <p className="form-hint">The change may already be saved. Check the refreshed playlists and their songs before trying again.</p>}
    <div className="modal-actions"><button type="button" disabled={save.isPending} onClick={uncertain ? checkPlaylists : close}>{uncertain ? 'Close and check playlists' : 'Cancel'}</button><button className="primary" disabled={save.isPending || uncertain || additionBlocked || (destination === 'new' && (!name.trim() || creationBlocked))}>{save.isPending ? 'Saving…' : destination === 'new' ? 'Create playlist' : 'Add songs'}</button></div>
  </form></Dialog>;
}
