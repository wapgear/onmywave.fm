import { StorageError } from './storage-error';
import { randomUUID } from 'node:crypto';
import type { LocalState, RoomProfile, WorkflowDraft } from '../shared/types';
import { getLocalState, updateLocalState } from './storage';
import { cancelPreparedNews, getPreparedNews, prepareRoomNews } from './prepared-news';
import type { NewsService } from './news';
import { ServiceError } from './jellyfin';

const TICK_MS = 60_000;
const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
let timer: NodeJS.Timeout | undefined;
let busy = false;
let activeRequest: string | null = null;
let activeRoomId: string | null = null;
let canRun = () => true;
let generation = 0;
export function invalidateNewsWorkflow() { ++generation; }

function sameProducerConfig(a: RoomProfile, b: RoomProfile) {
  return a.id === b.id && a.enabled === b.enabled && JSON.stringify(a.room) === JSON.stringify(b.room)
    && a.mood === b.mood && a.workflowDraft.newsEnabled === b.workflowDraft.newsEnabled
    && a.workflowDraft.newsInterests === b.workflowDraft.newsInterests && a.workflowDraft.everyHours === b.workflowDraft.everyHours
    && a.workflowDraft.importance === b.workflowDraft.importance && a.workflowDraft.maxNewsClipsPerDay === b.workflowDraft.maxNewsClipsPerDay;
}

async function replaceWorkflow(profile: RoomProfile, workflowDraft: WorkflowDraft): Promise<boolean> {
  let applied = false;
  await updateLocalState(state => {
    const latest = state.roomProfiles.find(value => value.id === profile.id);
    if (!latest || !sameProducerConfig(latest, profile)) return {};
    applied = true;
    return {
      roomProfiles: state.roomProfiles.map(value => value.id === profile.id ? { ...value, workflowDraft } : value),
      ...(state.activeRoomProfileId === profile.id ? { workflowDraft } : {}),
    };
  });
  return applied;
}

async function finishRun(profileId: string, requestId: string, outcome: NonNullable<WorkflowDraft['newsLastRun']>['outcome'], message?: string) {
  await updateLocalState(state => {
    const profile = state.roomProfiles.find(value => value.id === profileId);
    const run = profile?.workflowDraft.newsLastRun;
    if (!profile || run?.requestId !== requestId || run.outcome !== 'running') return {};
    const date = dayKey();
    const draft = profile.workflowDraft;
    const count = draft.newsClipDate === date ? draft.newsClipsToday ?? 0 : 0;
    const workflowDraft: WorkflowDraft = { ...draft, newsLastRun: { ...run, outcome, finishedAt: new Date().toISOString(), ...(message ? { message: message.slice(0, 2000) } : {}) },
      ...(outcome === 'prepared' ? { newsClipDate: date, newsClipsToday: count + 1 } : {}),
      ...(outcome === 'interrupted' ? { newsWorkflowPaused: true } : {}),
      ...(outcome === 'failed' ? { newsWorkflowError: message?.slice(0, 2000) } : outcome === 'prepared' || outcome === 'no-news' || outcome === 'partial-coverage' || outcome === 'interrupted' ? { newsWorkflowError: undefined } : {}) };
    return { roomProfiles: state.roomProfiles.map(value => value.id === profileId ? { ...value, workflowDraft } : value), ...(state.activeRoomProfileId === profileId ? { workflowDraft } : {}) };
  });
}

