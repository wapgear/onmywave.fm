import { app } from 'electron';
import { mkdir, readFile, writeFile, rename, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { DJ, LocalState, NewsArticle, PreparedNewsLibrary, PreparedNewsRequest, PreparedNewsScript, PreparedNewsTake } from '../shared/types';
import { canonicalArticleUrl, eligibleNewsTakes, matchesNewsRoom } from '../shared/news-pool';
import { getLocalState, readOpenAIKey, readElevenLabsKey, readTwitterKey } from './storage';
import { NewsService, validateNewsSettings } from './news';
import { ServiceError } from './jellyfin';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value);
const invalid = (message = 'Invalid prepared news request.'): never => { throw new ServiceError('invalid', message); };
const root = () => join(app.getPath('userData'), 'prepared-news');
const audioPath = (id: string) => join(root(), `${id}.mp3`);
let library: PreparedNewsLibrary | undefined;
let initialization: Promise<PreparedNewsLibrary> | undefined;
let writes = Promise.resolve();
let active: { id: string; controller: AbortController; publishing?: boolean; promise: Promise<PreparedNewsScript | PreparedNewsTake> } | null = null;

async function load() {
  if (library) return library;
  if (initialization) return initialization;
  initialization = (async () => {
  try {
    const value = JSON.parse(await readFile(join(root(), 'index.json'), 'utf8'));
    if (!Array.isArray(value.scripts) || !Array.isArray(value.takes) || !Array.isArray(value.requests)) throw new Error('Invalid prepared news index');
    const migrated: PreparedNewsLibrary = { ...value, reviewedArticles: Array.isArray(value.reviewedArticles) ? value.reviewedArticles : [] };
    let shouldPersist = !Array.isArray(value.reviewedArticles);
    for (const article of migrated.reviewedArticles) {
      const canonicalUrl = canonicalArticleUrl(article.url);
      if (canonicalUrl && canonicalUrl !== article.canonicalUrl) {
        article.canonicalUrl = canonicalUrl;
        shouldPersist = true;
      }
    }
    const known = [...(migrated.scripts ?? []), ...(migrated.takes ?? [])];
    for (const artifact of known) for (const article of artifact.articles ?? []) {
      const canonicalUrl = canonicalArticleUrl(article.url);
      if (!canonicalUrl) continue;
      const existing = migrated.reviewedArticles.find(item => item.canonicalUrl === canonicalUrl);
      if (existing) {
        if (existing.status === 'submitted') { existing.status = 'reviewed'; existing.outcome = 'selected'; shouldPersist = true; }
        continue;
      }
      migrated.reviewedArticles.push({ ...article, canonicalUrl, requestId: artifact.requestId, reviewedAt: artifact.createdAt, status: 'reviewed', outcome: 'selected' });
      shouldPersist = true;
    }
    migrated.reviewedArticles = migrated.reviewedArticles.map(article => {
      const request = migrated.requests.find(item => item.requestId === article.requestId);
      return article.status === 'submitted' && request?.status === 'interrupted' ? { ...article, status: 'interrupted' as const } : article;
    });
    library = migrated;
    if (shouldPersist) {
      await mkdir(root(), { recursive: true, mode: 0o700 });
      const temp = join(root(), `index.${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(migrated), { mode: 0o600 });
      await rename(temp, join(root(), 'index.json'));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ServiceError('server', 'The prepared news library could not be read. Existing files were preserved.');
    library = { scripts: [], takes: [], requests: [], selectedTakeId: null, reviewedArticles: [] };
  }
  let interrupted = false;
  library!.requests = library!.requests.map(request => request.status === 'running' ? (interrupted = true, { ...request, status: 'interrupted', error: 'The app stopped before this request completed. Start an explicit new attempt.' }) : request);
  library!.reviewedArticles = (library!.reviewedArticles ?? []).map(article => article.status === 'submitted' && !library!.requests.some(request => request.requestId === article.requestId && request.status === 'running') ? (interrupted = true, { ...article, status: 'interrupted' }) : article);
  if (interrupted) {
    await mkdir(root(), { recursive: true, mode: 0o700 });
    const temp = join(root(), `index.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(library), { mode: 0o600 });
    await rename(temp, join(root(), 'index.json'));
  }
  return library!;
  })();
  return initialization;
}

export async function submitReviewedCandidates(requestId: string, candidates: NewsArticle[]) {
  const at = new Date().toISOString();
  await change(current => {
    const reviewedArticles = [...(current.reviewedArticles ?? [])];
    for (const article of candidates) {
      const canonicalUrl = canonicalArticleUrl(article.url);
      if (!canonicalUrl || reviewedArticles.some(item => item.canonicalUrl === canonicalUrl)) continue;
      reviewedArticles.push({ ...article, canonicalUrl, requestId, reviewedAt: at, status: 'submitted' });
    }
    return { ...current, reviewedArticles };
  });
}
export async function completeReviewedCandidates(requestId: string, selectedUrl?: string) {
  const selected = selectedUrl ? canonicalArticleUrl(selectedUrl) : null;
  const at = new Date().toISOString();
  await change(current => ({ ...current, reviewedArticles: (current.reviewedArticles ?? []).map(article => article.requestId === requestId && article.status === 'submitted'
    ? { ...article, status: 'reviewed' as const, reviewedAt: at, outcome: selected && article.canonicalUrl === selected ? 'selected' as const : 'not-selected' as const } : article) }));
}
export async function interruptReviewedCandidates(requestId: string) {
  await change(current => ({ ...current, reviewedArticles: (current.reviewedArticles ?? []).map(article => article.requestId === requestId && article.status === 'submitted' ? { ...article, status: 'interrupted' } : article) }));
}
export async function releaseReviewedCandidates(requestId: string, candidates: NewsArticle[]) {
  const urls = new Set(candidates.map(article => canonicalArticleUrl(article.url)).filter((url): url is string => Boolean(url)));
  await change(current => ({ ...current, reviewedArticles: (current.reviewedArticles ?? []).filter(article => article.requestId !== requestId || article.status !== 'submitted' || !urls.has(article.canonicalUrl)) }));
}
export async function savePreparedScript(script: PreparedNewsScript) {
  await change(current => ({ ...current, scripts: current.scripts.some(value => value.id === script.id) ? current.scripts : [...current.scripts, script] }));
}
export async function reviewedArticleUrls() {
  return (await load()).reviewedArticles.map(article => article.canonicalUrl);
}
async function change(update: (current: PreparedNewsLibrary) => PreparedNewsLibrary) {
  const task = writes.then(async () => {
    const next = update(structuredClone(await load()));
    await mkdir(root(), { recursive: true, mode: 0o700 });
    const temp = join(root(), `index.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
    await rename(temp, join(root(), 'index.json'));
    library = next;
  });
  writes = task.catch(() => {});
  return task;
}
async function recoverCompletedAudio() {
  const current = await load();
  const files = await readdir(root()).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
  const recovered: { take: PreparedNewsTake; request: PreparedNewsRequest }[] = [];
  for (const file of files.filter(name => /^[a-zA-Z0-9-]+\.take\.json$/.test(name))) {
    const id = file.slice(0, -10);
    if (current.takes.some(take => take.id === id)) continue;
    try {
      const value = JSON.parse(await readFile(join(root(), file), 'utf8'));
      if (value.take?.id !== id || !validId(value.take.requestId) || value.request?.requestId !== value.take.requestId || typeof value.request.inputHash !== 'string') continue;
      let audio;
      try { audio = await stat(audioPath(id)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (active && active.id === value.take.requestId && active.publishing) continue;
        audio = await stat(`${audioPath(id)}.tmp`);
        if (!audio.isFile() || audio.size !== value.take.byteLength) continue;
        await rename(`${audioPath(id)}.tmp`, audioPath(id));
      }
      if (!audio.isFile() || audio.size !== value.take.byteLength) continue;
      recovered.push(value);
    } catch { /* Incomplete publications are never exposed as playable takes. */ }
  }
  if (!recovered.length) return;
  await change(state => {
    for (const { take, request } of recovered) {
      if (!state.takes.some(item => item.id === take.id)) state.takes.push(take);
      const old = state.requests.find(item => item.requestId === request.requestId);
      if (old) { old.status = 'complete'; old.artifactId = take.id; delete old.error; }
      else state.requests.push({ ...request, status: 'complete', artifactId: take.id });
    }
    return state;
  });
}
export function isPreparedNewsActive(requestId: string) { return active?.id === requestId; }
export async function preparedAudio(id: string): Promise<Buffer | null> {
  if (!validId(id)) return null;
  const take = (await load()).takes.find(value => value.id === id);
  if (!take || !Number.isSafeInteger(take.byteLength) || take.byteLength <= 0) return null;
  try { const audio = await readFile(audioPath(id)); return audio.length === take.byteLength ? audio : null; } catch { return null; }
}
export async function getPreparedNews(): Promise<PreparedNewsLibrary> {
  await writes;
  await recoverCompletedAudio();
  const snapshot = structuredClone(await load());
  snapshot.takes = await Promise.all(snapshot.takes.map(async take => ({ ...take, available: await stat(audioPath(take.id)).then(info => info.isFile() && Number.isSafeInteger(take.byteLength) && take.byteLength > 0 && info.size === take.byteLength, () => false) })));
  return snapshot;
}
export async function reconcilePreparedNews() {
  await writes;
  await recoverCompletedAudio();
  await change(current => ({ ...current, takes: current.takes.map(take => take.deliveryState?.status === 'claimed'
    ? { ...take, deliveryState: { status: 'ready' as const } } : take) }));
}
export async function nextRoomNews(input: { roomId: string; excludedIds: string[] }): Promise<PreparedNewsTake | null> {
  if (!input || !validId(input.roomId) || !Array.isArray(input.excludedIds) || input.excludedIds.length > 500 || input.excludedIds.some(id => !validId(id))) invalid();
  await writes;
  await recoverCompletedAudio();
  const state = await getLocalState();
  const profile = state.roomProfiles.find(value => value.id === input.roomId);
  if (!profile?.enabled) return null;
  const dj = state.djs.find(value => value.id === profile.room.djId);
  if (!dj?.news) return null;
  const excluded = new Set(input.excludedIds);
  const snapshot = await getPreparedNews();
  const candidates = eligibleNewsTakes(snapshot.takes, state, input.roomId).filter(take => !excluded.has(take.id));
  for (const candidate of candidates) {
    if (!(await preparedAudio(candidate.id))?.length) continue;
    const latestState = await getLocalState();
    const latestNews = await getPreparedNews();
    if (!eligibleNewsTakes(latestNews.takes, latestState, input.roomId).some(take => take.id === candidate.id && !excluded.has(take.id))) continue;
    let claimed = false;
    await change(current => {
      const take = current.takes.find(value => value.id === candidate.id);
      if (!take || (take.deliveryState && take.deliveryState.status !== 'ready')) return current;
      take.deliveryState = { status: 'claimed', claimedAt: new Date().toISOString() };
      claimed = true;
      return current;
    });
    if (claimed) {
      const finalState = await getLocalState();
      const finalProfile = finalState.roomProfiles.find(value => value.id === input.roomId);
      const finalTake = (await getPreparedNews()).takes.find(value => value.id === candidate.id);
      if (finalProfile?.enabled && finalTake?.available && matchesNewsRoom(finalTake, finalState, input.roomId)) return { ...finalTake, available: true, deliveryState: { status: 'claimed', claimedAt: new Date().toISOString() } };
      await releasePreparedNews(candidate.id);
      return null;
    }
  }
  return null;
}
export async function releasePreparedNews(id: string) {
  if (!validId(id)) invalid();
  await change(current => ({ ...current, takes: current.takes.map(take => take.id === id && take.deliveryState?.status === 'claimed'
    ? { ...take, deliveryState: { status: 'ready' as const } } : take) }));
}
export async function markPreparedNewsPlayed(id: string) {
  if (!validId(id)) invalid();
  await change(current => ({ ...current, takes: current.takes.map(take => take.id === id && take.deliveryState?.status === 'claimed'
    ? { ...take, deliveryState: { status: 'played' as const, playedAt: new Date().toISOString() } } : take) }));
}
export async function selectNewsTake(id: string | null) {
  if (id !== null && (!validId(id) || !await preparedAudio(id))) invalid('Choose an available saved take.');
  await change(current => ({ ...current, selectedTakeId: id }));
}
export async function cancelPreparedNews(id: string) {
  if (!validId(id)) invalid();
  if (active?.id === id) active.controller.abort();
}
export function cancelActivePreparedNews() { active?.controller.abort(); }
function validateDj(dj: DJ | undefined): DJ {
  if (!dj?.news) return invalid('Choose a saved DJ with news settings.');
  validateNewsSettings(dj.news!);
  return structuredClone(dj);
}
async function execute<T extends PreparedNewsScript | PreparedNewsTake>(requestId: string, kind: PreparedNewsRequest['kind'], payload: unknown, work: (signal: AbortSignal) => Promise<T>, reconcileOnly = false): Promise<T> {
  if (!validId(requestId)) invalid();
  const inputHash = hash(payload);
  // Reserve the operation synchronously before any await so concurrent IPC calls cannot both claim it.
  if (active) {
    if (active.id !== requestId) invalid('Another preparation is running. Finish or cancel it first.');
    const result = await active.promise;
    const record = (await load()).requests.find(item => item.requestId === requestId);
    if (record?.kind !== kind || record.inputHash !== inputHash) invalid('This request ID was already used for different input.');
    return result as T;
  }
  const controller = new AbortController();
  const operation: { id: string; controller: AbortController; publishing?: boolean; promise: Promise<T> } = { id: requestId, controller, promise: Promise.resolve(null as unknown as T) as Promise<T> };
  active = operation;
  operation.promise = (async () => {
    try {
      await recoverCompletedAudio();
      const old = (await load()).requests.find(item => item.requestId === requestId);
      if (old) {
        if (old.kind !== kind || old.inputHash !== inputHash) invalid('This request ID was already used for different input.');
        if (old.status === 'skipped') throw new ServiceError('no-news', old.error || 'No qualifying news. Music continues.');
        if (old.status === 'partial-coverage') throw new ServiceError('partial-coverage', old.error || 'No story was selected because source coverage was incomplete.');
        if (old.status === 'complete') {
          const saved = kind === 'script' ? (await load()).scripts.find(item => item.id === old.artifactId) : (await load()).takes.find(item => item.id === old.artifactId);
          if (saved) return (kind === 'audio' ? { ...structuredClone(saved), available: Boolean(await preparedAudio(saved.id)) } : structuredClone(saved)) as T;
        }
        throw new ServiceError('uncertain-write', old.error || 'This request did not complete. Start an explicit new attempt to try again.');
      }
      if (reconcileOnly) throw new ServiceError('uncertain-write', 'No completed result is saved for this request. Start a new attempt explicitly if you want to prepare it again.');
      await change(current => ({ ...current, requests: [...current.requests, { requestId, kind, inputHash, status: 'running' }] }));
      controller.signal.throwIfAborted();
      const result = await work(controller.signal);
      // A completed artifact crosses the publication boundary and must survive later cancellation.
      await change(current => ({ ...current,
        scripts: kind === 'script' && !current.scripts.some(script => script.id === result.id) ? [...current.scripts, result as PreparedNewsScript] : current.scripts,
        takes: kind === 'audio' && !current.takes.some(take => take.id === result.id) ? [...current.takes, result as PreparedNewsTake] : current.takes,
        requests: current.requests.map(item => item.requestId === requestId ? { ...item, status: 'complete', artifactId: result.id } : item),
      }));
      return result;
    } catch (error) {
      const message = controller.signal.aborted ? 'Preparation stopped. A provider request may have been charged. Start an explicit new attempt to try again.' : error instanceof Error ? error.message : 'Preparation did not complete.';
      await change(current => ({ ...current,
        requests: current.requests.map(item => item.requestId === requestId && item.status === 'running' ? { ...item, status: error instanceof ServiceError && error.code === 'partial-coverage' ? 'partial-coverage' : error instanceof ServiceError && error.code === 'no-news' ? 'skipped' : 'interrupted', error: message } : item),
        reviewedArticles: (current.reviewedArticles ?? []).map(article => article.requestId === requestId && article.status === 'submitted' ? { ...article, status: 'interrupted' } : article),
      }));
      if (controller.signal.aborted) throw new ServiceError('uncertain-write', message);
      throw error;
    } finally { if (active === operation) active = null; }
  })();
  return operation.promise;
}
export async function prepareNewsScript(news: NewsService, input: { requestId: string; djId: string; sourceIds: string[]; reconcileOnly?: boolean }) {
  if (!input || !validId(input.djId) || !Array.isArray(input.sourceIds) || input.sourceIds.length > 20 || input.sourceIds.some(id => !validId(id))) invalid();
  if (input.reconcileOnly !== undefined && typeof input.reconcileOnly !== 'boolean') invalid();
  return execute(input.requestId, 'script', { djId: input.djId, sourceIds: input.sourceIds }, async signal => {
    const state = await getLocalState();
    const dj = validateDj(state.djs.find(item => item.id === input.djId));
    const sources = [...new Set(input.sourceIds)].map(id => state.sources.find(source => source.id === id) || invalid('A selected source no longer exists.'));
    if (!sources.length) invalid('Choose at least one news source.');
    const cancel = () => news.cancel(input.requestId);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const excluded = await reviewedArticleUrls();
      signal.throwIfAborted();
      const result = await news.prepareScript({ requestId: input.requestId, dj, sources, settings: { ...dj.news!, interests: state.workflowDraft.newsInterests ?? dj.news!.interests, feedUrls: sources.filter(source => !source.kind || source.kind === 'rss').map(source => source.url) }, mood: state.vibe,
        excludeArticleUrls: excluded, onCandidates: candidates => submitReviewedCandidates(input.requestId, candidates), onReleaseCandidates: candidates => releaseReviewedCandidates(input.requestId, candidates), onReview: url => completeReviewedCandidates(input.requestId, url) });
      return { ...result, id: randomUUID(), createdAt: new Date().toISOString(), provenance: { dj, mood: state.vibe, sources, newsInterests: state.workflowDraft.newsInterests ?? dj.news!.interests } };
    } finally { signal.removeEventListener('abort', cancel); }
  }, input.reconcileOnly === true);
}
export async function renderNewsTake(news: NewsService, input: { requestId: string; scriptId: string; script: string; djId: string; newVariation?: boolean; reconcileOnly?: boolean }) {
  if (!input || !validId(input.scriptId) || !validId(input.djId) || typeof input.script !== 'string' || !input.script.trim() || input.script.length > 700 || input.script.trim().split(/\s+/u).length > 55 || (input.newVariation !== undefined && typeof input.newVariation !== 'boolean')) invalid('Use a reviewed script of at most 55 words.');
  if (input.reconcileOnly !== undefined && typeof input.reconcileOnly !== 'boolean') invalid();
  return execute(input.requestId, 'audio', { scriptId: input.scriptId, script: input.script, djId: input.djId, newVariation: input.newVariation === true }, async signal => {
    const saved = (await load()).scripts.find(item => item.id === input.scriptId);
    if (!saved) invalid('Prepare a script first.');
    const dj = validateDj((await getLocalState()).djs.find(item => item.id === input.djId));
    const settings = dj.news!;
    const engine = 'elevenlabs-v4' as const;
    const model = 'eleven_v4';
    const voice = settings.elevenVoiceId || 'JBFqnCBsd6RMkjVDRZzb';
    const delivery = settings.elevenTags || '';
    const signature = hash({ scriptId: saved!.id, script: input.script.trim(), engine, model, voice, delivery, language: dj.language, personality: dj.personality, musicPreferences: dj.musicPreferences, mood: saved!.provenance.mood });
    if (!input.newVariation) {
      const matches = (await load()).takes.filter(take => take.signature === signature && take.provenance.dj.id === saved!.provenance.dj.id)
        .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
      for (const take of matches) if (await preparedAudio(take.id)) return structuredClone(take);
    }
    const result = await news.renderPreparedSpeech({ requestId: input.requestId, dj, settings, mood: saved!.provenance.mood, engine }, { requestId: input.requestId, script: input.script.trim(), articles: saved!.articles, warnings: saved!.warnings }, AbortSignal.any([signal, AbortSignal.timeout(120000)]));
    signal.throwIfAborted();
    const id = randomUUID();
    const take = { id, requestId: input.requestId, scriptId: saved!.id, script: result.script, articles: result.articles, warnings: result.warnings, audioUrl: `wave-media://prepared/${id}`, engine, createdAt: new Date().toISOString(), signature, provenance: saved!.provenance, renderingDJ: dj, available: true, byteLength: result.audio.length, model, voice, delivery } as PreparedNewsTake;
    await publishTake(take, result.audio);
    return take;
  }, input.reconcileOnly === true);
}

async function publishTake(take: PreparedNewsTake, audio: Buffer) {
  if (active?.id === take.requestId) active.publishing = true;
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const temp = `${audioPath(take.id)}.tmp`;
  await writeFile(temp, audio, { mode: 0o600 });
  const sidecar = join(root(), `${take.id}.take.json`);
  const request = (await load()).requests.find(item => item.requestId === take.requestId)!;
  await writeFile(`${sidecar}.tmp`, JSON.stringify({ take, request }), { mode: 0o600 });
  await rename(`${sidecar}.tmp`, sidecar);
  await rename(temp, audioPath(take.id));
}

export async function prepareRoomNews(news: NewsService, input: { requestId: string; roomId: string }, snapshot?: Pick<LocalState, 'roomProfiles' | 'djs' | 'sources'>): Promise<PreparedNewsTake> {
  if (!input || !validId(input.requestId) || !validId(input.roomId)) invalid();
  return execute(input.requestId, 'audio', { automaticRoomId: input.roomId }, async signal => {
    const state = snapshot ?? await getLocalState();
    const profile = state.roomProfiles.find(value => value.id === input.roomId) ?? invalid('This Listening Room no longer exists.');
    if (!profile.enabled) invalid('Choose an enabled Listening Room.');
    if (!profile.workflowDraft.newsEnabled) invalid('Enable the news workflow for this Listening Room before preparing automatic news.');
    if (!profile.mood.trim()) invalid('Add a mood to this Listening Room.');
    const dj = validateDj(state.djs.find(value => value.id === profile.room.djId));
    const sources = [...new Set(profile.room.sourceIds)].map(id => state.sources.find(value => value.id === id) || invalid('A room source no longer exists. Edit this Listening Room.'));
    if (!sources.length) invalid('Choose at least one source in this Listening Room.');
    if (!await readOpenAIKey()) invalid('Add your OpenAI API key in Settings → Provider keys before resuming automatic preparation.');
    if (!await readElevenLabsKey()) invalid('Add your ElevenLabs API key in Settings → Provider keys before resuming automatic preparation.');
    if (sources.some(source => source.kind === 'twitter') && !await readTwitterKey()) invalid('Add an X bearer token for this Listening Room’s sources.');
    const interests = profile.workflowDraft.newsInterests ?? dj.news!.interests;
    const settings = { ...dj.news!, interests, feedUrls: sources.filter(source => !source.kind || source.kind === 'rss').map(source => source.url) };
    const provenance = { dj, mood: profile.mood, sources, newsInterests: interests, roomId: profile.id, roomName: profile.name };
    const cancel = () => news.cancel(input.requestId);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const excluded = await reviewedArticleUrls();
      signal.throwIfAborted();
      const scriptResult = await news.prepareScript({ requestId: input.requestId, dj, sources, mood: profile.mood, settings, importance: profile.workflowDraft.importance, excludeArticleUrls: excluded, freshWithinHours: 24,
        onCandidates: candidates => submitReviewedCandidates(input.requestId, candidates), onReleaseCandidates: candidates => releaseReviewedCandidates(input.requestId, candidates), onReview: url => completeReviewedCandidates(input.requestId, url) });
      signal.throwIfAborted();
      const script: PreparedNewsScript = { requestId: input.requestId, script: scriptResult.script, articles: scriptResult.articles, warnings: scriptResult.warnings, id: randomUUID(), createdAt: new Date().toISOString(), provenance };
      await change(current => ({ ...current, scripts: current.scripts.some(value => value.id === script.id) ? current.scripts : [...current.scripts, script] }));
      signal.throwIfAborted();
      const result = await news.renderPreparedSpeech({ requestId: input.requestId, dj, settings, mood: profile.mood, engine: 'elevenlabs-v4' }, scriptResult, AbortSignal.any([signal, AbortSignal.timeout(120000)]));
      signal.throwIfAborted();
      const id = randomUUID();
      const take: PreparedNewsTake = { requestId: input.requestId, script: result.script, articles: result.articles, warnings: result.warnings, engine: result.engine, id, scriptId: script.id, createdAt: script.createdAt, audioUrl: `wave-media://prepared/${id}`, signature: hash({ requestId: input.requestId, provenance, script: result.script }), provenance, renderingDJ: dj, available: true, byteLength: result.audio.length, model: 'eleven_v4', voice: settings.elevenVoiceId || 'JBFqnCBsd6RMkjVDRZzb', delivery: settings.elevenTags || '', deliveryState: { status: 'ready' } };
      await publishTake(take, result.audio);
      return take;
    } finally { signal.removeEventListener('abort', cancel); }
  });
}
