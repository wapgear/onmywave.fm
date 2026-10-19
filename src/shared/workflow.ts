export type WorkflowDraft = {
  newsInterests?: string;
  newsEnabled?: boolean;
  nextNewsCheckAt?: string;
  newsWorkflowError?: string;
  newsAssessmentDate?: string;
  newsAssessmentsToday?: number;
  newsClipDate?: string;
  newsClipsToday?: number;
  newsLastRun?: {
    requestId: string;
    startedAt: string;
    finishedAt?: string;
    outcome: 'running' | 'prepared' | 'no-news' | 'partial-coverage' | 'failed' | 'interrupted';
    message?: string;
    roomName?: string;
    setupChanged?: boolean;
  };
  newsWorkflowPaused?: boolean;
  everyHours: 1 | 3 | 6;
  importance: 'major' | 'relevant';
  maxNewsClipsPerDay: number;
  morning: {
    includeWeather: boolean;
    city: string;
    localTime: string;
    timeZone: string;
    units: 'celsius' | 'fahrenheit';
  };
};

export function defaultWorkflowDraft(): WorkflowDraft {
  return {
    newsEnabled: false,
    everyHours: 3,
    importance: 'major',
    maxNewsClipsPerDay: 3,
    morning: {
      includeWeather: false,
      city: '',
      localTime: '08:00',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      units: 'celsius',
    },
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const validCity = (value: unknown): value is string => typeof value === 'string' && value.length <= 256;

function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 128) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isWorkflowDraft(value: unknown): value is WorkflowDraft {
  if (
    !record(value) ||
    (value.newsInterests !== undefined &&
      (typeof value.newsInterests !== 'string' || value.newsInterests.length > 4000)) ||
    (value.newsEnabled !== undefined && typeof value.newsEnabled !== 'boolean') ||
    (value.nextNewsCheckAt !== undefined &&
      (typeof value.nextNewsCheckAt !== 'string' || !Number.isFinite(Date.parse(value.nextNewsCheckAt)))) ||
    (value.newsWorkflowError !== undefined &&
      value.newsWorkflowError !== null &&
      (typeof value.newsWorkflowError !== 'string' || value.newsWorkflowError.length > 2000)) ||
    (value.newsAssessmentDate !== undefined &&
      (typeof value.newsAssessmentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.newsAssessmentDate))) ||
    (value.newsAssessmentsToday !== undefined &&
      (!Number.isInteger(value.newsAssessmentsToday) ||
        (value.newsAssessmentsToday as number) < 0 ||
        (value.newsAssessmentsToday as number) > 24)) ||
    (value.newsClipDate !== undefined &&
      (typeof value.newsClipDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.newsClipDate))) ||
    (value.newsClipsToday !== undefined &&
      (!Number.isInteger(value.newsClipsToday) ||
        (value.newsClipsToday as number) < 0 ||
        (value.newsClipsToday as number) > 10)) ||
    (value.newsWorkflowPaused !== undefined && typeof value.newsWorkflowPaused !== 'boolean') ||
    (value.newsLastRun !== undefined &&
      (!record(value.newsLastRun) ||
        typeof value.newsLastRun.requestId !== 'string' ||
        !/^[a-zA-Z0-9-]{1,128}$/.test(value.newsLastRun.requestId) ||
        typeof value.newsLastRun.startedAt !== 'string' ||
        !Number.isFinite(Date.parse(value.newsLastRun.startedAt)) ||
        (value.newsLastRun.finishedAt !== undefined &&
          (typeof value.newsLastRun.finishedAt !== 'string' ||
            !Number.isFinite(Date.parse(value.newsLastRun.finishedAt)))) ||
        !['running', 'prepared', 'no-news', 'partial-coverage', 'failed', 'interrupted'].includes(
          String(value.newsLastRun.outcome),
        ) ||
        (value.newsLastRun.message !== undefined &&
          (typeof value.newsLastRun.message !== 'string' || value.newsLastRun.message.length > 2000)) ||
        (value.newsLastRun.roomName !== undefined &&
          (typeof value.newsLastRun.roomName !== 'string' || value.newsLastRun.roomName.length > 80)) ||
        (value.newsLastRun.setupChanged !== undefined && typeof value.newsLastRun.setupChanged !== 'boolean'))) ||
    ![1, 3, 6].includes(value.everyHours as number) ||
    !['major', 'relevant'].includes(String(value.importance)) ||
    !Number.isInteger(value.maxNewsClipsPerDay) ||
    (value.maxNewsClipsPerDay as number) < 1 ||
    (value.maxNewsClipsPerDay as number) > 10 ||
    !record(value.morning)
  )
    return false;
  const morning = value.morning;
  return (
    typeof morning.includeWeather === 'boolean' &&
    validCity(morning.city) &&
    (!morning.includeWeather || Boolean(morning.city.trim())) &&
    typeof morning.localTime === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(morning.localTime) &&
    validTimeZone(morning.timeZone) &&
    ['celsius', 'fahrenheit'].includes(String(morning.units))
  );
}

export function normalizeWorkflowDraft(value: unknown): WorkflowDraft {
  if (!isWorkflowDraft(value)) return defaultWorkflowDraft();
  return {
    ...(value.newsInterests !== undefined ? { newsInterests: value.newsInterests.trim() } : {}),
    newsEnabled: value.newsEnabled ?? false,
    ...(value.nextNewsCheckAt !== undefined ? { nextNewsCheckAt: value.nextNewsCheckAt } : {}),
    ...(typeof value.newsWorkflowError === 'string' ? { newsWorkflowError: value.newsWorkflowError } : {}),
    ...(value.newsAssessmentDate !== undefined ? { newsAssessmentDate: value.newsAssessmentDate } : {}),
    ...(value.newsAssessmentsToday !== undefined ? { newsAssessmentsToday: value.newsAssessmentsToday } : {}),
    ...(value.newsClipDate !== undefined ? { newsClipDate: value.newsClipDate } : {}),
    ...(value.newsClipsToday !== undefined ? { newsClipsToday: value.newsClipsToday } : {}),
    ...(value.newsLastRun !== undefined
      ? { newsLastRun: { ...value.newsLastRun } as WorkflowDraft['newsLastRun'] }
      : {}),
    ...(value.newsWorkflowPaused ? { newsWorkflowPaused: true } : {}),
    everyHours: value.everyHours,
    importance: value.importance,
    maxNewsClipsPerDay: value.maxNewsClipsPerDay,
    morning: {
      includeWeather: value.morning.includeWeather,
      city: value.morning.city.trim(),
      localTime: value.morning.localTime,
      timeZone: value.morning.timeZone,
      units: value.morning.units,
    },
  };
}
