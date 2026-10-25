import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { app } from 'electron';

import { canonicalArticleUrl, eligibleNewsTakes, matchesNewsRoom } from '../shared/news-pool';
import type {
  DJ,
  LocalState,
  NewsCollection,
  NewsEditorialSelection,
  NewsPreparationCheckpoint,
  NewsPreparationPhase,
  PreparedNewsOrigin,
  PreparedNewsLibrary,
  PreparedNewsRequest,
  PreparedNewsScript,
  PreparedNewsTake,
} from '../shared/types';
import { ServiceError } from './jellyfin';
import { NewsService, validateNewsSettings } from './news';
import { isSpokenNewsText, NEWS_PROMPT_POLICY_VERSION } from './news-prompts';
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

const checkpointLifetimeMs = 24 * 60 * 60 * 1000;

function validCollection(value: unknown): value is NewsCollection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const collection = value as NewsCollection;
  return (
    Array.isArray(collection.candidates) &&
    collection.candidates.length <= 200 &&
    new Set(collection.candidates.map((candidate) => candidate?.id)).size === collection.candidates.length &&
    new Set(collection.candidates.map((candidate) => canonicalArticleUrl(candidate?.url))).size ===
      collection.candidates.length &&
    collection.candidates.every(
      (candidate) =>
        !!candidate &&
        typeof candidate.id === 'string' &&
        candidate.id.length <= 128 &&
        typeof candidate.title === 'string' &&
        candidate.title.length <= 240 &&
        typeof candidate.summary === 'string' &&
        candidate.summary.length <= 1500 &&
        typeof candidate.url === 'string' &&
        canonicalArticleUrl(candidate.url) !== null &&
        typeof candidate.source === 'string' &&
        candidate.source.length <= 160 &&
        (candidate.publishedAt === undefined || Number.isFinite(Date.parse(candidate.publishedAt))) &&
        Array.isArray(candidate.sourceIds) &&
        candidate.sourceIds.length > 0 &&
        candidate.sourceIds.every((id) => typeof id === 'string' && id.length <= 128),
    ) &&
    Array.isArray(collection.sourceResults) &&
    collection.sourceResults.every(
      (result) =>
        !!result &&
        typeof result.sourceId === 'string' &&
        ['complete', 'partial', 'failed'].includes(result.status) &&
        Number.isInteger(result.articleCount) &&
        result.articleCount >= 0 &&
        Array.isArray(result.warnings) &&
        result.warnings.every((warning) => typeof warning === 'string'),
    ) &&
    collection.incomplete === collection.sourceResults.some((result) => result.status !== 'complete') &&
    Array.isArray(collection.warnings) &&
    collection.warnings.every((warning) => typeof warning === 'string') &&
    typeof collection.collectedAt === 'string' &&
    Number.isFinite(Date.parse(collection.collectedAt)) &&
    typeof collection.incomplete === 'boolean'
  );
}

function validSelection(value: unknown, collection?: NewsCollection): value is NewsEditorialSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const selection = value as NewsEditorialSelection;
  const selected = typeof selection.candidateId === 'string';
  return (
    (selection.candidateId === null ||
      (typeof selection.candidateId === 'string' &&
        Boolean(collection?.candidates.some((candidate) => candidate.id === selection.candidateId)))) &&
    ['selected', 'no-match', 'excluded', 'insufficient-evidence', 'not-major'].includes(selection.reasonCode) &&
    (selected ? selection.reasonCode === 'selected' : selection.reasonCode !== 'selected') &&
    typeof selection.reason === 'string' &&
    selection.reason.trim().length > 0 &&
    selection.reason.length <= 2000 &&
    (selection.candidateId === null ? selection.reasonCode !== 'selected' : selection.reasonCode === 'selected') &&
    typeof selection.decidedAt === 'string' &&
    Number.isFinite(Date.parse(selection.decidedAt))
  );
}

function preparationConfigHash(
  provenance: NewsPreparationCheckpoint['provenance'],
  settings: NewsPreparationCheckpoint['settings'],
  importance: NewsPreparationCheckpoint['importance'],
): string {
  return hash({
    policyVersion: NEWS_PROMPT_POLICY_VERSION,
    profileId: provenance.roomId,
    room: { djId: provenance.dj.id, sourceIds: provenance.sources.map((source) => source.id).sort() },
    mood: provenance.mood,
    importance,
    dj: { ...provenance.dj, avatar: undefined },
    interests: provenance.newsInterests,
    sources: [...provenance.sources].sort((a, b) => a.id.localeCompare(b.id)),
    settings: { ...settings, feedUrls: [...settings.feedUrls].sort() },
  });
}