async function processProfile(news: NewsService, profile: RoomProfile) {
  if (!canRun()) return;
  const epoch = generation;
  const now = new Date();
  const state = await getLocalState();
  const current = state.roomProfiles.find(value => value.id === profile.id);
  if (!current?.enabled || !current.workflowDraft.newsEnabled || current.workflowDraft.newsWorkflowError || current.workflowDraft.newsWorkflowPaused) return;
  const draft = current.workflowDraft;
  if (draft.nextNewsCheckAt && Date.parse(draft.nextNewsCheckAt) > now.getTime()) return;
  const date = dayKey(now);
  const assessments = draft.newsAssessmentDate === date ? draft.newsAssessmentsToday ?? 0 : 0;
  const clips = draft.newsClipDate === date ? draft.newsClipsToday ?? 0 : 0;
  const assessmentLimit = Math.ceil(24 / draft.everyHours);
  if (assessments >= assessmentLimit || clips >= draft.maxNewsClipsPerDay) {
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    await replaceWorkflow(current, { ...draft, nextNewsCheckAt: tomorrow.toISOString() });
    return;
  }
  if ((await getPreparedNews()).requests.some(request => request.status === 'running')) {
    await replaceWorkflow(current, { ...draft, nextNewsCheckAt: new Date(now.getTime() + 60_000).toISOString() });
    return;
  }

  const requestId = randomUUID();
  let snapshot: Pick<LocalState, 'roomProfiles' | 'djs' | 'sources'> | undefined;
  await updateLocalState(state => {
    if (!canRun() || epoch !== generation) return {};
    const latest = state.roomProfiles.find(value => value.id === current.id);
    if (!latest || !sameProducerConfig(latest, current)) return {};
    const workflow = latest.workflowDraft;
    const reservedAt = new Date();
    const reservedDate = dayKey(reservedAt);
    const count = workflow.newsAssessmentDate === reservedDate ? workflow.newsAssessmentsToday ?? 0 : 0;
    const recordings = workflow.newsClipDate === reservedDate ? workflow.newsClipsToday ?? 0 : 0;
    if (!latest.enabled || !workflow.newsEnabled || workflow.newsWorkflowError || workflow.newsWorkflowPaused
      || (workflow.nextNewsCheckAt && Date.parse(workflow.nextNewsCheckAt) > reservedAt.getTime())
      || count >= Math.ceil(24 / workflow.everyHours) || recordings >= workflow.maxNewsClipsPerDay) return {};
    snapshot = structuredClone({ roomProfiles: [latest], djs: state.djs, sources: state.sources });
    const started = { ...workflow, nextNewsCheckAt: new Date(reservedAt.getTime() + workflow.everyHours * 60 * 60 * 1000).toISOString(),
      newsAssessmentDate: reservedDate, newsAssessmentsToday: count + 1, newsWorkflowPaused: false,
      newsLastRun: { requestId, startedAt: reservedAt.toISOString(), outcome: 'running' as const, roomName: latest.name } };
    return { roomProfiles: state.roomProfiles.map(value => value.id === latest.id ? { ...value, workflowDraft: started } : value),
      ...(state.activeRoomProfileId === latest.id ? { workflowDraft: started } : {}) };
  });
  if (!snapshot) return;
  if (!canRun() || epoch !== generation) {
    await finishRun(current.id, requestId, 'interrupted', 'Preparation stopped before provider dispatch.');
    return;
  }
  activeRequest = requestId;
  activeRoomId = current.id;
  try {
    await prepareRoomNews(news, { requestId, roomId: current.id }, snapshot);
    await finishRun(current.id, requestId, 'prepared');
  } catch (error) {
    if (error instanceof StorageError) throw error;
    const message = error instanceof ServiceError ? error.message : 'Could not prepare the news break. Check the connection and try again.';
    if (error instanceof ServiceError && error.code === 'no-news') { await finishRun(current.id, requestId, 'no-news', message); return; }
    if (error instanceof ServiceError && error.code === 'partial-coverage') { await finishRun(current.id, requestId, 'partial-coverage', message); return; }
    if (error instanceof ServiceError && /another preparation is running/i.test(message)) {
      const latest = await getLocalState();
      const after = latest.roomProfiles.find(value => value.id === current.id);
      if (after) await replaceWorkflow(after, { ...after.workflowDraft, nextNewsCheckAt: new Date(Date.now() + 60_000).toISOString(), newsAssessmentDate: date, newsAssessmentsToday: assessments,
        newsLastRun: after.workflowDraft.newsLastRun?.requestId === requestId ? draft.newsLastRun : after.workflowDraft.newsLastRun });
      return;
    }
    const latest = await getLocalState();
    const after = latest.roomProfiles.find(value => value.id === current.id);
    if (after) await finishRun(current.id, requestId, error instanceof ServiceError && error.code === 'uncertain-write' || !after.enabled || !after.workflowDraft.newsEnabled ? 'interrupted' : 'failed', message);
  } finally {
    if (activeRequest === requestId) activeRequest = null;
    if (activeRoomId === current.id) activeRoomId = null;
  }
}

async function tick(news: NewsService) {
  if (busy) return;
  busy = true;
  try {
    const profiles = (await getLocalState()).roomProfiles;
    for (const profile of profiles) {
      if (activeRequest) break;
      await processProfile(news, profile);
    }
  } finally { busy = false; }
}

export async function startNewsWorkflow(news: NewsService, allowed = () => true, options: { immediate?: boolean; canStart?: () => boolean; onError?: (error: unknown) => void } = {}) {
  canRun = allowed;
  if (timer) return;
  const prepared = await getPreparedNews();
  const requests = new Map(prepared.requests.map(request => [request.requestId, request]));
  await updateLocalState(state => {
    const changed = state.roomProfiles.map(profile => {
      const run = profile.workflowDraft.newsLastRun;
      if (run?.outcome !== 'running') return profile;
      const request = requests.get(run.requestId);
      const outcome: NonNullable<WorkflowDraft['newsLastRun']>['outcome'] = request?.status === 'complete' ? 'prepared' : request?.status === 'skipped' ? 'no-news' : request?.status === 'partial-coverage' ? 'partial-coverage' : 'interrupted';
      const message = outcome === 'interrupted' ? request?.error || 'The app stopped before this preparation completed.' : request?.error;
      const take = request?.status === 'complete' ? prepared.takes.find(value => value.id === request.artifactId) : undefined;
      const date = take?.createdAt ? dayKey(new Date(take.createdAt)) : dayKey(new Date(run.startedAt));
      const count = profile.workflowDraft.newsClipDate === date ? profile.workflowDraft.newsClipsToday ?? 0 : 0;
      return { ...profile, workflowDraft: { ...profile.workflowDraft, newsWorkflowPaused: profile.workflowDraft.newsWorkflowPaused || outcome === 'interrupted',
        ...(outcome === 'prepared' ? { newsClipDate: date, newsClipsToday: count + 1 } : {}),
        newsLastRun: { ...run, outcome, finishedAt: outcome === 'prepared' ? take?.createdAt || new Date().toISOString() : new Date().toISOString(), ...(message ? { message: message.slice(0, 2000) } : {}) } } };
    });
    return { roomProfiles: changed, ...(state.activeRoomProfileId ? { workflowDraft: changed.find(profile => profile.id === state.activeRoomProfileId)?.workflowDraft } : {}) };
  });
  if (options.canStart?.() === false) return;
  const failed = (error: unknown) => { options.onError?.(error); console.error('News workflow tick failed. Check preparation status and try again.'); };
  timer = setInterval(() => { void tick(news).catch(failed); }, TICK_MS);
  if (options.immediate !== false) void tick(news).catch(failed);
}

export async function checkNewsWorkflow(news: NewsService) { await tick(news); }

export function stopNewsWorkflow() {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (activeRequest) void cancelPreparedNews(activeRequest).catch(() => {});
}

export function pauseNewsWorkflow(roomId: string) {
  if (activeRoomId === roomId && activeRequest) void cancelPreparedNews(activeRequest).catch(() => {});
}
