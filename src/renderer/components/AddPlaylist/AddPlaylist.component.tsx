import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Song } from '../../../shared/types';
import { unwrap, WaveError } from '../../api';
import { Dialog, ErrorNotice } from '../Shared';
import { useRetryFocus } from '../../useRetryFocus';
export function AddPlaylist({ songs, close, checkPlaylists }: { songs: Song[]; close: () => void; checkPlaylists: () => void }) {
  const client = useQueryClient();
  const mounted = useRef(true);
  const nameInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const destinationInput = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const playlists = useQuery({ queryKey: ['playlists'], queryFn: async () => unwrap(await window.wave.playlists()) });
  const retryFocus = useRetryFocus({ ownerKey: 'add-playlist:destinations', target: () => destinationInput.current, canFocusSuccess: () => playlists.isSuccess && !playlists.isFetching });
  const [destination, setDestination] = useState('new');
  const [name, setName] = useState('');
  const [skipExisting, setSkipExisting] = useState(true);
  const save = useMutation({ mutationFn: async () => {
    const trackIds = songs.map(song => song.id);
    if (destination === 'new') return unwrap(await window.wave.createPlaylist({ name: name.trim(), trackIds }));
    return unwrap(await window.wave.addPlaylistItems({ id: destination, trackIds, skipExisting }));
  }, onSuccess: async () => { if (!mounted.current) return; await client.invalidateQueries({ queryKey: ['playlists'] }); if (!mounted.current) return; await client.invalidateQueries({ queryKey: ['playlist'] }); if (mounted.current) close(); }, onError: async () => { if (!mounted.current) return; await client.invalidateQueries({ queryKey: ['playlist'] }); if (mounted.current) await client.invalidateQueries({ queryKey: ['playlists'] }); }, onSettled: () => { inFlight.current = false; } });
  const creation = playlists.data?.creationRecovery;
  const creationBlocked = !!creation || playlists.isPending || playlists.isFetching || !!playlists.error;
  const additionBlocked = destination !== 'new' && !!playlists.data?.items.find(item => item.id === destination)?.recoveryStatus;
  const blockedPlaylists = playlists.data?.items.some(item => !!item.recoveryStatus);
  const uncertain = save.error instanceof WaveError && save.error.code === 'uncertain-write';
  const locked = () => inFlight.current || save.isPending || uncertain;
  const cancel = () => { if (!inFlight.current && !save.isPending) close(); };
  const review = () => { if (!inFlight.current && !save.isPending) checkPlaylists(); };
  const blockPointer = (event: PointerEvent) => { if (locked()) event.preventDefault(); };
  const blockKey = (event: KeyboardEvent) => { if (locked() && event.key !== 'Tab' && event.key !== 'Escape') event.preventDefault(); };
  return <Dialog title={`Add ${songs.length === 1 ? 'song' : `${songs.length} songs`} to playlist`} close={cancel} closeDisabled={save.isPending} initialFocusRef={nameInput}><form onSubmit={event => { event.preventDefault(); if (locked() || additionBlocked || (destination === 'new' && (!name.trim() || creationBlocked))) return; inFlight.current = true; save.mutate(); }}>
    <label>Playlist<select ref={destinationInput} aria-disabled={save.isPending || uncertain || undefined} onPointerDown={blockPointer} onKeyDown={blockKey} onClick={event => { if (locked()) event.preventDefault(); }} value={destination} onChange={event => { if (locked()) event.currentTarget.value = destination; else setDestination(event.target.value); }}><option value="new" disabled={creationBlocked}>Create a new playlist</option>{playlists.data?.items.map(item => <option key={item.id} value={item.id} disabled={!!item.recoveryStatus}>{item.name}{item.recoveryStatus ? item.recoveryStatus === 'review' ? ' · Review needed' : ' · Editing unavailable' : ''}</option>)}</select></label>
    {destination === 'new' && <label>Playlist name<input ref={nameInput} autoFocus required maxLength={160} readOnly={save.isPending || uncertain} value={name} onChange={event => setName(event.target.value)} placeholder="A name for your collection" /></label>}
    {destination !== 'new' && <label className="checkbox-label"><input type="checkbox" aria-disabled={save.isPending || uncertain || undefined} onPointerDown={blockPointer} onKeyDown={blockKey} onClick={event => { if (locked()) event.preventDefault(); }} checked={skipExisting} onChange={event => { if (locked()) event.currentTarget.checked = skipExisting; else setSkipExisting(event.target.checked); }} />Skip songs already in this playlist</label>}
    <p className="form-hint">Changes are saved to Jellyfin. Your account must have permission to edit the selected playlist.</p>
    {blockedPlaylists && !creation && <p className="form-hint">Some playlists need review before you can add songs. <button type="button" className="room-link" aria-disabled={save.isPending || undefined} onClick={review}>Review playlists</button></p>}
    {creation && <p className="form-hint">{creation.status === 'unavailable' ? 'Playlist editing recovery is unavailable. You can still open and play your playlists.' : 'A playlist may already have been created. Review your playlists before creating another. You can choose an existing playlist.'} <button type="button" className="room-link" aria-disabled={save.isPending || undefined} onClick={review}>Review playlists</button></p>}
    <ErrorNotice error={playlists.error} retryRef={retryFocus.retryRef} retrying={playlists.isFetching} retry={() => retryFocus.retry(() => playlists.refetch())} /><ErrorNotice error={save.error} />{uncertain && <p className="form-hint">The change may already be saved. Check the refreshed playlists and their songs before trying again.</p>}
    <div className="modal-actions"><button type="button" aria-disabled={save.isPending || undefined} onClick={uncertain ? review : cancel}>{uncertain ? 'Close and check playlists' : 'Cancel'}</button><button className="primary" disabled={!save.isPending && !uncertain && (additionBlocked || (destination === 'new' && (!name.trim() || creationBlocked)))} aria-disabled={save.isPending || uncertain || undefined} aria-busy={save.isPending || undefined}>{save.isPending ? 'Saving…' : destination === 'new' ? 'Create playlist' : 'Add songs'}</button></div>
  </form></Dialog>;
}