function validCheckpoint(value: unknown): value is NewsPreparationCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const checkpoint = value as NewsPreparationCheckpoint;
  if (
    checkpoint.version !== 1 ||
    typeof checkpoint.configHash !== 'string' ||
    !/^[a-f\d]{64}$/i.test(checkpoint.configHash) ||
    typeof checkpoint.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(checkpoint.createdAt)) ||
    Date.parse(checkpoint.createdAt) > Date.now() ||
    !checkpoint.provenance ||
    !checkpoint.provenance.dj ||
    !checkpoint.provenance.dj.news ||
    !['id', 'name', 'instructions', 'musicPreferences', 'exclusions', 'language', 'personality'].every(
      (field) => typeof checkpoint.provenance.dj[field as keyof DJ] === 'string',
    ) ||
    typeof checkpoint.provenance.roomId !== 'string' ||
    typeof checkpoint.provenance.roomName !== 'string' ||
    typeof checkpoint.provenance.mood !== 'string' ||
    !Array.isArray(checkpoint.provenance.sources) ||
    !checkpoint.provenance.sources.every(
      (source) =>
        Boolean(source) &&
        validId(source.id) &&
        typeof source.name === 'string' &&
        typeof source.url === 'string' &&
        canonicalArticleUrl(source.url) !== null,
    ) ||
    !checkpoint.settings ||
    !['major', 'relevant'].includes(checkpoint.importance) ||
    checkpoint.provenance.importance !== checkpoint.importance
  )
    return false;
  try {
    if (hash(validateNewsSettings(checkpoint.settings)) !== hash(checkpoint.settings)) return false;
  } catch {
    return false;
  }
  if (
    preparationConfigHash(checkpoint.provenance, checkpoint.settings, checkpoint.importance) !== checkpoint.configHash
  )
    return false;
  if (checkpoint.collection !== undefined && !validCollection(checkpoint.collection)) return false;
  const sourceIds = new Set(checkpoint.provenance.sources.map((source) => source.id));
  if (sourceIds.size !== checkpoint.provenance.sources.length) return false;
  if (
    checkpoint.collection &&
    (checkpoint.collection.sourceResults.length !== sourceIds.size ||
      new Set(checkpoint.collection.sourceResults.map((result) => result.sourceId)).size !== sourceIds.size ||
      checkpoint.collection.sourceResults.some((result) => !sourceIds.has(result.sourceId)) ||
      checkpoint.collection.candidates.some((candidate) => candidate.sourceIds.some((id) => !sourceIds.has(id))))
  )
    return false;
  if (checkpoint.selection !== undefined && !validSelection(checkpoint.selection, checkpoint.collection)) return false;
  return checkpoint.scriptId === undefined || validId(checkpoint.scriptId);
}

function phaseMatchesCheckpoint(request: PreparedNewsRequest): boolean {
  if (!request.phase || !validCheckpoint(request.checkpoint)) return false;
  const { collection, selection, scriptId } = request.checkpoint;
  switch (request.phase) {
    case 'collecting':
      return !collection && !selection && !scriptId;
    case 'selecting':
      return Boolean(collection) && (!selection || selection.candidateId === null) && !scriptId;
    case 'selected':
    case 'writing':
      return Boolean(collection && selection?.candidateId) && !scriptId;
    case 'script-ready':
    case 'speech':
    case 'publishing':
    case 'complete':
      return Boolean(collection && selection?.candidateId && scriptId);
    default:
      return false;
  }
}

const root = () => join(app.getPath('userData'), 'prepared-news');

const audioPath = (id: string) => join(root(), `${id}.mp3`);

let library: PreparedNewsLibrary | undefined;

let initialization: Promise<PreparedNewsLibrary> | undefined;

let writes = Promise.resolve();

let recoveryDirty = true;

