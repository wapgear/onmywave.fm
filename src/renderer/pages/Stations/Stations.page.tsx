import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Headphones, LoaderCircle, Newspaper } from 'lucide-react';
import type { ListeningRoom, NewsProgress, PreparedNewsTake } from '../../../shared/types';
import { WaveError, unwrap } from '../../api';
import { Dialog, ErrorNotice, PageHeading } from '../../components/Shared';
import { FilterSelect } from '../../components/FilterSelect/FilterSelect.component';
import { InfoHelp } from '../../components/InfoHelp/InfoHelp.component';
import { ConfigurationTabs } from '../../components/ConfigurationTabs/ConfigurationTabs.component';
import { RoomSetup } from './components/RoomSetup.component';
import { PreparedTakes } from './components/PreparedTakes.component';
import { useDJPlayback } from '../../dj-playback';
import { WorkflowPreferences } from '../Settings/components/WorkflowPreferences.component';
import { NewsBucket } from './components/NewsBucket.component';
import './Stations.styles.css';

export type RoomDraft = { scriptId: string; script: string } | null;
export type RoomSetupDraft = { setup: ListeningRoom | null; moodDraft: string | null; newsInterests?: string; tab?: string };
type PreparationInput = { kind: 'script'; input: { requestId: string; djId: string; sourceIds: string[] } } | { kind: 'audio'; input: { requestId: string; scriptId: string; script: string; djId: string; newVariation?: boolean } };
type Preparation = PreparationInput & { reconcile?: boolean };
export function StationsPage({ draft, setDraft, configDraft, setConfigDraft, configureSources, configureDJ, configureSettings }: {
  draft: RoomDraft; setDraft: Dispatch<SetStateAction<RoomDraft>>; configDraft: RoomSetupDraft; setConfigDraft: Dispatch<SetStateAction<RoomSetupDraft>>; configureSources: () => void; configureDJ: () => void; configureSettings: () => void;
}) {
  const client = useQueryClient();
  const automation = useDJPlayback();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()) });
  const library = useQuery({ queryKey: ['preparedNews'], queryFn: async () => unwrap(await window.wave.getPreparedNews()), refetchInterval: query => query.state.data?.requests.some(value => value.status === 'running') ? 1000 : 10000 });
  const { setup, moodDraft } = configDraft;
  const setSetup = (setup: ListeningRoom | null) => setConfigDraft(current => ({ ...current, setup }));
  const setMoodDraft = (moodDraft: string | null) => setConfigDraft(current => ({ ...current, moodDraft }));
  const manualTools = useRef<HTMLDetailsElement>(null);
  const tab = ['news', 'host', 'prepare', 'settings'].includes(configDraft.tab ?? '') ? 'settings' : configDraft.tab === 'saved' ? 'saved' : 'bucket';
  const setTab = (tab: string) => setConfigDraft(current => ({ ...current, tab }));
  const aiStatus = useQuery({ queryKey: ['aiStatus'], meta: { aiOperation: true }, queryFn: async () => unwrap(await window.wave.getAiStatus()) });
  const elevenStatus = useQuery({ queryKey: ['elevenLabsStatus'], meta: { aiOperation: true }, queryFn: async () => unwrap(await window.wave.getElevenLabsStatus()) });
  const [progress, setProgress] = useState<NewsProgress | null>(null);
  const [lastRequest, setLastRequest] = useState<Preparation | null>(null);
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState('');
  const activeRequest = useRef<string | null>(null);
  useEffect(() => {
    const unsubscribe = window.wave.onNewsProgress(value => { if (value.requestId === activeRequest.current) setProgress(value); });
    return unsubscribe;
  }, []);
  const rawRoom = setup ?? state.data?.listeningRoom ?? { djId: null, sourceIds: [] };
  const room = state.data ? { djId: state.data.djs.some(dj => dj.id === rawRoom.djId) ? rawRoom.djId : null, sourceIds: rawRoom.sourceIds.filter(id => state.data!.sources.some(source => source.id === id)) } : rawRoom;
  const mood = moodDraft ?? state.data?.vibe ?? '';
  const sources = state.data?.sources ?? [];
  const dj = state.data?.djs.find(value => value.id === room.djId);
  const newsInterests = configDraft.newsInterests ?? state.data?.workflowDraft.newsInterests ?? dj?.news?.interests ?? '';
  const setNewsInterests = (newsInterests: string) => setConfigDraft(current => ({ ...current, newsInterests }));
  const sameSources = (left: string[], right: string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  const unsavedSetup = !!state.data && (room.djId !== state.data.listeningRoom.djId || !sameSources(room.sourceIds, state.data.listeningRoom.sourceIds)
    || mood !== state.data.vibe || newsInterests !== (state.data.workflowDraft.newsInterests ?? state.data.djs.find(value => value.id === state.data.listeningRoom.djId)?.news?.interests ?? ''));
  const activeProfile = state.data?.roomProfiles.find(value => value.id === state.data.activeRoomProfileId);
  const latestScript = library.data?.scripts.at(-1);
  const editing = draft ?? (latestScript ? { scriptId: latestScript.id, script: latestScript.script } : null);
  const scriptRecord = library.data?.scripts.find(value => value.id === editing?.scriptId);
  const selectedTake = library.data?.takes.find(value => value.id === library.data?.selectedTakeId);
  const finite = dj?.news?.speechEngine === 'elevenlabs-v4';
  const words = editing?.script.trim().split(/\s+/u).filter(Boolean).length ?? 0;
  const validSources = room.sourceIds.length > 0 && room.sourceIds.length <= 20 && room.sourceIds.every(id => sources.some(source => source.id === id));
  const ready = !!dj && validSources && !!mood.trim();
  const audioKeyReady = elevenStatus.data?.configured;
  const textKeyReady = aiStatus.data?.configured;
  async function refresh() { await client.invalidateQueries({ queryKey: ['preparedNews'] }); }
  async function persistSetup() {
    const latest = unwrap(await window.wave.getLocalState());
    unwrap(await window.wave.saveWorkflowDraft({ workflowDraft: { ...latest.workflowDraft, newsInterests }, room, mood: mood.trim() }));
    await client.invalidateQueries({ queryKey: ['localState'] });
    setConfigDraft(current => ({ ...current, setup: current.setup === setup ? null : current.setup, moodDraft: current.moodDraft === moodDraft ? null : current.moodDraft, newsInterests: current.newsInterests === configDraft.newsInterests ? undefined : current.newsInterests }));
  }
  const save = useMutation({ mutationFn: async () => {
    const latest = unwrap(await window.wave.getLocalState());
    unwrap(await window.wave.saveWorkflowDraft({ workflowDraft: { ...latest.workflowDraft, newsInterests }, room, mood: mood.trim() }));
    await client.invalidateQueries({ queryKey: ['localState'] });
    setConfigDraft(current => ({ ...current, setup: current.setup === setup ? null : current.setup, moodDraft: current.moodDraft === moodDraft ? null : current.moodDraft, newsInterests: current.newsInterests === configDraft.newsInterests ? undefined : current.newsInterests, tab: 'settings' }));
  } });
  const source = useMutation({ mutationFn: async (url: string) => unwrap(await window.wave.openSource(url)) });
  const prepare = useMutation({
    meta: { aiOperation: true },
    mutationFn: async (request: Preparation) => {
      const draftAtStart = draft;
      activeRequest.current = request.input.requestId;
      setLastRequest(request);
      setProgress(null);
      try {
        if (request.kind === 'script') {
          if (!request.reconcile) await persistSetup();
          const result = unwrap(await window.wave.prepareNewsScript(request.input));
          setDraft(current => current === draftAtStart ? { scriptId: result.id, script: result.script } : current);
        } else unwrap(await window.wave.renderNewsTake(request.input));
      } finally {
        if (activeRequest.current === request.input.requestId) activeRequest.current = null;
        await refresh();
      }
    },
  });
  const noNews = prepare.error instanceof WaveError && prepare.error.code === 'no-news';
  const running = library.data?.requests.find(value => value.status === 'running');
  const cancel = useMutation({ meta: { aiOperation: true }, mutationFn: async () => { const id = activeRequest.current ?? running?.requestId; if (id) unwrap(await window.wave.cancelPreparedNews(id)); await refresh(); } });
  const preparing = prepare.isPending || !!running;
  const profiles = useMutation({ mutationFn: async (action: { kind: 'copy' } | { kind: 'switch'; id: string; saveChanges: boolean }) => {
    if (action.kind === 'copy') {
      const latest = unwrap(await window.wave.getLocalState());
      unwrap(await window.wave.saveRoomProfile({ name: profileName.trim(), room, mood: mood.trim(), workflowDraft: { ...latest.workflowDraft, newsInterests } }));
    } else {
      if (action.saveChanges) await persistSetup();
      unwrap(await window.wave.activateRoomProfile(action.id));
    }
    await client.invalidateQueries({ queryKey: ['localState'] });
    if (action.kind === 'copy') {
      setNewProfileOpen(false); setProfileName('');
      setProfileNotice('New room saved. Choose it from the room picker to use it.');
    } else {
      setConfigDraft(current => ({ setup: null, moodDraft: null, tab: current.tab }));
      setSwitchTarget(null);
      setProfileNotice('Room switched. Your script and selected audio are unchanged.');
    }
  } });
  const enableProfile = useMutation({ mutationFn: async (input: { id: string; enabled: boolean }) => {
    unwrap(await window.wave.setRoomProfileEnabled(input));
    await client.invalidateQueries({ queryKey: ['localState'] });
  } });
  const busy = preparing || save.isPending || profiles.isPending || enableProfile.isPending;
  function chooseProfile(id: string) {
    if (busy || id === state.data?.activeRoomProfileId) return;
    profiles.reset(); setProfileNotice('');
    if (unsavedSetup) setSwitchTarget(id);
    else profiles.mutate({ kind: 'switch', id, saveChanges: false });
  }
  function prepareText() {
    if (!ready || !room.djId || !textKeyReady) return;
    prepare.reset(); cancel.reset();
    prepare.mutate({ kind: 'script', input: { requestId: crypto.randomUUID(), djId: room.djId, sourceIds: [...room.sourceIds] } });
  }
  function renderTake(newVariation = false) {
    if (!editing || !room.djId || !finite || !audioKeyReady || !words || words > 55) return;
    prepare.reset(); cancel.reset();
    prepare.mutate({ kind: 'audio', input: { requestId: crypto.randomUUID(), scriptId: editing.scriptId, script: editing.script.trim(), djId: room.djId, newVariation } });
  }
  const chosenSources = sources.filter(value => room.sourceIds.includes(value.id));
  const sourceSnapshot = (values: typeof sources) => JSON.stringify([...values].sort((a, b) => a.id.localeCompare(b.id)));
  const differs = selectedTake && (selectedTake.script !== editing?.script || JSON.stringify(selectedTake.renderingDJ) !== JSON.stringify(dj) || selectedTake.provenance.mood !== mood || (selectedTake.provenance.newsInterests ?? selectedTake.provenance.dj.news?.interests ?? '') !== newsInterests || sourceSnapshot(selectedTake.provenance.sources) !== sourceSnapshot(chosenSources));
  function loadDraft(take: PreparedNewsTake) { setTab('settings'); setDraft({ scriptId: take.scriptId, script: take.script }); requestAnimationFrame(() => { if (manualTools.current) manualTools.current.open = true; manualTools.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); manualTools.current?.querySelector<HTMLTextAreaElement>('#news-draft')?.focus({ preventScroll: true }); }); }
  function loadScriptDraft(script: { id: string; script: string }) { setTab('settings'); setDraft({ scriptId: script.id, script: script.script }); requestAnimationFrame(() => { if (manualTools.current) manualTools.current.open = true; manualTools.current?.scrollIntoView({ block: 'start', behavior: 'auto' }); manualTools.current?.querySelector<HTMLTextAreaElement>('#news-draft')?.focus({ preventScroll: true }); }); }
  function openPreparation() { setTab('settings'); }
  return <>
    <PageHeading title="News bucket" />
    <div className="listening-room">
      {state.isPending && <p className="loading" role="status">Opening your room…</p>}
      <ErrorNotice error={state.error} retry={() => void state.refetch()} />
      {state.data && <><div className="room-profile-bar"><label htmlFor="room-profile">Setup profile<select id="room-profile" value={state.data.activeRoomProfileId} disabled={busy} onChange={event => chooseProfile(event.target.value)}>{state.data.roomProfiles.map(value => <option key={value.id} value={value.id}>{value.name}{value.id === state.data?.activeRoomProfileId ? ' · Active' : ''}</option>)}</select></label><button disabled={busy} onClick={() => { profiles.reset(); setProfileName(''); setNewProfileOpen(true); }}>Save as new</button></div>
      {activeProfile && <details className="room-advanced"><summary>Advanced room options</summary><label className="room-dj-enabled"><input type="checkbox" checked={activeProfile.enabled} disabled={busy} onChange={event => enableProfile.mutate({ id: activeProfile.id, enabled: event.target.checked })} />Show in DJ player room selector</label></details>}
      <ErrorNotice error={enableProfile.error} />
      <p className="form-hint">Choose a profile to edit its sources, host, and preparation settings. Playback can use a different profile.</p>
      {profileNotice && <p className="form-hint room-profile-notice" role="status">{profileNotice}</p>}
      {!newProfileOpen && !switchTarget && <ErrorNotice error={profiles.error} />}
      <ConfigurationTabs id="room" label="News bucket and configuration" tabs={[{ id: 'bucket', label: 'News bucket' }, { id: 'settings', label: 'Settings' }, { id: 'saved', label: 'Saved audio' }]} value={tab} onChange={setTab} />
      {unsavedSetup && tab !== 'settings' && <div className="room-unsaved"><p>Unsaved news settings.</p><button onClick={() => setTab('settings')}>Review settings</button></div>}
      </>}
      {state.data && <section id="room-panel-bucket" role="tabpanel" aria-labelledby="room-tab-bucket" hidden={tab !== 'bucket'} tabIndex={0}>
        <ErrorNotice error={library.error} retry={() => void library.refetch()} />
        {library.isPending && <p className="loading" role="status">Opening the news bucket…</p>}
        {library.data && <NewsBucket library={library.data} localState={state.data} automation={automation} openSource={url => source.mutate(url)} openPreparation={openPreparation} openDraft={loadScriptDraft} />}
        <ErrorNotice error={source.error} />
      </section>}
      {preparing && <div className="news-progress room-active-progress" role="status"><LoaderCircle className="spinning" size={17} /><span>{progress?.message ?? 'Preparing…'}</span><button disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel preparation</button></div>}
      {tab !== 'settings' && prepare.isError && !noNews && <div className="room-background-error"><ErrorNotice error={prepare.error} /><button className="room-link" onClick={() => setTab('settings')}>Review preparation</button></div>}
      <section id="room-panel-settings" role="tabpanel" aria-labelledby="room-tab-settings" hidden={tab !== 'settings'} tabIndex={0} className="room-preparation">
      {state.data && <RoomSetup sources={sources} djs={state.data.djs} room={room} mood={mood} newsInterests={newsInterests} busy={busy} saving={save.isPending} saveError={save.error} setSetup={setSetup} setMoodDraft={setMoodDraft} setNewsInterests={setNewsInterests} configureSources={configureSources} configureDJ={configureDJ} onSave={() => save.mutate()} />}
      <WorkflowPreferences disabled={unsavedSetup || busy} />
      {unsavedSetup && <p className="form-hint">Save your setup before changing news preparation.</p>}
      {(!textKeyReady || !audioKeyReady) && <p className="form-hint">News preparation needs OpenAI and ElevenLabs keys. <button className="room-link" onClick={configureSettings}>Provider keys</button></p>}
      <details className="room-script room-testing-tools" ref={manualTools}><summary>Testing tools · Prepare a story manually</summary><div className="room-script-content" aria-labelledby="script-title"><div className="room-section-heading"><div><span className="eyebrow">Manual testing</span><h2 id="script-title">Prepare a story</h2></div><InfoHelp label="About manual preparation"><p>Use these tools to test a script or voice. Text and audio requests use your provider accounts and save completed results locally.</p><p>DJ playback only picks saved recordings. The news workflow prepares stories on its own schedule.</p></InfoHelp></div><p>Prepare text, review it, then generate an audio take.</p>
        <button className="primary" disabled={busy || !ready || !textKeyReady} onClick={prepareText}>{prepare.isPending && lastRequest?.kind === 'script' ? <LoaderCircle size={15} className="spinning" /> : <Newspaper size={15} />}{prepare.isPending && lastRequest?.kind === 'script' ? 'Preparing text…' : 'Prepare news text'}</button>
        {!ready && <p className="form-hint">Choose sources and a DJ, and describe your station mood first.</p>}
        {ready && !textKeyReady && <p className="notice">{aiStatus.isPending ? 'Checking OpenAI key…' : aiStatus.error ? 'OpenAI key status unavailable.' : 'Add an OpenAI key to prepare text.'} <button className="room-link" onClick={configureSettings}>Open Settings</button></p>}
        <ErrorNotice error={aiStatus.error} retry={() => void aiStatus.refetch()} />{dj?.news?.speechEngine === 'elevenlabs-v4' && <ErrorNotice error={elevenStatus.error} retry={() => void elevenStatus.refetch()} />}

        {!!library.data?.scripts.length && <div className="room-saved-script"><FilterSelect label="Saved draft" value={editing?.scriptId ?? ''} choices={library.data.scripts.map(value => ({ value: value.id, label: `${value.provenance.dj.name} · ${new Date(value.createdAt).toLocaleString()}` })).reverse()} onChange={id => { const saved = library.data?.scripts.find(value => value.id === id); if (saved) setDraft({ scriptId: saved.id, script: saved.script }); }} disabled={busy} /></div>}
        {editing && <div className="room-script-editor"><label htmlFor="news-draft">Review the script</label><textarea id="news-draft" rows={5} maxLength={700} disabled={busy} value={editing.script} onChange={event => setDraft({ ...editing, script: event.target.value })} /><div className="room-script-meta"><span className={words > 55 ? 'danger' : ''}>{words} / 55 words</span><span>{scriptRecord ? new Date(scriptRecord.createdAt).toLocaleString() : 'Saved draft'}</span></div>{scriptRecord && <details><summary>Sources and preparation settings</summary><p className="form-hint">Prepared for {scriptRecord.provenance.dj.name} · {scriptRecord.provenance.mood}</p><p className="form-hint">News interests: {(scriptRecord.provenance.newsInterests ?? scriptRecord.provenance.dj.news?.interests) || 'Any topics from selected sources'}</p>{scriptRecord.articles.map(article => <p key={article.id} className="room-article"><button className="room-link" onClick={() => source.mutate(article.url)}>{article.title}</button><span>{article.source}{article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleDateString()}` : ' · Date unavailable'}</span></p>)}{scriptRecord.warnings.map((warning, index) => <p className="form-hint" key={index}>{warning}</p>)}</details>}
          <div className="room-section-heading room-render-heading"><div><span className="eyebrow">Manual audio</span><h3>Generate a complete take</h3></div><Headphones size={19} /></div>{!finite && <p className="notice">Configure ElevenLabs in this DJ's voice settings. <button className="room-link" onClick={configureDJ}>Manage DJ in Settings</button></p>}
          {!audioKeyReady && <p className="notice">Add an ElevenLabs key before generating audio. <button className="room-link" onClick={configureSettings}>Open Settings</button></p>}
          <div className="room-actions"><button className="primary" disabled={busy || !finite || !audioKeyReady || !words || words > 55} onClick={() => renderTake()}>{prepare.isPending && lastRequest?.kind === 'audio' ? 'Generating audio…' : 'Generate audio take'}</button><button disabled={busy || !finite || !audioKeyReady || !words || words > 55} onClick={() => renderTake(true)}>Generate another take</button></div>
        </div>}
        <ErrorNotice error={source.error} />{noNews ? <p className="form-hint" role="status">No relevant story was found, so no audio was generated.</p> : <ErrorNotice error={prepare.error} />}{prepare.isError && !noNews && lastRequest && <button className="room-link" disabled={busy} onClick={() => prepare.mutate({ ...lastRequest, reconcile: true })}>Check saved result for this request</button>}<ErrorNotice error={cancel.error} />
      </div></details>
      </section>
      <section id="room-panel-saved" role="tabpanel" aria-labelledby="room-tab-saved" hidden={tab !== 'saved'} tabIndex={0}>
      {differs && <p className="notice">Your draft or setup differs from the selected take. Your saved choice remains unchanged.</p>}
        <ErrorNotice error={library.error} retry={() => void library.refetch()} />
      {library.isPending && <p className="loading" role="status">Opening saved audio…</p>}
      {library.data && <PreparedTakes library={library.data} refresh={() => void refresh()} loadDraft={loadDraft} />}
      {!!library.data?.requests.some(value => value.status !== 'complete') && <details className="room-request-history"><summary>Preparation history</summary>{library.data.requests.filter(value => value.status !== 'complete').slice(-10).reverse().map(value => <p key={value.requestId}><strong>{value.kind === 'script' ? 'News text' : 'Audio take'} · {value.status === 'skipped' ? 'No relevant story' : value.status}</strong><span>{value.error || (value.status === 'skipped' ? 'No audio was generated for this attempt.' : 'No automatic provider retry. Completed results remain in saved audio.')}</span></p>)}</details>}
      </section>
    </div>
    {newProfileOpen && <Dialog title="Save a new listening room" close={() => { if (!profiles.isPending) setNewProfileOpen(false); }}><form onSubmit={event => { event.preventDefault(); if (!profiles.isPending && profileName.trim()) profiles.mutate({ kind: 'copy' }); }}><fieldset disabled={profiles.isPending}><label>Name<input autoFocus required maxLength={80} value={profileName} onChange={event => { profiles.reset(); setProfileName(event.target.value); }} placeholder="Evening technology" /></label></fieldset><p className="form-hint">Saves your current setup as an inactive room. You can finish incomplete setup later.</p><ErrorNotice error={profiles.error} /><div className="modal-actions"><button type="button" disabled={profiles.isPending} onClick={() => setNewProfileOpen(false)}>Cancel</button><button className="primary" disabled={profiles.isPending || !profileName.trim()}>{profiles.isPending ? 'Saving…' : 'Save room'}</button></div></form></Dialog>}
    {switchTarget && <Dialog title="Switch listening rooms?" close={() => { if (!profiles.isPending) setSwitchTarget(null); }}><p>You have unsaved changes to {activeProfile?.name ?? 'your current room'}. Save them before switching, or discard them. Your script and selected audio stay unchanged.</p><ErrorNotice error={profiles.error} /><div className="modal-actions"><button disabled={profiles.isPending} onClick={() => setSwitchTarget(null)}>Cancel</button><button disabled={profiles.isPending} onClick={() => profiles.mutate({ kind: 'switch', id: switchTarget, saveChanges: false })}>Discard and switch</button><button className="primary" disabled={profiles.isPending} onClick={() => profiles.mutate({ kind: 'switch', id: switchTarget, saveChanges: true })}>{profiles.isPending ? 'Switching…' : 'Save and switch'}</button></div></Dialog>}
  </>;
}
