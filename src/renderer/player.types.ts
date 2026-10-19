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
  position: number;
  duration: number;
  error: string | null;
  volume: number;
  shuffle: boolean;
  repeat: PlaybackSnapshot['repeat'];
  canRetry: boolean;
  completedSongs: number;
  optionsError: string | null;
  optionsRevision: number;
  retryOptions(): Promise<OptionsSaveSettlement>;
  getOptionsSaveGeneration(): number;
  play(songs: Song[], index?: number): void;
  playQueueEntry(key: string, historyIndex?: number): void;
  enqueue(songs: Song[]): void;
  musicCommandRevision: number;
  getMusicCommandRevision(): number;
  pauseForPreview(): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  setVolume(value: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  removeQueue(key: string): void;
  retry(): Promise<PlaybackRetrySettlement>;
  getPlaybackGeneration(): number;
  getResumeGeneration(): number;
  newsPhase: 'idle' | NewsPhase | 'paused';
  activeNewsId?: string;
  newsRunId?: number;
  newsNotice: string | null;
  newsLoading: boolean;
  activeNews?: NewsBreak;
  lastNews: HeardNews | null;
  scheduleNews(news: NewsBreak, duckVolume: number, claimId?: string): Promise<void>;
  stopNews(): void;
  controlNews(runId: number, action: 'toggle' | 'stop'): boolean;
};

export type HeardNews = { news: NewsBreak; startedAt: string; status: 'playing' | 'completed' | 'interrupted' };

export type NewsPhase = 'waiting' | 'fading' | 'lead-in' | 'speaking' | 'tail';

export type QueueEntry = { key: string; song: Song; historyIndex?: number };