let recoveryPromise: Promise<void> | undefined;

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
        if (request.checkpoint !== undefined && !phaseMatchesCheckpoint(request) && request.status !== 'complete') {
          request.status = 'interrupted';
          request.error =
            'The saved news checkpoint could not be validated. Review the setup before starting a new check.';
          if (request.providerAttempt?.outcome === 'pending') request.providerAttempt.outcome = 'uncertain';
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
            ...(request.providerAttempt?.outcome === 'pending'
              ? { providerAttempt: { ...request.providerAttempt, outcome: 'uncertain' as const } }
              : {}),
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

export async function reviewedArticleUrls(configHash?: string) {
  const current = await load();
  const urls = new Set<string>();
  for (const take of current.takes) {
    for (const article of take.articles) {
      const canonical = canonicalArticleUrl(article.url);
      if (canonical) urls.add(canonical);
    }
  }
  for (const request of current.requests) {
    const checkpoint = request.checkpoint;
    if (
      !checkpoint ||
      !phaseMatchesCheckpoint(request) ||
      !checkpoint.selection?.candidateId ||
      !['running', 'failed', 'interrupted'].includes(request.status) ||
      Date.now() - Date.parse(checkpoint.createdAt) > checkpointLifetimeMs
    )
      continue;
    const selected = checkpoint.collection?.candidates.find(
      (candidate) => candidate.id === checkpoint.selection?.candidateId,
    );
    const canonical = selected && canonicalArticleUrl(selected.url);
    if (canonical && selectedCandidateIsFresh(checkpoint)) urls.add(canonical);
  }
  for (const article of current.reviewedArticles ?? []) {
    if (article.outcome === 'not-selected') {
      if (
        configHash &&
        article.configHash === configHash &&
        Date.parse(article.reviewedAt) <= Date.now() &&
        Date.now() - Date.parse(article.reviewedAt) <= checkpointLifetimeMs
      )
        urls.add(article.canonicalUrl);
      continue;
    }
    if (article.outcome === 'selected' && article.configHash) {
      const request = current.requests.find((value) => value.requestId === article.requestId);
      if (request?.checkpoint && Date.parse(request.checkpoint.createdAt) > Date.now()) continue;
      if (!request || !phaseMatchesCheckpoint(request) || request.status === 'complete') urls.add(article.canonicalUrl);
      continue;
    }
    if (article.outcome === 'selected') urls.add(article.canonicalUrl);
  }
  return [...urls];
}

function roomNewsSnapshot(state: Pick<LocalState, 'roomProfiles' | 'djs' | 'sources'>, roomId: string) {
  const profile =
    state.roomProfiles.find((value) => value.id === roomId) ?? invalid('This Listening Room no longer exists.');
  const dj = validateDj(state.djs.find((value) => value.id === profile.room.djId));
  const sources = [...new Set(profile.room.sourceIds)].map(
    (id) => state.sources.find((value) => value.id === id) || invalid('A room source no longer exists.'),
  );
  if (!sources.length) invalid('Choose at least one source in this Listening Room.');
  const interests = profile.workflowDraft.newsInterests ?? dj.news!.interests;
  const settings = validateNewsSettings({
    ...dj.news!,
    interests,
    feedUrls: sources.filter((source) => !source.kind || source.kind === 'rss').map((source) => source.url),
  });
  const provenance = {
    dj,
    mood: profile.mood,
    sources,
    newsInterests: interests,
    importance: profile.workflowDraft.importance,
    roomId: profile.id,
    roomName: profile.name,
  };
  const configHash = preparationConfigHash(provenance, settings, profile.workflowDraft.importance);
  return { profile, dj, sources, interests, settings, provenance, configHash };
}

function selectedCandidateIsFresh(checkpoint: NewsPreparationCheckpoint, now = Date.now()): boolean {
  const id = checkpoint.selection?.candidateId;
  if (!id || !checkpoint.collection) return false;
  const selected = checkpoint.collection.candidates.find((candidate) => candidate.id === id);
  const published = selected?.publishedAt ? Date.parse(selected.publishedAt) : NaN;
  return Number.isFinite(published) && published >= now - checkpointLifetimeMs && published <= now;
}

function selectedStoryExistsElsewhere(current: PreparedNewsLibrary, request: PreparedNewsRequest): boolean {
  const selected = request.checkpoint?.collection?.candidates.find(
    (candidate) => candidate.id === request.checkpoint?.selection?.candidateId,
  );
  const url = selected && canonicalArticleUrl(selected.url);
  if (!url) return false;
  if (
    current.takes.some(
      (take) =>
        take.requestId !== request.requestId &&
        take.articles.some((article) => canonicalArticleUrl(article.url) === url),
    )
  )
    return true;
  return current.requests.some((other) => {
    if (
      other.requestId === request.requestId ||
      !['running', 'failed', 'interrupted'].includes(other.status) ||
      !phaseMatchesCheckpoint(other) ||
      !other.checkpoint ||
      Date.now() - Date.parse(other.checkpoint.createdAt) > checkpointLifetimeMs ||
      !selectedCandidateIsFresh(other.checkpoint)
    )
      return false;
    return other.checkpoint.collection?.candidates.some(
      (candidate) =>
        candidate.id === other.checkpoint?.selection?.candidateId && canonicalArticleUrl(candidate.url) === url,
    );
  });
}

function validSavedScript(
  script: PreparedNewsScript | undefined,
  requestId: string,
  checkpoint: NewsPreparationCheckpoint,
) {
  const selectedId = checkpoint.selection?.candidateId;
  const candidate = checkpoint.collection?.candidates.find((value) => value.id === selectedId);
  return Boolean(
    script &&
    selectedId &&
    candidate &&
    script.id === checkpoint.scriptId &&
    script.requestId === requestId &&
    Array.isArray(script.articles) &&
    script.articles.length === 1 &&
    script.articles[0].id === selectedId &&
    canonicalArticleUrl(script.articles[0].url) === canonicalArticleUrl(candidate.url) &&
    isSpokenNewsText(script.script) &&
    script.selection?.candidateId === selectedId &&
    Number.isFinite(Date.parse(script.createdAt)),
  );
}

export async function resumableRoomNewsRequest(
  state: Pick<LocalState, 'roomProfiles' | 'djs' | 'sources'>,
  roomId: string,
): Promise<string | null> {
  const profile = state.roomProfiles.find((value) => value.id === roomId);
  const run = profile?.workflowDraft.newsLastRun;
  if (!profile || !run || !['failed', 'interrupted'].includes(run.outcome)) return null;
  const library = await getPreparedNews();
  const request = library.requests.find((value) => value.requestId === run.requestId);
  const now = Date.now();
  let currentConfigHash: string;
  try {
    currentConfigHash = roomNewsSnapshot(state, roomId).configHash;
  } catch {
    return null;
  }
  if (!request) return null;
  const checkpoint = request.checkpoint;
  if (
    !['failed', 'interrupted'].includes(request.status) ||
    !phaseMatchesCheckpoint(request) ||
    !checkpoint ||
    checkpoint.configHash !== currentConfigHash ||
    now - Date.parse(checkpoint.createdAt) > checkpointLifetimeMs ||
    Date.parse(checkpoint.createdAt) > now ||
    (checkpoint.selection &&
      (checkpoint.selection.candidateId === null || !selectedCandidateIsFresh(checkpoint, now))) ||
    (!checkpoint.selection &&
      checkpoint.collection &&
      (!checkpoint.collection.candidates.length ||
        checkpoint.collection.candidates.some((candidate) => {
          const published = candidate.publishedAt ? Date.parse(candidate.publishedAt) : NaN;
          return !Number.isFinite(published) || published < now - checkpointLifetimeMs || published > now;
        })))
  )
    return null;
  if (selectedStoryExistsElsewhere(library, request)) return null;
  if (
    ['script-ready', 'speech', 'publishing'].includes(request.phase!) &&
    !validSavedScript(
      library.scripts.find((script) => script.id === checkpoint.scriptId),
      request.requestId,
      checkpoint,
    )
  )
    return null;
  return request.requestId;
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

const phaseTransitions: Record<NewsPreparationPhase, NewsPreparationPhase[]> = {
  collecting: ['selecting'],
  selecting: ['selected'],
  selected: ['writing'],
  writing: ['script-ready'],
  'script-ready': ['speech'],
  speech: ['publishing'],
  publishing: ['complete'],
  complete: [],
};

async function updateRequest(requestId: string, update: (request: PreparedNewsRequest) => PreparedNewsRequest) {
  let found = false;
  await change((current) => ({
    ...current,
    requests: current.requests.map((request) => {
      if (request.requestId !== requestId) return request;
      if (request.status !== 'running') invalid('This news preparation is no longer active.');
      found = true;
      return update(request);
    }),
  }));
  if (!found) invalid('This news preparation is no longer available.');
}

async function persistCollection(requestId: string, collection: NewsCollection) {
  if (!validCollection(collection)) invalid('The collected news could not be saved safely.');
  await updateRequest(requestId, (request) => {
    const checkpoint = validCheckpoint(request.checkpoint)
      ? request.checkpoint
      : invalid('The news preparation checkpoint is malformed.');
    if (!['collecting', 'selecting'].includes(request.phase ?? '') || checkpoint.selection || checkpoint.scriptId)
      invalid('Collected news cannot replace a committed editorial decision.');
    const sourceIds = new Set(checkpoint.provenance.sources.map((source) => source.id));
    if (
      collection.sourceResults.length !== sourceIds.size ||
      new Set(collection.sourceResults.map((result) => result.sourceId)).size !== sourceIds.size ||
      collection.sourceResults.some((result) => !sourceIds.has(result.sourceId)) ||
      collection.candidates.some((candidate) => candidate.sourceIds.some((id) => !sourceIds.has(id)))
    )
      invalid('Collected stories do not match the configured sources.');
    if (checkpoint.collection && hash(checkpoint.collection) !== hash(collection))
      invalid('The collected news changed while this preparation was running.');
    return { ...request, phase: 'selecting', checkpoint: { ...checkpoint, collection } };
  });
}

async function persistSelection(requestId: string, selection: NewsEditorialSelection) {
  let reviewedAt = new Date().toISOString();
  await change((current) => {
    const request =
      current.requests.find((item) => item.requestId === requestId) ??
      invalid('The news preparation checkpoint is unavailable.');
    if (request.status !== 'running') invalid('The news preparation checkpoint is unavailable.');
    const checkpoint = validCheckpoint(request.checkpoint)
      ? request.checkpoint
      : invalid('The news preparation checkpoint is unavailable.');
    const collection = checkpoint.collection ?? invalid('The collected stories are missing.');
    if (!['selecting', 'selected'].includes(request.phase ?? '') || checkpoint.scriptId)
      invalid('An editorial decision cannot replace a later preparation stage.');
    if (!validSelection(selection, collection))
      invalid('The editorial selection does not match the collected stories.');
    if (checkpoint.selection && hash(checkpoint.selection) !== hash(selection))
      invalid('The editorial decision has already been saved.');
    reviewedAt = selection.decidedAt;
    const selected = collection.candidates.find((candidate) => candidate.id === selection.candidateId);
    const reviewedArticles = [...(current.reviewedArticles ?? [])];
    for (const candidate of collection.candidates) {
      const canonicalUrl = canonicalArticleUrl(candidate.url);
      if (!canonicalUrl) continue;
      const outcome = candidate.id === selected?.id ? 'selected' : 'not-selected';
      const article = {
        id: candidate.id,
        title: candidate.title,
        url: candidate.url,
        source: candidate.source,
        publishedAt: candidate.publishedAt,
        canonicalUrl,
        requestId,
        reviewedAt,
        status: 'reviewed' as const,
        outcome: outcome as 'selected' | 'not-selected',
        configHash: checkpoint.configHash,
        ...(candidate.id === selected?.id ? { reasonCode: selection.reasonCode, reason: selection.reason } : {}),
      };
      const existing = reviewedArticles.find(
        (item) => item.canonicalUrl === canonicalUrl && item.configHash === checkpoint.configHash,
      );
      if (existing) Object.assign(existing, article);
      else reviewedArticles.push(article);
    }
    return {
      ...current,
      requests: current.requests.map((item) =>
        item.requestId === requestId
          ? {
              ...item,
              phase: selection.candidateId ? 'selected' : item.phase,
              checkpoint: { ...checkpoint, selection },
              ...(item.providerAttempt?.phase === 'selecting' && item.providerAttempt.outcome === 'pending'
                ? { providerAttempt: { ...item.providerAttempt, outcome: 'received' as const } }
                : {}),
            }
          : item,
      ),
      reviewedArticles,
    };
  });
}

async function persistScript(requestId: string, script: PreparedNewsScript) {
  await change((current) => {
    const request =
      current.requests.find((item) => item.requestId === requestId) ??
      invalid('The news preparation checkpoint is unavailable.');
    if (request.status !== 'running') invalid('The news preparation checkpoint is unavailable.');
    const checkpoint = validCheckpoint(request.checkpoint)
      ? request.checkpoint
      : invalid('The news preparation checkpoint is unavailable.');
    const selection = checkpoint.selection ?? invalid('A script cannot be saved without a selected story.');
    if (!['writing', 'script-ready'].includes(request.phase ?? ''))
      invalid('Spoken text can only be committed during the writing stage.');
    const collection = checkpoint.collection ?? invalid('A script cannot be saved without a selected story.');
    if (!selection.candidateId) invalid('A script cannot be saved without a selected story.');
    const selected = collection.candidates.find((candidate) => candidate.id === selection.candidateId);
    if (
      !selected ||
      script.requestId !== requestId ||
      script.articles.length !== 1 ||
      script.articles[0].id !== selected.id ||
      canonicalArticleUrl(script.articles[0].url) !== canonicalArticleUrl(selected.url) ||
      !isSpokenNewsText(script.script) ||
      script.selection?.candidateId !== selection.candidateId
    )
      invalid('The spoken script does not match the saved editorial selection.');
    if (checkpoint.scriptId && checkpoint.scriptId !== script.id)
      invalid('A different script is already saved for this selection.');
    const scripts = current.scripts.some((value) => value.id === script.id)
      ? current.scripts
      : [...current.scripts, script];
    return {
      ...current,
      scripts,
      requests: current.requests.map((item) =>
        item.requestId === requestId
          ? {
              ...item,
              phase: 'script-ready',
              checkpoint: { ...checkpoint, scriptId: script.id },
              ...(item.providerAttempt?.phase === 'writing' && item.providerAttempt.outcome === 'pending'
                ? { providerAttempt: { ...item.providerAttempt, outcome: 'received' as const } }
                : {}),
            }
          : item,
      ),
    };
  });
}

async function setRequestPhase(requestId: string, phase: NewsPreparationPhase) {
  await updateRequest(requestId, (request) => {
    const previous = request.phase;
    if (previous !== undefined && previous !== phase && !phaseTransitions[previous].includes(phase))
      invalid(`News preparation cannot move from ${previous} to ${phase}.`);
    const next = { ...request, phase };
    if (!phaseMatchesCheckpoint(next)) invalid(`The saved checkpoint does not support the ${phase} stage.`);
    return next;
  });
}

async function recordProviderAttempt(
  requestId: string,
  phase: 'selecting' | 'writing' | 'speech',
  outcome: 'pending' | 'rejected' | 'received' | 'uncertain',
) {
  await updateRequest(requestId, (request) => {
    if (request.phase !== phase) invalid('The provider attempt does not match the active news stage.');
    if (outcome !== 'pending' && request.providerAttempt?.phase !== phase)
      invalid('The provider attempt does not match the active news stage.');
    return {
      ...request,
      providerAttempt: {
        phase,
        dispatchedAt:
          outcome === 'pending'
            ? new Date().toISOString()
            : (request.providerAttempt?.dispatchedAt ?? new Date().toISOString()),
        outcome,
      },
      ...(outcome === 'pending' ? { attempts: (request.attempts ?? 0) + 1 } : {}),
    };
  });
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
        old.phase = 'complete';
        old.artifactId = take.id;
        if (old.providerAttempt?.phase === 'speech' && old.providerAttempt.outcome !== 'received')
          old.providerAttempt = { ...old.providerAttempt, outcome: 'received' };
        delete old.error;
      } else
        state.requests.push({
          ...request,
          status: 'complete',
          phase: 'complete',
          artifactId: take.id,
          ...(request.providerAttempt?.phase === 'speech' && request.providerAttempt.outcome !== 'received'
            ? { providerAttempt: { ...request.providerAttempt, outcome: 'received' as const } }
            : {}),
        });
    }
    return state;
  });
}

