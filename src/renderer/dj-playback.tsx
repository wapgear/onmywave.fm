import { djPreparationKey } from '../shared/dj-avatar';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DJPlaybackSettings, PreparedNewsTake, RoomProfile } from '../shared/types';
import { defaultDJPlaybackSettings } from '../shared/dj-playback';
import { unwrap } from './api';
import { confirmLocalState } from './local-state-cache';
import { usePlayer } from './player';
import { useNewsRecovery } from './NewsRecovery';

type PlaybackView = { configKey: string; pending: PreparedNewsTake | null; preparing: boolean; placing: boolean; waiting: boolean; failure: string | null; baseline: number; retryPhase: 'queued' | 'checking' | 'ready' | 'empty' | null; retryMessage: string | null };
function useDJPlaybackController() {
  const player = usePlayer();
  const recovery = useNewsRecovery();
  const recoveryReady = recovery.status.phase === 'ready';
  const client = useQueryClient();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()), enabled: recoveryReady });
  const settings = state.data?.djPlayback ?? defaultDJPlaybackSettings();
  const writeInFlight = useRef(false);
  const [unconfirmedUpdate, setUnconfirmedUpdate] = useState<Partial<DJPlaybackSettings> | null>(null);
  const unconfirmedUpdateRef = useRef<Partial<DJPlaybackSettings> | null>(null);
  const setUnconfirmed = (patch: Partial<DJPlaybackSettings> | null) => {
    unconfirmedUpdateRef.current = patch;
    setUnconfirmedUpdate(patch);
  };
  const rooms = state.data?.roomProfiles.filter(room => room.enabled) ?? [];
  const room = rooms.find(room => room.id === settings.roomId);
  const dj = state.data?.djs.find(dj => dj.id === room?.room.djId);
  const sources = state.data?.sources.filter(source => room?.room.sourceIds.includes(source.id)) ?? [];
  const configKey = JSON.stringify([{ enabled: settings.enabled, roomId: settings.roomId, everySongs: settings.everySongs }, room ? { id: room.id, room: room.room, mood: room.mood, newsInterests: room.workflowDraft.newsInterests } : null, djPreparationKey(dj), sources]);
  const live = useRef({ player, queryError: state.error, recoveryReady });
  useLayoutEffect(() => { live.current = { player, queryError: state.error, recoveryReady }; });
  const retry = useRef<() => void>(() => {});
  const [view, setView] = useState<PlaybackView | null>(null);
  useEffect(() => {
    const [config, profile] = JSON.parse(configKey) as [DJPlaybackSettings, RoomProfile | null];
    let cancelled = false;
    let checking = false;
    const excluded = new Set<string>();
    let ownedNews: string | null = null;
    let heard = false;
    let skipped = false;
    let published = false;
    const attempted = new Set<string>();
    let recoveryBlocked = false;
    const release = (take: PreparedNewsTake) => {
      const claimId = take.deliveryState?.claimId;
      if (claimId) void window.wave.releasePreparedNews({ id: take.id, claimId }).then(unwrap).catch(() => {});
    };
    const cycle: PlaybackView = { configKey, baseline: live.current.player.completedSongs, pending: null, preparing: false, placing: false, waiting: false, failure: null, retryPhase: null, retryMessage: null };
    const publish = () => { if (!cancelled) setView({ ...cycle }); };
    retry.current = () => {
      if (writeInFlight.current || cycle.retryPhase === 'queued' || cycle.retryPhase === 'checking') return;
      cycle.retryMessage = `Saved news check queued until music is playing and a break is due.${cycle.failure ? ` Previous error: ${cycle.failure}` : ''}`;
      cycle.failure = null;
      cycle.retryPhase = 'queued';
      attempted.clear();
      publish();
    };
    const tick = () => {
      if (!published) { published = true; publish(); }
      const p = live.current.player;
      if (!live.current.recoveryReady) {
        const knownSpeech = p.activeNews && p.lastNews?.news.id === p.activeNews.id && (
          p.newsPhase === 'speaking' || p.newsPhase === 'paused' ||
          (p.newsPhase === 'tail' && p.lastNews.status === 'completed')
        );
        // Keep an already-started take intact through recovery. A paused take
        // remains user-paused, and a completed take may still be in its music
        // return tail; both are released only after the player clears it.
        if (knownSpeech) return;
        if (p.newsPhase !== 'idle' && !recoveryBlocked) p.stopNews();
        if (cycle.pending && ownedNews) release(cycle.pending);
        cycle.pending = null; ownedNews = null; cycle.preparing = false; cycle.placing = false;
        recoveryBlocked = true;
        publish();
        return;
      }
      recoveryBlocked = false;
      if (writeInFlight.current) return;
      if (!config.enabled || !profile || live.current.queryError || cycle.failure) return;
      if (!heard && cycle.pending && p.lastNews?.news.id === cycle.pending.id) {
        heard = true;
        excluded.add(cycle.pending.id);

      }
      if (heard && !p.activeNews && !cycle.placing) {
        heard = false; skipped = false; ownedNews = null; attempted.clear();
        cycle.pending = null; cycle.baseline = p.completedSongs;
        publish();
        return;
      }
      if (!p.currentKey || !p.requestedPlaying || p.busy || p.activeNews) return;
      if (cycle.pending) {
        const occurrence = `${p.currentKey}:${p.completedSongs}`;
        if (cycle.placing || attempted.has(occurrence)) return;
        attempted.add(occurrence);
        const take = cycle.pending;
        ownedNews = take.id;
        cycle.placing = true;
        publish();
        void p.scheduleNews(take, take.renderingDJ.news?.duckVolume ?? 0.05, take.deliveryState?.claimId).catch(cause => {
          if (cancelled) return;
          const message = cause instanceof Error ? cause.message : 'The DJ break could not be scheduled.';
          // A late result waits for another ending without repeating provider calls.
          if (!/too late|too long|too short|song changed|cancelled|Start a song/.test(message)) {
            excluded.add(take.id);
            cycle.pending = null;
            ownedNews = null;
            release(take);
          }
        }).finally(() => { cycle.placing = false; publish(); });
        return;
      }
      if (checking || p.completedSongs - cycle.baseline < config.everySongs - (skipped ? 0 : 1)) return;
      checking = true;
      const retrying = cycle.retryPhase === 'queued';
      if (retrying) {
        cycle.retryPhase = 'checking';
        cycle.retryMessage = 'Checking the saved news pool…';
      }
      cycle.preparing = true;
      publish();
      void window.wave.nextRoomNews({ roomId: profile.id, excludedIds: [...excluded] }).then(unwrap).then(take => {
        if (cancelled) {
          if (take) release(take);
          return;
        }
        if (!live.current.recoveryReady) {
          if (take) release(take);
          return;
        }
        cycle.pending = take;
        ownedNews = take?.id ?? null;
        if (!take) { cycle.baseline = live.current.player.completedSongs; skipped = true; }
        if (retrying) {
          cycle.retryPhase = take ? 'ready' : 'empty';
          cycle.retryMessage = take ? 'A saved news break is ready.' : 'No eligible saved news is available yet.';
        }
      }).catch(cause => {
        if (!cancelled) {
          cycle.failure = cause instanceof Error ? cause.message : 'The saved news pool could not be checked.';
          if (retrying) { cycle.retryPhase = null; cycle.retryMessage = null; }
        }
      }).finally(() => { checking = false; cycle.preparing = false; publish(); });
    };
    const timer = window.setInterval(tick, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (ownedNews && cycle.pending) release(cycle.pending);
      if (ownedNews && live.current.player.activeNews?.id === ownedNews) live.current.player.stopNews();
    };
  }, [configKey]);
  const current = view?.configKey === configKey ? view : null;
  const completed = Math.max(0, player.completedSongs - (current?.baseline ?? player.completedSongs));
  const savePlaybackSettings = async (patch: Partial<DJPlaybackSettings>) => {
    if (writeInFlight.current) throw new Error('A DJ playback setting is already being saved.');
    const safeDisable = patch.enabled === false && Object.keys(patch).every(key => key === 'enabled');
    if (unconfirmedUpdateRef.current && !safeDisable) throw new Error('Refresh DJ playback status before changing this setting.');
    if (!live.current.recoveryReady) throw new Error('News data is unavailable. Recover it before changing DJ playback.');
    writeInFlight.current = true;
    let saved = false;
    try {
      await confirmLocalState(client, unwrap(await window.wave.saveDJPlayback(patch)));
      saved = true;
      setUnconfirmed(patch);
      try {
        await client.invalidateQueries({ queryKey: ['localState'] }, { throwOnError: true });
        const confirmed = client.getQueryData<{ djPlayback?: DJPlaybackSettings }>(['localState'])?.djPlayback;
        if (!confirmed || Object.entries(patch).some(([key, value]) => confirmed[key as keyof DJPlaybackSettings] !== value)) {
          throw new Error('The refreshed settings do not match the saved change.');
        }
        setUnconfirmed(null);
      } catch {
        throw new Error('The setting was saved, but its current status could not be confirmed. Refresh DJ playback status to check it.');
      }
    } finally {
      if (saved && patch.enabled === false) live.current.player.stopNews();
      writeInFlight.current = false;
    }
  };
  const update = useMutation({ mutationFn: savePlaybackSettings });
  const updatePlayback = (patch: Partial<DJPlaybackSettings>) => update.mutate(patch);
  const refreshPlaybackStatus = async () => {
    if (writeInFlight.current) return state.refetch();
    const result = await state.refetch();
    if (!result.isError && !writeInFlight.current) {
      setUnconfirmed(null);
      update.reset();
    }
    return result;
  };
  const error = current?.failure ?? (settings.enabled && !room ? 'Choose an available News bucket.' : null);
  return { state, settings, rooms, room, sources, pending: recoveryReady ? current?.pending ?? null : null, preparing: recoveryReady && (current?.preparing ?? false), placing: recoveryReady && (current?.placing ?? false), waitingForPreparation: recoveryReady && (current?.waiting ?? false),
    error: recoveryReady ? error : null, update, updatePlayback, unconfirmedUpdate, refreshPlaybackStatus,
    retryPhase: current?.retryPhase ?? null, retryMessage: current?.retryMessage ?? null,
    songsUntilBreak: Math.max(1, settings.everySongs - completed), retry: () => { if (recoveryReady) retry.current(); }, recoveryStatus: recovery.status.phase };
}
const DJPlaybackContext = createContext<ReturnType<typeof useDJPlaybackController> | null>(null);
export function DJPlaybackProvider({ children }: { children: ReactNode }) {
  const controller = useDJPlaybackController();
  return <DJPlaybackContext.Provider value={controller}>{children}</DJPlaybackContext.Provider>;
}
export function useDJPlayback() {
  const controller = useContext(DJPlaybackContext);
  if (!controller) throw new Error('DJ controls require DJPlaybackProvider');
  return controller;
}
