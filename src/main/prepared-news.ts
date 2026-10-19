import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { app } from 'electron';

import { canonicalArticleUrl, eligibleNewsTakes, matchesNewsRoom } from '../shared/news-pool';
import type {
  DJ,
  LocalState,
  NewsArticle,
  PreparedNewsOrigin,
  PreparedNewsLibrary,
  PreparedNewsRequest,
  PreparedNewsScript,
  PreparedNewsTake,
} from '../shared/types';
import { ServiceError } from './jellyfin';
import { NewsService, validateNewsSettings } from './news';
import { getLocalState, readOpenAIKey, readElevenLabsKey, readTwitterKey } from './storage';
import { StorageError } from './storage-error';


const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value);

const invalid = (message = 'Invalid prepared news request.'): never => {
  throw new ServiceError('invalid', message);
};

function validOrigin(value: unknown): value is PreparedNewsOrigin {
  if (!value || typeof value !== 'object') return false;
  const origin = value as PreparedNewsOrigin;
  return (
    (origin.kind === 'manual' || origin.kind === 'automatic') &&
    typeof origin.startedAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(origin.startedAt) &&
    Number.isFinite(Date.parse(origin.startedAt)) &&
    new Date(origin.startedAt).toISOString() === origin.startedAt &&
    (origin.profileId === undefined || validId(origin.profileId)) &&
    (origin.profileName === undefined ||
      (typeof origin.profileName === 'string' && !!origin.profileName.trim() && origin.profileName.length <= 80))
  );
}

const root = () => join(app.getPath('userData'), 'prepared-news');

const audioPath = (id: string) => join(root(), `${id}.mp3`);

let library: PreparedNewsLibrary | undefined;

let initialization: Promise<PreparedNewsLibrary> | undefined;

let writes = Promise.resolve();

let active: {
  id: string;
  controller: AbortController;
  publishing?: boolean;
  promise: Promise<PreparedNewsScript | PreparedNewsTake>;
} | null = null;