async function recoverIfDirty() {
  while ((recoveryDirty || recoveryPromise) && !active?.publishing) {
    if (!recoveryPromise && recoveryDirty) {
      recoveryDirty = false;
      const scan = recoverCompletedAudio().catch((error) => {
        recoveryDirty = true;
        throw error;
      });
      const tracked: Promise<void> = scan.finally(() => {
        if (recoveryPromise === tracked) recoveryPromise = undefined;
      });
      recoveryPromise = tracked;
    }
    const current = recoveryPromise;
    if (current) await current;
  }
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
  await recoverIfDirty();
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
  await recoverIfDirty();
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
  context: Omit<PreparedNewsOrigin, 'startedAt'> & { kind: 'automatic'; checkpoint: NewsPreparationCheckpoint },
  retry = false,
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
      await recoverIfDirty();
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
        if (
          !retry ||
          !['failed', 'interrupted'].includes(old.status) ||
          !phaseMatchesCheckpoint(old) ||
          Date.now() - Date.parse(old.checkpoint!.createdAt) > checkpointLifetimeMs
        )
          throw new ServiceError(
            'uncertain-write',
            old.error || 'This request did not complete. Review News settings before resuming automatic preparation.',
          );
        if (
          old.checkpoint?.selection &&
          (!selectedCandidateIsFresh(old.checkpoint) || selectedStoryExistsElsewhere(await load(), old))
        )
          invalid('This selected story is no longer available for retry. Start a new news check.');
        await change((current) => ({
          ...current,
          requests: current.requests.map((item) =>
            item.requestId === requestId
              ? {
                  ...item,
                  status: 'running',
                  phase: item.checkpoint?.scriptId
                    ? 'script-ready'
                    : item.checkpoint?.selection?.candidateId
                      ? 'selected'
                      : item.checkpoint?.collection
                        ? 'selecting'
                        : 'collecting',
                  error: undefined,
                }
              : item,
          ),
        }));
      } else {
        const profileName =
          context.profileName ??
          (context.profileId
            ? (await getLocalState()).roomProfiles.find((profile) => profile.id === context.profileId)?.name
            : undefined);
        const { checkpoint, ...originContext } = context;
        const origin: PreparedNewsOrigin = { ...originContext, startedAt, profileName };
        const initialPhase: NewsPreparationPhase = checkpoint.scriptId
          ? 'script-ready'
          : checkpoint.selection?.candidateId
            ? 'selected'
            : checkpoint.collection
              ? 'selecting'
              : 'collecting';
        await change((current) => ({
          ...current,
          requests: [
            ...current.requests,
            {
              requestId,
              kind,
              inputHash,
              status: 'running',
              phase: initialPhase,
              origin,
              checkpoint,
            },
          ],
        }));
      }
      controller.signal.throwIfAborted();
      const result = await work(controller.signal);
      // A completed artifact crosses the publication boundary and must survive later cancellation.
      await change((current) => ({
        ...current,
        takes: !current.takes.some((take) => take.id === result.id) ? [...current.takes, result] : current.takes,
        requests: current.requests.map((item) =>
          item.requestId === requestId
            ? { ...item, status: 'complete', phase: 'complete', artifactId: result.id, error: undefined }
            : item,
        ),
      }));
      return result;
    } catch (error) {
      let publicationRecoveryUnavailable = false;
      if (operation.publishing) {
        operation.publishing = false;
        recoveryDirty = true;
        try {
          await recoverIfDirty();
          const recovered = (await load()).requests.find((item) => item.requestId === requestId);
          const take =
            recovered?.status === 'complete' && recovered.artifactId
              ? (await load()).takes.find((item) => item.id === recovered.artifactId)
              : undefined;
          if (take) return { ...structuredClone(take), available: Boolean(await preparedAudio(take.id)) } as T;
        } catch {
          // Keep the publication checkpoint for startup recovery; never turn a durable receipt into failure.
          publicationRecoveryUnavailable = true;
        }
      }
      const failure =
        error instanceof ServiceError
          ? error
          : new ServiceError('server', 'Could not prepare the news break. Check the connection and try again.');
      const providerOutcome = (await load()).requests.find((item) => item.requestId === requestId)?.providerAttempt
        ?.outcome;
      const uncertain =
        controller.signal.aborted ||
        publicationRecoveryUnavailable ||
        providerOutcome === 'pending' ||
        providerOutcome === 'uncertain';
      const message = publicationRecoveryUnavailable
        ? 'The recording receipt could not be confirmed. News recovery will check the saved audio before retrying.'
        : uncertain
          ? `${failure.message} A provider request may have been charged. Review News settings before explicitly resuming preparation.`
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
                      : uncertain
                        ? 'interrupted'
                        : 'failed',
                ...(item.providerAttempt?.outcome === 'pending'
                  ? { providerAttempt: { ...item.providerAttempt, outcome: 'uncertain' as const } }
                  : {}),
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
      if (failure instanceof StorageError) throw failure;
      if (uncertain) throw new ServiceError('uncertain-write', message);
      throw failure;
    } finally {
      if (active === operation) {
        if (operation.publishing) recoveryDirty = true;
        active = null;
      }
    }
  })();
  return operation.promise;
}

