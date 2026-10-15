import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { normalizeDJPlaybackSettings } from '../shared/dj-playback';
import { defaultNewsTransitionSettings, normalizeNewsTransitionSettings } from '../shared/news-transitions';
import type { NewsTransitionSettings } from '../shared/news-transitions';
import type { Connection, NewsBreak, PlaybackSnapshot, Song } from '../shared/types';
import { unwrap, WaveError } from './api';

type HeardNews = { news: NewsBreak; startedAt: string; status: 'playing' | 'completed' | 'interrupted' };
type NewsPhase = 'waiting' | 'fading' | 'lead-in' | 'speaking' | 'tail';
type ScheduledNews = { token: number; key: string; duration: number; bed: number; phase: NewsPhase; trackEnded: boolean; settings: NewsTransitionSettings; elapsed: number; lastTick: number; startLevel: number };

type QueueEntry = { key: string; song: Song };
type PlayerState = {
  queue: QueueEntry[]; current?: Song; currentKey?: string; playing: boolean; requestedPlaying: boolean; busy: boolean;
  position: number; duration: number; error: string | null; volume: number; shuffle: boolean;
  repeat: PlaybackSnapshot['repeat']; canRetry: boolean; completedSongs: number;
  play(songs: Song[], index?: number): void; playQueueEntry(key: string): void; enqueue(songs: Song[]): void;
  toggle(): void; next(): void; previous(): void; seek(seconds: number): void;
  setVolume(value: number): void; toggleShuffle(): void; cycleRepeat(): void;
  removeQueue(key: string): void; retry(): void;
  newsPhase: 'idle' | NewsPhase | 'paused'; activeNewsId?: string;
  newsLoading: boolean; activeNews?: NewsBreak; lastNews: HeardNews | null;
  scheduleNews(news: NewsBreak, duckVolume: number): Promise<void>; stopNews(): void;
};
const PlayerContext = createContext<PlayerState | null>(null);
export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('Player requires PlayerProvider');
  return value;
}
const entries = (songs: Song[]): QueueEntry[] => songs.map(song => ({ key: crypto.randomUUID(), song }));

