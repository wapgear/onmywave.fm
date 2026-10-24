import {
  ListMusic,
  LoaderCircle,
  MicVocal,
  Pause,
  Radio,
  Play,
  Repeat,
  Repeat1,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { useDJPlayback } from '../../dj-playback';
import { usePlayer } from '../../player';
import type { OptionsSaveSettlement, PlaybackRetrySettlement } from '../../player.types';
import { useRetryFocus } from '../../useRetryFocus';
import { IconButton } from '../IconButton/IconButton.component';
import { Artwork } from '../Shared';
import { DJBreakNotice } from './DJBreakNotice.component';
import type { PlayerProps } from './Player.types';
import { PlayerTimeline } from './PlayerTimeline.component';

import './Player.styles.css';

const fill = (percent: number): CSSProperties =>
  ({ '--range-fill': `${Math.max(0, Math.min(100, percent))}%` }) as CSSProperties;

export function Player({
  queueOpen,
  lyricsOpen,
  toggleQueue,
  toggleLyrics,
  openDetails,
  djOpen,
  toggleDJ,
  djControlsTarget,
}: PlayerProps) {
  const player = usePlayer();
  const automation = useDJPlayback();
  const notices = useRef<HTMLDivElement>(null);
  const repeatTrigger = useRef<HTMLButtonElement>(null);
  const { retryRef: libraryRetryRef, retry: retryLibraryWithFocus } = useRetryFocus({
    ownerKey: `player:library:${player.repeat}`,
    target: () => repeatTrigger.current,
    canFocusSuccess: () => !player.libraryError && !player.libraryLoading,
  });

  useLayoutEffect(() => {
    const node = notices.current;
    const root = document.documentElement;
    if (!node) return;
    const measure = () => root.style.setProperty('--player-notice-height', `${node.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => {
      observer.disconnect();
      root.style.removeProperty('--player-notice-height');
    };
  }, []);

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
  const Volume = player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;
  const showRetrying = retrying && (retryingKind === 'restore' || retryingKey === player.currentKey);
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
        <DJBreakNotice target={djControlsTarget} />
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
            {player.current && (
              <button
                onClick={(event) => {
                  if (document.activeElement === event.currentTarget)
                    nextControl.current?.focus({ preventScroll: true });
                  player.next();
                }}
              >
                Skip track
              </button>
            )}
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
        {(player.libraryLoading || player.libraryError) && (
          <div className="playback-error player-library-notice">
            <span role={player.libraryLoading ? 'status' : 'alert'}>
              {player.libraryLoading ? 'Loading whole library…' : player.libraryError}
            </span>
            {player.libraryError && (
              <button
                ref={libraryRetryRef}
                aria-disabled={player.libraryLoading || undefined}
                aria-busy={player.libraryLoading || undefined}
                onClick={() => {
                  if (player.libraryLoading) return;
                  void retryLibraryWithFocus(async () => ({ isError: !(await player.retryLibrary()) }));
                }}
              >
                {player.libraryLoading ? <LoaderCircle size={14} className="player-spin" /> : <RotateCw size={14} />}
                {player.libraryLoading ? 'Loading library…' : 'Retry library'}
              </button>
            )}
          </div>
        )}
      </div>
      <footer className="player-bar" aria-label="Music player">
        <div className="player-song">
          <button
            className="player-artwork"
            onClick={(event) => openDetails(event.currentTarget)}
            disabled={!player.current}
            aria-label={player.current ? `Song details for ${player.current.name || 'Untitled song'}` : 'Song details'}
            title="Show song details"
            aria-controls="listening-drawer"
          >
            <Artwork url={player.current?.imageUrl} name={player.current?.name ?? 'No song selected'} />
          </button>
          <div>
            <strong title={player.current?.name}>{player.current?.name ?? 'Your music, ready when you are'}</strong>
            <span title={player.current?.artists.join(', ')}>
              {player.current ? player.current.artists.join(', ') || 'Unknown artist' : 'Choose a song to begin'}
            </span>
          </div>
        </div>
        <div className="player-center">
          <div className="player-transport">
            <IconButton
              variant="player"
              className={`secondary-transport ${player.shuffle ? 'is-active' : ''}`}
              onClick={player.toggleShuffle}
              title={`Shuffle ${player.shuffle ? 'on' : 'off'}`}
              label="Shuffle"
              aria-pressed={player.shuffle}
            >
              <Shuffle size={16} aria-hidden="true" />
            </IconButton>
            <IconButton
              variant="player"
              onClick={player.previous}
              disabled={!player.current}
              title="Previous track (⌘←)"
              label="Previous track"
            >
              <SkipBack size={19} fill="currentColor" aria-hidden="true" />
            </IconButton>
            <IconButton
              ref={playControl}
              variant="play"
              onClick={player.toggle}
              disabled={!player.current}
              title={`${player.requestedPlaying ? 'Pause' : 'Play'} (Space)`}
              label={player.requestedPlaying ? 'Pause' : 'Play'}
            >
              {player.requestedPlaying ? (
                <Pause size={21} fill="currentColor" aria-hidden="true" />
              ) : (
                <Play size={21} fill="currentColor" aria-hidden="true" />
              )}
            </IconButton>
            <IconButton
              ref={nextControl}
              variant="player"
              onClick={player.next}
              disabled={!player.current}
              title="Next track (⌘→)"
              label="Next track"
            >
              <SkipForward size={19} fill="currentColor" aria-hidden="true" />
            </IconButton>
            <IconButton
              ref={repeatTrigger}
              variant="player"
              className={`secondary-transport ${player.repeat !== 'off' ? 'is-active' : ''}`}
              onClick={() =>
                player.setRepeat(player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off')
              }
              title={`Repeat: ${player.repeat}`}
              label={`Repeat: ${player.repeat}`}
              aria-pressed={player.repeat !== 'off'}
            >
              {player.repeat === 'one' ? (
                <Repeat1 size={16} aria-hidden="true" />
              ) : (
                <Repeat size={16} aria-hidden="true" />
              )}
            </IconButton>
          </div>
          <PlayerTimeline />
        </div>
        <div className="player-tools">
          {player.busy && (
            <>
              <span className="sr-only" role="status">
                Loading audio
              </span>
              <LoaderCircle size={15} className="player-spin" aria-hidden="true" />
            </>
          )}
          <IconButton
            variant="player"
            title={player.volume ? 'Mute' : 'Unmute'}
            label={player.volume ? 'Mute' : 'Unmute'}
            onClick={() => {
              if (player.volume) {
                setMutedVolume(player.volume);
                player.setVolume(0);
              } else player.setVolume(mutedVolume);
            }}
          >
            <Volume size={18} aria-hidden="true" />
          </IconButton>
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
          <IconButton
            variant="player"
            className={`player-lyrics ${lyricsOpen ? 'is-active' : ''}`}
            onClick={(event) => toggleLyrics(event.currentTarget)}
            title="Lyrics"
            label={lyricsOpen ? 'Hide lyrics' : 'Show lyrics'}
            aria-controls="listening-drawer"
            aria-expanded={lyricsOpen}
            disabled={!player.current}
          >
            <MicVocal size={18} aria-hidden="true" />
          </IconButton>
          <IconButton
            variant="player"
            className={`${queueOpen ? 'is-active' : ''}`}
            onClick={(event) => toggleQueue(event.currentTarget)}
            title="Playing Next"
            label={`${queueOpen ? 'Hide' : 'Show'} queue, ${player.queue.length} ${player.queue.length === 1 ? 'track' : 'tracks'}`}
            aria-controls="listening-drawer"
            aria-expanded={queueOpen}
          >
            <ListMusic size={21} aria-hidden="true" />
          </IconButton>
          <IconButton
            id="player-dj-controls"
            variant="player"
            className={`player-dj ${djOpen || automation.settings.enabled || player.newsPhase !== 'idle' ? 'is-active' : ''}`}
            onClick={(event) => toggleDJ(event.currentTarget)}
            title="Your DJ"
            label={djOpen ? 'Hide DJ sidebar' : 'Show DJ sidebar'}
            aria-controls="listening-drawer"
            aria-expanded={djOpen}
          >
            <Radio size={19} aria-hidden="true" />
          </IconButton>
        </div>
      </footer>
    </>
  );
}
