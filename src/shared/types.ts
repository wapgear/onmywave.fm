import type { DJPlaybackSettings, DJPlaybackSettingsPatch } from './dj-playback';
import type { UpdateStatus } from './update';
import type { WorkflowDraft } from './workflow';

export const NEWS_TEXT_MODEL = 'gpt-6-luna';

export type { DJPlaybackSettings, DJPlaybackSettingsPatch } from './dj-playback';

export type { WorkflowDraft } from './workflow';

export type ApiError = {
  code:
    | 'offline'
    | 'timeout'
    | 'unauthorized'
    | 'forbidden'
    | 'not-found'
    | 'unsupported'
    | 'invalid'
    | 'server'
    | 'uncertain-write'
    | 'no-news'
    | 'partial-coverage';
  message: string;
  authRevision?: number;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export type Page<T> = { items: T[]; total: number; start: number };

export type Connection = {
  id: string;
  authRevision: number;
  serverUrl: string;
  serverVersion: string;
  userName: string;
  selectedLibraryIds: string[];
  sessionOnly: boolean;
};

export type LibraryFilters = { genres: string[]; tags: string[] };

export type Library = { id: string; name: string };

export type Song = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  albumId?: string;
  albumArtist?: string;
  duration: number;
  year?: number;
  genres: string[];
  tags: string[];
  trackNumber?: number;
  discNumber?: number;
  imageUrl?: string;
  container?: string;
  codec?: string;
  bitRate?: number;
  sampleRate?: number;
  size?: number;
};

// Synced lines have monotonic start times in seconds on the song's playback clock.
export type SongLyrics = { lines: { text: string; start?: number }[]; synced: boolean };

export type Album = { id: string; name: string; artist: string; year?: number; imageUrl?: string; songCount?: number };

export type CatalogQuery = {
  start?: number;
  limit?: number;
  search?: string;
  genre?: string;
  tag?: string;
  sort?: 'name' | 'artist' | 'album' | 'year' | 'dateAdded';
  descending?: boolean;
};

export type CatalogRequest = CatalogQuery & { requestId?: string };

export type Playlist = {
  id: string;
  name: string;
  imageUrl?: string;
  songCount?: number;
  recoveryStatus?: 'pending' | 'review' | 'unavailable';
};

export type PlaylistEntry = { entryId: string; song: Song };

export type PlaylistEditRecovery =
  | { status: 'pending' | 'review'; markerId: string; receipt?: string }
  | { status: 'unavailable' };

export type PlaylistLibrary = { items: Playlist[]; creationRecovery?: PlaylistEditRecovery };

export type PlaylistDetail = Playlist & {
  canEdit: boolean | null;
  restriction?: string;
  entries: PlaylistEntry[];
  editRecovery?: PlaylistEditRecovery;
};

export type DJ = {
  avatar?: import('./dj-avatar').DJAvatarChoice;
  id: string;
  name: string;
  description: string;
  instructions: string;
  musicPreferences: string;
  exclusions: string;
  language: string;
  personality: string;
  speakingFrequency: 'never' | 'occasionally' | 'often';
  news?: NewsSettings;
};

export type NewsSettings = {
  feedUrls: string[];
  interests: string;
  minStories: number;
  maxStories: number;
  voice: string;
  textModel: string;
  speechEngine: 'openai-tts' | 'gpt-live-1' | 'elevenlabs-v4';
  elevenVoiceId?: string;
  elevenTags?: string;
  duckVolume: number;
};

export type NewsTransitionSettings = {
  mode: 'over-music' | 'between-songs';
  fadeOutSeconds: number;
  leadInSeconds: number;
  postSpeechSeconds: number;
  fadeInSeconds: number;
};

export type NewsArticle = { id: string; title: string; url: string; source: string; publishedAt?: string };

export type ReviewedNewsArticle = NewsArticle & {
  canonicalUrl: string;
  requestId: string;
  reviewedAt: string;
  status: 'submitted' | 'reviewed' | 'interrupted';
  outcome?: 'selected' | 'not-selected';
};

export type NewsScript = { requestId: string; script: string; articles: NewsArticle[]; warnings: string[] };

export type NewsBreak = NewsScript & {
  id: string;
  audioUrl: string;
  engine: NewsSettings['speechEngine'];
  createdAt: string;
};

export type DJVoicePreview = {
  audioUrl: string | null;
  createdAt: string | null;
  available: boolean;
  stale: boolean;
  attempted: boolean;
};

export type DJVoice = { id: string; name: string; description: string };

export type DJVoiceSearch = { prompt: string; gender: 'any' | 'male' | 'female' };

export type NewsRecoveryStatus = { phase: 'recovering' | 'ready' | 'unavailable' };

export type AiStatus = { configured: boolean; sessionOnly: boolean };