export function PlayerProvider({ connection, children }: { connection: Connection | null; children: ReactNode }) {
  const preferences = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()) });
  const djSettings = normalizeDJPlaybackSettings(preferences.data?.djPlayback);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [requestedPlaying, setRequestedPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.75);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<PlaybackSnapshot['repeat']>('off');
  const [restore, setRestore] = useState<PlaybackSnapshot | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [newsPhase, setNewsPhase] = useState<PlayerState['newsPhase']>('idle');
  const [activeNewsId, setActiveNewsId] = useState<string>();
  const [activeNews, setActiveNews] = useState<NewsBreak>();
  const [newsLoading, setNewsLoading] = useState(false);
  const [lastNews, setLastNews] = useState<HeardNews | null>(null);
  const [completedSongs, setCompletedSongs] = useState(0);
  const countedSongGeneration = useRef(-1);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speech = useRef<HTMLAudioElement | null>(null);
  const newsActive = useRef(false);
  const newsGeneration = useRef(0);
  const newsSchedule = useRef<ScheduledNews | null>(null);
  const cancelPreload = useRef<(() => void) | null>(null);
  const finishFade = useRef<((completed: boolean) => void) | null>(null);
  const consumedEnd = useRef<number | null>(null);
  const fadeOnNext = useRef<{ generation: number; seconds: number } | null>(null);
  const transitionSettings = useRef(defaultNewsTransitionSettings());
  const duck = useRef(1);
  const fadeFrame = useRef(0);
  const offset = useRef(0);
  const converted = useRef(false);
  const generation = useRef(0);
  const resumeGeneration = useRef(0);
  const target = useRef(0);
  const playIntent = useRef(false);
  const preparing = useRef(false);
  const shuffleHistory = useRef<{ keys: string[]; cursor: number; visited: Set<string> }>({ keys: [], cursor: -1, visited: new Set() });
  const requestPlayback = useCallback((value: boolean) => { playIntent.current = value; setRequestedPlaying(value); }, []);
  const current = queue[index]?.song;
  const currentKey = queue[index]?.key;
  const duration = current?.duration || 0;
  const live = useRef({ queue, index, current, repeat, shuffle, position, volume });
  useEffect(() => { live.current = { queue, index, current, repeat, shuffle, position, volume }; }, [queue, index, current, repeat, shuffle, position, volume]);

  const fadeMusic = useCallback((to: number, seconds = 1, followPlayback = false): Promise<boolean> => {
    cancelAnimationFrame(fadeFrame.current);
    finishFade.current?.(false);
    return new Promise(resolve => {
      finishFade.current = resolve;
      const from = duck.current;
      let previousTime = performance.now();
      let elapsed = 0;
      const step = (time: number) => {
        if (!followPlayback || (playIntent.current && audio.current && !audio.current.paused && audio.current.readyState >= 3)) elapsed += time - previousTime;
        previousTime = time;
        const progress = seconds <= 0 ? 1 : Math.min(1, elapsed / (seconds * 1000));
        duck.current = from + (to - from) * progress;
        if (audio.current) audio.current.volume = live.current.volume * duck.current;
        if (progress < 1) fadeFrame.current = requestAnimationFrame(step);
        else { finishFade.current = null; resolve(true); }
      };
      fadeFrame.current = requestAnimationFrame(step);
    });
  }, []);

  const stopNews = useCallback((preserveBed = false) => {
    ++newsGeneration.current;
    newsActive.current = false;
    newsSchedule.current = null;
    cancelPreload.current?.();
    cancelPreload.current = null;
    if (speech.current) {
      speech.current.onended = speech.current.onerror = speech.current.onplay = null;
      speech.current.pause();
      speech.current.removeAttribute('src');
      speech.current.load();
      speech.current = null;
    }
    fadeOnNext.current = preserveBed ? { generation: generation.current + 1, seconds: transitionSettings.current.fadeInSeconds } : null;
    if (preserveBed) {
      cancelAnimationFrame(fadeFrame.current);
      finishFade.current?.(false);
      finishFade.current = null;
    } else void fadeMusic(1);
    setNewsPhase('idle');
    setNewsLoading(false);
    setActiveNews(undefined);
    setLastNews(value => value?.status === 'playing' ? { ...value, status: 'interrupted' } : value);
    setActiveNewsId(undefined);
  }, [fadeMusic]);

  const load = useCallback(async (song: Song, transcode = false, start = 0) => {
    const token = ++generation.current;
    consumedEnd.current = null;
    const element = audio.current;
    if (!element) return;
    preparing.current = true;
    element.pause();
    element.removeAttribute('src');
    element.load();
    setBusy(true);
    setError(null);
    try {
      const resource = unwrap(await window.wave.preparePlayback({ id: song.id, transcode, offsetSeconds: start }));
      if (token !== generation.current) return;
      offset.current = resource.offsetSeconds;
      converted.current = resource.transcoded;
      target.current = resource.transcoded ? 0 : start;
      setPosition(start);
      element.src = resource.url;
      element.load();
      preparing.current = false;
      if (playIntent.current) await element.play();
      if (token !== generation.current) return;
      if (!playIntent.current) element.pause();
      setBusy(false);
    } catch (cause) {
      if (token !== generation.current) return;
      preparing.current = false;
      setBusy(false);
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      requestPlayback(false);
      setPlaying(false);
      setError(cause instanceof Error ? cause.message : 'Playback could not start. Retry or skip this track.');
    }
  }, [requestPlayback]);

  const changeTrack = useCallback((nextIndex: number) => {
    ++generation.current;
    preparing.current = true;
    setBusy(true);
    audio.current?.pause();
    const state = live.current;
    live.current = { ...state, index: nextIndex, current: state.queue[nextIndex]?.song, position: 0 };
    setPosition(0);
    setIndex(nextIndex);
    setAttempt(value => value + 1);
  }, []);

  const next = useCallback((afterNews = false) => {
    stopNews(afterNews);
    const state = live.current;
    if (!state.queue.length) return;
    const history = shuffleHistory.current;
    const key = state.queue[state.index]?.key;
    const available = new Set(state.queue.map(item => item.key));
    history.visited = new Set([...history.visited].filter(item => available.has(item)));
    let nextIndex: number | undefined;
    if (state.shuffle) {
      if (key) {
        history.visited.add(key);
        if (history.keys[history.cursor] !== key) {
          history.keys = [...history.keys.slice(0, history.cursor + 1), key].slice(-state.queue.length);
          history.cursor = history.keys.length - 1;
        }
      }
      while (history.cursor + 1 < history.keys.length && nextIndex === undefined) {
        history.cursor += 1;
        const candidateKey = history.keys[history.cursor];
        const candidate = state.queue.findIndex(item => item.key === candidateKey);
        if (candidate >= 0) nextIndex = candidate;
      }
      if (nextIndex === undefined) {
        let candidates = state.queue.map((item, i) => ({ key: item.key, index: i })).filter(item => !history.visited.has(item.key));
        if (!candidates.length && state.repeat === 'all') {
          history.visited = new Set(key ? [key] : []);
          candidates = state.queue.map((item, i) => ({ key: item.key, index: i })).filter(item => item.key !== key);
          if (!candidates.length) nextIndex = state.index;
        }
        if (candidates.length) {
          const chosen = candidates[Math.floor(Math.random() * candidates.length)];
          nextIndex = chosen.index;
          history.keys.push(chosen.key);
          if (history.keys.length > state.queue.length) history.keys.shift();
          history.cursor = history.keys.length - 1;
          history.visited.add(chosen.key);
        }
      }
    } else if (state.index + 1 < state.queue.length) nextIndex = state.index + 1;
    else if (state.repeat === 'all') nextIndex = 0;
    if (nextIndex !== undefined) {
      requestPlayback(true);
      changeTrack(nextIndex);
    } else {
      stopNews();
      ++generation.current;
      consumedEnd.current = generation.current;
      preparing.current = false;
      requestPlayback(false);
      audio.current?.pause();
      audio.current?.removeAttribute('src');
      audio.current?.load();
      setBusy(false);
      setPlaying(false);
    }
  }, [stopNews, requestPlayback, changeTrack]);

  const checkScheduledNews = useCallback(() => {
    const planned = newsSchedule.current;
    const music = audio.current;
    const voice = speech.current;
    if (!planned || !music || !voice) return;
    const now = performance.now();
    const delta = Math.max(0, (now - planned.lastTick) / 1000);
    planned.lastTick = now;
    if (!playIntent.current) return;
    const state = live.current;
    if (state.queue[state.index]?.key !== planned.key) { stopNews(); return; }
    if (!planned.trackEnded && (music.paused || music.seeking || music.readyState < 3)) return;
    const settings = planned.settings;
    const overMusic = settings.mode === 'over-music';
    const remaining = Math.max(0, state.current!.duration - offset.current - music.currentTime);
    const enter = (phase: NewsPhase) => {
      planned.phase = phase;
      planned.elapsed = 0;
      setNewsPhase(phase);
    };
    if (planned.phase === 'waiting') {
      const budget = overMusic ? settings.fadeOutSeconds + settings.leadInSeconds + planned.duration + settings.postSpeechSeconds + 0.3 : settings.fadeOutSeconds;
      if (!planned.trackEnded && remaining > budget) return;
      newsActive.current = true;
      planned.startLevel = duck.current;
      cancelAnimationFrame(fadeFrame.current);
      finishFade.current?.(false);
      finishFade.current = null;
      enter('fading');
    } else planned.elapsed += delta;
    if (planned.phase === 'fading') {
      const progress = settings.fadeOutSeconds === 0 ? 1 : Math.min(1, planned.elapsed / settings.fadeOutSeconds);
      const eased = progress * progress * (3 - 2 * progress);
      duck.current = planned.startLevel + ((overMusic ? planned.bed : 0) - planned.startLevel) * eased;
      music.volume = live.current.volume * duck.current;
      if (progress < 1 && !planned.trackEnded) return;
      if (!overMusic && !planned.trackEnded) return;
      enter('lead-in');
    }
    if (planned.phase === 'lead-in' && planned.elapsed >= settings.leadInSeconds) {
      enter('speaking');
      void voice.play().then(() => {
        if (planned.token !== newsGeneration.current) return;
        if (!playIntent.current) { voice.pause(); setNewsPhase('paused'); setPlaying(false); }
        else setPlaying(true);
      }).catch(() => {
        if (planned.token !== newsGeneration.current) return;
        const ended = planned.trackEnded;
        stopNews();
        setError('The news break could not start. Your music can continue.');
        if (ended) next();
      });
    }
    if (planned.phase === 'tail' && planned.elapsed >= settings.postSpeechSeconds && planned.trackEnded) {
      const seconds = settings.fadeInSeconds;
      consumedEnd.current = generation.current;
      next(true);
      if (fadeOnNext.current) fadeOnNext.current.seconds = seconds;
    }
  }, [next, stopNews]);

  useEffect(() => {
    const lifecycle = generation;
    const speechLifecycle = newsGeneration;
    const speechElement = speech;
    const preload = cancelPreload;
    const fadeCompletion = finishFade;
    const scheduled = newsSchedule;
    const activeNews = newsActive;
    const deferredFade = fadeOnNext;
    const element = new Audio();
    element.preload = 'metadata';
    audio.current = element;
    element.onplay = () => { if (!playIntent.current) element.pause(); else setPlaying(true); };
    element.onpause = () => setPlaying(false);
    element.onwaiting = () => setBusy(true);
    element.onplaying = () => {
      if (!playIntent.current) { element.pause(); return; }
      setBusy(false);
      if (!element.paused && fadeOnNext.current !== null && generation.current >= fadeOnNext.current.generation) {
        const seconds = fadeOnNext.current.seconds;
        fadeOnNext.current = null;
        void fadeMusic(1, seconds, true);
      }
    };
    element.onloadedmetadata = () => {
      if (target.current > 0) {
        element.currentTime = target.current;
        target.current = 0;
      }
      setBusy(false);
    };
    element.ontimeupdate = () => { setPosition(offset.current + element.currentTime); void checkScheduledNews(); };
    const newsClock = window.setInterval(() => void checkScheduledNews(), 25);
    element.onended = () => {
      if (!element.ended || consumedEnd.current === generation.current) return;
      if (countedSongGeneration.current !== generation.current) {
        countedSongGeneration.current = generation.current;
        setCompletedSongs(value => value + 1);
      }
      if (newsSchedule.current && (newsActive.current || newsSchedule.current.settings.mode === 'between-songs')) {
        newsSchedule.current.trackEnded = true;
        setPlaying(playIntent.current);
        checkScheduledNews();
        return;
      }
      stopNews();
      if (live.current.repeat === 'one') {
        const song = live.current.current;
        if (song) void load(song, converted.current, 0);
      } else next();
    };
    element.onerror = () => {
      const song = live.current.current;
      if (!song || !element.src || preparing.current) return;
      stopNews();
      if (!converted.current) void load(song, true, live.current.position);
      else {
        requestPlayback(false);
        setBusy(false);
        setPlaying(false);
        setError('This track could not be played. Check your connection, then retry or skip.');
      }
    };
    return () => {
      ++lifecycle.current;
      ++speechLifecycle.current;
      clearInterval(newsClock);
      scheduled.current = null;
      deferredFade.current = null;
      activeNews.current = false;
      preload.current?.();
      preload.current = null;
      cancelAnimationFrame(fadeFrame.current);
      fadeCompletion.current?.(false);
      fadeCompletion.current = null;
      if (speechElement.current) {
        speechElement.current.onended = speechElement.current.onerror = speechElement.current.onplay = null;
        speechElement.current.pause();
        speechElement.current.removeAttribute('src');
        speechElement.current.load();
        speechElement.current = null;
      }
      element.onplay = element.onpause = element.onwaiting = element.onplaying = null;
      element.onerror = element.onended = element.ontimeupdate = element.onloadedmetadata = null;
      element.pause();
      element.removeAttribute('src');
      element.load();
      audio.current = null;
    };
  }, [load, next, checkScheduledNews, stopNews, fadeMusic, requestPlayback]);

  const restoreSession = useCallback(async (saved: PlaybackSnapshot) => {
    const resumeToken = ++resumeGeneration.current;
    setBusy(true);
    setError(null);
    setRestore(saved);
    try {
      const songs: Song[] = [];
      let restoredIndex = 0;
      for (let n = 0; n < saved.trackIds.length; n += 50) {
        const batch = await Promise.all(saved.trackIds.slice(n, n + 50).map(id => window.wave.song(id).then(unwrap).catch((cause: unknown) => {
          if (cause instanceof WaveError && cause.code === 'not-found') return null;
          throw cause;
        })));
        if (resumeToken !== resumeGeneration.current) return;
        batch.forEach((song, j) => {
          if (song) {
            if (n + j < saved.currentIndex) restoredIndex++;
            songs.push(song);
          }
        });
      }
      if (!songs.length) throw new Error('The saved session tracks are no longer available.');
      stopNews();
      target.current = songs[restoredIndex]?.id === saved.trackIds[saved.currentIndex] ? saved.position : 0;
      requestPlayback(false);
      setPlaying(false);
      setPosition(target.current);
      ++generation.current;
      preparing.current = true;
      shuffleHistory.current = { keys: [], cursor: -1, visited: new Set() };
      setQueue(entries(songs));
      setIndex(Math.min(restoredIndex, songs.length - 1));
      setRestore(null);
    } catch (cause) { if (resumeToken === resumeGeneration.current) setError(cause instanceof Error ? cause.message : 'Could not restore the session.'); }
    finally { if (resumeToken === resumeGeneration.current) setBusy(false); }
  }, [requestPlayback, stopNews]);

  useEffect(() => {
    let active = true;
    const token = ++resumeGeneration.current;
    const restoreLifecycle = resumeGeneration;
    void window.wave.getLocalState().then(unwrap).then(state => {
      if (!active || token !== restoreLifecycle.current) return;
      const saved = state.playback;
      if (!saved || saved.connectionId !== connection?.id) return;
      setVolume(saved.volume);
      setShuffle(saved.shuffle);
      setRepeat(saved.repeat);
      if (saved.trackIds.length) void restoreSession(saved);
    }).catch(() => { if (active && token === restoreLifecycle.current) setError('Your previous listening session could not be restored.'); });
    return () => { active = false; ++restoreLifecycle.current; };
  }, [connection?.id, restoreSession, restoreAttempt]);

  useEffect(() => {
    if (currentKey && current) {
      const start = target.current;
      target.current = 0;
      void load(current, false, start);
    }
    // Queue occurrence identity changes only when a different occurrence starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, attempt, load]);

  useEffect(() => { if (audio.current) audio.current.volume = volume * duck.current; if (speech.current) speech.current.volume = volume * djSettings.voiceVolume; }, [volume, djSettings.voiceVolume]);

  useEffect(() => {
    if (!connection) return;
    const save = () => {
      const state = live.current;
      if (!state.queue.length) return;
      void window.wave.savePlayback({
        connectionId: connection.id, trackIds: state.queue.map(item => item.song.id),
        currentIndex: state.index, position: state.position, volume: state.volume,
        shuffle: state.shuffle, repeat: state.repeat,
      }).then(unwrap).catch(() => setError('Playback continues, but the session could not be saved.'));
    };
    save();
    const timer = window.setInterval(save, 5000);
    window.addEventListener('beforeunload', save);
    return () => { clearInterval(timer); window.removeEventListener('beforeunload', save); };
  }, [connection, queue, index, volume, shuffle, repeat]);

  const seek = useCallback((seconds: number) => {
    if (!djSettings.keepOnSeek) stopNews();
    if (newsSchedule.current) {
      newsSchedule.current.trackEnded = false;
      newsSchedule.current.lastTick = performance.now();
    }
    const state = live.current;
    if (!state.current || !audio.current) return;
    const value = Math.max(0, Math.min(seconds, state.current.duration || seconds));
    if (preparing.current) void load(state.current, false, value);
    else if (converted.current) void load(state.current, true, value);
    else {
      try { audio.current.currentTime = value; setPosition(value); }
      catch { setError('Seeking is not available yet. Wait for playback and try again.'); }
    }
  }, [load, stopNews, djSettings.keepOnSeek]);
  const toggle = useCallback(() => {
    const element = audio.current;
    if (speech.current && newsActive.current && newsSchedule.current) {
      const voice = speech.current;
      const planned = newsSchedule.current;
      if (!playIntent.current) {
        requestPlayback(true);
        planned.lastTick = performance.now();
        setNewsPhase(planned.phase);
        setPlaying(true);
        const resume = async () => {
          if (planned.phase === 'speaking') await voice.play();
          if (planned.token !== newsGeneration.current || !playIntent.current) { voice.pause(); return; }
          if (element && !element.ended && !planned.trackEnded) await element.play();
          if (planned.token === newsGeneration.current && !playIntent.current) { voice.pause(); element?.pause(); }
        };
        void resume().catch(cause => { if (planned.token === newsGeneration.current && playIntent.current && !(cause instanceof DOMException && cause.name === 'AbortError')) { const ended = planned.trackEnded; stopNews(); setError('The news break could not resume.'); if (ended) next(); } });
      } else {
        requestPlayback(false);
        voice.pause(); element?.pause(); setNewsPhase('paused'); setPlaying(false);
      }
      return;
    }
    if (!element || !live.current.current) return;
    if (!playIntent.current) {
      requestPlayback(true);
      if (preparing.current) return;
      if (!element.src) { void load(live.current.current); return; }
      const token = generation.current;
      void element.play().then(() => {
        if (token === generation.current && !playIntent.current) element.pause();
      }).catch(cause => {
        if (token !== generation.current || !playIntent.current || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        requestPlayback(false);
        setError('Playback could not resume. Retry this track.');
      });
    } else { requestPlayback(false); element.pause(); }
  }, [stopNews, requestPlayback, load, next]);
  const previous = useCallback(() => {
    const state = live.current;
    if (state.position > 3) { seek(0); return; }
    if (state.shuffle) {
      const history = shuffleHistory.current;
      while (history.cursor > 0) {
        history.cursor -= 1;
        const previousKey = history.keys[history.cursor];
        const previousIndex = state.queue.findIndex(item => item.key === previousKey);
        if (previousIndex >= 0) { stopNews(); changeTrack(previousIndex); return; }
      }
      seek(0);
    } else if (state.index > 0) { stopNews(); changeTrack(state.index - 1); }
    else seek(0);
  }, [seek, stopNews, changeTrack]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || document.querySelector('dialog[open]')
        || (target instanceof Element && target.closest('input, textarea, select, button, a, summary, [role="button"], [role="checkbox"], [role="combobox"], [role="menu"], [role="menuitem"], [role="slider"], [contenteditable]:not([contenteditable="false"])'))) return;
      if (event.code === 'Space' && !event.metaKey && !event.shiftKey && live.current.current) { event.preventDefault(); toggle(); }
      else if (event.metaKey && !event.shiftKey) {
        if (event.key === 'ArrowLeft' && live.current.current) { event.preventDefault(); previous(); }
        else if (event.key === 'ArrowRight' && live.current.current) { event.preventDefault(); next(); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setVolume(value => Math.min(1, value + 0.05)); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); setVolume(value => Math.max(0, value - 0.05)); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [next, previous, toggle]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = current ? new MediaMetadata({
      title: current.name, artist: current.artists.join(', '), album: current.album,
      artwork: current.imageUrl ? [{ src: current.imageUrl }] : [],
    }) : null;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => { if (!playIntent.current) toggle(); }],
      ['pause', () => { requestPlayback(false); setPlaying(false); audio.current?.pause(); if (speech.current && newsActive.current) { speech.current.pause(); setNewsPhase('paused'); } }], ['previoustrack', previous], ['nexttrack', () => next()],
      ['seekto', event => seek(event.seekTime ?? 0)],
      ['seekbackward', event => seek(live.current.position - (event.seekOffset ?? 10))],
      ['seekforward', event => seek(live.current.position + (event.seekOffset ?? 10))],
    ];
    for (const [action, handler] of handlers) navigator.mediaSession.setActionHandler(action, handler);
    return () => { for (const [action] of handlers) navigator.mediaSession.setActionHandler(action, null); };
  }, [current, playing, next, previous, seek, toggle, requestPlayback]);

  const play = (songs: Song[], start = 0) => {
    if (!songs.length) return;
    stopNews();
    ++resumeGeneration.current;
    requestPlayback(true);
    setRestore(null);
    setError(null);
    target.current = 0;
    ++generation.current;
    preparing.current = true;
    audio.current?.pause();
    shuffleHistory.current = { keys: [], cursor: -1, visited: new Set() };
    setQueue(entries(songs));
    setIndex(Math.min(Math.max(0, start), songs.length - 1));
  };
  const scheduleNews = async (news: NewsBreak, duckVolume = 0.05) => {
    const state = live.current;
    const key = state.queue[state.index]?.key;
    if (!state.current || !key || !audio.current?.src || !Number.isFinite(state.current.duration) || state.current.duration <= 0) {
      throw new Error('Start a song with a known duration before scheduling a news break.');
    }
    stopNews();
    setError(null);
    const token = ++newsGeneration.current;
    setNewsLoading(true);
    setActiveNews(news);
    const element = new Audio();
    element.preload = 'auto';
    element.volume = state.volume * djSettings.voiceVolume;
    speech.current = element;
    try {
      const saved = unwrap(await window.wave.getLocalState());
      if (token !== newsGeneration.current) throw new Error('The scheduled news break was cancelled.');
      const settings = normalizeNewsTransitionSettings(saved.newsTransitions);
      transitionSettings.current = settings;
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          element.removeEventListener('loadedmetadata', ready);
          element.removeEventListener('canplay', ready);
          element.removeEventListener('error', failed);
          if (cancelPreload.current === cancelled) cancelPreload.current = null;
        };
        const ready = () => {
          if (element.readyState >= 3 && Number.isFinite(element.duration) && element.duration > 0) { cleanup(); resolve(); }
        };
        const failed = () => { cleanup(); reject(new Error('The news audio could not be loaded. Your music continues.')); };
        const cancelled = () => { cleanup(); reject(new Error('The scheduled news break was cancelled.')); };
        const timer = window.setTimeout(() => { cleanup(); reject(new Error('Loading the news audio timed out. Try scheduling it again.')); }, 15000);
        cancelPreload.current = cancelled;
        element.addEventListener('loadedmetadata', ready);
        element.addEventListener('canplay', ready);
        element.addEventListener('error', failed);
        element.src = news.audioUrl;
        element.load();
        ready();
      });
      if (token !== newsGeneration.current || live.current.queue[live.current.index]?.key !== key) throw new Error('The song changed before the news break was ready.');
      const songDuration = live.current.current!.duration;
      const budget = settings.fadeOutSeconds + settings.leadInSeconds + element.duration + settings.postSpeechSeconds + 0.3;
      const scheduledAt = songDuration - budget;
      if (settings.mode === 'over-music' && scheduledAt < songDuration / 2) throw new Error('This break is too long for the song ending. Choose News bulletin in Settings > General > DJ transitions to play it between songs.');
      if (audio.current!.ended || (settings.mode === 'over-music' && offset.current + audio.current!.currentTime > scheduledAt)) throw new Error('It is too late for this transition. Choose News bulletin in Settings > General > DJ transitions, or try the next song.');
      const planned: ScheduledNews = { token, key, duration: element.duration, bed: Math.max(0, Math.min(0.08, Number.isFinite(duckVolume) ? duckVolume : 0.05)), phase: 'waiting', trackEnded: false, settings, elapsed: 0, lastTick: performance.now(), startLevel: 1 };
      newsSchedule.current = planned;
      setActiveNewsId(news.id);
      setNewsLoading(false);
      setNewsPhase('waiting');
      let heard = false;
      element.onplay = () => {
        if (heard || token !== newsGeneration.current) return;
        heard = true;
        setLastNews({ news, startedAt: new Date().toISOString(), status: 'playing' });
        if ('deliveryState' in news) void window.wave.markPreparedNewsPlayed(news.id).then(unwrap).catch(() => setError('Could not save DJ playback history.'));
      };
      element.onended = () => {
        if (token !== newsGeneration.current || newsSchedule.current !== planned) return;
        setLastNews(value => value?.news === news ? { ...value, status: 'completed' } : value);
        planned.phase = 'tail';
        planned.elapsed = 0;
        planned.lastTick = performance.now();
        setNewsPhase(playIntent.current ? 'tail' : 'paused');
        checkScheduledNews();
      };
      element.onerror = () => {
        if (token !== newsGeneration.current || newsSchedule.current !== planned) return;
        const ended = planned.trackEnded;
        stopNews();
        setError('The news audio could not play. Your music can continue.');
        if (ended) next();
      };
      void checkScheduledNews();
    } catch (cause) {
      if (token === newsGeneration.current) stopNews();
      throw cause;
    }
  };


  return <PlayerContext.Provider value={{
    queue, current, currentKey, playing, requestedPlaying, busy, position, duration, error, volume, shuffle, repeat, completedSongs,
    newsPhase, activeNewsId, newsLoading, activeNews, lastNews, scheduleNews, stopNews: () => { const ended = newsSchedule.current?.trackEnded; stopNews(); if (ended) next(); },
    canRetry: !!current || !!restore || !!error,
    play, playQueueEntry: key => {
      const state = live.current;
      const nextIndex = state.queue.findIndex(item => item.key === key);
      if (nextIndex < 0) return;
      stopNews();
      requestPlayback(true);
      shuffleHistory.current = { keys: [key], cursor: 0, visited: new Set([key]) };
      changeTrack(nextIndex);
    }, enqueue: songs => {
      if (!songs.length) return;
      ++resumeGeneration.current;
      setRestore(null);
      if (!live.current.current) setBusy(false);
      setQueue(items => [...items, ...entries(songs)]);
    }, toggle, next: () => next(), previous, seek,
    setVolume: value => setVolume(Math.max(0, Math.min(1, value))),
    toggleShuffle: () => {
      const key = live.current.queue[live.current.index]?.key;
      shuffleHistory.current = { keys: key ? [key] : [], cursor: key ? 0 : -1, visited: new Set(key ? [key] : []) };
      setShuffle(value => !value);
    },
    cycleRepeat: () => setRepeat(value => value === 'off' ? 'all' : value === 'all' ? 'one' : 'off'),
    removeQueue: key => {
      const removed = queue.findIndex(item => item.key === key);
      if (removed < 0) return;
      if (key === currentKey) {
        stopNews();
        ++generation.current;
        preparing.current = true;
        audio.current?.pause();
        setError(null);
      }
      const remaining = queue.filter(item => item.key !== key);
      if (!remaining.length) { requestPlayback(false); preparing.current = false; audio.current?.pause(); audio.current?.removeAttribute('src'); audio.current?.load(); ++generation.current; ++resumeGeneration.current; setBusy(false); setPlaying(false); setPosition(0); void window.wave.savePlayback(null); }
      const nextIndex = removed < index ? index - 1 : Math.min(index, Math.max(0, remaining.length - 1));
      if (key === currentKey && remaining.length) {
        const history = shuffleHistory.current;
        const replacement = remaining[nextIndex].key;
        history.visited.add(replacement);
        history.keys = [...history.keys.slice(0, history.cursor + 1), replacement].slice(-remaining.length);
        history.cursor = history.keys.length - 1;
      }
      live.current = { ...live.current, queue: remaining, index: nextIndex, current: remaining[nextIndex]?.song };
      setQueue(remaining);
      setIndex(nextIndex);
    },
    retry: () => { stopNews(); if (current) { requestPlayback(true); void load(current, converted.current, position); } else if (restore) void restoreSession(restore); else setRestoreAttempt(value => value + 1); },
  }}>{children}</PlayerContext.Provider>;
}
