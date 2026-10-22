import { editablePlaylistEntryIds, playlistEntryIdentity } from '../shared/playlist-entries';
import type {
  Album,
  ApiError,
  CatalogQuery,
  Connection,
  Library,
  LibraryFilters,
  Page,
  Playlist,
  PlaylistDetail,
  PlaylistEntry,
  Song,
  SongLyrics,
} from '../shared/types';

export class ServiceError extends Error {
  constructor(
    public code: ApiError['code'],
    message: string,
  ) {
    super(message);
  }
}

export type Session = {
  serverUrl: string;
  token: string;
  userId: string;
  userName: string;
  serverVersion: string;
  selectedLibraryIds: string[];
  sessionOnly: boolean;
};

type AudioStream = { Type?: string; Index?: number; Codec?: string; BitRate?: number; SampleRate?: number };

type Item = {
  Id: string;
  Name?: string;
  Type?: string;
  CollectionType?: string;
  MediaType?: string;
  Album?: string;
  AlbumId?: string;
  AlbumPrimaryImageTag?: string;
  AlbumArtist?: string;
  Artists?: string[];
  DateCreated?: string;
  RunTimeTicks?: number;
  ProductionYear?: number;
  Genres?: string[];
  Tags?: string[];
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ChildCount?: number;
  SortName?: string;
  Container?: string;
  MediaStreams?: AudioStream[];
  MediaSources?: {
    Container?: string;
    Size?: number;
    Bitrate?: number;
    DefaultAudioStreamIndex?: number;
    MediaStreams?: AudioStream[];
  }[];
  ImageTags?: Record<string, string>;
  PlaylistItemId?: string;
  Items?: Item[];
  TotalRecordCount?: number;
  CanEdit?: boolean;
  AccessToken?: string;
  User?: { Id: string; Name?: string };
  Version?: string;
};

export const PLAYLIST_CREATION = 'playlist-creation';

type Deps = {
  deviceId: string;
  imageUrl: (id: string, tag?: string) => string;
  onConnectionChanged?: () => void;
  persistConnection?: (session: Session | null, commit: (write: () => boolean) => boolean) => Promise<void>;
  playlistWrite?: (
    session: Session,
    id: string,
    reserve: boolean,
    operation: () => Promise<void>,
    canStart: () => boolean,
  ) => Promise<void>;
};

const fields = 'Genres,Tags,MediaSources,MediaStreams,DateCreated,Overview,SortName,ParentId';

const itemIdentity = (id: string) => id.replaceAll('-', '').toLowerCase();

const validId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value))
    throw new ServiceError('invalid', 'Invalid library item.');
  return value;
};

const ids = (values: unknown): string[] => {
  if (!Array.isArray(values) || values.length > 100000) throw new ServiceError('invalid', 'Invalid item selection.');
  return values.map(validId);
};

const playlistEntryId = (value: unknown): string => {
  if (typeof value !== 'string' || playlistEntryIdentity(value) === null)
    throw new ServiceError('invalid', 'Invalid playlist entry.');
  return value;
};

const name = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new ServiceError('invalid', 'Enter a name of up to 256 characters.');
  return value.trim();
};

const serverAddress = (value: string): string => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error();
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new ServiceError('invalid', 'Enter an HTTP or HTTPS Jellyfin server address.');
  }
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

class CatalogLimiter {
  private active = 0;
  private waiting: Array<{ ready: () => void; signal: AbortSignal }> = [];
  async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw new DOMException('Catalog request cancelled.', 'AbortError');
    let acquired = false;
    if (this.active >= 4) {
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal.removeEventListener('abort', aborted);
          this.active++;
          acquired = true;
          resolve();
        };
        const aborted = () => {
          this.waiting = this.waiting.filter((item) => item.ready !== ready);
          reject(new DOMException('Catalog request cancelled.', 'AbortError'));
        };
        this.waiting.push({ ready, signal });
        signal.addEventListener('abort', aborted, { once: true });
      });
    } else {
      this.active++;
      acquired = true;
    }
    if (signal.aborted) {
      if (acquired) this.release();
      throw new DOMException('Catalog request cancelled.', 'AbortError');
    }
    try {
      return await work();
    } finally {
      this.release();
    }
  }
  private release(): void {
    this.active--;
    while (this.waiting.length) {
      const next = this.waiting.shift()!;
      if (!next.signal.aborted) {
        next.ready();
        break;
      }
    }
  }
}

const catalogLimiter = new CatalogLimiter();

const catalogCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

type CatalogLoad = {
  session: Session;
  controller: AbortController;
  promise: Promise<Page<Item>>;
  subscribers: number;
  settled: boolean;
};