export type NewsProgress = {
  requestId: string;
  phase: 'feeds' | 'writing' | 'speech' | 'live-recording';
  message: string;
  transcript?: string;
};

export type PlaybackSnapshot = {
  shufflePlan?: import('./shuffle-queue').ShuffleSnapshot;
  connectionId: string;
  trackIds: string[];
  currentIndex: number;
  position: number;
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  outputId?: string;
};

export type PlaybackPreferences = Pick<PlaybackSnapshot, 'volume' | 'shuffle' | 'repeat'>;

export type NewsSource = {
  id: string;
  name: string;
  url: string;
  kind?: 'rss' | 'twitter' | 'hacker-news';
  query?: string;
};

export type ListeningRoom = { djId: string | null; sourceIds: string[] };

export type RoomProfile = {
  enabled: boolean;
  id: string;
  name: string;
  room: ListeningRoom;
  mood: string;
  workflowDraft: WorkflowDraft;
};

export type PreparedNewsProvenance = {
  dj: DJ;
  mood: string;
  sources: NewsSource[];
  newsInterests?: string;
  roomId?: string;
  roomName?: string;
};

export type PreparedNewsScript = NewsScript & { id: string; createdAt: string; provenance: PreparedNewsProvenance };

export type PreparedNewsTake = NewsBreak & {
  recordedAt?: string;
  signature: string;
  provenance: PreparedNewsProvenance;
  renderingDJ: DJ;
  available: boolean;
  byteLength: number;
  model: string;
  voice: string;
  delivery: string;
  scriptId: string;
  deliveryState?: {
    status: 'ready' | 'claimed' | 'started' | 'played';
    claimId?: string;
    claimedAt?: string;
    startedAt?: string;
    playedAt?: string;
  };
};

export type PreparedNewsOrigin = {
  kind: 'manual' | 'automatic';
  startedAt: string;
  profileId?: string;
  profileName?: string;
};

export type PreparedNewsRequest = {
  origin?: PreparedNewsOrigin;
  requestId: string;
  kind: 'script' | 'audio';
  inputHash: string;
  status: 'running' | 'complete' | 'failed' | 'interrupted' | 'skipped' | 'partial-coverage';
  artifactId?: string;
  error?: string;
};

export type PreparedNewsClaim = { id: string; claimId: string };

export type PreparedNewsLibrary = {
  preparationErrorVersion?: 1;
  scripts: PreparedNewsScript[];
  takes: PreparedNewsTake[];
  selectedTakeId: string | null;
  requests: PreparedNewsRequest[];
  reviewedArticles: ReviewedNewsArticle[];
};

export type LocalState = {
  preparationErrorVersion?: 1;
  djPlayback: DJPlaybackSettings;
  roomProfiles: RoomProfile[];
  activeRoomProfileId: string;
  newsTransitions: NewsTransitionSettings;
  djs: DJ[];
  playback: PlaybackSnapshot | null;
  playbackPreferences: Record<string, PlaybackPreferences>;
  sources: NewsSource[];
};

export type LocalStateSnapshot = LocalState & { revision: number };

export type PlaybackResource = { url: string; offsetSeconds: number; transcoded: boolean };

