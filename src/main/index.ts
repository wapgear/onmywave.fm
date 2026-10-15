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
import { JellyfinService, ServiceError } from './jellyfin';
import { getLocalState, openAIKeyStatus, readConnection, readOpenAIKey, updateLocalState, writeConnection, writeOpenAIKey, readElevenLabsKey, elevenLabsKeyStatus, writeElevenLabsKey } from './storage';
import { preparePlayback, registerMedia, registerSpeechAudio, revokeMedia, revokeSpeechAudio } from './media';
import { NewsService, validateNewsSettings } from './news';
import { getPreparedNews, prepareNewsScript, renderNewsTake, selectNewsTake, cancelPreparedNews, isPreparedNewsActive, nextRoomNews, releasePreparedNews, markPreparedNewsPlayed, reconcilePreparedNews, submitReviewedCandidates, completeReviewedCandidates, interruptReviewedCandidates, releaseReviewedCandidates, savePreparedScript, reviewedArticleUrls } from './prepared-news';
import { pauseNewsWorkflow, startNewsWorkflow, stopNewsWorkflow } from './news-workflow';
import { isNewsTransitionSettings, normalizeNewsTransitionSettings } from '../shared/news-transitions';
import { isWorkflowDraft, normalizeWorkflowDraft } from '../shared/workflow';
import type { WorkflowDraft } from '../shared/workflow';
import type { ApiError, DJ, NewsBreak, NewsProgress, PlaybackSnapshot, NewsSource, ListeningRoom, LocalState } from '../shared/types';