export class JellyfinService {
  private session: Session | null = null;
  private authRevision = 0;
  private connectionIntent = 0;
  private sessionRevision = 0;
  private connectionWrites = Promise.resolve();
  private writes = new Map<string, Promise<unknown>>();
  private catalogSnapshots = new Map<string, { session: Session; items: Item[] }>();
  private catalogLoads = new Map<string, CatalogLoad>();
  private lyricsRequest: AbortController | null = null;
  private catalogControllers = new Set<AbortController>();
  constructor(private deps: Deps) {}
  cancelCatalogLoads(): void {
    for (const load of this.catalogLoads.values()) load.controller.abort();
    for (const controller of this.catalogControllers) controller.abort();
    this.catalogLoads.clear();
  }
  private async waitForCatalogLoad(key: string, load: CatalogLoad, signal: AbortSignal): Promise<Page<Item>> {
    if (signal.aborted) throw new DOMException('Catalog request cancelled.', 'AbortError');
    load.subscribers++;
    let onAbort: (() => void) | undefined;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      load.subscribers--;
      if (!load.subscribers && !load.settled && this.catalogLoads.get(key) === load) {
        this.catalogLoads.delete(key);
        load.controller.abort();
      }
    };
    const aborted = () => {
      release();
      rejectAbort();
    };
    let rejectAbort = () => {};
    try {
      return await Promise.race([
        load.promise,
        new Promise<never>((_, reject) => {
          rejectAbort = () => reject(new DOMException('Catalog request cancelled.', 'AbortError'));
          onAbort = aborted;
          signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort);
      release();
    }
  }
  private trackCatalogLoad(key: string, load: CatalogLoad): void {
    this.catalogLoads.set(key, load);
    void load.promise
      .then(
        (page) => {
          load.settled = true;
          if (this.catalogLoads.get(key) === load && this.session === load.session) {
            this.catalogSnapshots.delete(key);
            this.catalogSnapshots.set(key, { session: load.session, items: page.items });
            if (this.catalogSnapshots.size > 2)
              this.catalogSnapshots.delete(this.catalogSnapshots.keys().next().value!);
          }
        },
        () => {
          load.settled = true;
        },
      )
      .finally(() => {
        if (this.catalogLoads.get(key) === load) this.catalogLoads.delete(key);
      });
  }
  connection(): Connection | null {
    const s = this.session;
    return s
      ? {
          authRevision: this.authRevision,
          id: `${s.serverUrl}|${s.userId}`,
          serverUrl: s.serverUrl,
          serverVersion: s.serverVersion,
          userName: s.userName,
          selectedLibraryIds: [...s.selectedLibraryIds],
          sessionOnly: s.sessionOnly,
        }
      : null;
  }
  exportSession(): Session | null {
    return this.session ? { ...this.session, selectedLibraryIds: [...this.session.selectedLibraryIds] } : null;
  }
  cancelPendingSignIns(): void {
    ++this.connectionIntent;
  }
  restore(session: Session | null): void {
    const restored = session
      ? {
          ...session,
          serverUrl: serverAddress(session.serverUrl),
          userId: validId(session.userId),
          selectedLibraryIds: ids(session.selectedLibraryIds),
        }
      : null;
    ++this.connectionIntent;
    this.lyricsRequest?.abort();
    this.cancelCatalogLoads();
    this.session = restored;
    ++this.authRevision;
    this.catalogSnapshots.clear();
    ++this.sessionRevision;
    this.deps.onConnectionChanged?.();
  }
  private async persistSession(candidate: Session | null, notify: boolean, intent?: number): Promise<void> {
    const revision = ++this.sessionRevision;
    const snapshot = candidate ? { ...candidate, selectedLibraryIds: [...candidate.selectedLibraryIds] } : null;
    const current = () =>
      revision === this.sessionRevision && (intent === undefined || intent === this.connectionIntent);
    const superseded = () =>
      new ServiceError('invalid', 'A newer account change replaced this request. Try again if needed.');
    const write = this.connectionWrites.then(async () => {
      if (!current()) throw superseded();
      let committed = false;
      const commit = (publish: () => boolean) => {
        if (!current()) throw superseded();
        const saved = publish();
        this.lyricsRequest?.abort();
        this.cancelCatalogLoads();
        this.session = snapshot ? { ...snapshot, sessionOnly: !saved } : null;
        this.catalogSnapshots.clear();
        committed = true;
        if (notify) {
          ++this.authRevision;
          this.deps.onConnectionChanged?.();
        }
        return saved;
      };
      try {
        if (this.deps.persistConnection) await this.deps.persistConnection(snapshot, commit);
        else commit(() => !snapshot?.sessionOnly);
      } catch (error) {
        if (!committed) throw error;
      }
      if (!committed) throw new ServiceError('server', 'The connection could not be saved. Try again.');
    });
    this.connectionWrites = write.catch(() => {});
    await write;
    if (!current()) throw superseded();
  }
  private requireSession(): Session {
    if (!this.session) throw new ServiceError('unauthorized', 'Sign in to Jellyfin.');
    return this.session;
  }
  private async readCurrentSession<T>(operation: () => Promise<T>): Promise<T> {
    const session = this.requireSession();
    const ensureCurrent = () => {
      if (this.session !== session) throw new ServiceError('invalid', 'The connection changed. Refresh your library.');
    };
    try {
      const result = await operation();
      ensureCurrent();
      return result;
    } catch (error) {
      ensureCurrent();
      throw error;
    }
  }
  private async request<T>(
    base: string,
    path: string,
    init: RequestInit,
    token: string | undefined,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
      throw new ServiceError('invalid', 'Invalid server request.');
    const target = new URL(base + path);
    if (target.origin !== new URL(base).origin) throw new ServiceError('invalid', 'Invalid server request.');
    const headers = new Headers(init.headers);
    headers.set(
      'Authorization',
      `MediaBrowser Client="onmywave.fm", Device="Mac", DeviceId="${this.deps.deviceId.replace(/[^a-zA-Z0-9-]/g, '')}", Version="0.1.0"${token ? `, Token="${token}"` : ''}`,
    );
    if (init.body) headers.set('Content-Type', 'application/json');
    const write =
      path !== '/Users/AuthenticateByName' && init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(target, {
        ...init,
        headers,
        redirect: 'manual',
        signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal,
      });
      if (response.status >= 300 && response.status < 400)
        throw new ServiceError('server', 'Jellyfin redirected the request. Check the server address.');
      if (response.status === 401)
        throw new ServiceError('unauthorized', 'Your Jellyfin session expired. Sign in again.');
      if (response.status === 403)
        throw new ServiceError('forbidden', 'Your Jellyfin account cannot perform this action.');
      if (response.status === 404) throw new ServiceError('not-found', 'This Jellyfin item is unavailable.');
      if (!response.ok)
        throw new ServiceError('server', `Jellyfin could not complete the request (${response.status}).`);
      return await consume(response);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (!write && init.signal?.aborted) throw new DOMException('Request canceled.', 'AbortError');
      if (error instanceof SyntaxError && !controller.signal.aborted && !init.signal?.aborted) {
        throw new ServiceError(
          write ? 'uncertain-write' : 'server',
          write
            ? 'Jellyfin did not return a readable confirmation. Refresh before trying again.'
            : 'Jellyfin returned an unreadable response.',
        );
      }
      if (write)
        throw new ServiceError(
          'uncertain-write',
          'The connection was interrupted. Refresh to check whether Jellyfin saved the change before trying again.',
        );
      throw new ServiceError(
        controller.signal.aborted ||
          init.signal?.aborted ||
          (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
          ? 'timeout'
          : 'offline',
        'Could not reach Jellyfin. Check the connection and try again.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
  async authenticatedRequest(path: string, init?: RequestInit): Promise<Response> {
    const session = this.requireSession();
    return this.request(session.serverUrl, path, init || {}, session.token, async (response) => {
      void response.body?.cancel().catch(() => {});
      return response;
    });
  }
  private requestJson(base: string, path: string, init: RequestInit = {}, token?: string): Promise<Item> {
    return this.request(base, path, init, token, (response) => response.json());
  }
  private async json(path: string, init?: RequestInit): Promise<Item> {
    const session = this.requireSession();
    return this.requestJson(session.serverUrl, path, init, session.token);
  }
  async connect(input: { serverUrl: string; username: string; password: string }): Promise<Connection> {
    const base = serverAddress(input.serverUrl);
    if (typeof input.username !== 'string' || !input.username.trim() || typeof input.password !== 'string')
      throw new ServiceError('invalid', 'Enter your Jellyfin username and password.');
    const intent = ++this.connectionIntent;
    const ensureCurrent = () => {
      if (intent !== this.connectionIntent)
        throw new ServiceError('invalid', 'A newer account change replaced this sign-in. Try again if needed.');
    };
    let info: Item;
    try {
      info = await this.requestJson(base, '/System/Info/Public');
    } catch (error) {
      ensureCurrent();
      throw error;
    }
    ensureCurrent();
    let auth: Item;
    try {
      auth = await this.requestJson(base, '/Users/AuthenticateByName', {
        method: 'POST',
        body: JSON.stringify({ Username: input.username.trim(), Pw: input.password }),
      });
    } catch (error) {
      ensureCurrent();
      if (error instanceof ServiceError && error.code === 'unauthorized')
        throw new ServiceError('unauthorized', 'Jellyfin did not accept your username or password.');
      throw error;
    }
    ensureCurrent();
    if (!auth.AccessToken || !auth.User?.Id)
      throw new ServiceError('server', 'Jellyfin did not return a valid session.');
    const candidate = {
      serverUrl: base,
      token: auth.AccessToken,
      userId: validId(auth.User.Id),
      userName: auth.User.Name || input.username,
      serverVersion: info.Version || '',
      selectedLibraryIds: [],
      sessionOnly: false,
    };
    await this.persistSession(candidate, true, intent);
    ensureCurrent();
    return this.connection()!;
  }
  async disconnect(): Promise<void> {
    this.cancelPendingSignIns();
    await this.persistSession(null, true);
    this.writes.clear();
  }
  async libraries(): Promise<Library[]> {
    return this.readCurrentSession(async () => {
      const s = this.requireSession();
      const data = await this.json(`/Users/${s.userId}/Views`);
      return (data.Items || [])
        .filter((item: Item) => item.CollectionType === 'music')
        .map((item: Item) => ({ id: validId(item.Id), name: item.Name || 'Music' }));
    });
  }
  async libraryFilters(): Promise<LibraryFilters> {
    return this.readCurrentSession(async () => {
      const session = this.requireSession();
      const results = await Promise.all(
        session.selectedLibraryIds.map(async (parentId) => {
          const parameters = new URLSearchParams({
            UserId: session.userId,
            ParentId: parentId,
            IncludeItemTypes: 'Audio',
            MediaTypes: 'Audio',
          });
          return this.json(`/Items/Filters?${parameters}`);
        }),
      );
      const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
      return {
        genres: unique(results.flatMap((value) => stringArray(value.Genres))),
        tags: unique(results.flatMap((value) => stringArray(value.Tags))),
      };
    });
  }
  async selectLibraries(values: string[]): Promise<Connection> {
    const session = this.requireSession();
    const selected = [...new Set(ids(values))];
    const available = new Set((await this.libraries()).map((item) => item.id));
    if (this.session !== session)
      throw new ServiceError('unauthorized', 'The connection changed. Select libraries again.');
    if (selected.some((id) => !available.has(id)))
      throw new ServiceError('forbidden', 'One of these libraries is unavailable to your account.');
    await this.persistSession({ ...session, selectedLibraryIds: selected }, false);
    return this.connection()!;
  }
  private songItem(item: Item): Song {
    const image = item.ImageTags?.Primary ? item.Id : item.AlbumId;
    const source = item.MediaSources?.[0];
    const streams = source?.MediaStreams ?? item.MediaStreams ?? [];
    const stream =
      streams.find((value) => value.Type === 'Audio' && value.Index === source?.DefaultAudioStreamIndex) ??
      streams.find((value) => value.Type === 'Audio');
    return {
      id: item.Id,
      name: item.Name || 'Untitled song',
      artists: stringArray(item.Artists),
      album: item.Album || '',
      albumId: item.AlbumId,
      albumArtist: item.AlbumArtist,
      duration: Math.max(0, (item.RunTimeTicks || 0) / 10000000),
      year: item.ProductionYear,
      genres: stringArray(item.Genres),
      tags: stringArray(item.Tags),
      trackNumber: item.IndexNumber,
      discNumber: item.ParentIndexNumber,
      imageUrl: image ? this.deps.imageUrl(image, item.ImageTags?.Primary || item.AlbumPrimaryImageTag) : undefined,
      container: item.Container || source?.Container,
      codec: stream?.Codec,
      bitRate: stream?.BitRate ?? source?.Bitrate,
      sampleRate: stream?.SampleRate,
      size: source?.Size,
    };
  }
  private albumItem(item: Item): Album {
    return {
      id: item.Id,
      name: item.Name || 'Untitled album',
      artist: item.AlbumArtist || stringArray(item.Artists).join(', '),
      year: item.ProductionYear,
      songCount: item.ChildCount,
      imageUrl: item.ImageTags?.Primary ? this.deps.imageUrl(item.Id, item.ImageTags.Primary) : undefined,
    };
  }
  private async catalog(type: 'Audio' | 'MusicAlbum', query: CatalogQuery, signal: AbortSignal): Promise<Page<Item>> {
    const s = this.requireSession();
    const start = query.start ?? 0,
      limit = query.limit ?? 100;
    if (
      !Number.isSafeInteger(start) ||
      start < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500 ||
      start > 1000000
    )
      throw new ServiceError('invalid', 'Invalid catalog page.');
    const sort = {
      name: 'SortName',
      artist: 'Artist,SortName',
      album: 'Album,ParentIndexNumber,IndexNumber,SortName',
      year: 'ProductionYear,SortName',
      dateAdded: 'DateCreated,SortName',
    }[query.sort || 'name'];
    if (!sort) throw new ServiceError('invalid', 'Invalid catalog sort.');
    for (const value of [query.search, query.genre, query.tag])
      if (value !== undefined && (typeof value !== 'string' || value.length > 500))
        throw new ServiceError('invalid', 'Invalid catalog filter.');
    if (!s.selectedLibraryIds.length) return { items: [], total: 0, start };
    if (query.search?.trim())
      return this.searchCatalog(type, { ...query, search: query.search.trim() }, sort, start, limit, signal);
    const multiple = s.selectedLibraryIds.length > 1;
    const snapshotKey = JSON.stringify([
      type,
      query.genre || '',
      query.tag || '',
      query.sort || 'name',
      !!query.descending,
    ]);
    const loading = this.catalogLoads.get(snapshotKey);
    if (multiple && loading?.session === s) {
      const page = await this.waitForCatalogLoad(snapshotKey, loading, signal);
      if (this.session !== s) throw new ServiceError('invalid', 'The library changed. Refresh your collection.');
      return { items: page.items.slice(start, start + limit), total: page.total, start };
    }
    const previous = this.catalogSnapshots.get(snapshotKey);
    if (multiple && start > 0 && previous?.session === s) {
      this.catalogSnapshots.delete(snapshotKey);
      this.catalogSnapshots.set(snapshotKey, previous);
      return { items: previous.items.slice(start, start + limit), total: previous.items.length, start };
    }
    const controller = multiple ? new AbortController() : undefined;
    const read = async (requestSignal: AbortSignal) => {
      const pageReads = s.selectedLibraryIds.map(async (parent) => {
        const params = new URLSearchParams({
          ParentId: parent,
          Recursive: 'true',
          IncludeItemTypes: type,
          Fields: fields,
          StartIndex: String(start),
          Limit: String(limit),
          SortBy: sort,
          SortOrder: query.descending ? 'Descending' : 'Ascending',
          EnableTotalRecordCount: 'true',
        });
        if (query.search) params.set('SearchTerm', query.search);
        if (query.genre) params.set('Genres', query.genre);
        if (query.tag) params.set('Tags', query.tag);
        // Complete each root before merging: provider and app sort comparators can differ.
        if (multiple) {
          const items = await this.allItems(`/Users/${s.userId}/Items`, Object.fromEntries(params), requestSignal);
          return { Items: items, TotalRecordCount: items.length };
        }
        return catalogLimiter.run(requestSignal, () =>
          this.json(`/Users/${s.userId}/Items?${params}`, { signal: requestSignal }),
        );
      });
      let pages;
      try {
        pages = await Promise.all(pageReads);
      } catch (error) {
        controller?.abort();
        await Promise.allSettled(pageReads);
        throw error;
      }
      let items: Item[] = pages.flatMap((page) => page.Items || []);
      if (multiple) {
        if (this.session !== s) throw new ServiceError('invalid', 'The library changed. Refresh your collection.');
        items = [...new Map(items.map((item) => [itemIdentity(item.Id), item])).values()];
        const total = items.length;
        const compareText = (a: string | undefined, b: string | undefined) =>
          catalogCollator.compare(String(a || ''), String(b || ''));
        items.sort((a, b) => {
          let value = 0;
          if (query.sort === 'dateAdded')
            value = (Date.parse(a.DateCreated || '') || 0) - (Date.parse(b.DateCreated || '') || 0);
          if (query.sort === 'year') value = (a.ProductionYear || 0) - (b.ProductionYear || 0);
          if (query.sort === 'artist')
            value = compareText(
              type === 'MusicAlbum' ? a.AlbumArtist || a.Artists?.[0] : a.Artists?.[0] || a.AlbumArtist,
              type === 'MusicAlbum' ? b.AlbumArtist || b.Artists?.[0] : b.Artists?.[0] || b.AlbumArtist,
            );
          if (query.sort === 'album')
            value =
              type === 'MusicAlbum'
                ? compareText(a.SortName || a.Name, b.SortName || b.Name)
                : compareText(a.Album, b.Album) ||
                  (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0) ||
                  (a.IndexNumber || 0) - (b.IndexNumber || 0);
          value ||=
            compareText(a.SortName || a.Name, b.SortName || b.Name) ||
            itemIdentity(a.Id).localeCompare(itemIdentity(b.Id));
          return query.descending ? -value : value;
        });
        return { items, total, start };
      }
      return { items, total: pages.reduce((sum, page) => sum + (page.TotalRecordCount || 0), 0), start };
    };
    if (!multiple) return read(signal);
    const load = {
      session: s,
      controller: controller!,
      promise: read(controller!.signal),
      subscribers: 0,
      settled: false,
    };
    this.trackCatalogLoad(snapshotKey, load);
    const page = await this.waitForCatalogLoad(snapshotKey, load, signal);
    if (this.session !== s) throw new ServiceError('invalid', 'The library changed. Refresh your collection.');
    return { items: page.items.slice(start, start + limit), total: page.total, start };
  }
  private async searchCatalog(
    type: 'Audio' | 'MusicAlbum',
    query: CatalogQuery,
    sort: string,
    start: number,
    limit: number,
    signal: AbortSignal,
  ): Promise<Page<Item>> {
    const session = this.requireSession();
    const term = query.search!;
    const snapshotKey = JSON.stringify([
      'search',
      type,
      term,
      query.genre || '',
      query.tag || '',
      query.sort || 'name',
      !!query.descending,
    ]);
    const loading = this.catalogLoads.get(snapshotKey);
    if (loading?.session === session) {
      const page = await this.waitForCatalogLoad(snapshotKey, loading, signal);
      if (this.session !== session) throw new ServiceError('unauthorized', 'The connection changed. Search again.');
      return { ...page, items: page.items.slice(start, start + limit), start };
    }
    const previous = this.catalogSnapshots.get(snapshotKey);
    if (start > 0 && previous?.session === session) {
      this.catalogSnapshots.delete(snapshotKey);
      this.catalogSnapshots.set(snapshotKey, previous);
      return { items: previous.items.slice(start, start + limit), total: previous.items.length, start };
    }
    if (start === 0) this.catalogSnapshots.delete(snapshotKey);
    const controller = new AbortController();
    const load: CatalogLoad = {
      session,
      controller,
      promise: this.readSearchCatalog(type, query, sort, controller.signal),
      subscribers: 0,
      settled: false,
    };
    this.trackCatalogLoad(snapshotKey, load);
    const page = await this.waitForCatalogLoad(snapshotKey, load, signal);
    if (this.session !== session) throw new ServiceError('unauthorized', 'The connection changed. Search again.');
    return { ...page, items: page.items.slice(start, start + limit), start };
  }

  private async readSearchCatalog(
    type: 'Audio' | 'MusicAlbum',
    query: CatalogQuery,
    sort: string,
    signal: AbortSignal,
  ): Promise<Page<Item>> {
    const session = this.requireSession();
    const term = query.search!;
    const maximum = 10000;
    const matches = new Map<string, Item>();
    const bounded = async (
      path: string,
      parameters: Record<string, string>,
      requestSignal = signal,
    ): Promise<Item[]> => {
      const result: Item[] = [];
      while (true) {
        if (this.session !== session) throw new ServiceError('unauthorized', 'The connection changed. Search again.');
        const params = new URLSearchParams({
          ...parameters,
          Fields: fields,
          EnableTotalRecordCount: 'true',
          StartIndex: String(result.length),
          Limit: '500',
        });
        const page = await catalogLimiter.run(requestSignal, () =>
          this.json(`${path}?${params}`, { signal: requestSignal }),
        );
        if (this.session !== session) throw new ServiceError('unauthorized', 'The connection changed. Search again.');
        const batch = page.Items || [];
        result.push(...batch);
        if ((page.TotalRecordCount || 0) > maximum || result.length > maximum)
          throw new ServiceError(
            'unsupported',
            'This search matches too much music. Enter a more specific title, artist, or album.',
          );
        if (!batch.length || result.length >= (page.TotalRecordCount ?? result.length)) return result;
      }
    };
    const add = (items: Item[]) => {
      for (const item of items) matches.set(itemIdentity(item.Id), item);
      if (matches.size > maximum)
        throw new ServiceError(
          'unsupported',
          'This search matches too much music. Enter a more specific title, artist, or album.',
        );
    };
    const branchController = new AbortController();
    const abortBranches = () => branchController.abort();
    signal.addEventListener('abort', abortBranches, { once: true });
    const branchSignal = branchController.signal;
    const artistsPromise = bounded(
      type === 'Audio' ? '/Artists' : '/Artists/AlbumArtists',
      { UserId: session.userId, SearchTerm: term },
      branchSignal,
    );
    const branches = session.selectedLibraryIds.map(async (library) => {
      const base: Record<string, string> = {
        ParentId: library,
        Recursive: 'true',
        IncludeItemTypes: type,
        SortBy: sort,
        SortOrder: query.descending ? 'Descending' : 'Ascending',
      };
      if (query.genre) base.Genres = query.genre;
      if (query.tag) base.Tags = query.tag;
      const titleMatches = bounded(`/Users/${session.userId}/Items`, { ...base, SearchTerm: term }, branchSignal);
      const work: Promise<Item[]>[] = [titleMatches];
      const artistMatches = artistsPromise.then(async (artists) => {
        const ids = artists.map((item) => validId(item.Id));
        return Promise.all(
          Array.from({ length: Math.ceil(ids.length / 100) }, (_, batch) =>
            bounded(
              `/Users/${session.userId}/Items`,
              {
                ...base,
                [type === 'Audio' ? 'ArtistIds' : 'AlbumArtistIds']: ids
                  .slice(batch * 100, batch * 100 + 100)
                  .join(','),
              },
              branchSignal,
            ),
          ),
        ).then((batches) => batches.flat());
      });
      work.push(artistMatches);
      if (type === 'Audio') {
        work.push(
          (async () => {
            const albums = await bounded(
              `/Users/${session.userId}/Items`,
              {
                ParentId: library,
                Recursive: 'true',
                IncludeItemTypes: 'MusicAlbum',
                SearchTerm: term,
              },
              branchSignal,
            );
            const batches = await Promise.all(
              Array.from({ length: Math.ceil(albums.length / 100) }, (_, batch) => {
                const albumIds = albums.slice(batch * 100, batch * 100 + 100).map((item) => validId(item.Id));
                const wanted = new Set(albumIds.map(itemIdentity));
                return bounded(
                  `/Users/${session.userId}/Items`,
                  { ...base, AlbumIds: albumIds.join(',') },
                  branchSignal,
                ).then((songs) => songs.filter((item) => item.AlbumId && wanted.has(itemIdentity(item.AlbumId))));
              }),
            );
            return batches.flat();
          })(),
        );
      }
      try {
        return (await Promise.all(work)).flat();
      } catch (error) {
        branchController.abort();
        await Promise.allSettled(work);
        throw error;
      }
    });
    let results: Item[][];
    try {
      results = await Promise.all(branches);
    } catch (error) {
      branchController.abort();
      await Promise.allSettled(branches);
      throw error;
    } finally {
      signal.removeEventListener('abort', abortBranches);
    }
    for (const items of results) add(items);
    const compareText = (a: string | undefined, b: string | undefined) =>
      catalogCollator.compare(String(a || ''), String(b || ''));
    const items = [...matches.values()].sort((a, b) => {
      let value = 0;
      if (query.sort === 'dateAdded')
        value = (Date.parse(a.DateCreated || '') || 0) - (Date.parse(b.DateCreated || '') || 0);
      if (query.sort === 'year') value = (a.ProductionYear || 0) - (b.ProductionYear || 0);
      if (query.sort === 'artist')
        value = compareText(
          type === 'MusicAlbum' ? a.AlbumArtist || a.Artists?.[0] : a.Artists?.[0] || a.AlbumArtist,
          type === 'MusicAlbum' ? b.AlbumArtist || b.Artists?.[0] : b.Artists?.[0] || b.AlbumArtist,
        );
      if (query.sort === 'album')
        value =
          type === 'MusicAlbum'
            ? compareText(a.SortName || a.Name, b.SortName || b.Name)
            : compareText(a.Album, b.Album) ||
              (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0) ||
              (a.IndexNumber || 0) - (b.IndexNumber || 0);
      value ||=
        compareText(a.SortName || a.Name, b.SortName || b.Name) || itemIdentity(a.Id).localeCompare(itemIdentity(b.Id));
      return query.descending ? -value : value;
    });
    if (this.session !== session) throw new ServiceError('unauthorized', 'The connection changed. Search again.');
    return { items, total: items.length, start: 0 };
  }
  async songs(query: CatalogQuery, signal = new AbortController().signal): Promise<Page<Song>> {
    return this.catalogOperation(signal, async (requestSignal) =>
      this.readCurrentSession(async () => {
        const page = await this.catalog('Audio', query, requestSignal);
        return { ...page, items: page.items.map((item) => this.songItem(item)) };
      }),
    );
  }
  async albums(query: CatalogQuery, signal = new AbortController().signal): Promise<Page<Album>> {
    return this.catalogOperation(signal, async (requestSignal) =>
      this.readCurrentSession(async () => {
        const page = await this.catalog('MusicAlbum', query, requestSignal);
        return { ...page, items: page.items.map((item) => this.albumItem(item)) };
      }),
    );
  }
  private async catalogOperation<T>(signal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const controller = new AbortController();
    this.catalogControllers.add(controller);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      return await operation(controller.signal);
    } finally {
      signal.removeEventListener('abort', abort);
      this.catalogControllers.delete(controller);
    }
  }
  private async allItems(path: string, parameters: Record<string, string> = {}, signal?: AbortSignal): Promise<Item[]> {
    const session = this.requireSession();
    const items: Item[] = [];
    while (true) {
      if (this.session !== session) throw new ServiceError('invalid', 'The connection changed. Refresh your library.');
      const params = new URLSearchParams({
        ...parameters,
        StartIndex: String(items.length),
        Limit: '500',
        Fields: fields,
      });
      const page = signal
        ? await catalogLimiter.run(signal, () => this.json(`${path}?${params}`, { signal }))
        : await this.json(`${path}?${params}`);
      if (this.session !== session) throw new ServiceError('invalid', 'The connection changed. Refresh your library.');
      const batch = page.Items || [];
      items.push(...batch);
      if (!batch.length || items.length >= (page.TotalRecordCount ?? items.length)) return items;
      if (items.length > 1000000) throw new ServiceError('unsupported', 'This selection is too large to load at once.');
    }
  }
  async album(value: string): Promise<Album> {
    return this.readCurrentSession(async () => {
      const id = validId(value),
        s = this.requireSession();
      const item = await this.json(`/Users/${s.userId}/Items/${id}`);
      if (item.Type !== 'MusicAlbum') throw new ServiceError('invalid', 'This item is not an album.');
      return this.albumItem(item);
    });
  }
  async albumTracks(value: string): Promise<Song[]> {
    return this.readCurrentSession(async () => {
      const id = validId(value),
        s = this.requireSession();
      return (
        await this.allItems(`/Users/${s.userId}/Items`, {
          ParentId: id,
          Recursive: 'true',
          IncludeItemTypes: 'Audio',
          SortBy: 'ParentIndexNumber,IndexNumber,SortName',
        })
      ).map((item) => this.songItem(item));
    });
  }
  async song(value: string): Promise<Song> {
    return this.readCurrentSession(async () => {
      const id = validId(value),
        s = this.requireSession();
      const item = await this.json(`/Users/${s.userId}/Items/${id}`);
      if (item.Type !== 'Audio') throw new ServiceError('invalid', 'This item is not a song.');
      return this.songItem(item);
    });
  }
  async lyrics(value: string): Promise<SongLyrics> {
    return this.readCurrentSession(async () => {
      const id = validId(value);
      const session = this.requireSession();
      const version = /^(\d+)\.(\d+)/.exec(session.serverVersion);
      if (version && (Number(version[1]) < 10 || (Number(version[1]) === 10 && Number(version[2]) < 9)))
        throw new ServiceError('unsupported', 'Lyrics require Jellyfin 10.9 or later.');
      this.lyricsRequest?.abort();
      const controller = new AbortController();
      this.lyricsRequest = controller;
      try {
        return await this.request(
          session.serverUrl,
          `/Audio/${id}/Lyrics`,
          { signal: controller.signal },
          session.token,
          async (response) => {
            // Bound the streamed response, including servers that omit Content-Length.
            const reader = response.body?.getReader();
            if (!reader) throw new ServiceError('server', 'Jellyfin returned an unreadable lyrics response.');
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
              while (true) {
                const next = await reader.read();
                if (next.done) break;
                size += next.value.byteLength;
                if (size > 1_000_000) throw new ServiceError('server', 'The lyrics response is too large to display.');
                chunks.push(next.value);
              }
            } finally {
              await reader.cancel().catch(() => {});
              reader.releaseLock();
            }
            const data: unknown = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
            if (!data || typeof data !== 'object' || !('Lyrics' in data) || !Array.isArray(data.Lyrics))
              throw new ServiceError('server', 'Jellyfin returned an unreadable lyrics response.');
            if (data.Lyrics.length > 10_000)
              throw new ServiceError('server', 'The lyrics response has too many lines to display.');
            const lines = data.Lyrics.map((line: unknown) => {
              if (!line || typeof line !== 'object' || !('Text' in line) || typeof line.Text !== 'string')
                throw new ServiceError('server', 'Jellyfin returned an unreadable lyric line.');
              const ticks = 'Start' in line ? line.Start : undefined;
              return {
                text: line.Text,
                start:
                  typeof ticks === 'number' && Number.isSafeInteger(ticks) && ticks >= 0
                    ? ticks / 10_000_000
                    : undefined,
              };
            });
            const metadata = 'Metadata' in data ? data.Metadata : undefined;
            const explicitlyPlain =
              metadata && typeof metadata === 'object' && 'IsSynced' in metadata && metadata.IsSynced === false;
            const synced =
              !explicitlyPlain &&
              lines.length > 0 &&
              lines.every(
                (line, index) =>
                  line.start !== undefined && (index === 0 || line.start >= (lines[index - 1].start ?? Infinity)),
              );
            if (!lines.some((line) => line.text.trim())) return { lines: [], synced: false };
            return { lines: synced ? lines : lines.map(({ text }) => ({ text })), synced: !!synced };
          },
        );
      } catch (error) {
        if (error instanceof ServiceError && error.code === 'not-found') {
          if (!version) throw new ServiceError('unsupported', 'Lyrics are unavailable on this Jellyfin server.');
          return { lines: [], synced: false };
        }
        throw error;
      } finally {
        if (this.lyricsRequest === controller) this.lyricsRequest = null;
      }
    });
  }
  private playlistItem(item: Item): Playlist {
    return {
      id: item.Id,
      name: item.Name || 'Untitled playlist',
      songCount: item.ChildCount,
      imageUrl: item.ImageTags?.Primary ? this.deps.imageUrl(item.Id, item.ImageTags.Primary) : undefined,
    };
  }
  async playlists(): Promise<Playlist[]> {
    return this.readCurrentSession(async () => {
      const s = this.requireSession();
      return (
        await this.allItems(`/Users/${s.userId}/Items`, {
          Recursive: 'true',
          IncludeItemTypes: 'Playlist',
          SortBy: 'SortName',
        })
      )
        .filter((item) => !item.MediaType || item.MediaType === 'Audio')
        .map((item) => this.playlistItem(item));
    });
  }
  private async entries(id: string): Promise<PlaylistEntry[]> {
    return this.readCurrentSession(async () => {
      const s = this.requireSession();
      return (await this.allItems(`/Playlists/${id}/Items`, { UserId: s.userId })).map((item) => ({
        entryId: item.PlaylistItemId || '',
        song: this.songItem(item),
      }));
    });
  }
  private async validateEntryChanges(id: string, targets: string[]): Promise<PlaylistEntry[]> {
    const current = await this.entries(id);
    const editable = editablePlaylistEntryIds(current);
    if (targets.some((entry) => !editable.has(entry)))
      throw new ServiceError(
        'invalid',
        'Jellyfin cannot identify this playlist entry separately. Refresh the playlist; repeated or unavailable entries cannot be moved or removed safely.',
      );
    return current;
  }
  async playlistPermission(value: string): Promise<boolean | null> {
    return this.readCurrentSession(async () => {
      const id = validId(value),
        s = this.requireSession();
      let canEdit: boolean | null = null;
      try {
        const permission = await this.json(`/Playlists/${id}/Users/${s.userId}`);
        canEdit = typeof permission?.CanEdit === 'boolean' ? permission.CanEdit : null;
      } catch (error) {
        if (this.session !== s) throw new ServiceError('invalid', 'The connection changed. Refresh this playlist.');
        if (
          !(error instanceof ServiceError) ||
          !['not-found', 'forbidden', 'unsupported', 'server', 'offline', 'timeout'].includes(error.code)
        )
          throw error;
      }
      if (this.session !== s) throw new ServiceError('invalid', 'The connection changed. Refresh this playlist.');
      return canEdit;
    });
  }
  async playlist(value: string): Promise<PlaylistDetail> {
    return this.readCurrentSession(async () => {
      const id = validId(value),
        s = this.requireSession();
      const item = await this.json(`/Users/${s.userId}/Items/${id}`);
      if (this.session !== s) throw new ServiceError('invalid', 'The connection changed. Refresh this playlist.');
      const canEdit = await this.playlistPermission(id);
      if (this.session !== s) throw new ServiceError('invalid', 'The connection changed. Refresh this playlist.');
      const entries = await this.entries(id);
      if (this.session !== s) throw new ServiceError('invalid', 'The connection changed. Refresh this playlist.');
      return {
        ...this.playlistItem(item),
        canEdit,
        restriction:
          canEdit === true
            ? undefined
            : canEdit === false
              ? 'Your account can listen to this playlist but cannot edit it.'
              : 'Jellyfin could not confirm edit permission. The server will check each change.',
        entries,
      };
    });
  }
  private serialize(id: string, operation: () => Promise<void>, reserve = false): Promise<void> {
    const session = this.requireSession();
    const key = JSON.stringify([
      session.serverUrl,
      session.userId.toLowerCase().replaceAll('-', ''),
      id.toLowerCase().replaceAll('-', ''),
    ]);
    const prior = this.writes.get(key) || Promise.resolve();
    const current = prior
      .catch(() => {})
      .then(() => {
        if (this.session !== session)
          throw new ServiceError('invalid', 'The connection changed. Refresh before editing this playlist.');
        const dispatch = () => {
          if (this.session !== session)
            throw new ServiceError('invalid', 'The connection changed. Refresh before editing this playlist.');
          return operation();
        };
        return this.runPlaylistWrite(session, id, reserve, dispatch);
      });
    this.writes.set(key, current);
    void current
      .finally(() => {
        if (this.writes.get(key) === current) this.writes.delete(key);
      })
      .catch(() => {});
    return current;
  }
  private runPlaylistWrite(
    session: Session,
    id: string,
    reserve: boolean,
    operation: () => Promise<void>,
  ): Promise<void> {
    const canStart = () => this.session === session;
    if (!canStart())
      return Promise.reject(new ServiceError('invalid', 'The connection changed. Refresh this playlist.'));
    return this.deps.playlistWrite ? this.deps.playlistWrite(session, id, reserve, operation, canStart) : operation();
  }
  async createPlaylist(input: { name: string; trackIds: string[] }): Promise<{ id: string }> {
    const label = name(input.name),
      tracks = ids(input.trackIds),
      s = this.requireSession();
    let createdId = '';
    await this.serialize(
      PLAYLIST_CREATION,
      async () => {
        const result = await this.json('/Playlists', {
          method: 'POST',
          body: JSON.stringify({ Name: label, Ids: tracks, UserId: s.userId, MediaType: 'Audio', IsPublic: false }),
        });
        try {
          createdId = validId(result.Id);
        } catch {
          throw new ServiceError(
            'uncertain-write',
            'Jellyfin did not confirm the new playlist. Check your playlists before creating another.',
          );
        }
      },
      true,
    );
    return { id: createdId };
  }

  async renamePlaylist(input: { id: string; name: string }): Promise<void> {
    const id = validId(input.id),
      label = name(input.name);
    return this.serialize(id, async () => {
      await this.authenticatedRequest(`/Playlists/${id}`, { method: 'POST', body: JSON.stringify({ Name: label }) });
    });
  }
  async addPlaylistItems(input: { id: string; trackIds: string[]; skipExisting: boolean }): Promise<void> {
    const id = validId(input.id),
      selection = ids(input.trackIds),
      session = this.requireSession();
    return this.serialize(id, async () => {
      let tracks = selection;
      if (input.skipExisting) {
        const present = new Set((await this.entries(id)).map((entry) => itemIdentity(entry.song.id)));
        tracks = selection.filter((track) => {
          const identity = itemIdentity(track);
          if (present.has(identity)) return false;
          present.add(identity);
          return true;
        });
      }
      if (!tracks.length) return;
      const write = async () => {
        for (let index = 0; index < tracks.length; index += 100) {
          if (this.session !== session)
            throw new ServiceError(
              index ? 'uncertain-write' : 'invalid',
              'The connection changed. Refresh this playlist before adding again.',
            );
          const params = new URLSearchParams({
            Ids: tracks.slice(index, index + 100).join(','),
            UserId: this.requireSession().userId,
          });
          try {
            await this.authenticatedRequest(`/Playlists/${id}/Items?${params}`, { method: 'POST' });
          } catch (error) {
            if (index > 0)
              throw new ServiceError(
                'uncertain-write',
                'Some songs were added before the operation stopped. Refresh this playlist before adding again.',
              );
            throw error;
          }
        }
      };
      return this.runPlaylistWrite(session, id, true, write);
    });
  }
  async removePlaylistEntries(input: { id: string; entryIds: string[] }): Promise<void> {
    const id = validId(input.id),
      session = this.requireSession();
    if (!Array.isArray(input.entryIds) || input.entryIds.length > 100000)
      throw new ServiceError('invalid', 'Invalid playlist entries.');
    const entries = input.entryIds.map(playlistEntryId);
    if (new Set(entries.map(playlistEntryIdentity)).size !== entries.length)
      throw new ServiceError('invalid', 'Choose each playlist entry only once.');
    if (!entries.length) return;
    return this.serialize(id, async () => {
      await this.validateEntryChanges(id, entries);
      const write = async () => {
        for (let index = 0; index < entries.length; index += 100) {
          if (this.session !== session)
            throw new ServiceError(
              index ? 'uncertain-write' : 'invalid',
              'The connection changed. Refresh this playlist.',
            );
          const params = new URLSearchParams({ EntryIds: entries.slice(index, index + 100).join(',') });
          try {
            await this.authenticatedRequest(`/Playlists/${id}/Items?${params}`, { method: 'DELETE' });
          } catch (error) {
            if (index > 0)
              throw new ServiceError(
                'uncertain-write',
                'Some entries were removed before the operation stopped. Refresh this playlist.',
              );
            throw error;
          }
        }
      };
      return this.runPlaylistWrite(session, id, true, write);
    });
  }
  async movePlaylistEntry(input: { id: string; entryId: string; index: number }): Promise<void> {
    const id = validId(input.id),
      entry = playlistEntryId(input.entryId),
      session = this.requireSession();
    if (!Number.isSafeInteger(input.index) || input.index < 0)
      throw new ServiceError('invalid', 'Invalid playlist position.');
    return this.serialize(id, async () => {
      const current = await this.validateEntryChanges(id, [entry]);
      if (input.index >= current.length)
        throw new ServiceError('invalid', 'The playlist changed. Refresh before moving this entry.');
      const write = async () => {
        if (this.session !== session)
          throw new ServiceError('invalid', 'The connection changed. Refresh this playlist.');
        await this.authenticatedRequest(`/Playlists/${id}/Items/${entry}/Move/${input.index}`, { method: 'POST' });
      };
      return this.runPlaylistWrite(session, id, true, write);
    });
  }
}
