import type { RoomProfile } from './types';
import { MAX_DAILY_NEWS_RECORDINGS } from './workflow';

export function preparationHistoryMessage(message: string | undefined) {
  return message?.replace(
    / Review News settings before (?:explicitly resuming preparation|resuming automatic preparation)\.$/,
    '',
  );
}

/** Counts are scheduled attempts, not provider invoices or successful assessments. */
export function newsPreparationStatus(profile: RoomProfile, now = new Date()) {
  const workflow = profile.workflowDraft;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const checks = workflow.newsAssessmentDate === day ? (workflow.newsAssessmentsToday ?? 0) : 0;
  const recordings = workflow.newsClipDate === day ? (workflow.newsClipsToday ?? 0) : 0;
  const checkLimit = Math.ceil(24 / workflow.everyHours);
  const recordingLimitReached = recordings >= workflow.maxNewsClipsPerDay;
  const checkLimitReached = checks >= checkLimit;
  const next = workflow.nextNewsCheckAt ? new Date(workflow.nextNewsCheckAt) : null;
  const nextLabel = next
    ? next.getTime() > now.getTime()
      ? `Next check: ${next.toLocaleString()}.`
      : 'A check is due. Waiting for the local runner.'
    : workflow.newsLastRun
      ? 'Next check pending.'
      : 'First check pending.';
  let label: string;
  let detail: string;
  let atLimit = false;
  let limitAction: { field: 'recording' | 'check'; label: string } | undefined;
  if (!profile.enabled) {
    label = 'Room unavailable';
    detail = 'Make this room available in its advanced options to prepare or play news automatically.';
  } else if (workflow.newsEnabled === undefined) {
    label = 'Starts after saving';
    detail = 'Finish and save this room’s setup to start automatic checks.';
  } else if (!workflow.newsEnabled) {
    label = 'Preparation off';
    detail = 'Saved recordings remain available. Enable news preparation in News settings.';
  } else if (workflow.newsWorkflowError || workflow.newsWorkflowPaused) {
    label = 'Preparation paused';
    detail = `${workflow.newsWorkflowError || (workflow.newsLastRun?.outcome === 'interrupted' ? 'The last check was interrupted.' : 'Automatic preparation is paused.')} Preparation stays paused until you resume it in News settings.`;
  } else if (workflow.newsLastRun?.outcome === 'running') {
    label = 'Preparing news';
    detail = 'Checking sources and preparing any qualifying story. Music keeps playing.';
  } else if (recordingLimitReached || checkLimitReached) {
    atLimit = true;
    label =
      recordingLimitReached && checkLimitReached
        ? 'Daily recording and check limits reached'
        : recordingLimitReached
          ? 'Daily recording limit reached'
          : 'Daily check limit reached';
    detail = 'Preparation stays on. Checks can continue automatically after local midnight.';
    if (recordings < MAX_DAILY_NEWS_RECORDINGS && checks < 24) {
      limitAction = recordingLimitReached
        ? { field: 'recording', label: checkLimitReached ? 'Review daily limits' : 'Increase recording limit' }
        : { field: 'check', label: 'Check sources more often' };
    }
  } else {
    label = 'Preparation on';
    const lastOutcome = workflow.newsLastRun?.outcome;
    const previousCheck =
      lastOutcome === 'partial-coverage'
        ? 'The last check had incomplete source coverage. '
        : lastOutcome === 'failed'
          ? 'The last check failed. '
          : lastOutcome === 'interrupted'
            ? 'The last check was interrupted. '
            : '';
    detail = `${previousCheck}${nextLabel} The app must be running and your Mac awake.`;
  }
  return {
    label,
    detail,
    checks,
    checkLimit,
    recordings,
    recordingLimit: workflow.maxNewsClipsPerDay,
    atLimit,
    limitAction,
  };
}
