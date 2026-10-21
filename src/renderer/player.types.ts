import type { NewsTransitionSettings } from '../shared/news-transitions';
import type { NewsBreak, PlaybackSnapshot, Song } from '../shared/types';


export type ScheduledNews = {
  token: number;
  key: string;
  duration: number;
  bed: number;
  phase: NewsPhase;
  trackEnded: boolean;
  settings: NewsTransitionSettings;
  elapsed: number;
  lastTick: number;
  startLevel: number;
  speechAttempt: number;
  starting: boolean;
  prepareSpeech(): Promise<void>;
  playSpeech(): Promise<void>;
  cancelDelivery(): void;
};

export type PlaybackRetrySettlement = {
  key?: string;
  generation: number;
  commandRevision: number;
  kind: 'track' | 'restore';
  outcome: 'success' | 'failure' | 'superseded';
};

export type OptionsSaveSettlement = { generation: number; outcome: 'success' | 'failure' | 'superseded' };

export type PlayerState = {
  queue: QueueEntry[];
  upcomingQueue: QueueEntry[];
  shuffleHistoryQueue: QueueEntry[];
  shuffleRemaining: number;
  current?: Song;
  currentKey?: string;
  playing: boolean;
  requestedPlaying: boolean;
  busy: boolean;
  duration: number;
  error: string | null;
  volume: number;
  shuffle: boolean;
  repeat: PlaybackSnapshot['repeat'];
  canRetry: boolean;
  completedSongs: number;
  optionsError: string | null;
  optionsRevision: number;
  retryOptions(this: void): Promise<OptionsSaveSettlement>;
  getOptionsSaveGeneration(this: void): number;
  play(this: void, songs: Song[], index?: number): void;
  playQueueEntry(this: void, key: string, historyIndex?: number): void;
  enqueue(this: void, songs: Song[]): void;
  musicCommandRevision: number;
  getMusicCommandRevision(this: void): number;
  pauseForPreview(this: void): void;
  toggle(this: void): void;
  next(this: void): void;
  previous(this: void): void;
  seek(this: void, seconds: number): void;
  setVolume(this: void, value: number): void;
  toggleShuffle(this: void): void;
  cycleRepeat(this: void): void;
  removeQueue(this: void, key: string): void;
  retry(this: void): Promise<PlaybackRetrySettlement>;
  getPlaybackGeneration(this: void): number;
  getResumeGeneration(this: void): number;
  newsPhase: 'idle' | NewsPhase | 'paused';
  activeNewsId?: string;
  newsRunId?: number;
  newsNotice: string | null;
  newsLoading: boolean;
  activeNews?: NewsBreak;
  lastNews: HeardNews | null;
  scheduleNews(this: void, news: NewsBreak, duckVolume: number, claimId?: string): Promise<void>;
  stopNews(this: void): void;
  controlNews(this: void, runId: number, action: 'toggle' | 'stop'): boolean;
};

export type PositionStore = {
  getSnapshot: () => number;
  publish: (position: number) => void;
  subscribe: (listener: () => void) => () => void;
};

export type HeardNews = { news: NewsBreak; startedAt: string; status: 'playing' | 'completed' | 'interrupted' };

export type NewsPhase = 'waiting' | 'fading' | 'lead-in' | 'speaking' | 'tail';

export type QueueEntry = { key: string; song: Song; historyIndex?: number };