async function publishTake(take: PreparedNewsTake, audio: Buffer) {
  const operation = active?.id === take.requestId ? active : null;
  if (operation) {
    operation.publishing = true;
    recoveryDirty = true;
  }
  try {
    if (recoveryPromise) await recoveryPromise;
    await mkdir(root(), { recursive: true, mode: 0o700 });
    const temp = `${audioPath(take.id)}.tmp`;
    await writeFile(temp, audio, { mode: 0o600 });
    const recorded = { ...take, recordedAt: new Date().toISOString() };
    const sidecar = join(root(), `${take.id}.take.json`);
    const request = (await load()).requests.find((item) => item.requestId === take.requestId)!;
    await writeFile(`${sidecar}.tmp`, JSON.stringify({ take: recorded, request }), { mode: 0o600 });
    await rename(`${sidecar}.tmp`, sidecar);
    await rename(temp, audioPath(take.id));
    let committed = false;
    await change((current) => ({
      ...current,
      requests: current.requests.map((item) =>
        item.requestId !== take.requestId
          ? item
          : item.status === 'running' &&
              item.phase === 'speech' &&
              item.providerAttempt?.phase === 'speech' &&
              item.providerAttempt.outcome === 'pending' &&
              validCheckpoint(item.checkpoint) &&
              item.checkpoint.scriptId === take.scriptId
            ? ((committed = true),
              {
                ...item,
                phase: 'publishing',
                providerAttempt: { ...item.providerAttempt, outcome: 'received' as const },
              })
            : invalid('The prepared speech no longer matches its saved checkpoint.'),
      ),
    }));
    if (!committed) invalid('The prepared speech could not be confirmed.');
    return recorded;
  } catch {
    throw new StorageError();
  }
}

