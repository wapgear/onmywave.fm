import { isDJPlaybackSettings, normalizeDJPlaybackSettings } from '../shared/dj-playback';
import type { DJPlaybackSettings } from '../shared/dj-playback';
import { normalizeNewsSource } from '../shared/sources';
import { readTwitterKey, twitterKeyStatus, writeTwitterKey } from './storage';
import { getDJVoicePreview, prepareDJVoicePreview, getVoicePreview, prepareVoicePreview } from './dj-previews';
import { searchDJVoices } from './dj-voices';
import { app, BrowserWindow, ipcMain, net, protocol, session, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acknowledgePlaylistRecovery, beginPlaylistRead, finishPlaylistRead, invalidatePlaylistReceipts, playlistRecoveryKey, playlistCreationRecoveryKey, playlistRecoveryStatuses, withPlaylistRecovery } from './playlist-recovery';
import { JellyfinService, ServiceError, PLAYLIST_CREATION } from './jellyfin';
import { getLocalState, openAIKeyStatus, readDeviceIdentity, readConnection, readOpenAIKey, updateLocalState, withProviderKeys, writeConnection, writeOpenAIKey, readElevenLabsKey, elevenLabsKeyStatus, writeElevenLabsKey } from './storage';
import { preparePlayback, registerMedia, registerSpeechAudio, revokeMedia, revokeSpeechAudio } from './media';
import { NewsService, validateNewsSettings } from './news';
import { getPreparedNews, prepareNewsScript, renderNewsTake, selectNewsTake, cancelPreparedNews, cancelActivePreparedNews, isPreparedNewsActive, nextRoomNews, releasePreparedNews, markPreparedNewsPlayed, reconcilePreparedNews, submitReviewedCandidates, completeReviewedCandidates, interruptReviewedCandidates, releaseReviewedCandidates, savePreparedScript, reviewedArticleUrls } from './prepared-news';
import { pauseNewsWorkflow, startNewsWorkflow, stopNewsWorkflow, invalidateNewsWorkflow } from './news-workflow';
import { isNewsTransitionSettings, normalizeNewsTransitionSettings } from '../shared/news-transitions';
import { isWorkflowDraft, normalizeWorkflowDraft } from '../shared/workflow';
import type { WorkflowDraft } from '../shared/workflow';
import type { ApiError, DJ, NewsBreak, NewsProgress, PlaybackSnapshot, PlaybackPreferences, NewsSource, ListeningRoom, LocalState } from '../shared/types';
import { defaultPlaybackPreferences, playbackPreferenceKey } from './playback-preferences';

