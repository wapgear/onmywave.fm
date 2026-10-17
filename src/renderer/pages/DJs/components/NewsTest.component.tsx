import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, KeyRound, LoaderCircle, Play, Radio, Square, WandSparkles } from 'lucide-react';
import type { DJ, NewsProgress } from '../../../../shared/types';
import { unwrap } from '../../../api';
import { usePlayer } from '../../../player';
import { ErrorNotice } from '../../../components/Shared';
import { useNewsRecovery } from '../../../NewsRecovery';

export function NewsTest({ dj, hasFeeds, saveDraft, setBusy }: {
  dj: DJ; hasFeeds: boolean; saveDraft: () => Promise<DJ>; setBusy: (busy: boolean) => void;
}) {
  const client = useQueryClient();
  const player = usePlayer();
  const recovery = useNewsRecovery();
  const recoveryReady = recovery.status.phase === 'ready';
  const breakStatus = { idle: '', waiting: 'DJ break scheduled for the end of this song.', fading: 'Lowering the music for your DJ.', 'lead-in': 'Your DJ starts shortly.', speaking: 'Your DJ is on air.', tail: 'Finishing the break before the next song.', paused: 'DJ break paused. Use the player to resume.' }[player.newsPhase];
  const { current: currentSong, currentKey } = player;
  const ai = useQuery({ queryKey: ['aiStatus'], meta: { aiOperation: true }, queryFn: async () => unwrap(await window.wave.getAiStatus()) });
  const [key, setKey] = useState('');
  const [elevenKey, setElevenKey] = useState('');
  const usesEleven = dj.news?.speechEngine === 'elevenlabs-v4';
  const eleven = useQuery({ queryKey: ['elevenLabsStatus'], enabled: usesEleven, meta: { aiOperation: true }, queryFn: async () => unwrap(await window.wave.getElevenLabsStatus()) });
  const [progress, setProgress] = useState<NewsProgress | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const request = useRef<string | null>(null);
  const track = useRef({ key: currentKey, song: currentSong });
  const lifecycle = useRef({ mounted: false, operation: 0 });
  const keySave = useMutation({ meta: { aiOperation: true }, mutationFn: async (value: string | null) => unwrap(await window.wave.setOpenAiKey(value)), onSuccess: status => {
    if (!lifecycle.current.mounted) return;
    client.setQueryData(['aiStatus'], status);
    setKey('');
  } });
  const elevenKeySave = useMutation({ meta: { aiOperation: true }, mutationFn: async (value: string | null) => unwrap(await window.wave.setElevenLabsKey(value)), onSuccess: status => {
    if (!lifecycle.current.mounted) return;
    client.setQueryData(['elevenLabsStatus'], status);
    setElevenKey('');
  } });
  useEffect(() => {
    lifecycle.current.mounted = true;
    const unsubscribe = window.wave.onNewsProgress(update => {
      if (lifecycle.current.mounted && update.requestId === request.current) setProgress(update);
    });
    const lifetime = lifecycle.current;
    return () => {
      lifetime.mounted = false;
      lifetime.operation += 1;
      unsubscribe();
      const requestId = request.current;
      request.current = null;
      if (requestId) void window.wave.cancelNewsBreak(requestId);
    };
  }, []);
  useEffect(() => {
    const changed = track.current.key !== currentKey;
    track.current = { key: currentKey, song: currentSong };
    if (changed && request.current) {
      const requestId = request.current;
      request.current = null;
      lifecycle.current.operation += 1;
      void window.wave.cancelNewsBreak(requestId);
      setCancelled(true);
      setProgress(null);
      setBusy(false);
    }
  }, [currentKey, currentSong, setBusy]);
  const generate = useMutation({
    meta: { aiOperation: true },
    mutationFn: async () => {
      if (!recoveryReady) throw new Error('News data is unavailable. Recover it before generating a DJ preview.');
      if (!lifecycle.current.mounted) throw new Error('The DJ editor is closed.');
      const song = track.current.song;
      const trackKey = track.current.key;
      if (!song || !trackKey) throw new Error('Choose a song before preparing a DJ break.');
      const operation = ++lifecycle.current.operation;
      const requestId = crypto.randomUUID();
      const active = () => lifecycle.current.mounted && lifecycle.current.operation === operation && track.current.key === trackKey;
      request.current = requestId;
      setBusy(true);
      setCancelled(false);
      setProgress({ requestId, phase: 'feeds', message: 'Saving your DJ settings…' });
      try {
        const saved = await saveDraft();
        if (!active()) throw new Error('News generation was cancelled.');
        setProgress({ requestId, phase: 'feeds', message: 'Reading your news sources…' });
        setBusy(true);
        const result = await window.wave.prepareNewsBreak({ requestId, djId: saved.id, songId: song.id });
        if (!active()) throw new Error('News generation was cancelled.');
        return { ...unwrap(result), trackKey, songName: song.name };
      } finally {
        if (active()) {
          request.current = null;
          setBusy(false);
        }
      }
    },
  });
  const cancel = useMutation({
    meta: { aiOperation: true },
    mutationFn: async () => {
      const requestId = request.current;
      lifecycle.current.operation += 1;
      try {
        if (requestId) unwrap(await window.wave.cancelNewsBreak(requestId));
        if (lifecycle.current.mounted) {
          if (request.current === requestId) request.current = null;
          setCancelled(true);
          setProgress(null);
        }
      } finally {
        if (lifecycle.current.mounted) setBusy(false);
      }
    },
  });
  const source = useMutation({ meta: { aiOperation: true }, mutationFn: async (url: string) => unwrap(await window.wave.openSource(url)) });
  const playback = useMutation({ meta: { aiOperation: true }, mutationFn: async () => {
    if (!recoveryReady) throw new Error('News data is unavailable. Recover it before scheduling a DJ break.');
    if (!generate.data || generate.data.trackKey !== player.currentKey) throw new Error('The current song changed. Generate a new break for its mood.');
    await player.scheduleNews(generate.data, dj.news?.duckVolume ?? 0.05);
  } });
  const busy = generate.isPending;
  const news = generate.data;
  const active = !!news && player.activeNewsId === news.id && player.newsPhase !== 'idle';
  const previewMatchesTrack = !!news && news.trackKey === player.currentKey;
  return <section className="dj-news-test"><div className="section-heading"><Radio size={19} /><div><h3>Test a DJ break</h3><p>One short story, scheduled for the end of the current song.</p></div></div>
    <div className="ai-key-settings"><div className="key-status"><KeyRound size={17} /><span>{ai.isPending ? 'Checking API key…' : ai.data?.configured ? 'OpenAI key configured' : 'OpenAI key required'}</span>{ai.data?.configured && <span className="pill">{ai.data.sessionOnly ? 'This session only' : 'Protected storage'}</span>}</div>
      <label>OpenAI API key<div className="key-input-row"><input type="password" autoComplete="off" spellCheck={false} value={key} placeholder={ai.data?.configured ? 'Enter a replacement key' : 'Enter your API key'} onChange={event => { setKey(event.target.value); keySave.reset(); }} /><button disabled={!key.trim() || keySave.isPending || busy} onClick={() => keySave.mutate(key.trim())}>{keySave.isPending ? 'Saving…' : 'Save key'}</button></div></label>
      <p className="form-hint">The key is stored through macOS protected storage when available and never shown after saving.</p>
      {ai.data?.sessionOnly && <p className="form-hint">Protected storage is unavailable. Re-enter the key after quitting the app.</p>}
      {ai.data?.configured && <button className="text-button" disabled={keySave.isPending || busy} onClick={() => keySave.mutate(null)}>Remove saved key</button>}
      <ErrorNotice error={ai.error} retrying={ai.isFetching} retry={() => ai.refetch()} /><ErrorNotice error={keySave.error} />
    </div>
    {usesEleven && <div className="ai-key-settings"><div className="key-status"><KeyRound size={17} /><span>{eleven.isPending ? 'Checking ElevenLabs key…' : eleven.data?.configured ? 'ElevenLabs key configured' : 'ElevenLabs key required'}</span>{eleven.data?.configured && <span className="pill">{eleven.data.sessionOnly ? 'This session only' : 'Protected storage'}</span>}</div>
      <label>ElevenLabs API key<div className="key-input-row"><input type="password" autoComplete="off" spellCheck={false} value={elevenKey} placeholder={eleven.data?.configured ? 'Enter a replacement ElevenLabs key' : 'Enter your ElevenLabs API key'} onChange={event => { setElevenKey(event.target.value); elevenKeySave.reset(); }} /><button disabled={!elevenKey.trim() || elevenKeySave.isPending || busy} onClick={() => elevenKeySave.mutate(elevenKey.trim())}>{elevenKeySave.isPending ? 'Saving…' : 'Save ElevenLabs key'}</button></div></label>
      <p className="form-hint">Stored separately using macOS protected storage. Your key stays in the app's main process after saving. An OpenAI key above is also needed to write the story.</p>
      {eleven.data?.sessionOnly && <p className="form-hint">Protected storage is unavailable. Re-enter the ElevenLabs key after quitting the app.</p>}
      {eleven.data?.configured && <button className="text-button" disabled={elevenKeySave.isPending || busy} onClick={() => elevenKeySave.mutate(null)}>Remove saved ElevenLabs key</button>}
      <ErrorNotice error={eleven.error} retrying={eleven.isFetching} retry={() => eleven.refetch()} /><ErrorNotice error={elevenKeySave.error} />
    </div>}
    <p className="news-data-disclosure">Generate preview sends relevant feed text, news interests, DJ instructions, and the current song's title, artists, album, genres, and tags to OpenAI. The DJ uses that metadata and your music preferences to follow the music's mood. {usesEleven && ' The generated script and delivery tags are then sent to ElevenLabs to synthesize speech with Eleven v4.'} This uses your selected providers' API accounts. Saving settings alone sends nothing to either provider.</p>
    {!recoveryReady && <p className="notice">News data is unavailable while recovering. You can keep listening to music; generation and DJ scheduling are paused.</p>}
    {!ai.isPending && !ai.error && !ai.data?.configured && <p className="notice">Add an OpenAI API key before generating a news break.</p>}
    {usesEleven && !eleven.isPending && !eleven.error && !eleven.data?.configured && <p className="notice">Add an ElevenLabs key with text-to-speech access before generating with Eleven v4.</p>}
    {!hasFeeds && <p className="form-hint">Add at least one RSS or Atom feed URL above to generate a preview.</p>}
    {!player.current && <p className="notice">Choose a song first so the DJ can follow its mood.</p>}
    <div className="news-generate-actions"><button className="primary" disabled={!recoveryReady || busy || !player.current || !ai.data?.configured || (usesEleven && !eleven.data?.configured) || !hasFeeds || !dj.name.trim()} onClick={() => { cancel.reset(); playback.reset(); generate.mutate(); }}><WandSparkles size={16} />{busy ? 'Preparing preview…' : 'Save DJ and generate preview'}</button>{busy && <button disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Cancelling…' : 'Cancel generation'}</button>}</div>
    {busy && progress && !cancelled && <div className="news-progress" role="status"><LoaderCircle className="spinning" size={18} /><div><strong>{progress.message}</strong>{progress.transcript && <p className="live-transcript">{progress.transcript}</p>}</div></div>}
    {cancelled && <p className="form-hint" role="status">Generation cancelled. Your music was left unchanged.</p>}
    {!cancelled && <ErrorNotice error={generate.error} />}<ErrorNotice error={cancel.error} />
    {news && !busy && <article className="news-preview"><div className="news-preview-heading"><div><span className="eyebrow">Generated preview</span><h3>Your news break</h3></div><span className="pill">{news.engine === 'elevenlabs-v4' ? 'Eleven v4 · AI voice' : 'AI-generated voice'}</span></div><p className="voice-disclosure">This briefing uses an AI-generated voice. Review the script and its sources before playing it.</p>{news.warnings.length > 0 && <ul className="news-warnings">{news.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}<div className="news-script">{news.script}</div>
      <div className="news-sources"><h4>Sources</h4>{news.articles.map(article => <div className="news-source" key={article.id}><button onClick={() => source.mutate(article.url)}><span>{article.title}</span><ExternalLink size={13} /></button><p>{article.source}{article.publishedAt ? ` · ${formatDate(article.publishedAt)}` : ' · Publication date unavailable'}</p></div>)}</div><ErrorNotice error={source.error} />
      <p className="form-hint">Prepared for {news.songName}.{!previewMatchesTrack && ' The song changed. Generate a new preview before scheduling.'}</p>
      <div className="news-playback-actions"><button className="primary" disabled={!recoveryReady || playback.isPending || active || !previewMatchesTrack || !player.current} onClick={() => playback.mutate()}><Play size={15} fill="currentColor" />{playback.isPending ? 'Scheduling…' : active ? player.newsPhase === 'waiting' ? 'Break scheduled' : 'Break active' : 'Schedule DJ break'}</button><button disabled={!active && !playback.isPending} onClick={() => player.stopNews()}><Square size={14} />{player.newsPhase === 'waiting' || playback.isPending ? 'Cancel scheduled break' : 'Stop break'}</button></div>{active && <p className="news-playing-status" role="status">{breakStatus} Pause keeps your place; changing songs cancels the break.</p>}<p className="form-hint">Choose over-music or between-song playback in Settings → General → DJ transitions. The break stays out of your music queue and playlists.</p><ErrorNotice error={playback.error} />
    </article>}
  </section>;
}
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