export async function prepareRoomNews(
  news: NewsService,
  input: { requestId: string; roomId: string; retry?: boolean },
  snapshot?: Pick<LocalState, 'roomProfiles' | 'djs' | 'sources'>,
): Promise<PreparedNewsTake> {
  if (!input || !validId(input.requestId) || !validId(input.roomId)) invalid();
  const retry = input.retry === true;
  const state = snapshot ?? (await getLocalState());
  const room = roomNewsSnapshot(state, input.roomId);
  const initialCheckpoint: NewsPreparationCheckpoint = {
    version: 1,
    configHash: room.configHash,
    createdAt: new Date().toISOString(),
    provenance: room.provenance,
    settings: room.settings,
    importance: room.profile.workflowDraft.importance,
  };
  return execute(
    input.requestId,
    'audio',
    { automaticRoomId: input.roomId, configHash: room.configHash },
    async (signal) => {
      const profile = room.profile;
      if (!profile.enabled) invalid('Choose an enabled Listening Room.');
      if (!profile.workflowDraft.newsEnabled)
        invalid('Enable the news workflow for this Listening Room before preparing automatic news.');
      if (!profile.mood.trim()) invalid('Add a mood to this Listening Room.');
      const request = (await load()).requests.find((value) => value.requestId === input.requestId);
      let checkpoint = request?.checkpoint;
      if (!checkpoint) {
        checkpoint = initialCheckpoint;
        await updateRequest(input.requestId, (current) => ({ ...current, checkpoint }));
      }
      if (
        !validCheckpoint(checkpoint) ||
        checkpoint.configHash !== room.configHash ||
        (retry && Date.now() - Date.parse(checkpoint.createdAt) > checkpointLifetimeMs)
      )
        invalid('This saved preparation no longer matches the current setup or has expired. Start a new check.');
      const provenance = checkpoint.provenance;
      const dj = provenance.dj;
      const sources = provenance.sources;
      const settings = checkpoint.settings;
      if (!(await readOpenAIKey()))
        invalid('Add your OpenAI API key in Settings → Provider keys before resuming automatic preparation.');
      if (!(await readElevenLabsKey()))
        invalid('Add your ElevenLabs API key in Settings → Provider keys before resuming automatic preparation.');
      if (sources.some((source) => source.kind === 'twitter') && !(await readTwitterKey()))
        invalid('Add an X bearer token for this Listening Room’s sources.');
      const cancel = () => news.cancel(input.requestId);
      signal.addEventListener('abort', cancel, { once: true });
      try {
        const excluded = await reviewedArticleUrls(checkpoint.configHash);
        signal.throwIfAborted();
        const savedScript = checkpoint.scriptId
          ? (await load()).scripts.find((value) => value.id === checkpoint.scriptId)
          : undefined;
        if (checkpoint.scriptId && !validSavedScript(savedScript, input.requestId, checkpoint))
          invalid('The saved script is missing or no longer matches its selected story. Start a new check.');
        let script = savedScript;
        const scriptResult = savedScript
          ? savedScript
          : await news.prepareScript({
              requestId: input.requestId,
              dj,
              sources,
              mood: provenance.mood,
              settings,
              importance: checkpoint.importance,
              excludeArticleUrls: excluded,
              freshWithinHours: 24,
              checkpoint: { collection: checkpoint.collection, selection: checkpoint.selection },
              onCollection: (collection) => persistCollection(input.requestId, collection),
              onSelection: (selection) => persistSelection(input.requestId, selection),
              onPhase: (phase) => setRequestPhase(input.requestId, phase),
              onProviderAttempt: (phase, outcome) => recordProviderAttempt(input.requestId, phase, outcome),
              onScript: async (generated) => {
                const currentCheckpointValue = (await load()).requests.find(
                  (value) => value.requestId === input.requestId,
                )?.checkpoint;
                const currentCheckpoint = validCheckpoint(currentCheckpointValue)
                  ? currentCheckpointValue
                  : invalid('The news preparation checkpoint is unavailable.');
                const artifact: PreparedNewsScript = {
                  ...generated,
                  id: currentCheckpoint.scriptId ?? randomUUID(),
                  createdAt: new Date().toISOString(),
                  provenance: currentCheckpoint.provenance,
                  selection: currentCheckpoint.selection,
                };
                await persistScript(input.requestId, artifact);
                script = artifact;
              },
            });
        signal.throwIfAborted();
        if (!script) {
          const currentCheckpointValue = (await load()).requests.find(
            (value) => value.requestId === input.requestId,
          )?.checkpoint;
          const currentCheckpoint = validCheckpoint(currentCheckpointValue) ? currentCheckpointValue : undefined;
          const stored = currentCheckpoint?.scriptId
            ? (await load()).scripts.find((value) => value.id === currentCheckpoint.scriptId)
            : undefined;
          if (!stored) invalid('The generated script could not be saved. Retry this preparation.');
          script = stored;
        }
        const readyScript = script ?? invalid('The generated script could not be saved. Retry this preparation.');
        signal.throwIfAborted();
        const result = await news.renderPreparedSpeech(
          {
            requestId: input.requestId,
            dj,
            settings,
            mood: provenance.mood,
            engine: 'elevenlabs-v4',
            onPhase: (phase) => setRequestPhase(input.requestId, phase),
            onProviderAttempt: (phase, outcome) => recordProviderAttempt(input.requestId, phase, outcome),
          },
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
          scriptId: readyScript.id,
          createdAt: readyScript.createdAt,
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
          selection: readyScript.selection,
        };
        return await publishTake(take, result.audio);
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    },
    {
      kind: 'automatic',
      profileId: input.roomId,
      profileName: room.profile.name,
      checkpoint: initialCheckpoint,
    },
    retry,
  );
}
