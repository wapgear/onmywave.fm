import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import type { DJ } from '../../../shared/types';
import { unwrap } from '../../api';
import { Dialog, Empty, ErrorNotice, PageHeading } from '../../components/Shared';
import { DJEditor } from './components/DJEditor.component';
import { DJPreview } from './components/DJPreview.component';
import './DJs.styles.css';
const fresh = (): DJ => ({ id: crypto.randomUUID(), name: '', description: '', instructions: '', musicPreferences: '', exclusions: '', language: '', personality: '', speakingFrequency: 'never' });
export function DJsPage() {
  const client = useQueryClient();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()) });
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<DJ | null>(null);
  const [deleting, setDeleting] = useState<DJ | null>(null);
  const save = useMutation({ mutationFn: async (id: string) => { const local = unwrap(await window.wave.getLocalState()); unwrap(await window.wave.saveDjs(local.djs.filter(dj => dj.id !== id))); }, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['localState'] }); setEditing(null); setDeleting(null); } });
  const djs = state.data?.djs ?? [];
  const affectedProfiles = deleting ? state.data?.roomProfiles.filter(profile => profile.room.djId === deleting.id) ?? [] : [];
  const affectedPlayback = state.data?.djPlayback.enabled ? affectedProfiles.find(profile => profile.id === state.data?.djPlayback.roomId) : undefined;
  function edit(dj: DJ) { save.reset(); setEditing(dj); }
  return <><PageHeading title="DJs" subtitle="Hosts and voices for your prepared audio takes"><button className="primary" disabled={!state.data} onClick={() => edit(fresh())}><Plus size={17} />New DJ</button></PageHeading><ErrorNotice error={state.error} retrying={state.isFetching} retry={() => state.refetch()} />
    {state.isPending ? <p className="loading" role="status">Loading your DJs…</p> : djs.length ? <div className="dj-list">{djs.map(dj => <article key={dj.id} className="dj-row"><div className="dj-avatar"><UserRound size={24} /></div><div className="dj-summary"><h2>{dj.name}</h2><p>{dj.description || 'Your saved DJ configuration'}</p><DJPreview dj={dj} activeId={previewing} onStart={setPreviewing} /></div><button className="icon-button" aria-label={`Edit ${dj.name}`} onClick={() => edit({ ...dj })}><Pencil size={17} /></button><button className="icon-button" aria-label={`Duplicate ${dj.name}`} onClick={() => edit({ ...dj, id: crypto.randomUUID(), name: `${dj.name} copy` })}><Copy size={17} /></button><button className="icon-button danger" aria-label={`Delete ${dj.name}`} onClick={() => { save.reset(); setDeleting(dj); }}><Trash2 size={17} /></button></article>)}</div> : !state.error && <Empty title="Choose a host for your news">Start with a preset voice and personality, then adjust how your host tells each story. You choose the music in your queue.</Empty>}
    {editing && <DJEditor value={editing} close={() => { if (!save.isPending) setEditing(null); }} />}
    {deleting && <Dialog title={`Delete ${deleting.name}?`} close={() => { if (!save.isPending) setDeleting(null); }}><p>This removes {deleting.name} from your saved DJs. {affectedProfiles.length ? `It will also be removed from ${affectedProfiles.map(profile => profile.name).join(', ')}. Choose another DJ in those profiles before preparing more news. ` : ''}Saved scripts and audio takes keep their original DJ information.</p>{affectedPlayback && <p>DJ breaks for {affectedPlayback.name} will turn off. Choose another DJ in News bucket before enabling them again.</p>}<ErrorNotice error={save.error} /><div className="modal-actions"><button disabled={save.isPending} onClick={() => setDeleting(null)}>Cancel</button><button className="destructive" disabled={save.isPending} onClick={() => save.mutate(deleting.id)}>{save.isPending ? 'Deleting…' : 'Delete DJ'}</button></div></Dialog>}
  </>;
}
