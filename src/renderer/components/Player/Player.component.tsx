import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  RotateCw,
  LoaderCircle,
} from 'lucide-react';
import { usePlayer } from '../../player';
import type { OptionsSaveSettlement, PlaybackRetrySettlement } from '../../player';
import { useRetryFocus } from '../../useRetryFocus';
import { useNewsRecovery } from '../../NewsRecovery';
import { Artwork } from '../Shared';
import { DJPopover } from './DJPopover.component';
import './Player.styles.css';

export const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};
const fill = (percent: number): CSSProperties =>
  ({ '--range-fill': `${Math.max(0, Math.min(100, percent))}%` }) as CSSProperties;

export function Player({
  queueOpen,
  toggleQueue,
  openRoom,
  openSettings,
}: {
  queueOpen: boolean;
  toggleQueue: () => void;
  openRoom: (source: HTMLButtonElement | null) => void;
  openSettings: (source: HTMLButtonElement | null) => void;
}) {
  const player = usePlayer();
  const recovery = useNewsRecovery();
  const knownSpeech =
    !!player.activeNews &&
    player.lastNews?.news.id === player.activeNews.id &&
    (player.newsPhase === 'speaking' ||
      player.newsPhase === 'paused' ||
      (player.newsPhase === 'tail' && player.lastNews.status === 'completed'));
  const showNewsControls = recovery.status.phase === 'ready' || knownSpeech;
  const breakStatus = {
    idle: '',
    waiting: 'DJ break scheduled for the end of this song.',
    fading: 'Lowering the music for your DJ.',
    'lead-in': 'Your DJ starts shortly.',
    speaking: 'Your DJ is on air.',
    tail: 'Your DJ has finished.',
    paused: 'DJ break paused. Use the player to resume.',
  }[player.newsPhase];
  const [breakFocus, setBreakFocus] = useState<{
    element: HTMLButtonElement;
    runId: number;
    action: 'toggle' | 'stop';
    ended?: 'cancelled' | 'stopped';
  } | null>(null);
  const ownsBreakFocus = breakFocus !== null && document.activeElement === breakFocus.element;
  const activeRun = showNewsControls && player.newsPhase !== 'idle' ? player.newsRunId : undefined;
  const visibleRuns = [
    ...(ownsBreakFocus && breakFocus.runId !== activeRun ? [breakFocus.runId] : []),
    ...(activeRun !== undefined ? [activeRun] : []),
  ];
  const notices = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = notices.current;
    const shell = node?.closest<HTMLElement>('.app-shell');
    if (!node || !shell) return;
    const measure = () => shell.style.setProperty('--player-notice-height', `${node.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => {
      observer.disconnect();
      shell.style.removeProperty('--player-notice-height');
    };
  }, []);
  const [seekDraft, setSeekDraft] = useState<{ key?: string; value: number } | null>(null);
  const [mutedVolume, setMutedVolume] = useState(0.75);
  const playControl = useRef<HTMLButtonElement>(null);
  const nextControl = useRef<HTMLButtonElement>(null);
  const volumeControl = useRef<HTMLInputElement>(null);
  const optionsKey = String(player.optionsRevision);
  const optionsAttempt = useRef<{ key: string } | null>(null);
  const [retryingOptionsKey, setRetryingOptionsKey] = useState<string | null>(null);
  const [optionsSettlement, setOptionsSettlement] = useState<OptionsSaveSettlement | null>(null);
  const retryingOptions = retryingOptionsKey === optionsKey;
  const { retryRef: optionsRetryRef, retry: retryOptionsWithFocus } = useRetryFocus({
    ownerKey: `player:options:${optionsKey}`,
    target: () => volumeControl.current,
    canFocusSuccess: () =>
      !player.optionsError &&
      (!retryingOptions ||
        (optionsSettlement?.outcome === 'success' &&
          optionsSettlement.generation === player.getOptionsSaveGeneration())),
  });
  const retryingRef = useRef<{ key?: string; kind: 'track' | 'restore' } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryingKey, setRetryingKey] = useState<string | undefined>();
  const [retryingKind, setRetryingKind] = useState<'track' | 'restore' | null>(null);
  const [retrySettlement, setRetrySettlement] = useState<PlaybackRetrySettlement | null>(null);
  const { retryRef, retry } = useRetryFocus({
    ownerKey: `player:retry:${retrying && retryingKind === 'restore' ? 'restore' : (player.currentKey ?? 'restore')}`,
    target: () => playControl.current,
    canFocusSuccess: () => {
      if (
        retrySettlement?.outcome !== 'success' ||
        retrySettlement.key !== player.currentKey ||
        retrySettlement.commandRevision !== player.getMusicCommandRevision()
      )
        return false;
      if (retrySettlement.kind === 'restore') return retrySettlement.generation === player.getResumeGeneration();
      return retrySettlement.generation === player.getPlaybackGeneration() && !player.busy && !player.error;
    },
  });
  const duration = player.duration;
  const draftSeek = seekDraft?.key === player.currentKey ? seekDraft?.value : undefined;
  const position = duration ? Math.min(draftSeek ?? player.position, duration) : player.position;
  const Volume = player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;
  const showRetrying = retrying && (retryingKind === 'restore' || retryingKey === player.currentKey);
  function commitSeek() {
    if (draftSeek !== undefined) player.seek(draftSeek);
    setSeekDraft(null);
  }
  function retryPlayback() {
    const kind: 'track' | 'restore' = player.currentKey ? 'track' : 'restore';
    if (
      retryingRef.current &&
      (retryingRef.current.kind === 'restore' || (kind === 'track' && retryingRef.current.key === player.currentKey))
    )
      return;
    const currentAttempt = { key: player.currentKey, kind };
    retryingRef.current = currentAttempt;
    setRetrying(true);
    setRetryingKey(player.currentKey);
    setRetryingKind(kind);
    setRetrySettlement(null);
    void retry(
      async () => {
        const settlement = await player.retry();
        setRetrySettlement(settlement);
        return { isError: settlement.outcome === 'failure' };
      },
      undefined,
      () => {
        if (retryingRef.current === currentAttempt) {
          retryingRef.current = null;
          setRetrying(false);
          setRetryingKey(undefined);
          setRetryingKind(null);
        }
      },
    );
  }
  function retryOptions() {
    if (optionsAttempt.current?.key === optionsKey) return;
    const currentAttempt = { key: optionsKey };
    optionsAttempt.current = currentAttempt;
    setRetryingOptionsKey(optionsKey);
    setOptionsSettlement(null);
    void retryOptionsWithFocus(
      async () => {
        const settlement = await player.retryOptions();
        if (optionsAttempt.current === currentAttempt) setOptionsSettlement(settlement);
        return { isError: settlement.outcome === 'failure' };
      },
      undefined,
      () => {
        if (optionsAttempt.current !== currentAttempt) return;
        optionsAttempt.current = null;
        setRetryingOptionsKey(null);
      },
    );
  }
  return (
    <>
      <div ref={notices} className="player-notices">
        {visibleRuns.map((runId) => {
          const current = runId === activeRun;
          const terminal =
            activeRun !== undefined
              ? 'Previous DJ break ended.'
              : breakFocus?.ended === 'cancelled'
                ? 'Scheduled DJ break cancelled.'
                : breakFocus?.ended === 'stopped'
                  ? 'DJ break stopped.'
                  : 'DJ break ended.';
          const actions: ('toggle' | 'stop')[] = current ? ['toggle', 'stop'] : breakFocus ? [breakFocus.action] : [];
          return (
            <div key={runId} className="radio-speaking">
              <span role="status">{current ? breakStatus : terminal}</span>
              {actions.map((action) => (
                <button
                  key={action}
                  aria-disabled={!current || undefined}
                  onFocus={(event) => setBreakFocus({ element: event.currentTarget, runId, action })}
                  onBlur={(event) => {
                    const element = event.currentTarget;
                    setBreakFocus((value) => (value?.element === element ? null : value));
                  }}
                  onClick={() => {
                    if (!current) return;
                    const handled = player.controlNews(runId, action);
                    if (handled && action === 'stop')
                      setBreakFocus((value) =>
                        value?.runId === runId
                          ? { ...value, ended: player.newsPhase === 'waiting' ? 'cancelled' : 'stopped' }
                          : value,
                      );
                  }}
                >
                  {!current
                    ? activeRun !== undefined
                      ? 'Previous break ended'
                      : breakFocus?.ended === 'cancelled'
                        ? 'Break cancelled'
                        : breakFocus?.ended === 'stopped'
                          ? 'Break stopped'
                          : 'Break ended'
                    : action === 'stop'
                      ? player.newsPhase === 'waiting'
                        ? 'Cancel break'
                        : 'Stop DJ'
                      : player.newsPhase === 'paused' || (player.newsPhase === 'waiting' && !player.requestedPlaying)
                        ? 'Resume'
                        : 'Pause'}
                </button>
              ))}
            </div>
          );
        })}
        {player.newsNotice && (
          <div className="playback-error">
            <span role="status">{player.newsNotice}</span>
          </div>
        )}
        {(player.error || showRetrying) && (
          <div className="playback-error">
            <span role={showRetrying ? 'status' : 'alert'}>{showRetrying ? 'Retrying playback…' : player.error}</span>
            <button
              ref={retryRef}
              aria-disabled={showRetrying || undefined}
              aria-busy={showRetrying || undefined}
              onClick={retryPlayback}
              disabled={!showRetrying && (player.busy || !player.canRetry)}
            >
              {showRetrying ? <LoaderCircle size={14} className="player-spin" /> : <RotateCw size={14} />}
              {showRetrying ? 'Retrying…' : 'Retry'}
            </button>
            <button
              onClick={(event) => {
                if (document.activeElement === event.currentTarget) nextControl.current?.focus({ preventScroll: true });
                player.next();
              }}
              disabled={!player.current}
            >
              Skip track
            </button>
          </div>
        )}
        {(player.optionsError || retryingOptions) && (
          <div className="playback-error player-options-error">
            <span role={retryingOptions ? 'status' : 'alert'}>
              {retryingOptions ? 'Saving player options…' : player.optionsError}
            </span>
            <button
              ref={optionsRetryRef}
              aria-disabled={retryingOptions || undefined}
              aria-busy={retryingOptions || undefined}
              onClick={retryOptions}
            >
              {retryingOptions ? <LoaderCircle size={14} className="player-spin" /> : <RotateCw size={14} />}
              {retryingOptions ? 'Saving options…' : 'Retry saving options'}
            </button>
          </div>
        )}
      </div>
      <footer className="player-bar" aria-label="Music player">
        <div className="player-song">
          <div className="player-artwork">
            <Artwork url={player.current?.imageUrl} name={player.current?.name ?? 'No song selected'} />
          </div>
          <div>
            <strong title={player.current?.name}>{player.current?.name ?? 'Your music, ready when you are'}</strong>
            <span title={player.current?.artists.join(', ')}>
              {player.current ? player.current.artists.join(', ') || 'Unknown artist' : 'Choose a song to begin'}
            </span>
          </div>
        </div>
        <div className="player-center">
          <div className="player-transport">
            <button
              className={`player-icon secondary-transport ${player.shuffle ? 'is-active' : ''}`}
              onClick={player.toggleShuffle}
              title={`Shuffle ${player.shuffle ? 'on' : 'off'}`}
              aria-label="Shuffle"
              aria-pressed={player.shuffle}
            >
              <Shuffle size={16} />
            </button>
            <button
              className="player-icon"
              onClick={player.previous}
              disabled={!player.current}
              title="Previous track (⌘←)"
              aria-label="Previous track"
            >
              <SkipBack size={19} fill="currentColor" />
            </button>
            <button
              ref={playControl}
              className="player-play"
              onClick={player.toggle}
              disabled={!player.current}
              title={`${player.requestedPlaying ? 'Pause' : 'Play'} (Space)`}
              aria-label={player.requestedPlaying ? 'Pause' : 'Play'}
            >
              {player.requestedPlaying ? (
                <Pause size={21} fill="currentColor" />
              ) : (
                <Play size={21} fill="currentColor" />
              )}
            </button>
            <button
              ref={nextControl}
              className="player-icon"
              onClick={player.next}
              disabled={!player.current}
              title="Next track (⌘→)"
              aria-label="Next track"
            >
              <SkipForward size={19} fill="currentColor" />
            </button>
            <button
              className={`player-icon secondary-transport ${player.repeat !== 'off' ? 'is-active' : ''}`}
              onClick={player.cycleRepeat}
              title={`Repeat ${player.repeat}`}
              aria-label={`Repeat: ${player.repeat}`}
              aria-pressed={player.repeat !== 'off'}
            >
              {player.repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>
          <div className="player-progress">
            <span>{formatTime(position)}</span>
            <input
              type="range"
              min="0"
              max={Math.max(1, duration)}
              step="0.1"
              value={duration ? position : 0}
              style={fill(duration ? (position / duration) * 100 : 0)}
              disabled={!player.current || !duration}
              aria-label="Playback position"
              aria-valuetext={
                duration
                  ? `${formatTime(position)} of ${formatTime(duration)}`
                  : `${formatTime(position)} elapsed; duration unavailable`
              }
              onChange={(event) => setSeekDraft({ key: player.currentKey, value: Number(event.target.value) })}
              onBlur={commitSeek}
              onPointerUp={commitSeek}
              onPointerCancel={() => setSeekDraft(null)}
              onKeyUp={(event) => {
                if (
                  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(
                    event.key,
                  )
                )
                  commitSeek();
              }}
            />
            <span aria-label={player.current && !duration ? 'Duration unavailable' : 'Time remaining'}>
              {duration || !player.current ? `−${formatTime(Math.max(0, duration - position))}` : '--:--'}
            </span>
          </div>
        </div>
        <div className="player-tools">
          <DJPopover openRoom={openRoom} openSettings={openSettings} />
          {player.busy && (
            <>
              <span className="sr-only" role="status">
                Loading audio
              </span>
              <LoaderCircle size={15} className="player-spin" aria-hidden="true" />
            </>
          )}
          <button
            className="player-icon"
            title={player.volume ? 'Mute' : 'Unmute'}
            aria-label={player.volume ? 'Mute' : 'Unmute'}
            onClick={() => {
              if (player.volume) {
                setMutedVolume(player.volume);
                player.setVolume(0);
              } else player.setVolume(mutedVolume);
            }}
          >
            <Volume size={18} />
          </button>
          <input
            ref={volumeControl}
            className="player-volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={player.volume}
            style={fill(player.volume * 100)}
            onChange={(event) => player.setVolume(Number(event.target.value))}
            aria-label="Volume"
            aria-valuetext={`${Math.round(player.volume * 100)} percent`}
          />
          <button
            className={`player-icon ${queueOpen ? 'is-active' : ''}`}
            onClick={toggleQueue}
            title="Playing Next"
            aria-label={`${queueOpen ? 'Hide' : 'Show'} queue, ${player.queue.length} ${player.queue.length === 1 ? 'track' : 'tracks'}`}
            aria-controls="listening-drawer"
            aria-expanded={queueOpen}
          >
            <ListMusic size={21} />
          </button>
        </div>
      </footer>
    </>
  );
}
