import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, ExternalLink, Headphones, LoaderCircle, Pause, Play, Radio, Square } from 'lucide-react';
import type { PreparedNewsLibrary, PreparedNewsTake } from '../../../../shared/types';
import { unwrap } from '../../../api';
import { freshAudioUrl } from '../../../audio';
import { usePlayer } from '../../../player';
import { ErrorNotice, duration } from '../../../components/Shared';
import './PreparedTakes.styles.css';

type Audition = { id: string; phase: 'loading' | 'playing' | 'paused'; position: number };
const provider = (take: PreparedNewsTake) => take.engine === 'elevenlabs-v4' ? 'ElevenLabs' : take.engine === 'openai-tts' ? 'OpenAI' : 'Saved recording';
const savedDate = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Saved take';

export function PreparedTakes({ library, refresh, loadDraft, active = true }: { library: PreparedNewsLibrary; refresh: () => void; loadDraft: (take: PreparedNewsTake) => void; active?: boolean }) {
  const player = usePlayer();
  const breakStatus = { idle: '', waiting: 'DJ break scheduled for the end of this song.', fading: 'Lowering the music for your DJ.', 'lead-in': 'Your DJ starts shortly.', speaking: 'Your DJ is on air.', tail: 'Finishing the break before music resumes.', paused: 'DJ break paused. Use the player to resume.' }[player.newsPhase];
  const audio = useRef<HTMLAudioElement | null>(null);
  const operation = useRef(0);
  const playGeneration = useRef(0);
  const [audition, setAudition] = useState<Audition | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [audioError, setAudioError] = useState<string | null>(null);
  const selected = library.takes.find(take => take.id === library.selectedTakeId);
  const takes = [...library.takes].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || b.id.localeCompare(a.id));
  const dispose = useCallback(() => {
    ++operation.current;
    ++playGeneration.current;
    const element = audio.current;
    if (element) {
      element.onplay = element.onpause = element.onended = element.onerror = element.onloadedmetadata = element.ontimeupdate = null;
      element.pause(); element.removeAttribute('src'); element.load();
      audio.current = null;
    }
  }, []);
  const stop = useCallback(() => { dispose(); setAudition(null); }, [dispose]);
  useEffect(() => () => dispose(), [dispose]);
  useEffect(() => {
    if (active || !audio.current) return;
    dispose();
    const token = operation.current;
    queueMicrotask(() => { if (token === operation.current) setAudition(null); });
  }, [active, dispose]);
  useEffect(() => {
    if (!player.requestedPlaying || !audio.current) return;
    dispose();
    const token = operation.current;
    queueMicrotask(() => { if (token === operation.current) setAudition(null); });
  }, [player.requestedPlaying, dispose]);
  useLayoutEffect(() => {
    if (!audio.current) return;
    dispose();
    const token = operation.current;
    queueMicrotask(() => { if (token === operation.current) setAudition(null); });
  }, [player.currentKey, player.musicCommandRevision, dispose]);
  const select = useMutation({ onMutate: () => stop(), mutationFn: async (id: string | null) => unwrap(await window.wave.selectNewsTake(id)), onSettled: refresh });
  const source = useMutation({ mutationFn: async (url: string) => unwrap(await window.wave.openSource(url)) });
  const schedule = useMutation({ mutationFn: async (take: PreparedNewsTake) => {
    stop();
    await player.scheduleNews(take, take.renderingDJ.news?.duckVolume ?? 0.05);
  } });
  async function listen(take: PreparedNewsTake) {
    setAudioError(null);
    if (audition?.id === take.id && audio.current) {
      if (audition.phase === 'loading') { stop(); return; }
      if (!audio.current.paused) { ++playGeneration.current; audio.current.pause(); return; }
      player.pauseForPreview();
      const token = operation.current;
      const playToken = ++playGeneration.current;
      const command = player.getMusicCommandRevision();
      try { await audio.current.play(); }
      catch { if (token === operation.current && playToken === playGeneration.current && command === player.getMusicCommandRevision()) { stop(); setAudioError('This saved take could not resume. Try auditioning it again.'); } }
      return;
    }
    stop();
    player.pauseForPreview();
    const token = operation.current;
    const command = player.getMusicCommandRevision();
    const element = new Audio();
    audio.current = element;
    setAudition({ id: take.id, phase: 'loading', position: 0 });
    element.preload = 'auto';
    element.volume = player.volume;
    element.onloadedmetadata = () => {
      if (token === operation.current && Number.isFinite(element.duration) && element.duration > 0) setDurations(old => ({ ...old, [take.id]: element.duration }));
    };
    element.onplay = () => {
      if (token !== operation.current || command !== player.getMusicCommandRevision()) { element.pause(); return; }
      if (!element.paused) setAudition({ id: take.id, phase: 'playing', position: element.currentTime });
    };
    element.onpause = () => { if (token === operation.current && element.paused) setAudition(old => old?.id === take.id ? { ...old, phase: 'paused' } : old); };
    element.ontimeupdate = () => { if (token === operation.current) setAudition(old => old?.id === take.id ? { ...old, position: element.currentTime } : old); };
    element.onended = () => { if (token === operation.current) stop(); };
    element.onerror = () => { if (token === operation.current && command === player.getMusicCommandRevision()) { stop(); setAudioError('The saved audio could not be opened. Refresh saved takes to check the file.'); } };
    element.src = freshAudioUrl(take.audioUrl);
    const playToken = ++playGeneration.current;
    try { await element.play(); }
    catch { if (token === operation.current && playToken === playGeneration.current && command === player.getMusicCommandRevision()) { stop(); setAudioError('The saved audio could not play. Refresh saved takes, then try again.'); } }
  }
  useEffect(() => { if (audio.current) audio.current.volume = player.volume; }, [player.volume]);
  const selectedActive = !!selected && player.activeNewsId === selected.id && player.newsPhase !== 'idle';
  return <section className="prepared-takes" aria-labelledby="prepared-takes-title">
    <header className="prepared-takes-heading"><div><h2 id="prepared-takes-title">Saved audio takes</h2><p>Listen or choose a take for a DJ break.</p></div><button onClick={refresh}>Refresh</button></header>
    {takes.length > 0 && <div className="prepared-selection"><div><span className="prepared-eyebrow">Selected take</span><strong>{selected ? `${selected.renderingDJ.name} · ${savedDate(selected.createdAt)}` : 'Choose a saved take below'}</strong>{selected && <p>{provider(selected)} · {selected.voice}{!selected.available ? ' · Audio unavailable' : ''}</p>}</div><div className="prepared-selection-actions">{selected && <><button className="primary" disabled={!selected.available || !player.current || schedule.isPending || selectedActive} onClick={() => { schedule.reset(); schedule.mutate(selected); }}><Radio size={15} />{schedule.isPending ? 'Scheduling…' : selectedActive ? 'Break active' : 'Schedule DJ break'}</button><button disabled={select.isPending} onClick={() => select.mutate(null)}>Clear selection</button></>}</div></div>}
    {selected && !player.current && <p className="prepared-help">Start a song before scheduling a break. Preparing and auditioning saved audio do not require a song.</p>}
    {selectedActive && <div className="prepared-on-air"><span role="status">{breakStatus}</span><button onClick={player.stopNews}>{player.newsPhase === 'waiting' ? 'Cancel scheduled break' : 'Stop break'}</button></div>}
    {selected && <p className="prepared-help">The break waits for the end of this song. Choose its placement and timing in Settings → General → DJ transitions. Pause keeps your place. Seeking follows the Keep the DJ setting; changing songs cancels this placement.</p>}
    <ErrorNotice error={select.error} /><ErrorNotice error={schedule.error} /><ErrorNotice error={audioError ? new Error(audioError) : null} />
    {!takes.length && <div className="prepared-empty"><Headphones size={28} /><h3>No saved audio yet</h3><p>Prepare a story to save your first recording.</p></div>}
    <ol className="prepared-take-list">{takes.map(take => {
      const current = audition?.id === take.id ? audition : null;
      const measured = durations[take.id];
      const chosen = selected?.id === take.id;
      return <li key={take.id} className={`prepared-take ${chosen ? 'is-selected' : ''}`}>
        <div className="prepared-take-heading"><div><h3>{take.renderingDJ.name || 'Saved DJ take'}</h3><p><time dateTime={take.createdAt}>{savedDate(take.createdAt)}</time> · {provider(take)} · {take.voice}</p></div>{chosen && <span className="prepared-selected"><Check size={13} />Selected</span>}</div>
        <div className="prepared-audition"><button disabled={!take.available} onClick={() => void listen(take)} aria-label={current?.phase === 'loading' ? 'Cancel loading audition' : current?.phase === 'playing' ? 'Pause audition' : current?.phase === 'paused' ? 'Resume audition' : `Audition take from ${savedDate(take.createdAt)}`}>{current?.phase === 'loading' ? <LoaderCircle size={15} className="spinning" /> : current?.phase === 'playing' ? <Pause size={15} /> : <Play size={15} />}{current?.phase === 'loading' ? 'Loading…' : current?.phase === 'playing' ? 'Pause' : current?.phase === 'paused' ? 'Resume' : 'Listen'}</button>{current && <button onClick={stop} aria-label="Stop audition"><Square size={13} />Stop</button>}<span className="prepared-duration">{current ? `${duration(current.position)} / ` : ''}{measured ? duration(measured) : 'Duration checked on listen'}</span>{!chosen && <button className="prepared-use-take" disabled={!take.available || select.isPending} onClick={() => select.mutate(take.id)}>Use this take</button>}</div>
        {!take.available && <p className="prepared-missing">The saved audio file is missing or incomplete. Its script and settings are kept. Load the script to prepare another take when you choose.</p>}
        <p className="prepared-script">{take.script}</p>
        <details className="prepared-provenance"><summary>Saved mood, settings, and sources</summary><dl><div><dt>Mood</dt><dd>{take.provenance.mood || 'No mood specified'}</dd></div><div><dt>News interests</dt><dd>{(take.provenance.newsInterests ?? take.provenance.dj.news?.interests) || 'Any topics from selected sources'}</dd></div><div><dt>Writing DJ</dt><dd>{take.provenance.dj.name}</dd></div><div><dt>Audio model</dt><dd>{take.model}</dd></div><div><dt>Delivery</dt><dd>{take.delivery || 'Default delivery'}</dd></div><div><dt>Voice</dt><dd>{take.voice}</dd></div><div><dt>Language</dt><dd>{take.renderingDJ.language || 'Default'}</dd></div><div><dt>Personality</dt><dd>{take.renderingDJ.personality || 'Default delivery'}</dd></div></dl>{!!take.provenance.sources.length && <div className="prepared-source-links"><h4>Configured feeds</h4>{take.provenance.sources.map(feed => <button key={feed.id} onClick={() => source.mutate(feed.url)}><ExternalLink size={12} /><span>{feed.name || feed.url}</span></button>)}</div>}{!!take.articles.length && <div className="prepared-source-links"><h4>Story references</h4>{take.articles.map(article => <div key={article.id}><button onClick={() => source.mutate(article.url)}><ExternalLink size={12} /><span>{article.title}</span></button><p>{article.source}{Number.isFinite(Date.parse(article.publishedAt ?? '')) ? ` · ${savedDate(article.publishedAt!)}` : ' · Date unavailable'}</p></div>)}</div>}{!!take.warnings.length && <ul className="prepared-warnings">{take.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}</details>
        <div className="prepared-take-footer"><button onClick={() => loadDraft(take)}>Load script into draft</button><span>AI-generated voice · Saved locally</span></div>
      </li>;
    })}</ol><ErrorNotice error={source.error} />
  </section>;
}
