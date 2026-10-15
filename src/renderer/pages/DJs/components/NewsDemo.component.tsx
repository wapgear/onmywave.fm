import { useMutation } from '@tanstack/react-query';
import { Play, Square } from 'lucide-react';
import demo from '../../../public/demo/news-break.json';
import { usePlayer } from '../../../player';
import { unwrap } from '../../../api';
import { ErrorNotice } from '../../../components/Shared';

export function NewsDemo() {
  const player = usePlayer();
  const breakStatus = { idle: '', waiting: 'DJ break scheduled for the end of this song.', fading: 'Lowering the music for your DJ.', 'lead-in': 'Your DJ starts shortly.', speaking: 'Your DJ is on air.', tail: 'Finishing the break before the next song.', paused: 'DJ break paused. Use the player to resume.' }[player.newsPhase];
  const playback = useMutation({ mutationFn: () => player.scheduleNews({ ...demo, engine: 'openai-tts', audioUrl: new URL('/demo/news-break.mp3', window.location.href).href }, 0.05) });
  const source = useMutation({ mutationFn: async (url: string) => unwrap(await window.wave.openSource(url)) });
  const active = player.activeNewsId === demo.id && player.newsPhase !== 'idle';
  return <section className="news-preview" aria-label="DJ demo">
    <div className="news-preview-heading"><div><span className="eyebrow">Demo · {demo.articles.length} {demo.articles.length === 1 ? 'story' : 'stories'}</span><h2>A short radio-host example</h2></div><span className="pill">AI-generated voice</span></div>
    <p>A saved host example, recorded {new Date(demo.createdAt).toLocaleDateString()}. This demonstration uses a fixed script; its headlines may have changed. Generate a preview in a DJ's settings to follow your current music's mood.</p>
    <p className="form-hint">Choose music, then schedule the demo for the end of the current song. Settings → General → DJ transitions controls whether the voice plays over the ending or between songs, with time to breathe before and after. No API key or generation request is needed to replay it.</p>
    {!player.current && <p className="notice">Choose a song before scheduling the demo.</p>}
    <div className="news-playback-actions"><button className="primary" disabled={!player.current || playback.isPending || active} onClick={() => playback.mutate()}><Play size={15} />{playback.isPending ? 'Scheduling…' : active ? player.newsPhase === 'waiting' ? 'Demo scheduled' : player.newsPhase === 'paused' ? 'Demo paused' : 'Demo active' : 'Schedule DJ break'}</button><button disabled={!active && !playback.isPending} onClick={() => player.stopNews()}><Square size={14} />{player.newsPhase === 'waiting' || playback.isPending ? 'Cancel scheduled demo' : 'Stop demo'}</button></div>
    {active && <p role="status">{breakStatus} Pause keeps your place; changing songs cancels the demo.</p>}
    <ErrorNotice error={playback.error} />
    <details><summary>Transcript and sources</summary><p className="news-script">{demo.script}</p><div className="news-sources">{demo.articles.map(article => <div className="news-source" key={article.id}><button onClick={() => source.mutate(article.url)}>{article.title}</button><p>{article.source}</p></div>)}</div></details>
    <ErrorNotice error={source.error} />
  </section>;
}
