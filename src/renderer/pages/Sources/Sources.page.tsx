import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Rss, Trash2 } from 'lucide-react';
import { normalizeNewsSource } from '../../../shared/sources';
import type { NewsSource } from '../../../shared/types';
import { unwrap } from '../../api';
import { Dialog, Empty, ErrorNotice, PageHeading } from '../../components/Shared';
import { TwitterSetupHelp } from '../../components/ProviderKeys/TwitterSetupHelp.component';
import './Sources.styles.css';

export function SourcesPage() {
  const client = useQueryClient();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()) });
  const [editing, setEditing] = useState<NewsSource | null>(null);
  const [deleting, setDeleting] = useState<NewsSource | null>(null);
  const sourceNameInput = useRef<HTMLInputElement>(null);
  const mutation = useMutation({
    mutationFn: async (action: { save: NewsSource } | { remove: string }) => {
      const local = unwrap(await window.wave.getLocalState());
      let sources: NewsSource[];
      if ('save' in action) {
        const next = normalizeNewsSource(action.save);
        if (local.sources.some(source => source.id !== next.id && source.url === next.url && (source.query ?? '') === (next.query ?? ''))) throw new Error('This source is already saved. Edit the existing source instead.');
        sources = local.sources.some(source => source.id === next.id) ? local.sources.map(source => source.id === next.id ? next : source) : [...local.sources, next];
      } else sources = local.sources.filter(source => source.id !== action.remove);
      unwrap(await window.wave.saveNewsSources(sources));
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['localState'] }); setEditing(null); setDeleting(null); },
  });
  const sources = state.data?.sources ?? [];
  function edit(source: NewsSource) { mutation.reset(); setEditing({ ...source }); }
  const affectedProfiles = deleting ? state.data?.roomProfiles.filter(profile => profile.room.sourceIds.includes(deleting.id)) ?? [] : [];
  const affectedPlayback = state.data?.djPlayback.enabled ? affectedProfiles.find(profile => profile.id === state.data?.djPlayback.roomId && profile.room.sourceIds.every(id => id === deleting?.id)) : undefined;
  return <><PageHeading title="Sources" subtitle="News for your prepared stories"><button className="primary" disabled={!state.data || mutation.isPending} onClick={() => edit({ id: crypto.randomUUID(), name: '', url: '' })}><Plus size={16} />Add source</button></PageHeading>
    <p className="sources-description">Choose RSS feeds, Twitter / X searches, or Hacker News for your news workflow.</p>
    <ErrorNotice error={state.error} retry={() => void state.refetch()} />
    {state.isPending ? <p className="loading" role="status">Loading sources…</p> : sources.length ? <div className="source-list">{sources.map(source => <article className="source-row" key={source.id}><Rss size={18} aria-hidden="true" /><div><h2>{source.name}</h2><p>{source.kind === 'twitter' ? source.query : source.url}</p><p>{source.kind === 'twitter' ? 'Twitter / X' : source.kind === 'hacker-news' ? 'Hacker News' : 'RSS / Atom'}</p>{state.data?.listeningRoom.sourceIds.includes(source.id) && <span>Selected in News bucket</span>}</div><button className="icon-button" disabled={mutation.isPending} aria-label={`Edit ${source.name}`} onClick={() => edit(source)}><Pencil size={16} /></button><button className="icon-button danger" disabled={mutation.isPending} aria-label={`Delete ${source.name}`} onClick={() => { mutation.reset(); setDeleting(source); }}><Trash2 size={16} /></button></article>)}</div> : !state.error && <Empty title="Choose where your news comes from">Add a feed, Twitter search, or Hacker News to prepare your first story.</Empty>}
    {editing && <Dialog title={sources.some(source => source.id === editing.id) ? 'Edit source' : 'Add source'} close={() => { if (!mutation.isPending) setEditing(null); }} initialFocusRef={sourceNameInput}><form onSubmit={event => { event.preventDefault(); if (!mutation.isPending) mutation.mutate({ save: editing }); }}><fieldset disabled={mutation.isPending}><label>Name<input ref={sourceNameInput} autoFocus required maxLength={160} placeholder="Music news" value={editing.name} onChange={event => { mutation.reset(); setEditing({ ...editing, name: event.target.value }); }} /></label><label>Source type<select value={editing.kind ?? 'rss'} onChange={event => { mutation.reset(); const kind = event.target.value as NonNullable<NewsSource['kind']>; setEditing({ ...editing, kind, url: kind === 'hacker-news' ? 'https://hacker-news.firebaseio.com/v0/topstories.json' : kind === 'twitter' ? 'https://api.x.com/2/tweets/search/recent' : '', query: '' }); }}><option value="rss">RSS / Atom</option><option value="twitter">Twitter / X</option><option value="hacker-news">Hacker News</option></select></label>
      {editing.kind === 'twitter' ? <><label>Search query<input required maxLength={512} placeholder="(AI OR robotics) lang:en -is:retweet" value={editing.query ?? ''} onChange={event => { mutation.reset(); setEditing({ ...editing, query: event.target.value }); }} /></label><p className="form-hint">Uses your Twitter / X bearer token from Provider keys. Your API access must support recent search.</p><TwitterSetupHelp /></> : editing.kind === 'hacker-news' ? <label>Stories<select value={editing.url} onChange={event => { mutation.reset(); setEditing({ ...editing, url: event.target.value }); }}><option value="https://hacker-news.firebaseio.com/v0/topstories.json">Top stories</option><option value="https://hacker-news.firebaseio.com/v0/newstories.json">New stories</option><option value="https://hacker-news.firebaseio.com/v0/beststories.json">Best stories</option></select></label> : <label>RSS or Atom URL<input type="url" required maxLength={4096} placeholder="https://example.com/feed.xml" value={editing.url} onChange={event => { mutation.reset(); setEditing({ ...editing, url: event.target.value }); }} /></label>}</fieldset><ErrorNotice error={mutation.error} /><div className="modal-actions"><button type="button" disabled={mutation.isPending} onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={mutation.isPending || !editing.name.trim() || (editing.kind === 'twitter' ? !editing.query?.trim() : !editing.url.trim())}>{mutation.isPending ? 'Saving…' : 'Save source'}</button></div></form></Dialog>}
    {deleting && <Dialog title={`Delete ${deleting.name}?`} close={() => { if (!mutation.isPending) setDeleting(null); }}><p>This removes {deleting.name} from your saved sources. {affectedProfiles.length ? `It will also be removed from ${affectedProfiles.map(profile => profile.name).join(', ')} and their future news preparation. Review those profiles after deleting. ` : ''}Saved scripts and audio takes keep their source information.</p>{affectedPlayback && <p>DJ breaks for {affectedPlayback.name} will turn off. Choose another source in News bucket before enabling them again.</p>}<ErrorNotice error={mutation.error} /><div className="modal-actions"><button disabled={mutation.isPending} onClick={() => setDeleting(null)}>Cancel</button><button className="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate({ remove: deleting.id })}>{mutation.isPending ? 'Deleting…' : 'Delete source'}</button></div></Dialog>}
  </>;
}