app.setName('onmywave.fm Light');
app.setPath('userData', join(app.getPath('appData'), 'onmywave-light'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'wave-app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'wave-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
const directory = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | null = null;
let signingOut = false;
let preparationEpoch = 0;
const news = new NewsService({ canGenerate: () => !signingOut && !!service.connection(), getApiKey: readOpenAIKey, getTwitterKey: readTwitterKey, getElevenApiKey: readElevenLabsKey, onProgress: value => {
  if ((activeNews === value.requestId || isPreparedNewsActive(value.requestId)) && window && !window.isDestroyed()) window.webContents.send('wave:newsProgress', value);
} });
let activeNews: string | null = null;
let newsGeneration = 0;
let preparingNewsPreview = false;
function cancelNews(requestId?: string) {
  news.cancel(requestId);
  if (!requestId || requestId === activeNews) { ++newsGeneration; activeNews = null; revokeSpeechAudio(); }
}
let playlistSessionEpoch = 0;
let service: JellyfinService;
let deviceId: string;
let persistentDeviceIdentity = false;
const invalid = () => { throw new ServiceError('invalid', 'Invalid request.'); };
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const strings = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= max && value.every(item => text(item, 128));

function validateDjs(value: unknown): asserts value is DJ[] {
  if (!Array.isArray(value) || value.length > 1000) invalid();
  for (const dj of value as unknown[]) {
    if (!isRecord(dj) || !text(dj.id, 128) || !text(dj.name, 256) || !dj.name.trim()) invalid();
    for (const field of ['description', 'instructions', 'musicPreferences', 'exclusions', 'language', 'personality']) {
      if (!text((dj as Record<string, unknown>)[field], 20_000)) invalid();
    }
    if (!['never', 'occasionally', 'often'].includes(String((dj as Record<string, unknown>).speakingFrequency))) invalid();
    const settings = (dj as DJ).news;
    if (settings !== undefined) {
      (dj as DJ).news = validateNewsSettings(settings);
      if (!['openai-tts', 'gpt-live-1', 'elevenlabs-v4'].includes(settings.speechEngine) || !text(settings.textModel, 128)
        || !/^[a-zA-Z0-9._-]+$/.test(settings.textModel) || !Number.isFinite(settings.duckVolume) || settings.duckVolume < 0 || settings.duckVolume > 0.5) invalid();
    }
  }
}
function validateRoomConfiguration(value: unknown): asserts value is { room: ListeningRoom; mood: string; workflowDraft: WorkflowDraft } {
  if (!isRecord(value) || !isWorkflowDraft(value.workflowDraft) || !text(value.mood, 4000)
    || !isRecord(value.room) || (value.room.djId !== null && (!text(value.room.djId, 128) || !value.room.djId))
    || !strings(value.room.sourceIds, 20) || value.room.sourceIds.some(id => !id)) invalid();
}
function validateRoomReferences(room: ListeningRoom, state: LocalState) {
  if ((room.djId !== null && !state.djs.some(dj => dj.id === room.djId)) || room.sourceIds.some(id => !state.sources.some(source => source.id === id))) throw new ServiceError('invalid', 'A selected DJ or source no longer exists.');
}
function markChangedProfileRuns(state: LocalState, affected: (profile: LocalState['roomProfiles'][number]) => boolean): Partial<LocalState> {
  const roomProfiles = state.roomProfiles.map(profile => affected(profile) && profile.workflowDraft.newsLastRun
    ? { ...profile, workflowDraft: { ...profile.workflowDraft, newsLastRun: { ...profile.workflowDraft.newsLastRun, setupChanged: true } } } : profile);
  return { roomProfiles, ...(state.activeRoomProfileId ? { workflowDraft: roomProfiles.find(profile => profile.id === state.activeRoomProfileId)?.workflowDraft } : {}) };
}
function profileName(value: unknown): string {
  if (!text(value, 80) || !value.trim()) throw new ServiceError('invalid', 'Give this configuration a name of up to 80 characters.');
  return value.trim();
}
function profileId(value: unknown): asserts value is string {
  if (!text(value, 128) || !/^[a-zA-Z0-9-]+$/.test(value)) invalid();
}

function validatePlayback(value: unknown): asserts value is PlaybackSnapshot | null {
  if (value === null) return;
  if (!isRecord(value) || !text(value.connectionId, 4096) || !strings(value.trackIds, 100_000)
    || !Number.isInteger(value.currentIndex) || (value.currentIndex as number) < 0 || (value.currentIndex as number) >= Math.max(1, (value.trackIds as string[]).length)
    || typeof value.position !== 'number' || !Number.isFinite(value.position) || value.position < 0
    || typeof value.volume !== 'number' || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1
    || typeof value.shuffle !== 'boolean' || typeof value.repeat !== 'string' || !['off', 'all', 'one'].includes(value.repeat)
    || (value.outputId !== undefined && !text(value.outputId, 512))) invalid();
}


function registerIpc() {
  const operations: Record<string, (input: never) => unknown> = {
    getConnection: () => service.connection(),
    connect: async (input: { serverUrl: string; username: string; password: string }) => {
      if (!isRecord(input) || !text(input.serverUrl, 2048) || !text(input.username, 256) || !text(input.password, 4096)) invalid();
      if (signingOut) throw new ServiceError('invalid', 'Wait for sign-out to finish before signing in.');
      await service.connect(input);
      if (service.connection() && !signingOut) news.resumeGeneration();
      return service.connection();
    },
    disconnect: async () => {
      if (signingOut) throw new ServiceError('invalid', 'Sign-out is already in progress.');
      signingOut = true;
      service.cancelPendingSignIns();
      ++preparationEpoch;
      invalidateNewsWorkflow();
      cancelActivePreparedNews();
      news.cancelGeneration();
      try {
        try {
          await updateLocalState(state => {
            const roomProfiles = state.roomProfiles.map(profile => profile.workflowDraft.newsEnabled
              ? { ...profile, workflowDraft: { ...profile.workflowDraft, newsWorkflowPaused: true, nextNewsCheckAt: undefined } } : profile);
            return { roomProfiles, workflowDraft: roomProfiles.find(profile => profile.id === state.activeRoomProfileId)!.workflowDraft };
          });
        } catch {
          throw new ServiceError('server', 'Automatic preparation could not be paused. You are still signed in. Try signing out again.');
        }
        try { await service.disconnect(); }
        catch {
          throw new ServiceError('server', 'Sign-out could not finish. You are still signed in. Try again.');
        }
      } finally {
        signingOut = false;
        if (service.connection()) news.resumeGeneration();
      }
    },
    libraries: () => service.libraries(),
    libraryFilters: () => service.libraryFilters(),
    selectLibraries: input => service.selectLibraries(input),
    songs: input => service.songs(input), albums: input => service.albums(input),
    album: input => service.album(input), albumTracks: input => service.albumTracks(input), song: input => service.song(input),
    playlists: async () => {
      const current = service.exportSession(), epoch = playlistSessionEpoch;
      if (!current) throw new ServiceError('unauthorized', 'Sign in to Jellyfin.');
      const key = playlistCreationRecoveryKey(current.serverUrl, current.userId);
      let before;
      try { before = await beginPlaylistRead(key); } catch { /* Existing playlists remain available for listening. */ }
      if (epoch !== playlistSessionEpoch) throw new ServiceError('invalid', 'The connection changed. Refresh your playlists.');
      const items = await service.playlists();
      if (epoch !== playlistSessionEpoch) throw new ServiceError('invalid', 'The connection changed. Refresh your playlists.');
      let creationRecovery;
      try { creationRecovery = before ? await finishPlaylistRead(key, before) : { status: 'unavailable' as const }; }
      catch { creationRecovery = { status: 'unavailable' as const }; }
      const statuses = await playlistRecoveryStatuses(items.map(item => playlistRecoveryKey(current.serverUrl, current.userId, item.id)));
      if (epoch !== playlistSessionEpoch) throw new ServiceError('invalid', 'The connection changed. Refresh your playlists.');
      return { items: items.map((item, index) => ({ ...item, recoveryStatus: statuses[index] })), creationRecovery };
    },
    acknowledgePlaylistCreation: async (input: { markerId: string; receipt: string }) => {
      if (!isRecord(input) || !text(input.markerId, 36) || !text(input.receipt, 36)) invalid();
      const current = service.exportSession(), epoch = playlistSessionEpoch;
      if (!current) throw new ServiceError('unauthorized', 'Sign in to Jellyfin.');
      await acknowledgePlaylistRecovery(playlistCreationRecoveryKey(current.serverUrl, current.userId), input.markerId, input.receipt, () => epoch === playlistSessionEpoch);
    },
    playlist: async (input: string) => {
      const current = service.exportSession(), epoch = playlistSessionEpoch;
      if (!current) throw new ServiceError('unauthorized', 'Sign in to Jellyfin.');
      const key = typeof input === 'string' ? playlistRecoveryKey(current.serverUrl, current.userId, input) : '';
      let before;
      try { before = await beginPlaylistRead(key); } catch { /* Listening stays available if edit recovery cannot be read. */ }
      if (epoch !== playlistSessionEpoch) throw new ServiceError('invalid', 'The connection changed. Refresh this playlist.');
      const detail = await service.playlist(input);
      if (epoch !== playlistSessionEpoch) throw new ServiceError('invalid', 'The connection changed. Refresh this playlist.');
      let editRecovery;
      try { editRecovery = before ? await finishPlaylistRead(key, before) : { status: 'unavailable' as const }; }
      catch { editRecovery = { status: 'unavailable' as const }; }
      if (epoch !== playlistSessionEpoch) throw new ServiceError('invalid', 'The connection changed. Refresh this playlist.');
      return { ...detail, editRecovery };
    },
    acknowledgePlaylistRecovery: async (input: { id: string; markerId: string; receipt: string }) => {
      if (!isRecord(input) || !text(input.id, 128) || !text(input.markerId, 36) || !text(input.receipt, 36)) invalid();
      const current = service.exportSession(), epoch = playlistSessionEpoch;
      if (!current) throw new ServiceError('unauthorized', 'Sign in to Jellyfin.');
      await acknowledgePlaylistRecovery(playlistRecoveryKey(current.serverUrl, current.userId, input.id), input.markerId, input.receipt, () => epoch === playlistSessionEpoch);
    },
    createPlaylist: input => service.createPlaylist(input), renamePlaylist: input => service.renamePlaylist(input),
    addPlaylistItems: input => service.addPlaylistItems(input), removePlaylistEntries: input => service.removePlaylistEntries(input),
    movePlaylistEntry: input => service.movePlaylistEntry(input),
    preparePlayback: (input: { id: string; transcode?: boolean; offsetSeconds?: number }) => {
      if (!isRecord(input) || typeof input.id !== 'string' || (input.transcode !== undefined && typeof input.transcode !== 'boolean')) invalid();
      const current = service.exportSession();
      return preparePlayback(current ? { ...current, id: service.connection()!.id } : null, input, deviceId);
    },
    getLocalState: () => getLocalState(),
    saveDjs: async input => {
      validateDjs(input);
      const djs = input as DJ[];
      await updateLocalState(state => {
        const before = new Map(state.djs.map(dj => [dj.id, JSON.stringify(dj)]));
        const after = new Map(djs.map(dj => [dj.id, JSON.stringify(dj)]));
        const changed = new Set([...before.keys(), ...after.keys()].filter(id => before.get(id) !== after.get(id)));
        return { djs, ...markChangedProfileRuns(state, profile => Boolean(profile.room.djId && changed.has(profile.room.djId))) };
      });
    },
    searchDJVoices,
    saveVibe: async input => { if (!text(input, 20_000)) invalid(); await updateLocalState({ vibe: input }); },
    saveNewsTransitions: async input => {
      if (!isNewsTransitionSettings(input)) invalid();
      const settings = normalizeNewsTransitionSettings(input);
      await updateLocalState({ newsTransitions: settings });
      return settings;
    },
    savePlayback: async (input: PlaybackSnapshot | null) => {
      validatePlayback(input);
      await updateLocalState(state => {
        const connectionId = service.connection()?.id;
        if (signingOut || !connectionId) return {};
        if (!input) return state.playback?.connectionId === connectionId ? { playback: null } : {};
        if (input.connectionId !== connectionId) return {};
        const { volume, shuffle, repeat } = input;
        return {
          playback: state.playback && state.playback.connectionId !== connectionId && !input.trackIds.length ? state.playback : input,
          playbackPreferences: { ...state.playbackPreferences, [playbackPreferenceKey(connectionId)]: { volume, shuffle, repeat } },
        };
      });
    },
    getPlaybackPreferences: async (connectionId: string) => {
      if (!text(connectionId, 4096) || !connectionId) invalid();
      const state = await getLocalState();
      if (signingOut || service.connection()?.id !== connectionId) return null;
      return state.playbackPreferences[playbackPreferenceKey(connectionId)] ?? defaultPlaybackPreferences();
    },
    savePlaybackPreferences: async (input: { connectionId: string; options: Partial<PlaybackPreferences> }) => {
      if (!isRecord(input) || !text(input.connectionId, 4096) || !input.connectionId || !isRecord(input.options)) invalid();
      const options = input.options;
      if (!Object.keys(options).length || Object.keys(options).some(key => !['volume', 'shuffle', 'repeat'].includes(key))
        || ('volume' in options && (typeof options.volume !== 'number' || !Number.isFinite(options.volume) || options.volume < 0 || options.volume > 1))
        || ('shuffle' in options && typeof options.shuffle !== 'boolean')
        || ('repeat' in options && (typeof options.repeat !== 'string' || !['off', 'all', 'one'].includes(options.repeat)))) invalid();
      let saved = false;
      await updateLocalState(state => {
        const playback = state.playback;
        if (signingOut || service.connection()?.id !== input.connectionId) return {};
        saved = true;
        const key = playbackPreferenceKey(input.connectionId);
        return {
          playback: playback?.connectionId === input.connectionId ? { ...playback, ...options } : playback,
          playbackPreferences: { ...state.playbackPreferences, [key]: { ...(state.playbackPreferences[key] ?? defaultPlaybackPreferences()), ...options } },
        };
      });
      return saved;
    },
    saveWorkflowDraft: async (input: { expectedProfileId: string; workflowDraft: WorkflowDraft; room: ListeningRoom; mood: string; resumePreparation?: boolean }) => {
      const epoch = preparationEpoch;
      if (signingOut) throw new ServiceError('invalid', 'Wait for sign-out to finish before saving news settings.');
      validateRoomConfiguration(input);
      profileId(input.expectedProfileId);
      if (input.resumePreparation !== undefined && typeof input.resumePreparation !== 'boolean') invalid();
      const latest = await getLocalState();
      const activeProfileId = input.expectedProfileId;
      const initialRun = latest.roomProfiles.find(profile => profile.id === activeProfileId)?.workflowDraft.newsLastRun;
      const runningRequestId = initialRun?.outcome === 'running' ? initialRun.requestId : undefined;
      if (latest.activeRoomProfileId !== activeProfileId) throw new ServiceError('invalid', 'The profile changed before saving. Review its settings and save again.');
      validateRoomReferences(input.room, latest);
      const selectedSources = latest.sources.filter(source => input.room.sourceIds.includes(source.id));
      const selectedDj = latest.djs.find(dj => dj.id === input.room.djId);
      if (input.workflowDraft.newsEnabled) {
        if (!latest.roomProfiles.find(profile => profile.id === activeProfileId)?.enabled) throw new ServiceError('invalid', 'Make this profile available before enabling news preparation.');
        if (!selectedSources.length) throw new ServiceError('invalid', 'Choose at least one source before enabling news preparation.');
        if (!selectedDj?.news) throw new ServiceError('invalid', 'Choose a saved DJ with voice settings before enabling news preparation.');
        if (!input.mood.trim()) throw new ServiceError('invalid', 'Describe the host mood before enabling news preparation.');
      }
      const save = async () => {
        if (signingOut || epoch !== preparationEpoch) throw new ServiceError('invalid', 'Sign-out interrupted this save. Sign in and review the saved news settings.');
        if (input.workflowDraft.newsEnabled) {
          if (!await readOpenAIKey()) throw new ServiceError('invalid', 'Add an OpenAI key before enabling news preparation.');
          if (!await readElevenLabsKey()) throw new ServiceError('invalid', 'Add an ElevenLabs key before enabling news preparation.');
          if (selectedSources.some(source => source.kind === 'twitter') && !await readTwitterKey()) throw new ServiceError('invalid', 'Add an X bearer token for the selected X sources before enabling news preparation.');
        }
        await updateLocalState(state => {
          if (signingOut || epoch !== preparationEpoch) throw new ServiceError('invalid', 'Sign-out interrupted this save. Sign in and review the saved news settings.');
          if (state.activeRoomProfileId !== activeProfileId) throw new ServiceError('invalid', 'The profile changed while saving. Review its settings and save again.');
          validateRoomReferences(input.room, state);
          if (input.workflowDraft.newsEnabled && (JSON.stringify(selectedDj) !== JSON.stringify(state.djs.find(dj => dj.id === input.room.djId))
            || JSON.stringify(selectedSources) !== JSON.stringify(state.sources.filter(source => input.room.sourceIds.includes(source.id)))
            || !state.roomProfiles.find(profile => profile.id === activeProfileId)?.enabled)) throw new ServiceError('invalid', 'The selected host or sources changed while saving. Review them and save again.');
          const profile = state.roomProfiles.find(value => value.id === activeProfileId);
          const requested = normalizeWorkflowDraft(input.workflowDraft);
          const explicitResume = input.resumePreparation === true;
          const room = { djId: input.room.djId, sourceIds: [...new Set(input.room.sourceIds)] };
          const changed = !profile || requested.newsEnabled !== profile.workflowDraft.newsEnabled || requested.everyHours !== profile.workflowDraft.everyHours
            || requested.importance !== profile.workflowDraft.importance || requested.maxNewsClipsPerDay !== profile.workflowDraft.maxNewsClipsPerDay
            || requested.newsInterests !== profile.workflowDraft.newsInterests || input.mood.trim() !== profile.mood || JSON.stringify(room) !== JSON.stringify(profile.room);
          const run = profile?.workflowDraft.newsLastRun;
          const anchoredRun = run && (run.outcome === 'running' || run.requestId === runningRequestId) ? run : undefined;
          const workflowDraft: WorkflowDraft = {
            ...requested,
            newsLastRun: profile?.workflowDraft.newsLastRun ? { ...profile.workflowDraft.newsLastRun, ...(changed ? { setupChanged: true } : {}) } : undefined,
            newsWorkflowPaused: profile?.workflowDraft.newsWorkflowPaused && !explicitResume ? true : undefined,
            newsWorkflowError: explicitResume ? undefined : profile?.workflowDraft.newsWorkflowError,
            newsAssessmentDate: profile?.workflowDraft.newsAssessmentDate,
            newsAssessmentsToday: profile?.workflowDraft.newsAssessmentsToday,
            newsClipDate: profile?.workflowDraft.newsClipDate,
            newsClipsToday: profile?.workflowDraft.newsClipsToday,
            nextNewsCheckAt: !requested.newsEnabled ? undefined : !changed ? profile?.workflowDraft.nextNewsCheckAt
              : anchoredRun ? new Date(Date.parse(anchoredRun.startedAt) + requested.everyHours * 60 * 60 * 1000).toISOString() : undefined,
          };
          return { workflowDraft, listeningRoom: room, vibe: input.mood.trim() };
        });
      };
      if (input.workflowDraft.newsEnabled) await withProviderKeys(save);
      else await save();
      if (input.workflowDraft.newsEnabled === false) pauseNewsWorkflow(activeProfileId);
    },
    disableNewsPreparation: async (input: string) => {
      profileId(input);
      await updateLocalState(state => {
        const profile = state.roomProfiles.find(value => value.id === input);
        if (!profile) throw new ServiceError('not-found', 'This news profile no longer exists.');
        const workflowDraft = { ...profile.workflowDraft, newsEnabled: false, nextNewsCheckAt: undefined };
        return { roomProfiles: state.roomProfiles.map(value => value.id === input ? { ...value, workflowDraft } : value),
          ...(state.activeRoomProfileId === input ? { workflowDraft } : {}) };
      });
      pauseNewsWorkflow(input);
    },
    saveRoomProfile: async (input: { name: string; room: ListeningRoom; mood: string; workflowDraft: WorkflowDraft }) => {
      validateRoomConfiguration(input);
      const name = profileName(input.name);
      const workflowDraft = { ...normalizeWorkflowDraft(input.workflowDraft), newsEnabled: false, nextNewsCheckAt: undefined, newsWorkflowError: undefined,
        newsAssessmentDate: undefined, newsAssessmentsToday: undefined, newsClipDate: undefined, newsClipsToday: undefined, newsLastRun: undefined, newsWorkflowPaused: undefined };
      await updateLocalState(state => {
        validateRoomReferences(input.room, state);
        if (state.roomProfiles.length >= 100) throw new ServiceError('invalid', 'You can save up to 100 configurations.');
        return { roomProfiles: [...state.roomProfiles, { enabled: false, id: randomUUID(), name, room: { djId: input.room.djId, sourceIds: [...new Set(input.room.sourceIds)] }, mood: input.mood.trim(), workflowDraft }] };
      });
    },
    activateRoomProfile: async (input: string) => {
      profileId(input);
      if (activeNews || (await getPreparedNews()).requests.some(request => request.status === 'running')) throw new ServiceError('invalid', 'Wait for preparation to finish before switching configurations.');
      await updateLocalState(state => {
        const profile = state.roomProfiles.find(value => value.id === input);
        if (!profile) throw new ServiceError('not-found', 'This configuration no longer exists.');
        return { activeRoomProfileId: profile.id, listeningRoom: profile.room, vibe: profile.mood, workflowDraft: profile.workflowDraft };
      });
    },
    renameRoomProfile: async (input: { id: string; name: string }) => {
      if (!isRecord(input)) invalid();
      profileId(input.id);
      const name = profileName(input.name);
      await updateLocalState(state => {
        if (!state.roomProfiles.some(profile => profile.id === input.id)) throw new ServiceError('not-found', 'This configuration no longer exists.');
        return { roomProfiles: state.roomProfiles.map(profile => profile.id === input.id ? { ...profile, name } : profile) };
      });
    },
    deleteRoomProfile: async (input: string) => {
      profileId(input);
      await updateLocalState(state => {
        if (input === state.activeRoomProfileId) throw new ServiceError('invalid', 'Switch to another configuration before deleting this one.');
        if (!state.roomProfiles.some(profile => profile.id === input)) throw new ServiceError('not-found', 'This configuration no longer exists.');
        return { roomProfiles: state.roomProfiles.filter(profile => profile.id !== input) };
      });
      pauseNewsWorkflow(input);
    },
    saveNewsSources: async (input: NewsSource[]) => {
      if (!Array.isArray(input) || input.length > 100 || input.some(source => !isRecord(source) || !text(source.id, 128) || !/^[a-zA-Z0-9-]+$/.test(source.id) || !text(source.name, 256) || !source.name.trim() || !text(source.url, 4096))) invalid();
      if (new Set(input.map(source => source.id)).size !== input.length) invalid();
      let sources: NewsSource[];
      try { sources = input.map(normalizeNewsSource); } catch (error) { throw new ServiceError('invalid', error instanceof Error ? error.message : 'Invalid source.'); }
      if (new Set(sources.map(source => `${source.kind}:${source.url}`)).size !== sources.length) throw new ServiceError('invalid', 'This source is already configured.');
      await updateLocalState(state => {
        const before = new Map(state.sources.map(source => [source.id, JSON.stringify(source)]));
        const after = new Map(sources.map(source => [source.id, JSON.stringify(source)]));
        const changed = new Set([...before.keys(), ...after.keys()].filter(id => before.get(id) !== after.get(id)));
        return { sources, listeningRoom: { ...state.listeningRoom, sourceIds: state.listeningRoom.sourceIds.filter(id => sources.some(source => source.id === id)) },
          ...markChangedProfileRuns(state, profile => profile.room.sourceIds.some(id => changed.has(id))) };
      });
    },
    saveListeningRoom: async (input: ListeningRoom) => {
      if (!isRecord(input) || (input.djId !== null && !text(input.djId, 128)) || !strings(input.sourceIds, 20)) invalid();
      await updateLocalState(state => {
        if ((input.djId !== null && !state.djs.some(dj => dj.id === input.djId)) || input.sourceIds.some(id => !state.sources.some(source => source.id === id))) invalid();
        return { listeningRoom: { djId: input.djId, sourceIds: [...new Set(input.sourceIds)] } };
      });
    },
    setRoomProfileEnabled: async (input: { id: string; enabled: boolean }) => {
      if (!isRecord(input) || typeof input.enabled !== 'boolean') invalid();
      profileId(input.id);
      await updateLocalState(state => {
        if (!state.roomProfiles.some(profile => profile.id === input.id)) throw new ServiceError('not-found', 'This configuration no longer exists.');
        return { roomProfiles: state.roomProfiles.map(profile => profile.id === input.id ? { ...profile, enabled: input.enabled } : profile) };
      });
      if (!input.enabled) pauseNewsWorkflow(input.id);
    },
    saveDJPlayback: async (input: DJPlaybackSettings) => {
      if (!isDJPlaybackSettings(input)) invalid();
      await updateLocalState(state => {
        const profile = state.roomProfiles.find(value => value.id === input.roomId);
        if (input.roomId !== null && !profile) throw new ServiceError('invalid', 'Choose a saved Listening Room.');
        if (input.enabled) {
          if (!profile?.enabled || !profile.room.djId || !profile.room.sourceIds.length || !profile.mood.trim()) throw new ServiceError('invalid', 'Choose an enabled Listening Room with a DJ, sources, and mood.');
          validateRoomReferences(profile.room, state);
        }
        return { djPlayback: normalizeDJPlaybackSettings(input) };
      });
    },
    nextRoomNews: input => nextRoomNews(input),
    releasePreparedNews: input => releasePreparedNews(input),
    markPreparedNewsPlayed: input => markPreparedNewsPlayed(input),
    getPreparedNews: () => getPreparedNews(),
    prepareNewsScript: input => { news.generationSignal(); return prepareNewsScript(news, input); },
    renderNewsTake: input => { news.generationSignal(); return renderNewsTake(news, input); },
    selectNewsTake: input => selectNewsTake(input),
    cancelPreparedNews: input => cancelPreparedNews(input),
    getVoicePreview: input => getVoicePreview(input),
    prepareVoicePreview: input => prepareVoicePreview(news, input),
    getDJVoicePreview: input => getDJVoicePreview(input),
    prepareDJVoicePreview: input => prepareDJVoicePreview(news, input),
    getTwitterStatus: () => twitterKeyStatus(),
    setTwitterKey: async (input: string | null) => {
      if (input !== null && (typeof input !== 'string' || !/^[a-zA-Z0-9%._~+/=-]{8,2048}$/.test(input))) throw new ServiceError('invalid', 'Enter a valid X bearer token.');
      cancelNews();
      return writeTwitterKey(input);
    },
    getAiStatus: () => openAIKeyStatus(),
    getElevenLabsStatus: () => elevenLabsKeyStatus(),
    setElevenLabsKey: async (input: string | null) => {
      if (input !== null && (!text(input, 1024) || !input.trim() || /\s/.test(input))) invalid();
      cancelNews();
      return writeElevenLabsKey(input);
    },
    setOpenAiKey: async (input: string | null) => {
      if (input !== null && (!text(input, 1024) || !input.trim() || /\s/.test(input))) invalid();
      cancelNews();
      return writeOpenAIKey(input);
    },
    prepareNewsBreak: async (input: { requestId: string; djId: string; songId: string }): Promise<NewsBreak> => {
      if (!isRecord(input) || !text(input.requestId, 128) || !/^[a-zA-Z0-9-]+$/.test(input.requestId) || !text(input.djId, 128) || !text(input.songId, 128)) invalid();
      const lifecycle = news.generationSignal();
      if (preparingNewsPreview) throw new ServiceError('invalid', 'Another DJ preview is running. Finish or cancel it first.');
      preparingNewsPreview = true;
      const generation = newsGeneration;
      activeNews = input.requestId;
      const checkActive = () => { if (newsGeneration !== generation || activeNews !== input.requestId) throw new ServiceError('invalid', 'News rendering was cancelled.'); };
      try {
        const dj = (await getLocalState()).djs.find(dj => dj.id === input.djId);
        checkActive();
        if (!dj?.news) throw new ServiceError('invalid', 'Save a DJ with news sources before testing a break.');
        validateDjs([dj]);
        const music = await service.song(input.songId);
        checkActive();
        const progress = (value: NewsProgress) => {
          if (newsGeneration === generation && activeNews === input.requestId && window && !window.isDestroyed()) window.webContents.send('wave:newsProgress', value);
        };
        progress({ requestId: input.requestId, phase: 'feeds', message: 'Fetching your feeds and writing a personalized bulletin…' });
        const excluded = await reviewedArticleUrls();
        checkActive();
        lifecycle.throwIfAborted();
        const result = await news.generate({ ...input, dj, music, settings: dj.news, engine: 'elevenlabs-v4', excludeArticleUrls: excluded,
          onCandidates: candidates => submitReviewedCandidates(input.requestId, candidates), onReleaseCandidates: candidates => releaseReviewedCandidates(input.requestId, candidates), onReview: url => completeReviewedCandidates(input.requestId, url),
          onPreparedScript: async result => {
            const state = await getLocalState();
            const sources = dj.news!.feedUrls.map((url, index) => state.sources.find(source => source.url === url) ?? { id: `preview-${index}`, name: new URL(url).hostname, url, kind: 'rss' as const });
            await savePreparedScript({ ...result, id: input.requestId, createdAt: new Date().toISOString(), provenance: { dj, mood: state.vibe, sources, newsInterests: dj.news!.interests } });
          } });
        const script = result;
        const bytes = result.audio;
        const mime = result.mimeType;
        checkActive();
        const audioUrl = registerSpeechAudio(bytes, mime);
        return { requestId: input.requestId, script: script.script, articles: script.articles, warnings: script.warnings,
          id: input.requestId, audioUrl, engine: result.engine, createdAt: new Date().toISOString() };
      } catch (error) {
        await interruptReviewedCandidates(input.requestId);
        if (newsGeneration === generation && activeNews === input.requestId) { activeNews = null; revokeSpeechAudio(); }
        throw error;
      } finally { preparingNewsPreview = false; }
    },
    cancelNewsBreak: (input: string) => { if (!text(input, 128)) invalid(); cancelNews(input); },
    openSource: async (input: string) => {
      if (!text(input, 4096)) invalid();
      let url: URL;
      try { url = new URL(input); } catch { return invalid(); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) invalid();
      await shell.openExternal(url.href);
    },
  };
  for (const [name, operation] of Object.entries(operations)) {
    ipcMain.handle(`wave:${name}`, async (event, input: unknown) => {
      try {
        if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new ServiceError('forbidden', 'Request denied.');
        if (input !== undefined && JSON.stringify(input).length > 8_000_000) invalid();
        if (input !== undefined && ['songs', 'albums', 'connect', 'createPlaylist', 'renamePlaylist', 'addPlaylistItems', 'removePlaylistEntries', 'movePlaylistEntry', 'preparePlayback'].includes(name) && !isRecord(input)) invalid();
        return { ok: true, value: await operation(input as never) };
      } catch (error) {
        const known = error instanceof ServiceError;
        const mediaError = isRecord(error) && ['unauthorized', 'invalid'].includes(String(error.code));
        const safeError: ApiError = known ? { code: error.code, message: error.message }
          : mediaError ? { code: error.code as ApiError['code'], message: String(error.message) }
          : { code: 'server', message: 'The operation could not be completed. Please try again.' };
        return { ok: false, error: safeError };
      }
    });
  }
}

async function createWindow() {
  window = new BrowserWindow({ width: 1280, height: 800, minWidth: 960, minHeight: 640,
    title: 'onmywave.fm', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 22 },
    backgroundColor: '#faf9f6', show: false,
    webPreferences: { preload: join(directory, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => { cancelNews(); window = null; });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadURL('wave-app://bundle/index.html');
}

app.whenReady().then(async () => {
  const identity = await readDeviceIdentity();
  deviceId = identity.id;
  persistentDeviceIdentity = identity.persistent;
  service = new JellyfinService({ deviceId, persistConnection: async (value, commit) => { await writeConnection(value && persistentDeviceIdentity ? { ...value, id: `${value.serverUrl}|${value.userId}` } : null, publish => commit(() => { const saved = publish(); return persistentDeviceIdentity && saved; })); }, imageUrl: (id, tag) => `wave-media://artwork/${id}${typeof tag === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(tag) ? `?tag=${encodeURIComponent(tag)}` : ''}`, onConnectionChanged: () => { ++playlistSessionEpoch; invalidatePlaylistReceipts(); cancelNews(); revokeMedia(); }, playlistWrite: (session, id, reserve, operation, canStart) => withPlaylistRecovery(id === PLAYLIST_CREATION ? playlistCreationRecoveryKey(session.serverUrl, session.userId) : playlistRecoveryKey(session.serverUrl, session.userId, id), reserve, operation, id === PLAYLIST_CREATION, canStart) });

  const root = resolve(directory, '../renderer');
  protocol.handle('wave-app', async request => {
    const url = new URL(request.url);
    const target = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    const path = relative(root, target);
    if (url.hostname !== 'bundle' || path.startsWith('..') || !extname(target) || !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 404 });
    try {
      const response = await net.fetch(pathToFileURL(target).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' wave-media: data:; media-src 'self' wave-media:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'");
      return new Response(response.body, { headers, status: response.status });
    } catch { return new Response(null, { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const stored = await readConnection();
  if (stored) service.restore({ ...stored, sessionOnly: !persistentDeviceIdentity });
  registerMedia(() => {
    const current = service.exportSession();
    return current ? { ...current, id: service.connection()!.id } : null;
  }, deviceId);
  registerIpc();
  await reconcilePreparedNews();
  await startNewsWorkflow(news, () => !signingOut && !!service.connection());
  await createWindow();
  app.on('activate', () => { if (!window) void createWindow(); });
}).catch(() => { app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { stopNewsWorkflow(); cancelNews(); revokeMedia(); });