export interface WaveApi {
  getUpdateStatus(): Promise<Result<UpdateStatus>>;
  checkForUpdates(): Promise<Result<UpdateStatus>>;
  downloadUpdate(): Promise<Result<UpdateStatus>>;
  installUpdate(): Promise<Result<UpdateStatus>>;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
  getNewsRecoveryStatus(): Promise<Result<NewsRecoveryStatus>>;
  retryNewsRecovery(): Promise<Result<NewsRecoveryStatus>>;
  getConnection(): Promise<Result<Connection | null>>;
  connect(input: { serverUrl: string; username: string; password: string }): Promise<Result<Connection>>;
  disconnect(): Promise<Result<void>>;
  libraries(): Promise<Result<Library[]>>;
  libraryFilters(): Promise<Result<LibraryFilters>>;
  selectLibraries(ids: string[]): Promise<Result<Connection>>;
  songs(this: void, query: CatalogRequest): Promise<Result<Page<Song>>>;
  albums(this: void, query: CatalogRequest): Promise<Result<Page<Album>>>;
  cancelCatalog(requestId: string): Promise<Result<void>>;
  album(id: string): Promise<Result<Album>>;
  albumTracks(id: string): Promise<Result<Song[]>>;
  song(id: string): Promise<Result<Song>>;
  lyrics(id: string): Promise<Result<SongLyrics>>;
  playlists(): Promise<Result<PlaylistLibrary>>;
  playlistPermission(id: string): Promise<Result<boolean | null>>;
  playlist(id: string): Promise<Result<PlaylistDetail>>;
  acknowledgePlaylistRecovery(input: { id: string; markerId: string; receipt: string }): Promise<Result<void>>;
  acknowledgePlaylistCreation(input: { markerId: string; receipt: string }): Promise<Result<void>>;
  createPlaylist(input: { name: string; trackIds: string[] }): Promise<Result<{ id: string }>>;
  renamePlaylist(input: { id: string; name: string }): Promise<Result<void>>;
  addPlaylistItems(input: { id: string; trackIds: string[]; skipExisting: boolean }): Promise<Result<void>>;
  removePlaylistEntries(input: { id: string; entryIds: string[] }): Promise<Result<void>>;
  movePlaylistEntry(input: { id: string; entryId: string; index: number }): Promise<Result<void>>;
  preparePlayback(input: {
    id: string;
    transcode?: boolean;
    offsetSeconds?: number;
  }): Promise<Result<PlaybackResource>>;
  getLocalState(): Promise<Result<LocalStateSnapshot>>;
  saveDjs(djs: DJ[]): Promise<Result<LocalStateSnapshot>>;
  onPlaybackCheckpointRequest(callback: (requestId: string) => void): () => void;
  flushPlaybackCheckpoint(input: { requestId: string; snapshot: PlaybackSnapshot | null }): Promise<Result<boolean>>;
  searchDJVoices(input: DJVoiceSearch): Promise<Result<DJVoice[]>>;
  saveNewsTransitions(settings: NewsTransitionSettings): Promise<Result<LocalStateSnapshot>>;
  savePlayback(snapshot: PlaybackSnapshot | null): Promise<Result<void>>;
  getPlaybackPreferences(connectionId: string): Promise<Result<PlaybackPreferences | null>>;
  savePlaybackPreferences(input: {
    connectionId: string;
    options: Partial<PlaybackPreferences>;
  }): Promise<Result<boolean>>;
  saveWorkflowDraft(input: {
    expectedProfileId: string;
    workflowDraft: WorkflowDraft;
    room: ListeningRoom;
    mood: string;
    resumePreparation?: boolean;
  }): Promise<Result<LocalStateSnapshot>>;
  disableNewsPreparation(roomId: string): Promise<Result<LocalStateSnapshot>>;
  saveRoomProfile(input: {
    name: string;
    room: ListeningRoom;
    mood: string;
    workflowDraft: WorkflowDraft;
  }): Promise<Result<LocalStateSnapshot>>;
  activateRoomProfile(id: string): Promise<Result<LocalStateSnapshot>>;
  renameRoomProfile(input: { id: string; name: string }): Promise<Result<void>>;
  deleteRoomProfile(id: string): Promise<Result<void>>;
  saveNewsSources(sources: NewsSource[]): Promise<Result<LocalStateSnapshot>>;
  setRoomProfileEnabled(input: { id: string; enabled: boolean }): Promise<Result<LocalStateSnapshot>>;
  saveDJPlayback(settings: DJPlaybackSettingsPatch): Promise<Result<LocalStateSnapshot>>;
  nextRoomNews(input: { roomId: string; excludedIds: string[] }): Promise<Result<PreparedNewsTake | null>>;
  claimPreparedNews(input: { id: string; claimId?: string }): Promise<Result<PreparedNewsTake>>;
  startPreparedNews(input: PreparedNewsClaim): Promise<Result<void>>;
  releasePreparedNews(input: PreparedNewsClaim & { neverPlayInvoked?: boolean }): Promise<Result<void>>;
  markPreparedNewsPlayed(input: PreparedNewsClaim): Promise<Result<void>>;
  getPreparedNews(): Promise<Result<PreparedNewsLibrary>>;
  cancelPreparedNews(requestId: string): Promise<Result<void>>;
  getVoicePreview(voiceId: string): Promise<Result<DJVoicePreview>>;
  prepareVoicePreview(input: { voiceId: string; regenerate?: boolean }): Promise<Result<DJVoicePreview>>;
  getDJVoicePreview(djId: string): Promise<Result<DJVoicePreview>>;
  prepareDJVoicePreview(input: { djId: string; regenerate?: boolean }): Promise<Result<DJVoicePreview>>;
  getAiStatus(): Promise<Result<AiStatus>>;
  getTwitterStatus(): Promise<Result<AiStatus>>;
  setTwitterKey(key: string | null): Promise<Result<AiStatus>>;
  getElevenLabsStatus(): Promise<Result<AiStatus>>;
  setElevenLabsKey(key: string | null): Promise<Result<AiStatus>>;
  setOpenAiKey(key: string | null): Promise<Result<AiStatus>>;
  onNewsProgress(callback: (progress: NewsProgress) => void): () => void;
  openSource(url: string): Promise<Result<void>>;
}
