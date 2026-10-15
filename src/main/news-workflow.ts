import { randomUUID } from 'node:crypto';
import type { RoomProfile, WorkflowDraft } from '../shared/types';
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

function sameProducerConfig(a: RoomProfile, b: RoomProfile) {
  return a.id === b.id && a.enabled === b.enabled && JSON.stringify(a.room) === JSON.stringify(b.room)
    && a.mood === b.mood && JSON.stringify(a.workflowDraft) === JSON.stringify(b.workflowDraft);
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

async function countPreparedClip(profileId: string) {
  const date = dayKey();
  await updateLocalState(state => {
    const profile = state.roomProfiles.find(value => value.id === profileId);
    if (!profile) return {};
    const count = profile.workflowDraft.newsClipDate === date ? profile.workflowDraft.newsClipsToday ?? 0 : 0;
    const workflowDraft = { ...profile.workflowDraft, newsClipDate: date, newsClipsToday: count + 1 };
    return {
      roomProfiles: state.roomProfiles.map(value => value.id === profileId ? { ...value, workflowDraft } : value),
      ...(state.activeRoomProfileId === profileId ? { workflowDraft } : {}),
    };
  });
}

async function processProfile(news: NewsService, profile: RoomProfile) {
  const now = new Date();
  const state = await getLocalState();
  const current = state.roomProfiles.find(value => value.id === profile.id);
  if (!current?.enabled || !current.workflowDraft.newsEnabled || current.workflowDraft.newsWorkflowError) return;
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
  const due = new Date(now.getTime() + draft.everyHours * 60 * 60 * 1000).toISOString();
  if (!await replaceWorkflow(current, { ...draft, nextNewsCheckAt: due, newsAssessmentDate: date, newsAssessmentsToday: assessments + 1 })) return;
  activeRequest = requestId;
  activeRoomId = current.id;
  try {
    await prepareRoomNews(news, { requestId, roomId: current.id });
    await countPreparedClip(current.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'News preparation failed.';
    if (error instanceof ServiceError && error.code === 'no-news') return;
    if (/another preparation is running/i.test(message)) {
      const latest = await getLocalState();
      const after = latest.roomProfiles.find(value => value.id === current.id);
      if (after) await replaceWorkflow(after, { ...after.workflowDraft, nextNewsCheckAt: new Date(Date.now() + 60_000).toISOString(), newsAssessmentDate: date, newsAssessmentsToday: assessments });
      return;
    }
    const latest = await getLocalState();
    const after = latest.roomProfiles.find(value => value.id === current.id);
    if (after && (!after.enabled || !after.workflowDraft.newsEnabled)) return;
    if (after) await replaceWorkflow(after, { ...after.workflowDraft, newsWorkflowError: message.slice(0, 2000) });
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

export async function startNewsWorkflow(news: NewsService) {
  if (timer) return;
  timer = setInterval(() => { void tick(news).catch(error => console.error('News workflow tick failed.', error)); }, TICK_MS);
  void tick(news).catch(error => console.error('News workflow tick failed.', error));
}

export function stopNewsWorkflow() {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (activeRequest) void cancelPreparedNews(activeRequest).catch(() => {});
}

export function pauseNewsWorkflow(roomId: string) {
  if (activeRoomId === roomId && activeRequest) void cancelPreparedNews(activeRequest).catch(() => {});
}
