import type { PreparedNewsTake } from '../shared/types';

export type PlaybackView = {
  configKey: string;
  pending: PreparedNewsTake | null;
  preparing: boolean;
  placing: boolean;
  waiting: boolean;
  failure: string | null;
  baseline: number;
  retryPhase: 'queued' | 'checking' | 'ready' | 'empty' | null;
  retryMessage: string | null;
};
