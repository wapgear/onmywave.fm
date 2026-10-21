import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { normalizeDJPlaybackSettings } from '../shared/dj-playback';
import { defaultNewsTransitionSettings, normalizeNewsTransitionSettings } from '../shared/news-transitions';
import {
  createShufflePlan,
  isShuffleSnapshot,
  nextShuffle,
  previousShuffle,
  refillShufflePlan,
  removeShuffle,
  selectShuffle,
  type ShufflePlan,
} from '../shared/shuffle-queue';
import type {
  Connection,
  NewsBreak,
  PlaybackPreferences,
  PlaybackSnapshot,
  PreparedNewsClaim,
  Song,
} from '../shared/types';
import { unwrap, WaveError } from './api';
import { freshAudioUrl } from './audio';
import { useNewsRecovery } from './NewsRecovery';
import type {
  HeardNews,
  NewsPhase,
  QueueEntry,
  OptionsSaveSettlement,
  PlaybackRetrySettlement,
  PositionStore,
  PlayerState,
  ScheduledNews,
} from './player.types';


type LoadSettlement = { key?: string; generation: number; outcome: 'success' | 'failure' | 'superseded' };

const PlayerContext = createContext<PlayerState | null>(null);

const PositionContext = createContext<PositionStore | null>(null);

