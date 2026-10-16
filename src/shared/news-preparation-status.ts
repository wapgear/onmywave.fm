import type { RoomProfile } from './types';

/** Counts are scheduled attempts, not provider invoices or successful assessments. */
export function newsPreparationStatus(profile: RoomProfile, now = new Date()) {
  const workflow = profile.workflowDraft;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const checks = workflow.newsAssessmentDate === day ? workflow.newsAssessmentsToday ?? 0 : 0;
  const recordings = workflow.newsClipDate === day ? workflow.newsClipsToday ?? 0 : 0;
  const checkLimit = Math.ceil(24 / workflow.everyHours);
  const atLimit = recordings >= workflow.maxNewsClipsPerDay ? 'recording' : checks >= checkLimit ? 'check' : null;
  const next = workflow.nextNewsCheckAt ? new Date(workflow.nextNewsCheckAt) : null;
  const nextLabel = next ? next.getTime() > now.getTime() ? `Next check: ${next.toLocaleString()}.` : 'A check is due. Waiting for the local runner.' : workflow.newsLastRun ? 'Next check pending.' : 'First check pending.';
  let label: string;
  let detail: string;
  if (!profile.enabled) {
    label = 'Room unavailable'; detail = 'Make this room available in its advanced options to prepare or play news automatically.';
  } else if (!workflow.newsEnabled) {
    label = 'Preparation off'; detail = 'Saved recordings remain available. Enable news preparation in News settings.';
  } else if (workflow.newsWorkflowError || workflow.newsWorkflowPaused) {
    label = 'Preparation paused'; detail = `${workflow.newsWorkflowError || (workflow.newsLastRun?.outcome === 'interrupted' ? 'The last check was interrupted.' : 'Automatic preparation is paused.')} Preparation stays paused until you resume it in News settings.`;
  } else if (workflow.newsLastRun?.outcome === 'running') {
    label = 'Preparing news'; detail = 'Checking sources and preparing any qualifying story. Music keeps playing.';
  } else if (atLimit) {
    label = `Daily ${atLimit} limit reached`; detail = `Checks can resume after local midnight while the app runs.${next && next.getTime() > now.getTime() ? ` Next check: ${next.toLocaleString()}.` : ''}`;
  } else {
    label = 'Preparation on'; detail = `${nextLabel} The app must be running and your Mac awake.`;
  }
  return { label, detail, checks, checkLimit, recordings, recordingLimit: workflow.maxNewsClipsPerDay, atLimit };
}
