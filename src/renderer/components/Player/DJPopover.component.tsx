import { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ExternalLink, Radio, Settings, X } from 'lucide-react';
import type { NewsBreak } from '../../../shared/types';
import { unwrap } from '../../api';
import { usePlayer } from '../../player';
import { useDJPlayback } from '../../dj-playback';
import { ErrorNotice } from '../Shared';
import './DJPopover.styles.css';

export function DJPopover({ openRoom, openSettings }: { openRoom: () => void; openSettings: () => void }) {
  const player = usePlayer();
  const automation = useDJPlayback();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const active = automation.settings.enabled || !!player.activeNews;
  const phaseLabels = { idle: 'Enabled', waiting: 'Scheduled', fading: 'Fading music', 'lead-in': 'Starting', speaking: 'On air', tail: 'Returning to music', paused: 'Paused' };
  const status = player.newsLoading ? 'Loading' : player.newsPhase !== 'idle' ? phaseLabels[player.newsPhase]
    : automation.error ? 'Needs attention' : automation.waitingForPreparation ? 'Waiting' : automation.preparing ? 'Checking pool' : automation.pending ? 'Ready'
    : automation.settings.enabled ? player.requestedPlaying ? 'Enabled' : 'Waiting for music' : 'Off';
  const upcoming = player.activeNews ?? automation.pending;
  const source = useMutation({ mutationFn: async (url: string) => unwrap(await window.wave.openSource(url)) });
  function position() {
    if (!trigger.current || !popup.current) return;
    const rect = trigger.current.getBoundingClientRect();
    popup.current.style.right = `${Math.max(12, Math.min(window.innerWidth - rect.right, window.innerWidth - 372))}px`;
    popup.current.style.bottom = `${window.innerHeight - rect.top + 12}px`;
    popup.current.style.maxHeight = `${Math.max(120, rect.top - 24)}px`;
  }
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [open]);
  function navigate(action: () => void) { popup.current?.hidePopover(); action(); }
  function story(news: NewsBreak) {
    return <div className="dj-story"><p>{news.script}</p>{news.articles.length ? <ul>{news.articles.map(article => <li key={article.id}><button className="dj-source-link" onClick={() => source.mutate(article.url)}>{article.title}<ExternalLink size={12} aria-hidden="true" /></button><small>{article.source}</small></li>)}</ul> : <p className="dj-hint">No source references saved for this recording.</p>}</div>;
  }
  return <>
    <button ref={trigger} className={`player-dj ${active ? 'is-active' : ''}`} popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} aria-label={`DJ: ${status}. Open DJ controls`} onClick={position}><Radio size={17} /><span>DJ</span><span className="dj-button-status">{status}</span></button>
    <div id={id} ref={popup} className="dj-popover" popover="auto" role="dialog" aria-label="DJ controls" onToggle={event => {
      const opening = event.newState === 'open';
      setOpen(opening);
      if (opening) { position(); popup.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }
      else if (popup.current?.contains(document.activeElement) || document.activeElement === document.body) trigger.current?.focus({ preventScroll: true });
    }}>
      <header><div><h2>Your DJ</h2><span className={`dj-status ${active ? 'is-active' : ''}`} role="status">{status === 'Scheduled' ? 'Scheduled near track end' : status === 'Loading' ? 'Loading news audio…' : status}</span></div><button className="icon-button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close DJ controls"><X size={18} /></button></header>
      <section className="dj-control"><div><strong>DJ schedule</strong><p className="dj-hint">Check for a news break every {automation.settings.everySongs} {automation.settings.everySongs === 1 ? 'song' : 'songs'} while enabled. Music continues when nothing qualifies.</p></div><button className={automation.settings.enabled ? '' : 'primary'} disabled={automation.update.isPending || (!automation.settings.enabled && !automation.room)} onClick={() => automation.update.mutate({ enabled: !automation.settings.enabled })}>{automation.settings.enabled ? 'Disable DJ' : 'Enable DJ'}</button></section>
      {automation.settings.enabled && !automation.preparing && !upcoming && !automation.error && <p className="dj-automation-note">Next break in {automation.songsUntilBreak} {automation.songsUntilBreak === 1 ? 'song' : 'songs'}. Skips do not count.</p>}
      <ErrorNotice error={automation.error ? new Error(automation.error) : null} retry={automation.error && automation.room ? automation.retry : undefined} />
      <ErrorNotice error={automation.update.error} />
      <ErrorNotice error={player.error ? new Error(player.error) : null} />
      <section><h3>Quick configuration</h3><label className="dj-take-label" htmlFor={`${id}-room`}>News profile</label><select id={`${id}-room`} value={automation.room?.id ?? ''} disabled={automation.update.isPending || !automation.state.data} onChange={event => automation.update.mutate({ roomId: event.target.value || null })}><option value="">Choose a news profile</option>{automation.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select>
        {automation.state.isPending && <p className="dj-hint" role="status">Loading news profiles…</p>}
        <ErrorNotice error={automation.state.error} retry={() => void automation.state.refetch()} />
        {automation.room ? <p className="dj-hint">{automation.state.data?.djs.find(dj => dj.id === automation.room?.room.djId)?.name ?? 'Choose a host in the News bucket'} · {automation.sources.map(value => value.name).join(', ') || 'No sources selected'}</p> : <p className="dj-hint">Make a room available in News bucket to select it here.</p>}
        <p className="dj-hint">The DJ picks saved news matching this room. News preparation runs separately in News bucket settings.</p>
      </section>
      <section><h3>{player.newsPhase !== 'idle' && player.newsPhase !== 'waiting' ? 'Current news' : 'Upcoming news'}</h3>{upcoming ? story(upcoming) : <p className="dj-hint">{automation.waitingForPreparation ? 'Waiting for the current preparation to finish…' : automation.preparing ? 'Checking saved news…' : automation.settings.enabled ? 'The DJ checks saved news when a break is due. An empty pool is skipped.' : 'Enable DJ to start your schedule.'}</p>}{automation.pending && !player.activeNews && <p className="dj-hint">Ready for the next suitable song ending. Music continues if this ending is unsuitable.</p>}</section>
      <section><h3>Last heard this session</h3>{player.lastNews ? <><p className="dj-hint">{new Date(player.lastNews.startedAt).toLocaleTimeString()} · {player.lastNews.status === 'completed' ? 'Played to the end' : player.lastNews.status === 'playing' ? 'On air' : 'Interrupted'}{player.lastNews.status === 'playing' && player.newsPhase === 'paused' ? ' · Paused' : ''}</p>{story(player.lastNews.news)}</> : <p className="dj-hint">No news has played in this session.</p>}</section>
      <ErrorNotice error={source.error} />
      <footer><button onClick={() => navigate(openRoom)}><Radio size={15} />News bucket</button><button onClick={() => navigate(openSettings)}><Settings size={15} />DJ settings</button></footer>
    </div>
  </>;
}