function createPositionStore(): PositionStore {
  let position = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => position,
    publish: (value) => {
      if (position === value) return;
      position = value;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const trackLoadError = 'This track could not be played. Check your connection, then retry or skip.';

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('Player requires PlayerProvider');
  return value;
}

export function usePlayerPosition() {
  const store = useContext(PositionContext);
  if (!store) throw new Error('Player position requires PlayerProvider');
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

const entries = (songs: Song[]): QueueEntry[] => songs.map((song) => ({ key: crypto.randomUUID(), song }));

export function PlayerProvider({ connection, children }: { connection: Connection | null; children: ReactNode }) {
  const [positionStore] = useState(createPositionStore);
  const recovery = useNewsRecovery();
  const recoveryReady = recovery.status.phase === 'ready';
  const preferences = useQuery({
    queryKey: ['localState'],
    queryFn: async () => unwrap(await window.wave.getLocalState()),
  });
  const djSettings = normalizeDJPlaybackSettings(preferences.data?.djPlayback);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [requestedPlaying, setRequestedPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.75);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<PlaybackSnapshot['repeat']>('off');
  const [restore, setRestore] = useState<PlaybackSnapshot | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [readyConnection, setReadyConnection] = useState<string | null>(null);
  const preferenceEdits = useRef({ volume: false, shuffle: false, repeat: false });
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsRevision, setOptionsRevision] = useState(0);
  const optionsSaveGeneration = useRef(0);
  const optionsInFlight = useRef<{ generation: number; promise: Promise<OptionsSaveSettlement> } | null>(null);
  const playbackCheckpoint = useRef({
    inFlight: null as null | { fingerprint: string },
    pending: null as null | {
      fingerprint: string;
      snapshot: PlaybackSnapshot;
      optionsGeneration: number;
      optionsPending: boolean;
      lifecycleGeneration: number;
      connectionGeneration: number;
    },
    lastSavedFingerprint: null as string | null,
    skipDrain: false,
  });
  const currentConnectionId = useRef(connection?.id ?? null);
  const checkpointConnectionGeneration = useRef(0);
  const mounted = useRef(false);
  const checkpointLifecycle = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [newsPhase, setNewsPhase] = useState<PlayerState['newsPhase']>('idle');
  const [activeNewsId, setActiveNewsId] = useState<string>();
  const [newsRunId, setNewsRunId] = useState<number>();
  const [activeNews, setActiveNews] = useState<NewsBreak>();
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsNotice, setNewsNotice] = useState<string | null>(null);
  const newsNoticeRevision = useRef(0);
  const [lastNews, setLastNews] = useState<HeardNews | null>(null);
  const [completedSongs, setCompletedSongs] = useState(0);
  const commandRevision = useRef(0);
  const [musicCommandRevision, setMusicCommandRevision] = useState(0);
  const cancelRestoreRetry = useRef<(() => void) | null>(null);

  useEffect(() => {
    ++checkpointLifecycle.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const musicCommand = useCallback(() => {
    ++newsNoticeRevision.current;
    setNewsNotice(null);
    setMusicCommandRevision(++commandRevision.current);
    cancelRestoreRetry.current?.();
    cancelRestoreRetry.current = null;
  }, []);

  const getMusicCommandRevision = useCallback(() => commandRevision.current, []);

  const countedSongGeneration = useRef(-1);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speech = useRef<HTMLAudioElement | null>(null);
  const newsActive = useRef(false);
  const newsGeneration = useRef(0);
  const newsSchedule = useRef<ScheduledNews | null>(null);
  const newsClock = useRef<number | null>(null);
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
  const retryInFlight = useRef<{
    key?: string;
    kind: 'track' | 'restore';
    promise: Promise<PlaybackRetrySettlement>;
  } | null>(null);
  const restoreRetryWaiter = useRef<{
    commandRevision: number;
    resolve: (settlement: PlaybackRetrySettlement) => void;
  } | null>(null);
  const resumeGeneration = useRef(0);
  const target = useRef(0);
  const playIntent = useRef(false);
  const preparing = useRef(false);
  const [shuffleView, setShuffleView] = useState<ShufflePlan>(() => createShufflePlan([], null));
  const shufflePlan = useRef<ShufflePlan>(shuffleView);

  const clearNewsClock = useCallback(() => {
    if (newsClock.current === null) return;
    window.clearInterval(newsClock.current);
    newsClock.current = null;
  }, []);

  const updateShufflePlan = useCallback((plan: ShufflePlan) => {
    shufflePlan.current = plan;
    setShuffleView(plan);
  }, []);

  const requestPlayback = useCallback((value: boolean) => {
    playIntent.current = value;
    setRequestedPlaying(value);
  }, []);

  const current = queue[index]?.song;
  const currentKey = queue[index]?.key;
  const duration = current && Number.isFinite(current.duration) && current.duration > 0 ? current.duration : 0;
  const live = useRef({
    queue,
    index,
    current,
    repeat,
    shuffle,
    position: 0,
    volume,
    recoveryReady,
  });

  useLayoutEffect(() => {
    const nextConnectionId = connection?.id ?? null;
    if (currentConnectionId.current === nextConnectionId) return;
    currentConnectionId.current = nextConnectionId;
    ++checkpointConnectionGeneration.current;
    playbackCheckpoint.current.pending = null;
  }, [connection?.id]);

  const publishPosition = useCallback(
    (value: number) => {
      live.current.position = value;
      positionStore.publish(value);
    },
    [positionStore],
  );

  useLayoutEffect(() => {
    live.current = { ...live.current, queue, index, current, repeat, shuffle, volume, recoveryReady };
  }, [queue, index, current, repeat, shuffle, volume, recoveryReady]);

  const changeVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value));
    if (next === live.current.volume) return;
    ++optionsSaveGeneration.current;
    setOptionsRevision((revision) => revision + 1);
    preferenceEdits.current.volume = true;
    live.current.volume = next;
    setVolume(next);
  }, []);

  const fadeMusic = useCallback((to: number, seconds = 1, followPlayback = false): Promise<boolean> => {
    cancelAnimationFrame(fadeFrame.current);
    finishFade.current?.(false);
    return new Promise((resolve) => {
      finishFade.current = resolve;
      const from = duck.current;
      let previousTime = performance.now();
      let elapsed = 0;
      const step = (time: number) => {
        if (
          !followPlayback ||
          (playIntent.current && audio.current && !audio.current.paused && audio.current.readyState >= 3)
        )
          elapsed += Math.max(0, time - previousTime);
        previousTime = time;
        const progress = seconds <= 0 ? 1 : Math.min(1, elapsed / (seconds * 1000));
        duck.current = from + (to - from) * progress;
        if (audio.current) audio.current.volume = live.current.volume * duck.current;
        if (progress < 1) fadeFrame.current = requestAnimationFrame(step);
        else {
          finishFade.current = null;
          resolve(true);
        }
      };
      fadeFrame.current = requestAnimationFrame(step);
    });
  }, []);

  const stopNews = useCallback(
    (preserveBed = false) => {
      ++newsGeneration.current;
      newsActive.current = false;
      clearNewsClock();
      newsSchedule.current?.cancelDelivery();
      newsSchedule.current = null;
      setNewsRunId(undefined);
      cancelPreload.current?.();
      cancelPreload.current = null;
      if (speech.current) {
        speech.current.onended = speech.current.onerror = speech.current.onplay = null;
        speech.current.pause();
        speech.current.removeAttribute('src');
        speech.current.load();
        speech.current = null;
      }
      fadeOnNext.current = preserveBed
        ? { generation: generation.current + 1, seconds: transitionSettings.current.fadeInSeconds }
        : null;
      if (preserveBed) {
        cancelAnimationFrame(fadeFrame.current);
        finishFade.current?.(false);
        finishFade.current = null;
      } else void fadeMusic(1);
      setNewsPhase('idle');
      setNewsLoading(false);
      setActiveNews(undefined);
      setLastNews((value) => (value?.status === 'playing' ? { ...value, status: 'interrupted' } : value));
      setActiveNewsId(undefined);
    },
    [clearNewsClock, fadeMusic],
  );

  useEffect(() => {
    const knownSpeech =
      activeNews &&
      lastNews?.news.id === activeNews.id &&
      (newsPhase === 'speaking' || newsPhase === 'paused' || (newsPhase === 'tail' && lastNews.status === 'completed'));
    if (!recoveryReady && newsPhase !== 'idle' && !knownSpeech) {
      const timer = window.setTimeout(stopNews, 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeNews, lastNews, newsPhase, recoveryReady, stopNews]);

  const load = useCallback(
    async (song: Song, transcode = false, start = 0): Promise<LoadSettlement> => {
      const token = ++generation.current;
      const key = live.current.queue[live.current.index]?.key;
      const settlement = (outcome: LoadSettlement['outcome']): LoadSettlement => ({ key, generation: token, outcome });
      consumedEnd.current = null;
      const element = audio.current;
      if (!element) return settlement('superseded');
      element.ondurationchange = null;
      preparing.current = true;
      element.pause();
      element.removeAttribute('src');
      element.load();
      setBusy(true);
      setError(null);
      try {
        const resource = unwrap(await window.wave.preparePlayback({ id: song.id, transcode, offsetSeconds: start }));
        if (token !== generation.current) return settlement('superseded');
        offset.current = resource.offsetSeconds;
        converted.current = resource.transcoded;
        target.current = resource.transcoded ? 0 : start;
        publishPosition(start);
        if (!Number.isFinite(song.duration) || song.duration <= 0) {
          element.ondurationchange = () => {
            const measured = resource.offsetSeconds + element.duration;
            if (
              !key ||
              token !== generation.current ||
              audio.current !== element ||
              element.currentSrc !== resource.url ||
              live.current.queue[live.current.index]?.key !== key ||
              !Number.isFinite(measured) ||
              measured <= 0
            )
              return;
            setQueue((items) => {
              if (token !== generation.current || items.find((item) => item.key === key)?.song.duration === measured)
                return items;
              return items.map((item) =>
                item.key === key ? { ...item, song: { ...item.song, duration: measured } } : item,
              );
            });
          };
        }
        element.src = resource.url;
        element.load();
        preparing.current = false;
        if (playIntent.current) await element.play();
        if (token !== generation.current) return settlement('superseded');
        if (!playIntent.current) element.pause();
        setBusy(false);
        return settlement('success');
      } catch (cause) {
        if (token !== generation.current) return settlement('superseded');
        preparing.current = false;
        setBusy(false);
        if (cause instanceof DOMException && cause.name === 'AbortError') return settlement('superseded');
        requestPlayback(false);
        setPlaying(false);
        setError(
          cause instanceof DOMException && cause.name === 'NotSupportedError'
            ? trackLoadError
            : cause instanceof Error
              ? cause.message
              : 'Playback could not start. Retry or skip this track.',
        );
        return settlement('failure');
      }
    },
    [publishPosition, requestPlayback],
  );

  const changeTrack = useCallback(
    (nextIndex: number) => {
      ++generation.current;
      preparing.current = true;
      setBusy(true);
      audio.current?.pause();
      const state = live.current;
      live.current = { ...state, index: nextIndex, current: state.queue[nextIndex]?.song, position: 0 };
      publishPosition(0);
      setIndex(nextIndex);
      setAttempt((value) => value + 1);
    },
    [publishPosition],
  );

  const next = useCallback(
    (afterNews = false) => {
      stopNews(afterNews);
      const state = live.current;
      if (!state.queue.length) return;
      let nextIndex: number | undefined;
      if (state.shuffle) {
        const advanced = nextShuffle(
          shufflePlan.current,
          state.queue.map((item) => item.key),
          state.queue[state.index]?.key ?? null,
          state.repeat === 'all',
        );
        updateShufflePlan(advanced.plan);
        if (advanced.key) nextIndex = state.queue.findIndex((item) => item.key === advanced.key);
      } else if (state.index + 1 < state.queue.length) nextIndex = state.index + 1;
      else if (state.repeat === 'all') nextIndex = 0;
      if (nextIndex !== undefined) {
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
    },
    [stopNews, requestPlayback, changeTrack, updateShufflePlan],
  );

  const skipNext = useCallback(() => {
    musicCommand();
    next();
  }, [musicCommand, next]);

  const continueAfterSong = useCallback(
    (afterNews = false) => {
      const state = live.current;
      if (state.repeat === 'one' && state.current) {
        stopNews(afterNews);
        void load(state.current, converted.current, 0);
      } else next(afterNews);
    },
    [load, next, stopNews],
  );

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
    if (state.queue[state.index]?.key !== planned.key) {
      stopNews();
      return;
    }
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
      const budget = overMusic
        ? settings.fadeOutSeconds +
          settings.leadInSeconds +
          Math.max(0, planned.duration - voice.currentTime) +
          settings.postSpeechSeconds +
          0.3
        : settings.fadeOutSeconds;
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
    if (planned.phase === 'lead-in' && planned.elapsed >= settings.leadInSeconds && !planned.starting) {
      planned.starting = true;
      const attempt = ++planned.speechAttempt;
      void planned
        .prepareSpeech()
        .then(async () => {
          if (
            planned.token !== newsGeneration.current ||
            newsSchedule.current !== planned ||
            attempt !== planned.speechAttempt ||
            planned.phase !== 'lead-in' ||
            live.current.queue[live.current.index]?.key !== planned.key ||
            !playIntent.current
          )
            return;
          enter('speaking');
          await planned.playSpeech();
          if (planned.token !== newsGeneration.current || attempt !== planned.speechAttempt) return;
          if (!playIntent.current) {
            voice.pause();
            setNewsPhase('paused');
            setPlaying(false);
          } else setPlaying(true);
        })
        .catch(() => {
          if (planned.token !== newsGeneration.current || attempt !== planned.speechAttempt) return;
          const ended = planned.trackEnded;
          stopNews();
          setNewsNotice('The DJ break could not start. You can try again from Saved audio.');
          if (ended) continueAfterSong();
        })
        .finally(() => {
          planned.starting = false;
        });
    }
    if (planned.phase === 'tail' && planned.elapsed >= settings.postSpeechSeconds && planned.trackEnded) {
      const seconds = settings.fadeInSeconds;
      consumedEnd.current = generation.current;
      continueAfterSong(true);
      if (fadeOnNext.current) fadeOnNext.current.seconds = seconds;
    }
  }, [continueAfterSong, stopNews]);

  const startNewsClock = useCallback(() => {
    if (newsClock.current !== null || !newsSchedule.current) return;
    newsClock.current = window.setInterval(() => {
      if (!newsSchedule.current) {
        clearNewsClock();
        return;
      }
      checkScheduledNews();
    }, 25);
  }, [checkScheduledNews, clearNewsClock]);

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
    element.onplay = () => {
      if (!playIntent.current) element.pause();
      else setPlaying(true);
    };
    element.onpause = () => setPlaying(false);
    element.onwaiting = () => setBusy(true);
    element.onplaying = () => {
      if (!playIntent.current) {
        element.pause();
        return;
      }
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
    element.ontimeupdate = () => {
      if (!newsSchedule.current?.trackEnded) publishPosition(offset.current + element.currentTime);
      checkScheduledNews();
    };
    if (newsSchedule.current) startNewsClock();
    element.onended = () => {
      // A queue change can precede replacement of the outgoing audio source.
      if (preparing.current || !element.ended || consumedEnd.current === generation.current) return;
      if (countedSongGeneration.current !== generation.current) {
        countedSongGeneration.current = generation.current;
        setCompletedSongs((value) => value + 1);
      }
      if (newsSchedule.current && (newsActive.current || newsSchedule.current.settings.mode === 'between-songs')) {
        newsSchedule.current.trackEnded = true;
        setPlaying(playIntent.current);
        checkScheduledNews();
        return;
      }
      continueAfterSong();
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
        setError(trackLoadError);
      }
    };
    return () => {
      ++lifecycle.current;
      ++speechLifecycle.current;
      clearNewsClock();
      scheduled.current?.cancelDelivery();
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
      element.onerror =
        element.onended =
        element.ontimeupdate =
        element.onloadedmetadata =
        element.ondurationchange =
          null;
      element.pause();
      element.removeAttribute('src');
      element.load();
      audio.current = null;
    };
  }, [
    load,
    continueAfterSong,
    checkScheduledNews,
    clearNewsClock,
    startNewsClock,
    stopNews,
    fadeMusic,
    publishPosition,
    requestPlayback,
  ]);

  const restoreSession = useCallback(
    async (saved: PlaybackSnapshot, retryCommandRevision?: number): Promise<PlaybackRetrySettlement> => {
      const resumeToken = ++resumeGeneration.current;
      setBusy(true);
      setError(null);
      setRestore(saved);
      try {
        const songs: Song[] = [];
        const originalIndices: number[] = [];
        let restoredIndex = 0;
        for (let n = 0; n < saved.trackIds.length; n += 50) {
          const batch = await Promise.all(
            saved.trackIds.slice(n, n + 50).map((id) =>
              window.wave
                .song(id)
                .then(unwrap)
                .catch((cause: unknown) => {
                  if (cause instanceof WaveError && cause.code === 'not-found') return null;
                  throw cause;
                }),
            ),
          );
          if (resumeToken !== resumeGeneration.current)
            return {
              generation: resumeToken,
              commandRevision: retryCommandRevision ?? commandRevision.current,
              kind: 'restore',
              outcome: 'superseded',
            };
          batch.forEach((song, j) => {
            if (song) {
              if (n + j < saved.currentIndex) restoredIndex++;
              songs.push(song);
              originalIndices.push(n + j);
            }
          });
        }
        if (!songs.length) throw new Error('The saved session tracks are no longer available.');
        stopNews();
        target.current = songs[restoredIndex]?.id === saved.trackIds[saved.currentIndex] ? saved.position : 0;
        requestPlayback(false);
        setPlaying(false);
        publishPosition(target.current);
        ++generation.current;
        preparing.current = true;
        const restoredQueue = entries(songs);
        const restoredIndexInQueue = Math.min(restoredIndex, songs.length - 1);
        const restoredKey = restoredQueue[restoredIndexInQueue]?.key;
        let plan: ShufflePlan;
        if (
          isShuffleSnapshot(saved.shufflePlan, saved.trackIds.length, saved.currentIndex) &&
          originalIndices.includes(saved.currentIndex)
        ) {
          const snapshot = saved.shufflePlan;
          const byOriginal = new Map(originalIndices.map((original, index) => [original, restoredQueue[index].key]));
          const keys = (indices: number[]) =>
            indices.flatMap((index) => (byOriginal.has(index) ? [byOriginal.get(index)!] : []));
          plan = refillShufflePlan(
            {
              upcoming: keys(snapshot.upcoming),
              history: keys(snapshot.history),
              cursor: keys(snapshot.history.slice(0, snapshot.cursor + 1)).length - 1,
              visited: new Set(keys(snapshot.visited)),
            },
            restoredQueue.map((item) => item.key),
          );
        } else
          plan = createShufflePlan(
            restoredQueue.map((item) => item.key),
            restoredKey ?? null,
          );
        updateShufflePlan(plan);
        setQueue(restoredQueue);
        setIndex(restoredIndexInQueue);
        setRestore(null);
        setReadyConnection(saved.connectionId);
        return {
          key: restoredKey,
          generation: resumeToken,
          commandRevision: retryCommandRevision ?? commandRevision.current,
          kind: 'restore',
          outcome: restoredKey ? 'success' : 'superseded',
        };
      } catch (cause) {
        if (resumeToken === resumeGeneration.current)
          setError(
            `Your saved queue could not be restored. It is still saved. ${cause instanceof Error ? cause.message : 'Check the connection and try again.'}`,
          );
        return {
          generation: resumeToken,
          commandRevision: retryCommandRevision ?? commandRevision.current,
          kind: 'restore',
          outcome: resumeToken === resumeGeneration.current ? 'failure' : 'superseded',
        };
      } finally {
        if (resumeToken === resumeGeneration.current) setBusy(false);
      }
    },
    [publishPosition, requestPlayback, stopNews, updateShufflePlan],
  );

  useEffect(() => {
    let active = true;
    const token = ++resumeGeneration.current;
    const restoreLifecycle = resumeGeneration;
    const connectionId = connection?.id;
    const retryWaiter = restoreRetryWaiter.current;
    if (retryWaiter) restoreRetryWaiter.current = null;
    const superseded = () => ({
      generation: token,
      commandRevision: retryWaiter?.commandRevision ?? commandRevision.current,
      kind: 'restore' as const,
      outcome: 'superseded' as const,
    });
    void Promise.all([
      window.wave.getLocalState().then(unwrap),
      connectionId ? window.wave.getPlaybackPreferences(connectionId).then(unwrap) : Promise.resolve(null),
    ])
      .then(async ([state, options]) => {
        if (!active || token !== restoreLifecycle.current) {
          retryWaiter?.resolve(superseded());
          return;
        }
        if (options) {
          if (!preferenceEdits.current.volume) setVolume(options.volume);
          if (!preferenceEdits.current.shuffle) setShuffle(options.shuffle);
          if (!preferenceEdits.current.repeat) setRepeat(options.repeat);
        }
        const saved = state.playback;
        if (!saved || saved.connectionId !== connectionId || !saved.trackIds.length) {
          setReadyConnection(connectionId ?? null);
          retryWaiter?.resolve(superseded());
          return;
        }
        const settlement = await restoreSession(saved, retryWaiter?.commandRevision);
        retryWaiter?.resolve(settlement);
      })
      .catch(() => {
        if (active && token === restoreLifecycle.current)
          setError('Your previous listening session could not be restored.');
        retryWaiter?.resolve({
          generation: token,
          commandRevision: retryWaiter?.commandRevision ?? commandRevision.current,
          kind: 'restore',
          outcome: active && token === restoreLifecycle.current ? 'failure' : 'superseded',
        });
      });
    return () => {
      active = false;
      ++restoreLifecycle.current;
      retryWaiter?.resolve(superseded());
    };
  }, [connection?.id, restoreSession, restoreAttempt]);

  const saveOptions = useCallback((): Promise<OptionsSaveSettlement> => {
    const pending = optionsInFlight.current;
    if (pending?.generation === optionsSaveGeneration.current) return pending.promise;
    const generation = ++optionsSaveGeneration.current;
    const state = live.current;
    const options: Partial<PlaybackPreferences> = {};
    if (preferenceEdits.current.volume) options.volume = state.volume;
    if (preferenceEdits.current.shuffle) options.shuffle = state.shuffle;
    if (preferenceEdits.current.repeat) options.repeat = state.repeat;
    if (!connection || !Object.keys(options).length) return Promise.resolve({ generation, outcome: 'superseded' });
    const promise = window.wave
      .savePlaybackPreferences({ connectionId: connection.id, options })
      .then(unwrap)
      .then((saved): OptionsSaveSettlement => {
        if (generation !== optionsSaveGeneration.current || !saved) return { generation, outcome: 'superseded' };
        setOptionsError(null);
        return { generation, outcome: 'success' };
      })
      .catch((): OptionsSaveSettlement => {
        if (generation !== optionsSaveGeneration.current) return { generation, outcome: 'superseded' };
        setOptionsError('Player options could not be saved. Your saved queue is unchanged.');
        return { generation, outcome: 'failure' };
      })
      .finally(() => {
        if (optionsInFlight.current?.generation === generation) optionsInFlight.current = null;
      });
    optionsInFlight.current = { generation, promise };
    return promise;
  }, [connection]);

  useEffect(
    () => () => {
      ++optionsSaveGeneration.current;
    },
    [connection?.id],
  );

  useEffect(() => {
    if (connection && readyConnection !== connection.id) void saveOptions();
  }, [connection, readyConnection, volume, shuffle, repeat, optionsRevision, saveOptions]);

  useEffect(() => {
    if (currentKey && current) {
      const start = target.current;
      target.current = 0;
      // Queue changes synchronize the external audio element, including its loading state.
      // oxlint-disable-next-line react/set-state-in-effect
      void load(current, false, start);
    }
    // Queue occurrence identity changes only when a different occurrence starts.
    // oxlint-disable-next-line hooks/exhaustive-deps
  }, [currentKey, attempt, load]);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume * duck.current;
    if (speech.current) speech.current.volume = volume * djSettings.voiceVolume;
  }, [volume, djSettings.voiceVolume]);

  useEffect(() => {
    if (!connection || readyConnection !== connection.id) return;
    const checkpoint = playbackCheckpoint.current;
    const dispatch = (item: NonNullable<typeof checkpoint.pending>) => {
      checkpoint.inFlight = { fingerprint: item.fingerprint };
      void window.wave
        .savePlayback(item.snapshot)
        .then(unwrap)
        .then(() => {
          if (checkpointConnectionGeneration.current === item.connectionGeneration)
            checkpoint.lastSavedFingerprint = item.fingerprint;
          if (
            !mounted.current ||
            checkpointLifecycle.current !== item.lifecycleGeneration ||
            checkpointConnectionGeneration.current !== item.connectionGeneration ||
            currentConnectionId.current !== item.snapshot.connectionId
          )
            return;
          if (!item.optionsPending && item.optionsGeneration === optionsSaveGeneration.current) setOptionsError(null);
          setError((current) =>
            current === 'Playback continues, but the session could not be saved.' ? null : current,
          );
        })
        .catch(() => {
          if (
            mounted.current &&
            checkpointLifecycle.current === item.lifecycleGeneration &&
            checkpointConnectionGeneration.current === item.connectionGeneration &&
            currentConnectionId.current === item.snapshot.connectionId
          )
            setError('Playback continues, but the session could not be saved.');
        })
        .finally(() => {
          if (checkpoint.inFlight?.fingerprint !== item.fingerprint) return;
          checkpoint.inFlight = null;
          if (checkpoint.skipDrain) return;
          const pending = checkpoint.pending;
          checkpoint.pending = null;
          if (!pending) return;
          if (pending.fingerprint === checkpoint.lastSavedFingerprint) {
            if (
              mounted.current &&
              checkpointLifecycle.current === pending.lifecycleGeneration &&
              checkpointConnectionGeneration.current === pending.connectionGeneration &&
              currentConnectionId.current === pending.snapshot.connectionId
            )
              setError((current) =>
                current === 'Playback continues, but the session could not be saved.' ? null : current,
              );
            return;
          }
          if (pending.fingerprint === item.fingerprint && checkpoint.lastSavedFingerprint !== item.fingerprint) return;
          dispatch(pending);
        });
    };
    const save = () => {
      if (!mounted.current || currentConnectionId.current !== connection.id) return;
      const state = live.current;
      const optionsGeneration = optionsSaveGeneration.current;
      const optionsPending = optionsInFlight.current?.generation === optionsGeneration;
      const byKey = new Map(state.queue.map((item, index) => [item.key, index]));
      const indices = (keys: Iterable<string>) => [...keys].flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
      const plan = shufflePlan.current;
      const snapshot: PlaybackSnapshot = {
        connectionId: connection.id,
        trackIds: state.queue.map((item) => item.song.id),
        currentIndex: state.queue.length ? state.index : 0,
        position: state.queue.length ? live.current.position : 0,
        volume: state.volume,
        shuffle: state.shuffle,
        repeat: state.repeat,
        ...(state.shuffle
          ? {
              shufflePlan: {
                upcoming: indices(plan.upcoming),
                history: indices(plan.history),
                cursor: plan.cursor,
                visited: indices(plan.visited),
              },
            }
          : {}),
      };
      const item = {
        fingerprint: JSON.stringify(snapshot),
        snapshot,
        optionsGeneration,
        optionsPending,
        lifecycleGeneration: checkpointLifecycle.current,
        connectionGeneration: checkpointConnectionGeneration.current,
      };
      checkpoint.skipDrain = false;
      if (checkpoint.inFlight) {
        checkpoint.pending = checkpoint.inFlight.fingerprint === item.fingerprint ? null : item;
        return;
      }
      if (item.fingerprint === checkpoint.lastSavedFingerprint) {
        if (
          mounted.current &&
          checkpointLifecycle.current === item.lifecycleGeneration &&
          checkpointConnectionGeneration.current === item.connectionGeneration
        )
          setError((current) =>
            current === 'Playback continues, but the session could not be saved.' ? null : current,
          );
        return;
      }
      dispatch(item);
    };
    const saveOnUnload = () => {
      const state = live.current;
      const byKey = new Map(state.queue.map((item, index) => [item.key, index]));
      const indices = (keys: Iterable<string>) => [...keys].flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
      const plan = shufflePlan.current;
      const snapshot: PlaybackSnapshot = {
        connectionId: connection.id,
        trackIds: state.queue.map((item) => item.song.id),
        currentIndex: state.queue.length ? state.index : 0,
        position: state.queue.length ? state.position : 0,
        volume: state.volume,
        shuffle: state.shuffle,
        repeat: state.repeat,
        ...(state.shuffle
          ? {
              shufflePlan: {
                upcoming: indices(plan.upcoming),
                history: indices(plan.history),
                cursor: plan.cursor,
                visited: indices(plan.visited),
              },
            }
          : {}),
      };
      checkpoint.pending = null;
      checkpoint.skipDrain = true;
      void window.wave
        .savePlayback(snapshot)
        .then(unwrap)
        .catch(() => {});
    };
    save();
    const timer = window.setInterval(save, 5000);
    window.addEventListener('beforeunload', saveOnUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', saveOnUnload);
    };
  }, [connection, readyConnection, queue, index, volume, shuffle, repeat, optionsRevision, shuffleView]);

  const seek = useCallback(
    (seconds: number) => {
      musicCommand();
      if (!djSettings.keepOnSeek) stopNews();
      const state = live.current;
      if (!state.current || !audio.current) return;
      const value = Math.max(0, Math.min(seconds, state.current.duration || seconds));
      const planned = newsSchedule.current;
      if (planned) {
        planned.trackEnded = false;
        planned.lastTick = performance.now();
        if (value < state.current.duration && planned.phase !== 'waiting') {
          ++planned.speechAttempt;
          speech.current?.pause();
          if (planned.phase !== 'tail') {
            planned.phase = 'waiting';
            planned.elapsed = 0;
            setNewsPhase('waiting');
          }
          void fadeMusic(1);
        }
      }
      if (Number.isFinite(state.current.duration) && state.current.duration > 0 && value === state.current.duration) {
        // An explicit endpoint seek is a track boundary, not a natural completion.
        ++generation.current;
        consumedEnd.current = generation.current;
        preparing.current = false;
        target.current = 0;
        audio.current.pause();
        audio.current.removeAttribute('src');
        audio.current.load();
        setBusy(false);
        publishPosition(value);
        if (newsSchedule.current) {
          newsSchedule.current.trackEnded = true;
          setPlaying(playIntent.current);
          checkScheduledNews();
        } else continueAfterSong();
        return;
      }
      if (preparing.current) void load(state.current, false, value);
      else if (converted.current || !audio.current.src) void load(state.current, converted.current, value);
      else {
        try {
          audio.current.currentTime = value;
          publishPosition(value);
        } catch {
          setError('Seeking is not available yet. Wait for playback and try again.');
        }
      }
    },
    [
      load,
      stopNews,
      continueAfterSong,
      checkScheduledNews,
      djSettings.keepOnSeek,
      musicCommand,
      fadeMusic,
      publishPosition,
    ],
  );

  const retry = useCallback((): Promise<PlaybackRetrySettlement> => {
    if (retryInFlight.current && (retryInFlight.current.kind === 'restore' || retryInFlight.current.key === currentKey))
      return retryInFlight.current.promise;
    musicCommand();
    const retryCommandRevision = commandRevision.current;
    stopNews();
    let pending: Promise<PlaybackRetrySettlement>;
    if (current && currentKey) {
      const key = currentKey;
      requestPlayback(true);
      pending = load(current, converted.current, live.current.position).then((result) => ({
        key: result.key,
        generation: result.generation,
        commandRevision: retryCommandRevision,
        kind: 'track' as const,
        outcome:
          live.current.queue[live.current.index]?.key === key && generation.current === result.generation
            ? result.outcome
            : 'superseded',
      }));
    } else if (restore) {
      pending = new Promise((resolve) => {
        const finish = (settlement: PlaybackRetrySettlement) => {
          if (cancelRestoreRetry.current === cancel) cancelRestoreRetry.current = null;
          resolve(settlement);
        };
        const cancel = () => {
          ++resumeGeneration.current;
          finish({
            generation: resumeGeneration.current,
            commandRevision: retryCommandRevision,
            kind: 'restore',
            outcome: 'superseded',
          });
        };
        cancelRestoreRetry.current = cancel;
        void restoreSession(restore, retryCommandRevision).then(finish);
      });
    } else {
      pending = new Promise((resolve) => {
        const finish = (settlement: PlaybackRetrySettlement) => {
          if (restoreRetryWaiter.current?.resolve === finish) restoreRetryWaiter.current = null;
          if (cancelRestoreRetry.current === cancel) cancelRestoreRetry.current = null;
          resolve(settlement);
        };
        const cancel = () => {
          ++resumeGeneration.current;
          finish({
            generation: resumeGeneration.current,
            commandRevision: retryCommandRevision,
            kind: 'restore',
            outcome: 'superseded',
          });
        };
        cancelRestoreRetry.current = cancel;
        restoreRetryWaiter.current = { commandRevision: retryCommandRevision, resolve: finish };
        setRestoreAttempt((value) => value + 1);
      });
    }
    const currentAttempt = {
      key: currentKey,
      kind: current && currentKey ? ('track' as const) : ('restore' as const),
      promise: pending,
    };
    retryInFlight.current = currentAttempt;
    void pending.then(() => {
      if (retryInFlight.current === currentAttempt) retryInFlight.current = null;
    });
    return pending;
  }, [current, currentKey, load, musicCommand, requestPlayback, restore, restoreSession, stopNews]);

  const toggle = useCallback(
    (origin?: 'preview') => {
      if (origin !== 'preview') musicCommand();
      const element = audio.current;
      if (
        speech.current &&
        newsSchedule.current &&
        ((newsActive.current && newsSchedule.current.phase !== 'waiting') || newsSchedule.current.trackEnded)
      ) {
        const voice = speech.current;
        const planned = newsSchedule.current;
        if (!playIntent.current) {
          requestPlayback(true);
          planned.lastTick = performance.now();
          setNewsPhase(planned.phase);
          setPlaying(true);
          const attempt = ++planned.speechAttempt;
          const resume = async () => {
            if (planned.phase === 'speaking') await planned.playSpeech();
            if (planned.token !== newsGeneration.current || attempt !== planned.speechAttempt) return;
            if (!playIntent.current) {
              voice.pause();
              return;
            }
            if (element && !element.ended && !planned.trackEnded) await element.play();
            if (planned.token === newsGeneration.current && !playIntent.current) {
              voice.pause();
              element?.pause();
            }
          };
          void resume().catch((cause) => {
            if (
              planned.token === newsGeneration.current &&
              attempt === planned.speechAttempt &&
              playIntent.current &&
              !(cause instanceof DOMException && cause.name === 'AbortError')
            ) {
              const ended = planned.trackEnded;
              stopNews();
              setNewsNotice('The DJ break could not resume. You can try again from Saved audio.');
              if (ended) continueAfterSong();
            }
          });
        } else {
          ++planned.speechAttempt;
          requestPlayback(false);
          voice.pause();
          element?.pause();
          setNewsPhase('paused');
          setPlaying(false);
        }
        return;
      }
      if (!element || !live.current.current) return;
      if (!playIntent.current) {
        requestPlayback(true);
        if (preparing.current) return;
        if (!element.src) {
          void load(live.current.current);
          return;
        }
        const token = generation.current;
        void element
          .play()
          .then(() => {
            if (token === generation.current && !playIntent.current) element.pause();
          })
          .catch((cause) => {
            if (
              token !== generation.current ||
              !playIntent.current ||
              (cause instanceof DOMException && cause.name === 'AbortError')
            )
              return;
            requestPlayback(false);
            setError('Playback could not resume. Retry this track.');
          });
      } else {
        requestPlayback(false);
        element.pause();
      }
    },
    [stopNews, requestPlayback, load, continueAfterSong, musicCommand],
  );

  const controlNews = (runId: number, action: 'toggle' | 'stop') => {
    const planned = newsSchedule.current;
    if (!planned || planned.token !== runId || planned.token !== newsGeneration.current) return false;
    if (action === 'toggle') toggle();
    else if (planned.trackEnded) continueAfterSong();
    else stopNews();
    return true;
  };

  const previous = useCallback(() => {
    musicCommand();
    const state = live.current;
    if (state.position > 3) {
      seek(0);
      return;
    }
    if (state.shuffle) {
      const previous = previousShuffle(shufflePlan.current);
      const previousIndex = state.queue.findIndex((item) => item.key === previous.key);
      if (previousIndex >= 0) {
        updateShufflePlan(previous.plan);
        stopNews();
        changeTrack(previousIndex);
        return;
      }
      seek(0);
    } else if (state.index > 0) {
      stopNews();
      changeTrack(state.index - 1);
    } else seek(0);
  }, [seek, stopNews, changeTrack, musicCommand, updateShufflePlan]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey ||
        document.querySelector('dialog[open], :popover-open') ||
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, [role="checkbox"], [role="combobox"], [role="menu"], [role="menuitem"], [role="slider"], [contenteditable]:not([contenteditable="false"])',
          ))
      )
        return;
      const interactive =
        target instanceof Element && target.closest('button, a, summary, [role="button"], [role="tab"]');
      if (event.code === 'Space' && !event.metaKey && !interactive && live.current.current) {
        event.preventDefault();
        toggle();
      } else if (event.metaKey) {
        if (event.key === 'ArrowLeft' && live.current.current) {
          event.preventDefault();
          previous();
        } else if (event.key === 'ArrowRight' && live.current.current) {
          event.preventDefault();
          skipNext();
        } else if (event.key === 'ArrowUp' && !interactive) {
          event.preventDefault();
          changeVolume(live.current.volume + 0.05);
        } else if (event.key === 'ArrowDown' && !interactive) {
          event.preventDefault();
          changeVolume(live.current.volume - 0.05);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [skipNext, previous, toggle, changeVolume]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = current
      ? new MediaMetadata({
          title: current.name,
          artist: current.artists.join(', '),
          album: current.album,
          artwork: current.imageUrl ? [{ src: current.imageUrl }] : [],
        })
      : null;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      [
        'play',
        () => {
          if (!playIntent.current) toggle();
        },
      ],
      [
        'pause',
        () => {
          musicCommand();
          requestPlayback(false);
          setPlaying(false);
          audio.current?.pause();
          if (speech.current && newsActive.current) {
            speech.current.pause();
            setNewsPhase('paused');
          }
        },
      ],
      ['previoustrack', previous],
      ['nexttrack', skipNext],
      ['seekto', (event) => seek(event.seekTime ?? 0)],
      ['seekbackward', (event) => seek(live.current.position - (event.seekOffset ?? 10))],
      ['seekforward', (event) => seek(live.current.position + (event.seekOffset ?? 10))],
    ];
    for (const [action, handler] of handlers)
      navigator.mediaSession.setActionHandler(action, action.startsWith('seek') && !duration ? null : handler);
    return () => {
      for (const [action] of handlers) navigator.mediaSession.setActionHandler(action, null);
    };
  }, [current, duration, playing, skipNext, previous, seek, toggle, requestPlayback, musicCommand]);

  const playQueueEntry = (key: string, historyIndex?: number) => {
    const state = live.current;
    const nextIndex = state.queue.findIndex((item) => item.key === key);
    if (nextIndex < 0) return;
    musicCommand();
    stopNews();
    requestPlayback(true);
    if (state.shuffle) {
      const plan = shufflePlan.current;
      const selected =
        historyIndex !== undefined && plan.history[historyIndex] === key
          ? { ...plan, cursor: historyIndex }
          : selectShuffle(
              plan,
              state.queue.map((item) => item.key),
              key,
            );
      updateShufflePlan(
        refillShufflePlan(
          selected,
          state.queue.map((item) => item.key),
        ),
      );
    }
    changeTrack(nextIndex);
  };
  const play = (songs: Song[], start?: number) => {
    if (!songs.length) return;
    const selectedIndex = Math.min(Math.max(0, start ?? 0), songs.length - 1);
    const state = live.current;
    if (state.shuffle && (start !== undefined || songs.length === 1)) {
      const selectedId = songs[selectedIndex].id;
      const plan = shufflePlan.current;
      const byKey = new Map(state.queue.map((item) => [item.key, item]));
      const forwardIndex = plan.history.findIndex(
        (key, index) => index > plan.cursor && byKey.get(key)?.song.id === selectedId,
      );
      const selected =
        state.queue[state.index]?.song.id === selectedId
          ? state.queue[state.index]
          : forwardIndex >= 0
            ? byKey.get(plan.history[forwardIndex])
            : (plan.upcoming.map((key) => byKey.get(key)).find((item) => item?.song.id === selectedId) ??
              state.queue.find((item) => item.song.id === selectedId));
      if (selected) {
        playQueueEntry(
          selected.key,
          forwardIndex >= 0 && plan.history[forwardIndex] === selected.key ? forwardIndex : undefined,
        );
        return;
      }
    }
    musicCommand();
    stopNews();
    ++resumeGeneration.current;
    requestPlayback(true);
    setRestore(null);
    setError(null);
    target.current = 0;
    ++generation.current;
    preparing.current = true;
    audio.current?.pause();
    const nextQueue = entries(songs);
    const nextIndex = selectedIndex;
    updateShufflePlan(
      createShufflePlan(
        nextQueue.map((item) => item.key),
        nextQueue[nextIndex]?.key ?? null,
      ),
    );
    setQueue(nextQueue);
    setIndex(nextIndex);
    setReadyConnection(connection?.id ?? null);
  };
  const scheduleNews = async (news: NewsBreak, duckVolume = 0.05, claimId?: string) => {
    if (!live.current.recoveryReady)
      throw new Error('News data is unavailable. Recover it before scheduling a DJ break.');
    const state = live.current;
    const key = state.queue[state.index]?.key;
    if (
      !state.current ||
      !key ||
      !audio.current?.src ||
      !Number.isFinite(state.current.duration) ||
      state.current.duration <= 0
    ) {
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
    ++newsNoticeRevision.current;
    setNewsNotice(null);
    let delivery: PreparedNewsClaim | null = null;
    let playInvoked = false;
    let startPromise: Promise<void> | null = null;
    const cancelDelivery = () => {
      if (delivery && !playInvoked)
        void window.wave
          .releasePreparedNews({ ...delivery, neverPlayInvoked: true })
          .then(unwrap)
          .catch(() => {});
    };
    try {
      const saved = unwrap(await window.wave.getLocalState());
      if (token !== newsGeneration.current || !live.current.recoveryReady)
        throw new Error('The scheduled news break was cancelled because news data is unavailable.');
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
          if (element.readyState >= 3 && Number.isFinite(element.duration) && element.duration > 0) {
            cleanup();
            resolve();
          }
        };
        const failed = () => {
          cleanup();
          reject(new Error('The news audio could not be loaded. Your music continues.'));
        };
        const cancelled = () => {
          cleanup();
          reject(new Error('The scheduled news break was cancelled.'));
        };
        const timer = window.setTimeout(() => {
          cleanup();
          reject(new Error('Loading the news audio timed out. Try scheduling it again.'));
        }, 15000);
        cancelPreload.current = cancelled;
        element.addEventListener('loadedmetadata', ready);
        element.addEventListener('canplay', ready);
        element.addEventListener('error', failed);
        element.src = freshAudioUrl(news.audioUrl);
        element.load();
        ready();
      });
      if (
        token !== newsGeneration.current ||
        !live.current.recoveryReady ||
        live.current.queue[live.current.index]?.key !== key
      )
        throw new Error('The song changed or news data became unavailable before the break was ready.');
      const songDuration = live.current.current!.duration;
      const budget =
        settings.fadeOutSeconds + settings.leadInSeconds + element.duration + settings.postSpeechSeconds + 0.3;
      const scheduledAt = songDuration - budget;
      if (settings.mode === 'over-music' && scheduledAt < songDuration / 2)
        throw new Error(
          'This break is too long for the song ending. Choose News bulletin in Settings > General > DJ transitions to play it between songs.',
        );
      if (
        audio.current!.ended ||
        (settings.mode === 'over-music' && offset.current + audio.current!.currentTime > scheduledAt)
      )
        throw new Error(
          'It is too late for this transition. Choose News bulletin in Settings > General > DJ transitions, or try the next song.',
        );
      if ('signature' in news) {
        const reserved = unwrap(await window.wave.claimPreparedNews({ id: news.id, claimId }));
        if (reserved.deliveryState?.status === 'claimed' && reserved.deliveryState.claimId)
          delivery = { id: news.id, claimId: reserved.deliveryState.claimId };
        if (
          token !== newsGeneration.current ||
          !live.current.recoveryReady ||
          live.current.queue[live.current.index]?.key !== key
        )
          throw new Error('The scheduled news break was cancelled.');
        if (
          audio.current!.ended ||
          (settings.mode === 'over-music' && offset.current + audio.current!.currentTime > scheduledAt)
        )
          throw new Error(
            'It is too late for this transition. Choose News bulletin in Settings > General > DJ transitions, or try the next song.',
          );
      }
      const planned: ScheduledNews = {
        token,
        key,
        duration: element.duration,
        bed: Math.max(0, Math.min(0.08, Number.isFinite(duckVolume) ? duckVolume : 0.05)),
        phase: 'waiting',
        trackEnded: false,
        settings,
        elapsed: 0,
        lastTick: performance.now(),
        startLevel: 1,
        speechAttempt: 0,
        starting: false,
        prepareSpeech: () =>
          (startPromise ??= delivery ? window.wave.startPreparedNews(delivery).then(unwrap) : Promise.resolve()),
        playSpeech: () => {
          playInvoked = true;
          return element.play();
        },
        cancelDelivery,
      };
      newsSchedule.current = planned;
      startNewsClock();
      setNewsRunId(token);
      setActiveNewsId(news.id);
      setNewsLoading(false);
      setNewsPhase('waiting');
      let heard = false;
      element.onplay = () => {
        if (token !== newsGeneration.current || planned.phase !== 'speaking' || !playIntent.current) {
          element.pause();
          return;
        }
        if (heard) return;
        heard = true;
        setLastNews({ news, startedAt: new Date().toISOString(), status: 'playing' });
        const noticeRevision = newsNoticeRevision.current;
        if (delivery)
          void window.wave
            .markPreparedNewsPlayed(delivery)
            .then(unwrap)
            .catch(() => {
              if (noticeRevision === newsNoticeRevision.current)
                setNewsNotice(
                  'The DJ break started, but its history could not be saved. This story stays out of automatic breaks. You can still replay it yourself.',
                );
            });
      };
      element.onended = () => {
        if (token !== newsGeneration.current || newsSchedule.current !== planned) return;
        setLastNews((value) => (value?.news === news ? { ...value, status: 'completed' } : value));
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
        setNewsNotice('The DJ audio could not play. You can try again from Saved audio.');
        if (ended) continueAfterSong();
      };
      checkScheduledNews();
    } catch (cause) {
      cancelDelivery();
      if (token === newsGeneration.current) stopNews();
      throw cause;
    }
  };

  const byQueueKey = new Map(queue.map((item) => [item.key, item]));
  const planned = shuffleView;
  const forward = planned.history.slice(planned.cursor + 1);
  const forwardKeys = new Set(forward);
  const plannedKeys = new Set(planned.upcoming);
  const upcomingKeys = [...forward, ...planned.upcoming.filter((key) => !forwardKeys.has(key))];
  const upcomingQueue = upcomingKeys
    .slice(0, 50)
    .flatMap((key, index) =>
      byQueueKey.has(key)
        ? [{ ...byQueueKey.get(key)!, ...(index < forward.length ? { historyIndex: planned.cursor + 1 + index } : {}) }]
        : [],
    );
  const shuffleHistoryQueue = planned.history
    .slice(0, planned.cursor)
    .flatMap((key, historyIndex) => (byQueueKey.has(key) ? [{ ...byQueueKey.get(key)!, historyIndex }] : []));
  const shuffleRemaining =
    upcomingKeys.length +
    queue.filter((item) => !planned.visited.has(item.key) && !plannedKeys.has(item.key) && !forwardKeys.has(item.key))
      .length;

  return (
    <PositionContext.Provider value={positionStore}>
      <PlayerContext.Provider
        value={{
          queue,
          upcomingQueue,
          shuffleHistoryQueue,
          shuffleRemaining,
          current,
          currentKey,
          playing,
          requestedPlaying,
          busy,
          duration,
          error,
          volume,
          shuffle,
          repeat,
          completedSongs,
          optionsError,
          optionsRevision,
          retryOptions: saveOptions,
          getOptionsSaveGeneration: () => optionsSaveGeneration.current,
          newsPhase,
          activeNewsId,
          newsRunId,
          newsLoading,
          newsNotice,
          activeNews,
          lastNews,
          scheduleNews,
          stopNews: () => {
            const ended = newsSchedule.current?.trackEnded;
            if (ended) continueAfterSong();
            else stopNews();
          },
          controlNews,
          canRetry: !!current || !!restore || !!error,
          musicCommandRevision,
          getMusicCommandRevision,
          pauseForPreview: () => {
            if (playIntent.current) toggle('preview');
          },
          play,
          playQueueEntry,
          enqueue: (songs) => {
            if (!songs.length) return;
            // Queueing replaces an in-flight saved-session restore. Settle its Retry
            // attempt so it cannot keep masking errors for the newly queued track.
            cancelRestoreRetry.current?.();
            cancelRestoreRetry.current = null;
            ++resumeGeneration.current;
            setRestore(null);
            if (!live.current.current) setBusy(false);
            const nextQueue = [...live.current.queue, ...entries(songs)];
            if (live.current.shuffle) {
              const keys = nextQueue.map((item) => item.key);
              const currentKey = nextQueue[live.current.index]?.key ?? null;
              updateShufflePlan(
                live.current.queue.length
                  ? refillShufflePlan(shufflePlan.current, keys)
                  : createShufflePlan(keys, currentKey),
              );
            }
            live.current = { ...live.current, queue: nextQueue, current: nextQueue[live.current.index]?.song };
            setQueue(nextQueue);
            setReadyConnection(connection?.id ?? null);
          },
          toggle,
          next: skipNext,
          previous,
          seek,
          setVolume: changeVolume,
          toggleShuffle: () => {
            ++optionsSaveGeneration.current;
            setOptionsRevision((revision) => revision + 1);
            preferenceEdits.current.shuffle = true;
            const key = live.current.queue[live.current.index]?.key;
            if (!live.current.shuffle)
              updateShufflePlan(
                createShufflePlan(
                  live.current.queue.map((item) => item.key),
                  key ?? null,
                ),
              );
            setShuffle((value) => !value);
          },
          cycleRepeat: () => {
            ++optionsSaveGeneration.current;
            setOptionsRevision((revision) => revision + 1);
            preferenceEdits.current.repeat = true;
            setRepeat((value) => (value === 'off' ? 'all' : value === 'all' ? 'one' : 'off'));
          },
          removeQueue: (key) => {
            const removed = queue.findIndex((item) => item.key === key);
            if (removed < 0) return;
            if (key === currentKey) {
              musicCommand();
              stopNews();
              ++generation.current;
              preparing.current = true;
              audio.current?.pause();
              setError(null);
            }
            const remaining = queue.filter((item) => item.key !== key);
            if (!remaining.length) {
              requestPlayback(false);
              preparing.current = false;
              audio.current?.pause();
              audio.current?.removeAttribute('src');
              audio.current?.load();
              ++generation.current;
              ++resumeGeneration.current;
              setBusy(false);
              setPlaying(false);
              publishPosition(0);
            }
            let nextIndex = removed < index ? index - 1 : Math.min(index, Math.max(0, remaining.length - 1));
            let plan = shufflePlan.current;
            if (key === currentKey && shuffle && remaining.length) {
              const keys = remaining.map((item) => item.key);
              const advanced = nextShuffle(removeShuffle(plan, keys, key), keys, null, repeat === 'all');
              plan = advanced.plan;
              if (advanced.key && advanced.key !== key)
                nextIndex = remaining.findIndex((item) => item.key === advanced.key);
              else {
                requestPlayback(false);
                nextIndex = Math.min(nextIndex, remaining.length - 1);
              }
            }
            plan = removeShuffle(
              plan,
              remaining.map((item) => item.key),
              key,
            );
            if (shuffle && remaining.length) {
              const replacement = remaining[nextIndex].key;
              if (plan.history[plan.cursor] !== replacement)
                plan = selectShuffle(
                  plan,
                  remaining.map((item) => item.key),
                  replacement,
                );
              plan = refillShufflePlan(
                plan,
                remaining.map((item) => item.key),
              );
            }
            updateShufflePlan(plan);
            live.current = { ...live.current, queue: remaining, index: nextIndex, current: remaining[nextIndex]?.song };
            setQueue(remaining);
            setIndex(nextIndex);
          },
          retry,
          getPlaybackGeneration: () => generation.current,
          getResumeGeneration: () => resumeGeneration.current,
        }}
      >
        {children}
      </PlayerContext.Provider>
    </PositionContext.Provider>
  );
}
