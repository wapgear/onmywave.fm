import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DJ, DJPlaybackSettings, NewsSource, PreparedNewsTake, RoomProfile } from '../shared/types';
import { defaultDJPlaybackSettings } from '../shared/dj-playback';
import { unwrap } from './api';
import { usePlayer } from './player';

type PlaybackView = { configKey: string; pending: PreparedNewsTake | null; preparing: boolean; placing: boolean; waiting: boolean; failure: string | null; baseline: number };
function useDJPlaybackController() {
  const player = usePlayer();
  const client = useQueryClient();
  const state = useQuery({ queryKey: ['localState'], queryFn: async () => unwrap(await window.wave.getLocalState()) });
  const settings = state.data?.djPlayback ?? defaultDJPlaybackSettings();
  const rooms = state.data?.roomProfiles.filter(room => room.enabled) ?? [];
  const room = rooms.find(room => room.id === settings.roomId);
  const dj = state.data?.djs.find(dj => dj.id === room?.room.djId);
  const sources = state.data?.sources.filter(source => room?.room.sourceIds.includes(source.id)) ?? [];
  const configKey = JSON.stringify([{ enabled: settings.enabled, roomId: settings.roomId, everySongs: settings.everySongs }, room ? { id: room.id, room: room.room, mood: room.mood, newsInterests: room.workflowDraft.newsInterests } : null, dj ?? null, sources]);
  const live = useRef({ player, queryError: state.error });
  useLayoutEffect(() => { live.current = { player, queryError: state.error }; });
  const retry = useRef<() => void>(() => {});
  const [view, setView] = useState<PlaybackView | null>(null);
  useEffect(() => {
    const [config, profile] = JSON.parse(configKey) as [DJPlaybackSettings, RoomProfile | null, DJ | null, NewsSource[]];
    let cancelled = false;
    let checking = false;
    const excluded = new Set<string>();
    let ownedNews: string | null = null;
    let heard = false;
    let skipped = false;
    let published = false;
    const attempted = new Set<string>();
    const cycle: PlaybackView = { configKey, baseline: live.current.player.completedSongs, pending: null, preparing: false, placing: false, waiting: false, failure: null };
    const publish = () => { if (!cancelled) setView({ ...cycle }); };
    retry.current = () => { cycle.failure = null; attempted.clear(); publish(); };
    const tick = () => {
      if (!published) { published = true; publish(); }
      const p = live.current.player;
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
        void p.scheduleNews(take, take.renderingDJ.news?.duckVolume ?? 0.05).catch(cause => {
          if (cancelled) return;
          const message = cause instanceof Error ? cause.message : 'The DJ break could not be scheduled.';
          // A late result waits for another ending without repeating provider calls.
          if (!/too late|too long|too short|song changed|cancelled|Start a song/.test(message)) {
            excluded.add(take.id);
            cycle.pending = null;
            ownedNews = null;
            void window.wave.releasePreparedNews(take.id).then(unwrap).catch(() => {});
          }
        }).finally(() => { cycle.placing = false; publish(); });
        return;
      }
      if (checking || p.completedSongs - cycle.baseline < config.everySongs - (skipped ? 0 : 1)) return;
      checking = true;
      cycle.preparing = true;
      publish();
      void window.wave.nextRoomNews({ roomId: profile.id, excludedIds: [...excluded] }).then(unwrap).then(take => {
        if (cancelled) {
          if (take) void window.wave.releasePreparedNews(take.id).then(unwrap).catch(() => {});
          return;
        }
        cycle.pending = take;
        ownedNews = take?.id ?? null;
        if (!take) { cycle.baseline = live.current.player.completedSongs; skipped = true; }
      }).catch(cause => {
        if (!cancelled) cycle.failure = cause instanceof Error ? cause.message : 'The saved news pool could not be checked.';
      }).finally(() => { checking = false; cycle.preparing = false; publish(); });
    };
    const timer = window.setInterval(tick, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (ownedNews) void window.wave.releasePreparedNews(ownedNews).then(unwrap).catch(() => {});
      if (ownedNews && live.current.player.activeNews?.id === ownedNews) live.current.player.stopNews();
    };
  }, [configKey]);
  const current = view?.configKey === configKey ? view : null;
  const completed = Math.max(0, player.completedSongs - (current?.baseline ?? player.completedSongs));
  const update = useMutation({ mutationFn: async (patch: Partial<DJPlaybackSettings>) => {
    const latest = unwrap(await window.wave.getLocalState());
    unwrap(await window.wave.saveDJPlayback({ ...latest.djPlayback, ...patch }));
    await client.invalidateQueries({ queryKey: ['localState'] });
    if (patch.enabled === false) live.current.player.stopNews();
  } });
  const error = current?.failure ?? (settings.enabled && !room ? 'Choose an available Listening Room.' : null);
  return { state, settings, rooms, room, sources, pending: current?.pending ?? null, preparing: current?.preparing ?? false, placing: current?.placing ?? false, waitingForPreparation: current?.waiting ?? false,
    error, update, songsUntilBreak: Math.max(1, settings.everySongs - completed), retry: () => retry.current() };
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