async function load() {
  if (library) return library;
  if (initialization) return initialization;
  initialization = (async () => {
    let indexRead = false;
    let restored: PreparedNewsLibrary;
    try {
      const content = await readFile(join(root(), 'index.json'), 'utf8');
      indexRead = true;
      const value = JSON.parse(content);
      if (!Array.isArray(value.scripts) || !Array.isArray(value.takes) || !Array.isArray(value.requests))
        throw new Error('Invalid prepared news index');
      const migrated: PreparedNewsLibrary = {
        ...value,
        preparationErrorVersion: 1,
        reviewedArticles: Array.isArray(value.reviewedArticles) ? value.reviewedArticles : [],
      };
      let shouldPersist = !Array.isArray(value.reviewedArticles) || value.preparationErrorVersion !== 1;
      for (const request of migrated.requests) {
        if (
          value.preparationErrorVersion !== 1 &&
          request.error &&
          !['skipped', 'partial-coverage'].includes(request.status)
        ) {
          request.error = 'Earlier preparation details are unavailable. Review the setup before retrying.';
        }
        if (request.origin !== undefined && !validOrigin(request.origin)) {
          delete request.origin;
          shouldPersist = true;
        }
      }
      for (const article of migrated.reviewedArticles) {
        const canonicalUrl = canonicalArticleUrl(article.url);
        if (canonicalUrl && canonicalUrl !== article.canonicalUrl) {
          article.canonicalUrl = canonicalUrl;
          shouldPersist = true;
        }
      }
      const known = [...(migrated.scripts ?? []), ...(migrated.takes ?? [])];
      for (const artifact of known)
        for (const article of artifact.articles ?? []) {
          const canonicalUrl = canonicalArticleUrl(article.url);
          if (!canonicalUrl) continue;
          const existing = migrated.reviewedArticles.find((item) => item.canonicalUrl === canonicalUrl);
          if (existing) {
            if (existing.status === 'submitted') {
              existing.status = 'reviewed';
              existing.outcome = 'selected';
              shouldPersist = true;
            }
            continue;
          }
          migrated.reviewedArticles.push({
            ...article,
            canonicalUrl,
            requestId: artifact.requestId,
            reviewedAt: artifact.createdAt,
            status: 'reviewed',
            outcome: 'selected',
          });
          shouldPersist = true;
        }
      migrated.reviewedArticles = migrated.reviewedArticles.map((article) => {
        const request = migrated.requests.find((item) => item.requestId === article.requestId);
        return article.status === 'submitted' && request?.status === 'interrupted'
          ? { ...article, status: 'interrupted' as const }
          : article;
      });
      if (shouldPersist) {
        await mkdir(root(), { recursive: true, mode: 0o700 });
        const temp = join(root(), `index.${randomUUID()}.tmp`);
        await writeFile(temp, JSON.stringify(migrated), { mode: 0o600 });
        await rename(temp, join(root(), 'index.json'));
      }
      restored = migrated;
    } catch (error) {
      if (indexRead || (error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new StorageError('The prepared news library could not be read. Existing files were preserved.');
      restored = {
        preparationErrorVersion: 1,
        scripts: [],
        takes: [],
        requests: [],
        selectedTakeId: null,
        reviewedArticles: [],
      };
    }
    let interrupted = false;
    restored.requests = restored.requests.map((request) =>
      request.status === 'running'
        ? ((interrupted = true),
          {
            ...request,
            status: 'interrupted',
            error:
              'The app stopped before this request completed. Review News settings before resuming automatic preparation.',
          })
        : request,
    );
    restored.reviewedArticles = (restored.reviewedArticles ?? []).map((article) =>
      article.status === 'submitted' &&
      !restored.requests.some((request) => request.requestId === article.requestId && request.status === 'running')
        ? ((interrupted = true), { ...article, status: 'interrupted' })
        : article,
    );
    if (interrupted) {
      await mkdir(root(), { recursive: true, mode: 0o700 });
      const temp = join(root(), `index.${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(restored), { mode: 0o600 });
      await rename(temp, join(root(), 'index.json'));
    }
    library = restored;
    return library;
  })().catch((error) => {
    initialization = undefined;
    throw error instanceof StorageError ? error : new StorageError();
  });
  return initialization;
}

export async function submitReviewedCandidates(requestId: string, candidates: NewsArticle[]) {
  const at = new Date().toISOString();
  await change((current) => {
    const reviewedArticles = [...(current.reviewedArticles ?? [])];
    for (const article of candidates) {
      const canonicalUrl = canonicalArticleUrl(article.url);
      if (!canonicalUrl || reviewedArticles.some((item) => item.canonicalUrl === canonicalUrl)) continue;
      reviewedArticles.push({ ...article, canonicalUrl, requestId, reviewedAt: at, status: 'submitted' });
    }
    return { ...current, reviewedArticles };
  });
}

export async function completeReviewedCandidates(requestId: string, selectedUrl?: string) {
  const selected = selectedUrl ? canonicalArticleUrl(selectedUrl) : null;
  const at = new Date().toISOString();
  await change((current) => ({
    ...current,
    reviewedArticles: (current.reviewedArticles ?? []).map((article) =>
      article.requestId === requestId && article.status === 'submitted'
        ? {
            ...article,
            status: 'reviewed' as const,
            reviewedAt: at,
            outcome: selected && article.canonicalUrl === selected ? ('selected' as const) : ('not-selected' as const),
          }
        : article,
    ),
  }));
}

export async function interruptReviewedCandidates(requestId: string) {
  await change((current) => ({
    ...current,
    reviewedArticles: (current.reviewedArticles ?? []).map((article) =>
      article.requestId === requestId && article.status === 'submitted'
        ? { ...article, status: 'interrupted' }
        : article,
    ),
  }));
}

export async function releaseReviewedCandidates(requestId: string, candidates: NewsArticle[]) {
  const urls = new Set(
    candidates.map((article) => canonicalArticleUrl(article.url)).filter((url): url is string => Boolean(url)),
  );
  await change((current) => ({
    ...current,
    reviewedArticles: (current.reviewedArticles ?? []).filter(
      (article) => article.requestId !== requestId || article.status !== 'submitted' || !urls.has(article.canonicalUrl),
    ),
  }));
}

export async function reviewedArticleUrls() {
  return (await load()).reviewedArticles.map((article) => article.canonicalUrl);
}

async function change(update: (current: PreparedNewsLibrary) => PreparedNewsLibrary) {
  const task = writes.then(async () => {
    const next = update(structuredClone(await load()));
    try {
      await mkdir(root(), { recursive: true, mode: 0o700 });
      const temp = join(root(), `index.${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await rename(temp, join(root(), 'index.json'));
    } catch {
      throw new StorageError();
    }
    library = next;
  });
  writes = task.catch(() => {});
  return task;
}

async function recoverCompletedAudio() {
  const current = await load();
  const files = await readdir(root()).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw new StorageError();
  });
  const recovered: { take: PreparedNewsTake; request: PreparedNewsRequest }[] = [];
  for (const file of files.filter((name) => /^[a-zA-Z0-9-]+\.take\.json$/.test(name))) {
    const id = file.slice(0, -10);
    if (current.takes.some((take) => take.id === id)) continue;
    try {
      const value = JSON.parse(await readFile(join(root(), file), 'utf8'));
      if (
        value.take?.id !== id ||
        !validId(value.take.requestId) ||
        value.request?.requestId !== value.take.requestId ||
        typeof value.request.inputHash !== 'string'
      )
        continue;
      let audio;
      try {
        audio = await stat(audioPath(id));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new StorageError();
        if (active && active.id === value.take.requestId && active.publishing) continue;
        audio = await stat(`${audioPath(id)}.tmp`);
        if (!audio.isFile() || audio.size !== value.take.byteLength) continue;
        await rename(`${audioPath(id)}.tmp`, audioPath(id));
      }
      if (!audio.isFile() || audio.size !== value.take.byteLength) continue;
      if (!validOrigin(value.request.origin)) delete value.request.origin;
      recovered.push(value);
    } catch (error) {
      if (error instanceof StorageError) throw error;
      if ((error as NodeJS.ErrnoException).code && (error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new StorageError();
      // Incomplete publications are never exposed as playable takes.
    }
  }
  if (!recovered.length) return;
  await change((state) => {
    for (const { take, request } of recovered) {
      if (!state.takes.some((item) => item.id === take.id)) state.takes.push(take);
      const old = state.requests.find((item) => item.requestId === request.requestId);
      if (old) {
        old.status = 'complete';
        old.artifactId = take.id;
        delete old.error;
      } else state.requests.push({ ...request, status: 'complete', artifactId: take.id });
    }
    return state;
  });
}

export function isPreparedNewsActive(requestId: string) {
  return active?.id === requestId;
}

export async function preparedAudio(id: string): Promise<Buffer | null> {
  if (!validId(id)) return null;
  const take = (await load()).takes.find((value) => value.id === id);
  if (!take || !Number.isSafeInteger(take.byteLength) || take.byteLength <= 0) return null;
  try {
    const audio = await readFile(audioPath(id));
    return audio.length === take.byteLength ? audio : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new StorageError();
  }
}

export async function getPreparedNews(): Promise<PreparedNewsLibrary> {
  await writes;
  await recoverCompletedAudio();
  const snapshot = structuredClone(await load());
  snapshot.takes = await Promise.all(
    snapshot.takes.map(async (take) => ({
      ...take,
      available: await stat(audioPath(take.id)).then(
        (info) =>
          info.isFile() &&
          Number.isSafeInteger(take.byteLength) &&
          take.byteLength > 0 &&
          info.size === take.byteLength,
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return false;
          throw new StorageError();
        },
      ),
    })),
  );
  return snapshot;
}

export async function reconcilePreparedNews() {
  await writes;
  await recoverCompletedAudio();
  await change((current) => ({
    ...current,
    takes: current.takes.map((take) => {
      const delivery = take.deliveryState;
      if (delivery?.status !== 'claimed') return take;
      // A token-bearing claim cannot have reached speech.play without first being
      // durably changed to started. Legacy claims predate that gate and are ambiguous.
      if (validId(delivery.claimId)) return { ...take, deliveryState: { status: 'ready' as const } };
      return {
        ...take,
        deliveryState: { status: 'started' as const, startedAt: delivery.claimedAt || new Date().toISOString() },
      };
    }),
  }));
}

function canonicalArticleUrls(take: PreparedNewsTake): Set<string> {
  return new Set(
    take.articles.map((article) => canonicalArticleUrl(article.url)).filter((url): url is string => Boolean(url)),
  );
}

function overlapsClaimedArticles(take: PreparedNewsTake, takes: PreparedNewsTake[]): boolean {
  const urls = canonicalArticleUrls(take);
  if (!urls.size) return false;
  return takes.some(
    (other) =>
      other.id !== take.id &&
      other.deliveryState?.status === 'claimed' &&
      [...canonicalArticleUrls(other)].some((url) => urls.has(url)),
  );
}

function overlapsReservedArticles(take: PreparedNewsTake, takes: PreparedNewsTake[]): boolean {
  const urls = canonicalArticleUrls(take);
  if (!urls.size) return false;
  return takes.some(
    (other) =>
      other.id !== take.id &&
      ['claimed', 'started', 'played'].includes(other.deliveryState?.status ?? '') &&
      [...canonicalArticleUrls(other)].some((url) => urls.has(url)),
  );
}

async function releaseClaimAfterFailure(id: string, claimId: string, failure: unknown) {
  try {
    await releasePreparedNews({ id, claimId });
  } catch {
    const message = `${failure instanceof Error ? failure.message : 'The saved take could not be confirmed.'} The playback reservation could not be released. Restart the app before retrying.`;
    const wrapped =
      failure instanceof StorageError
        ? new StorageError(message)
        : failure instanceof ServiceError
          ? new ServiceError(failure.code, message)
          : new ServiceError('server', message);
    (wrapped as Error & { cause?: unknown }).cause = failure;
    throw wrapped;
  }
}

export async function nextRoomNews(
  input: { roomId: string; excludedIds: string[] },
  canClaim = () => true,
): Promise<PreparedNewsTake | null> {
  if (
    !input ||
    !validId(input.roomId) ||
    !Array.isArray(input.excludedIds) ||
    input.excludedIds.length > 500 ||
    input.excludedIds.some((id) => !validId(id))
  )
    invalid();
  await writes;
  await recoverCompletedAudio();
  const state = await getLocalState();
  const profile = state.roomProfiles.find((value) => value.id === input.roomId);
  if (!profile?.enabled) return null;
  const dj = state.djs.find((value) => value.id === profile.room.djId);
  if (!dj?.news) return null;
  const excluded = new Set(input.excludedIds);
  const snapshot = await getPreparedNews();
  const candidates = eligibleNewsTakes(snapshot.takes, state, input.roomId).filter((take) => !excluded.has(take.id));
  for (const candidate of candidates) {
    if (!canClaim()) return null;
    if (!(await preparedAudio(candidate.id))?.length) continue;
    const latestState = await getLocalState();
    const latestNews = await getPreparedNews();
    if (
      !eligibleNewsTakes(latestNews.takes, latestState, input.roomId).some(
        (take) => take.id === candidate.id && !excluded.has(take.id),
      )
    )
      continue;
    let claimed = false;
    let claimId: string | undefined;
    await change((current) => {
      const take = current.takes.find((value) => value.id === candidate.id);
      if (
        !canClaim() ||
        !take ||
        (take.deliveryState && take.deliveryState.status !== 'ready') ||
        overlapsReservedArticles(take, current.takes)
      )
        return current;
      claimId = randomUUID();
      take.deliveryState = { status: 'claimed', claimId, claimedAt: new Date().toISOString() };
      claimed = true;
      return current;
    });
    if (claimed) {
      try {
        const finalState = await getLocalState();
        const finalProfile = finalState.roomProfiles.find((value) => value.id === input.roomId);
        const finalTake = (await getPreparedNews()).takes.find((value) => value.id === candidate.id);
        if (
          canClaim() &&
          finalProfile?.enabled &&
          finalTake?.available &&
          matchesNewsRoom(finalTake, finalState, input.roomId) &&
          finalTake.deliveryState?.status === 'claimed' &&
          finalTake.deliveryState.claimId === claimId
        )
          return finalTake;
      } catch (error) {
        await releaseClaimAfterFailure(candidate.id, claimId!, error);
        throw error;
      }
      await releaseClaimAfterFailure(
        candidate.id,
        claimId!,
        new ServiceError('invalid', 'The saved take no longer matches this playback profile.'),
      );
      return null;
    }
  }
  return null;
}

export async function claimPreparedNews(input: { id: string; claimId?: string }): Promise<PreparedNewsTake> {
  if (!input || !validId(input.id) || (input.claimId !== undefined && !validId(input.claimId))) invalid();
  await writes;
  await recoverCompletedAudio();
  const readable = await getPreparedNews();
  const available = readable.takes.some((take) => take.id === input.id && take.available);
  if (!available) invalid('Choose an available saved take.');
  let result: PreparedNewsTake | undefined;
  await change((current) => {
    const take = current.takes.find((value) => value.id === input.id);
    if (!take) throw new ServiceError('not-found', 'This saved take no longer exists.');
    const delivery = take.deliveryState;
    if (delivery?.status === 'claimed') {
      if (!input.claimId || delivery.claimId !== input.claimId || !validId(delivery.claimId))
        invalid('This saved take is reserved by another playback.');
      result = { ...structuredClone(take), available: true };
      return current;
    }
    if (delivery?.status === 'started' || delivery?.status === 'played') {
      if (input.claimId) invalid('This take has already started playback.');
      // An explicit manual replay does not reopen automatic eligibility.
      result = { ...structuredClone(take), available: true };
      return current;
    }
    if (delivery !== undefined && delivery.status !== 'ready') invalid('This saved take cannot be scheduled.');
    if (overlapsClaimedArticles(take, current.takes)) invalid('A matching story is already reserved for playback.');
    const claimId = randomUUID();
    const claimedAt = new Date().toISOString();
    take.deliveryState = { status: 'claimed', claimId, claimedAt };
    result = { ...structuredClone(take), available: true };
    return current;
  });
  if (!result) invalid('This saved take could not be reserved.');
  return result!;
}

export async function startPreparedNews(input: { id: string; claimId: string }) {
  if (!input || !validId(input.id) || !validId(input.claimId)) invalid();
  let matched = false;
  await change((current) => ({
    ...current,
    takes: current.takes.map((take) => {
      if (take.id !== input.id) return take;
      const delivery = take.deliveryState;
      if (delivery?.status === 'started' && delivery.claimId === input.claimId) {
        matched = true;
        return take;
      }
      if (delivery?.status !== 'claimed' || delivery.claimId !== input.claimId) return take;
      matched = true;
      return {
        ...take,
        deliveryState: {
          status: 'started' as const,
          claimId: input.claimId,
          claimedAt: delivery.claimedAt,
          startedAt: new Date().toISOString(),
        },
      };
    }),
  }));
  if (!matched) invalid('This saved take reservation is no longer current.');
}

export async function releasePreparedNews(input: { id: string; claimId: string; neverPlayInvoked?: boolean }) {
  if (
    !input ||
    !validId(input.id) ||
    !validId(input.claimId) ||
    (input.neverPlayInvoked !== undefined && typeof input.neverPlayInvoked !== 'boolean')
  )
    invalid();
  await change((current) => ({
    ...current,
    takes: current.takes.map((take) => {
      if (take.id !== input.id || take.deliveryState?.claimId !== input.claimId) return take;
      if (
        take.deliveryState.status === 'claimed' ||
        (take.deliveryState.status === 'started' && input.neverPlayInvoked === true)
      ) {
        return { ...take, deliveryState: { status: 'ready' as const } };
      }
      return take;
    }),
  }));
}

export async function markPreparedNewsPlayed(input: { id: string; claimId: string }) {
  if (!input || !validId(input.id) || !validId(input.claimId)) invalid();
  await change((current) => ({
    ...current,
    takes: current.takes.map((take) => {
      if (
        take.id !== input.id ||
        take.deliveryState?.claimId !== input.claimId ||
        take.deliveryState.status !== 'started'
      )
        return take;
      return {
        ...take,
        deliveryState: { ...take.deliveryState, status: 'played' as const, playedAt: new Date().toISOString() },
      };
    }),
  }));
}

export async function cancelPreparedNews(id: string) {
  if (!validId(id)) invalid();
  if (active?.id === id) active.controller.abort();
}

export function cancelActivePreparedNews() {
  active?.controller.abort();
}

function validateDj(dj: DJ | undefined): DJ {
  if (!dj?.news) return invalid('Choose a saved DJ with news settings.');
  validateNewsSettings(dj.news!);
  return structuredClone(dj);
}

async function execute<T extends PreparedNewsTake>(
  requestId: string,
  kind: 'audio',
  payload: unknown,
  work: (signal: AbortSignal) => Promise<T>,
  context: Omit<PreparedNewsOrigin, 'startedAt'> & { kind: 'automatic' },
): Promise<T> {
  if (!validId(requestId)) invalid();
  const inputHash = hash(payload);
  // Reserve the operation synchronously before any await so concurrent IPC calls cannot both claim it.
  if (active) {
    if (active.id !== requestId) invalid('Another preparation is running. Finish or cancel it first.');
    const result = await active.promise;
    const record = (await load()).requests.find((item) => item.requestId === requestId);
    if (record?.kind !== kind || record.inputHash !== inputHash)
      invalid('This request ID was already used for different input.');
    return result as T;
  }
  const controller = new AbortController();
  const operation: { id: string; controller: AbortController; publishing?: boolean; promise: Promise<T> } = {
    id: requestId,
    controller,
    promise: Promise.resolve(null as unknown as T) as Promise<T>,
  };
  active = operation;
  const startedAt = new Date().toISOString();
  operation.promise = (async () => {
    try {
      await recoverCompletedAudio();
      const old = (await load()).requests.find((item) => item.requestId === requestId);
      if (old) {
        if (old.kind !== kind || old.inputHash !== inputHash)
          invalid('This request ID was already used for different input.');
        if (old.status === 'skipped')
          throw new ServiceError('no-news', old.error || 'No qualifying news. Music continues.');
        if (old.status === 'partial-coverage')
          throw new ServiceError(
            'partial-coverage',
            old.error || 'No story was selected because source coverage was incomplete.',
          );
        if (old.status === 'complete') {
          const saved = (await load()).takes.find((item) => item.id === old.artifactId);
          if (saved) return { ...structuredClone(saved), available: Boolean(await preparedAudio(saved.id)) } as T;
        }
        throw new ServiceError(
          'uncertain-write',
          old.error || 'This request did not complete. Review News settings before resuming automatic preparation.',
        );
      }
      const profileName =
        context.profileName ??
        (context.profileId
          ? (await getLocalState()).roomProfiles.find((profile) => profile.id === context.profileId)?.name
          : undefined);
      const origin: PreparedNewsOrigin = { ...context, startedAt, profileName };
      await change((current) => ({
        ...current,
        requests: [...current.requests, { requestId, kind, inputHash, status: 'running', origin }],
      }));
      controller.signal.throwIfAborted();
      const result = await work(controller.signal);
      // A completed artifact crosses the publication boundary and must survive later cancellation.
      await change((current) => ({
        ...current,
        takes: !current.takes.some((take) => take.id === result.id) ? [...current.takes, result] : current.takes,
        requests: current.requests.map((item) =>
          item.requestId === requestId ? { ...item, status: 'complete', artifactId: result.id } : item,
        ),
      }));
      return result;
    } catch (error) {
      const failure =
        error instanceof ServiceError
          ? error
          : new ServiceError('server', 'Could not prepare the news break. Check the connection and try again.');
      const message = controller.signal.aborted
        ? 'Preparation stopped. A provider request may have been charged. Review News settings before resuming automatic preparation.'
        : failure.message;
      await change((current) => ({
        ...current,
        requests: current.requests.map((item) =>
          item.requestId === requestId && item.status === 'running'
            ? {
                ...item,
                status:
                  error instanceof ServiceError && error.code === 'partial-coverage'
                    ? 'partial-coverage'
                    : error instanceof ServiceError && error.code === 'no-news'
                      ? 'skipped'
                      : 'interrupted',
                error: message,
              }
            : item,
        ),
        reviewedArticles: (current.reviewedArticles ?? []).map((article) =>
          article.requestId === requestId && article.status === 'submitted'
            ? { ...article, status: 'interrupted' }
            : article,
        ),
      }));
      if (controller.signal.aborted) throw new ServiceError('uncertain-write', message);
      throw failure;
    } finally {
      if (active === operation) active = null;
    }
  })();
  return operation.promise;
}

async function publishTake(take: PreparedNewsTake, audio: Buffer) {
  if (active?.id === take.requestId) active.publishing = true;
  try {
    await mkdir(root(), { recursive: true, mode: 0o700 });
    const temp = `${audioPath(take.id)}.tmp`;
    await writeFile(temp, audio, { mode: 0o600 });
    const recorded = { ...take, recordedAt: new Date().toISOString() };
    const sidecar = join(root(), `${take.id}.take.json`);
    const request = (await load()).requests.find((item) => item.requestId === take.requestId)!;
    await writeFile(`${sidecar}.tmp`, JSON.stringify({ take: recorded, request }), { mode: 0o600 });
    await rename(`${sidecar}.tmp`, sidecar);
    await rename(temp, audioPath(take.id));
    return recorded;
  } catch {
    throw new StorageError();
  }
}

export async function prepareRoomNews(
  news: NewsService,
  input: { requestId: string; roomId: string },
  snapshot?: Pick<LocalState, 'roomProfiles' | 'djs' | 'sources'>,
): Promise<PreparedNewsTake> {
  if (!input || !validId(input.requestId) || !validId(input.roomId)) invalid();
  return execute(
    input.requestId,
    'audio',
    { automaticRoomId: input.roomId },
    async (signal) => {
      const state = snapshot ?? (await getLocalState());
      const profile =
        state.roomProfiles.find((value) => value.id === input.roomId) ??
        invalid('This Listening Room no longer exists.');
      if (!profile.enabled) invalid('Choose an enabled Listening Room.');
      if (!profile.workflowDraft.newsEnabled)
        invalid('Enable the news workflow for this Listening Room before preparing automatic news.');
      if (!profile.mood.trim()) invalid('Add a mood to this Listening Room.');
      const dj = validateDj(state.djs.find((value) => value.id === profile.room.djId));
      const sources = [...new Set(profile.room.sourceIds)].map(
        (id) =>
          state.sources.find((value) => value.id === id) ||
          invalid('A room source no longer exists. Edit this Listening Room.'),
      );
      if (!sources.length) invalid('Choose at least one source in this Listening Room.');
      if (!(await readOpenAIKey()))
        invalid('Add your OpenAI API key in Settings → Provider keys before resuming automatic preparation.');
      if (!(await readElevenLabsKey()))
        invalid('Add your ElevenLabs API key in Settings → Provider keys before resuming automatic preparation.');
      if (sources.some((source) => source.kind === 'twitter') && !(await readTwitterKey()))
        invalid('Add an X bearer token for this Listening Room’s sources.');
      const interests = profile.workflowDraft.newsInterests ?? dj.news!.interests;
      const settings = {
        ...dj.news!,
        interests,
        feedUrls: sources.filter((source) => !source.kind || source.kind === 'rss').map((source) => source.url),
      };
      const provenance = {
        dj,
        mood: profile.mood,
        sources,
        newsInterests: interests,
        roomId: profile.id,
        roomName: profile.name,
      };
      const cancel = () => news.cancel(input.requestId);
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const excluded = await reviewedArticleUrls();
        signal.throwIfAborted();
        const scriptResult = await news.prepareScript({
          requestId: input.requestId,
          dj,
          sources,
          mood: profile.mood,
          settings,
          importance: profile.workflowDraft.importance,
          excludeArticleUrls: excluded,
          freshWithinHours: 24,
          onCandidates: (candidates) => submitReviewedCandidates(input.requestId, candidates),
          onReleaseCandidates: (candidates) => releaseReviewedCandidates(input.requestId, candidates),
          onReview: (url) => completeReviewedCandidates(input.requestId, url),
        });
        signal.throwIfAborted();
        const script: PreparedNewsScript = {
          requestId: input.requestId,
          script: scriptResult.script,
          articles: scriptResult.articles,
          warnings: scriptResult.warnings,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          provenance,
        };
        await change((current) => ({
          ...current,
          scripts: current.scripts.some((value) => value.id === script.id)
            ? current.scripts
            : [...current.scripts, script],
        }));
        signal.throwIfAborted();
        const result = await news.renderPreparedSpeech(
          { requestId: input.requestId, dj, settings, mood: profile.mood, engine: 'elevenlabs-v4' },
          scriptResult,
          AbortSignal.any([signal, AbortSignal.timeout(120000)]),
        );
        signal.throwIfAborted();
        const id = randomUUID();
        const take: PreparedNewsTake = {
          requestId: input.requestId,
          script: result.script,
          articles: result.articles,
          warnings: result.warnings,
          engine: result.engine,
          id,
          scriptId: script.id,
          createdAt: script.createdAt,
          audioUrl: `wave-media://prepared/${id}`,
          signature: hash({ requestId: input.requestId, provenance, script: result.script }),
          provenance,
          renderingDJ: dj,
          available: true,
          byteLength: result.audio.length,
          model: 'eleven_v4',
          voice: settings.elevenVoiceId || 'JBFqnCBsd6RMkjVDRZzb',
          delivery: settings.elevenTags || '',
          deliveryState: { status: 'ready' },
        };
        return await publishTake(take, result.audio);
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    },
    {
      kind: 'automatic',
      profileId: input.roomId,
      profileName: snapshot?.roomProfiles.find((profile) => profile.id === input.roomId)?.name,
    },
  );
}
