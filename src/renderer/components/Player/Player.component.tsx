import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, RotateCw, LoaderCircle } from 'lucide-react';
import { usePlayer } from '../../player';
import { Artwork } from '../Shared';
import { DJPopover } from './DJPopover.component';
import './Player.styles.css';

export const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};
const fill = (percent: number): CSSProperties => ({ '--range-fill': `${Math.max(0, Math.min(100, percent))}%` }) as CSSProperties;

export function Player({ queueOpen, toggleQueue, openRoom, openSettings }: { queueOpen: boolean; toggleQueue: () => void; openRoom: () => void; openSettings: () => void }) {
  const player = usePlayer();
  const breakStatus = { idle: '', waiting: 'DJ break scheduled for the end of this song.', fading: 'Lowering the music for your DJ.', 'lead-in': 'Your DJ starts shortly.', speaking: 'Your DJ is on air.', tail: 'Your DJ has finished.', paused: 'DJ break paused. Use the player to resume.' }[player.newsPhase];
  const notices = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = notices.current;
    const shell = node?.closest<HTMLElement>('.app-shell');
    if (!node || !shell) return;
    const measure = () => shell.style.setProperty('--player-notice-height', `${node.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => { observer.disconnect(); shell.style.removeProperty('--player-notice-height'); };
  }, []);
  const [seekDraft, setSeekDraft] = useState<{ key?: string; value: number } | null>(null);
  const [mutedVolume, setMutedVolume] = useState(0.75);
  const duration = player.duration;
  const draftSeek = seekDraft?.key === player.currentKey ? seekDraft?.value : undefined;
  const position = duration ? Math.min(draftSeek ?? player.position, duration) : player.position;
  const Volume = player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;
  function commitSeek() { if (draftSeek !== undefined) player.seek(draftSeek); setSeekDraft(null); }
  return <>
    <div ref={notices} className="player-notices">
      {player.newsPhase !== 'idle' && <div className="radio-speaking"><span role="status">{breakStatus}</span><button onClick={player.toggle}>{player.newsPhase === 'paused' || (player.newsPhase === 'waiting' && !player.requestedPlaying) ? 'Resume' : 'Pause'}</button><button onClick={player.stopNews}>{player.newsPhase === 'waiting' ? 'Cancel break' : 'Stop DJ'}</button></div>}
      {player.error && <div className="playback-error"><span role="alert">{player.error}</span><button onClick={player.retry} disabled={player.busy || !player.canRetry}><RotateCw size={14} /> Retry</button><button onClick={player.next} disabled={!player.current}>Skip track</button></div>}
      {player.optionsError && <div className="playback-error player-options-error"><span role="alert">{player.optionsError}</span><button onClick={player.retryOptions}><RotateCw size={14} /> Retry saving options</button></div>}
    </div>
    <footer className="player-bar" aria-label="Music player">
      <div className="player-song"><div className="player-artwork"><Artwork url={player.current?.imageUrl} name={player.current?.name ?? 'No song selected'} /></div><div><strong title={player.current?.name}>{player.current?.name ?? 'Your music, ready when you are'}</strong><span title={player.current?.artists.join(', ')}>{player.current ? player.current.artists.join(', ') || 'Unknown artist' : 'Choose a song to begin'}</span></div></div>
      <div className="player-center">
        <div className="player-transport">
          <button className={`player-icon secondary-transport ${player.shuffle ? 'is-active' : ''}`} onClick={player.toggleShuffle} title={`Shuffle ${player.shuffle ? 'on' : 'off'}`} aria-label="Shuffle" aria-pressed={player.shuffle}><Shuffle size={16} /></button>
          <button className="player-icon" onClick={player.previous} disabled={!player.current} title="Previous track (⌘←)" aria-label="Previous track"><SkipBack size={19} fill="currentColor" /></button>
          <button className="player-play" onClick={player.toggle} disabled={!player.current} title={`${player.requestedPlaying ? 'Pause' : 'Play'} (Space)`} aria-label={player.requestedPlaying ? 'Pause' : 'Play'}>{player.requestedPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button>
          <button className="player-icon" onClick={player.next} disabled={!player.current} title="Next track (⌘→)" aria-label="Next track"><SkipForward size={19} fill="currentColor" /></button>
          <button className={`player-icon secondary-transport ${player.repeat !== 'off' ? 'is-active' : ''}`} onClick={player.cycleRepeat} title={`Repeat ${player.repeat}`} aria-label={`Repeat: ${player.repeat}`} aria-pressed={player.repeat !== 'off'}>{player.repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}</button>
        </div>
        <div className="player-progress"><span>{formatTime(position)}</span><input type="range" min="0" max={Math.max(1, duration)} step="0.1" value={duration ? position : 0} style={fill(duration ? position / duration * 100 : 0)} disabled={!player.current || !duration} aria-label="Playback position" aria-valuetext={duration ? `${formatTime(position)} of ${formatTime(duration)}` : `${formatTime(position)} elapsed; duration unavailable`} onChange={event => setSeekDraft({ key: player.currentKey, value: Number(event.target.value) })} onBlur={commitSeek} onPointerUp={commitSeek} onPointerCancel={() => setSeekDraft(null)} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commitSeek(); }} /><span aria-label={player.current && !duration ? 'Duration unavailable' : 'Time remaining'}>{duration || !player.current ? `−${formatTime(Math.max(0, duration - position))}` : '--:--'}</span></div>
      </div>
      <div className="player-tools"><DJPopover openRoom={openRoom} openSettings={openSettings} />{player.busy && <><span className="sr-only" role="status">Loading audio</span><LoaderCircle size={15} className="player-spin" aria-hidden="true" /></>}<button className="player-icon" title={player.volume ? 'Mute' : 'Unmute'} aria-label={player.volume ? 'Mute' : 'Unmute'} onClick={() => { if (player.volume) { setMutedVolume(player.volume); player.setVolume(0); } else player.setVolume(mutedVolume); }}><Volume size={18} /></button><input className="player-volume" type="range" min="0" max="1" step="0.01" value={player.volume} style={fill(player.volume * 100)} onChange={event => player.setVolume(Number(event.target.value))} aria-label="Volume" aria-valuetext={`${Math.round(player.volume * 100)} percent`} /><button className={`player-icon ${queueOpen ? 'is-active' : ''}`} onClick={toggleQueue} title="Playing Next" aria-label={`${queueOpen ? 'Hide' : 'Show'} queue, ${player.queue.length} tracks`} aria-controls="listening-drawer" aria-expanded={queueOpen}><ListMusic size={21} /></button></div>
    </footer>
  </>;
}