app.setName('onmywave.fm Light');
app.setPath('userData', join(app.getPath('appData'), 'onmywave-light'));
protocol.registerSchemesAsPrivileged([
  { scheme: 'wave-app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'wave-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
const directory = dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | null = null;
const news = new NewsService({ getApiKey: readOpenAIKey, getTwitterKey: readTwitterKey, getElevenApiKey: readElevenLabsKey, onProgress: value => {
  if ((activeNews === value.requestId || isPreparedNewsActive(value.requestId)) && window && !window.isDestroyed()) window.webContents.send('wave:newsProgress', value);
} });
let activeNews: string | null = null;
let newsGeneration = 0;
let preparingNewsPreview = false;
function cancelNews(requestId?: string) {
  news.cancel(requestId);
  if (!requestId || requestId === activeNews) { ++newsGeneration; activeNews = null; revokeSpeechAudio(); }
}
const service = new JellyfinService({ deviceId: 'onmywave-light', imageUrl: id => `wave-media://artwork/${id}`, onConnectionChanged: () => { cancelNews(); revokeMedia(); } });
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
    || typeof value.shuffle !== 'boolean' || !['off', 'all', 'one'].includes(String(value.repeat))
    || (value.outputId !== undefined && !text(value.outputId, 512))) invalid();
}

async function persistConnection() {
  const value = service.exportSession();
  const saved = await writeConnection(value ? { ...value, id: service.connection()!.id } : null);
  service.setSessionOnly(!saved);
}

function registerIpc() {
  const operations: Record<string, (input: never) => unknown> = {
    getConnection: () => service.connection(),
    connect: async (input: { serverUrl: string; username: string; password: string }) => {
      if (!isRecord(input) || !text(input.serverUrl, 2048) || !text(input.username, 256) || !text(input.password, 4096)) invalid();
      await service.connect(input);
      await persistConnection();
      return service.connection();
    },
    disconnect: async () => { await service.disconnect(); await persistConnection(); },
    libraries: () => service.libraries(),
    libraryFilters: () => service.libraryFilters(),
    selectLibraries: async input => { await service.selectLibraries(input); await persistConnection(); return service.connection(); },
    songs: input => service.songs(input), albums: input => service.albums(input),
    albumTracks: input => service.albumTracks(input), song: input => service.song(input),
    playlists: () => service.playlists(), playlist: input => service.playlist(input),
    createPlaylist: input => service.createPlaylist(input), renamePlaylist: input => service.renamePlaylist(input),
    addPlaylistItems: input => service.addPlaylistItems(input), removePlaylistEntries: input => service.removePlaylistEntries(input),
    movePlaylistEntry: input => service.movePlaylistEntry(input),
    preparePlayback: (input: { id: string; transcode?: boolean; offsetSeconds?: number }) => {
      if (!isRecord(input) || typeof input.id !== 'string' || (input.transcode !== undefined && typeof input.transcode !== 'boolean')) invalid();
      const current = service.exportSession();
      return preparePlayback(current ? { ...current, id: service.connection()!.id } : null, input);
    },
    getLocalState: () => getLocalState(),
    saveDjs: async input => { validateDjs(input); await updateLocalState({ djs: input }); },
    searchDJVoices,
    saveVibe: async input => { if (!text(input, 20_000)) invalid(); await updateLocalState({ vibe: input }); },
    saveNewsTransitions: async input => {
      if (!isNewsTransitionSettings(input)) invalid();
      const settings = normalizeNewsTransitionSettings(input);
      await updateLocalState({ newsTransitions: settings });
      return settings;
    },
    savePlayback: async input => { validatePlayback(input); await updateLocalState({ playback: input }); },
    saveWorkflowDraft: async (input: { workflowDraft: WorkflowDraft; room: ListeningRoom; mood: string }) => {
      validateRoomConfiguration(input);
      const latest = await getLocalState();
      const activeProfileId = latest.activeRoomProfileId;
      await updateLocalState(state => {
        validateRoomReferences(input.room, state);
        const profile = state.roomProfiles.find(value => value.id === activeProfileId);
        const requested = normalizeWorkflowDraft(input.workflowDraft);
        const room = { djId: input.room.djId, sourceIds: [...new Set(input.room.sourceIds)] };
        const changed = !profile || requested.newsEnabled !== profile.workflowDraft.newsEnabled || requested.everyHours !== profile.workflowDraft.everyHours
          || requested.importance !== profile.workflowDraft.importance || requested.maxNewsClipsPerDay !== profile.workflowDraft.maxNewsClipsPerDay
          || requested.newsInterests !== profile.workflowDraft.newsInterests || input.mood.trim() !== profile.mood || JSON.stringify(room) !== JSON.stringify(profile.room);
        const workflowDraft: WorkflowDraft = {
          ...requested,
          ...(profile?.workflowDraft.newsAssessmentDate ? { newsAssessmentDate: profile.workflowDraft.newsAssessmentDate } : {}),
          ...(profile?.workflowDraft.newsAssessmentsToday !== undefined ? { newsAssessmentsToday: profile.workflowDraft.newsAssessmentsToday } : {}),
          ...(profile?.workflowDraft.newsClipDate ? { newsClipDate: profile.workflowDraft.newsClipDate } : {}),
          ...(profile?.workflowDraft.newsClipsToday !== undefined ? { newsClipsToday: profile.workflowDraft.newsClipsToday } : {}),
          ...(!changed && profile?.workflowDraft.nextNewsCheckAt ? { nextNewsCheckAt: profile.workflowDraft.nextNewsCheckAt } : {}),
        };
        return { workflowDraft, listeningRoom: room, vibe: input.mood.trim() };
      });
      if (input.workflowDraft.newsEnabled === false) pauseNewsWorkflow(activeProfileId);
    },
    saveRoomProfile: async (input: { name: string; room: ListeningRoom; mood: string; workflowDraft: WorkflowDraft }) => {
      validateRoomConfiguration(input);
      const name = profileName(input.name);
      const workflowDraft = { ...normalizeWorkflowDraft(input.workflowDraft), newsEnabled: false, nextNewsCheckAt: undefined, newsWorkflowError: undefined,
        newsAssessmentDate: undefined, newsAssessmentsToday: undefined, newsClipDate: undefined, newsClipsToday: undefined };
      await updateLocalState(state => {
        validateRoomReferences(input.room, state);
        if (state.roomProfiles.length >= 100) throw new ServiceError('invalid', 'You can save up to 100 configurations.');
        return { roomProfiles: [...state.roomProfiles, { enabled: true, id: randomUUID(), name, room: { djId: input.room.djId, sourceIds: [...new Set(input.room.sourceIds)] }, mood: input.mood.trim(), workflowDraft }] };
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
      await updateLocalState(state => ({ sources, listeningRoom: { ...state.listeningRoom, sourceIds: state.listeningRoom.sourceIds.filter(id => sources.some(source => source.id === id)) } }));
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
    prepareNewsScript: input => prepareNewsScript(news, input),
    renderNewsTake: input => renderNewsTake(news, input),
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
        const result = await news.generate({ ...input, dj, music, settings: dj.news, engine: 'elevenlabs-v4', excludeArticleUrls: await reviewedArticleUrls(),
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
  if (stored) service.restore({ ...stored, sessionOnly: false });
  registerMedia(() => {
    const current = service.exportSession();
    return current ? { ...current, id: service.connection()!.id } : null;
  });
  registerIpc();
  await reconcilePreparedNews();
  await startNewsWorkflow(news);
  await createWindow();
  app.on('activate', () => { if (!window) void createWindow(); });
}).catch(() => { app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { stopNewsWorkflow(); cancelNews(); revokeMedia(); });
