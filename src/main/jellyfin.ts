import type { Album, ApiError, CatalogQuery, Connection, Library, LibraryFilters, Page, Playlist, PlaylistDetail, PlaylistEntry, Song } from '../shared/types';

export class ServiceError extends Error {
  constructor(public code: ApiError['code'], message: string) { super(message); }
}
export type Session = {
  serverUrl: string; token: string; userId: string; userName: string; serverVersion: string;
  selectedLibraryIds: string[]; sessionOnly: boolean;
};
type AudioStream = { Type?: string; Index?: number; Codec?: string; BitRate?: number; SampleRate?: number };
type Item = {
  Id: string; Name?: string; Type?: string; CollectionType?: string; MediaType?: string;
  Album?: string; AlbumId?: string; AlbumArtist?: string; Artists?: string[];
  RunTimeTicks?: number; ProductionYear?: number; Genres?: string[]; Tags?: string[];
  IndexNumber?: number; ParentIndexNumber?: number; ChildCount?: number; SortName?: string;
  Container?: string; MediaStreams?: AudioStream[]; MediaSources?: { Container?: string; Size?: number; Bitrate?: number; DefaultAudioStreamIndex?: number; MediaStreams?: AudioStream[] }[]; ImageTags?: Record<string, string>;
  PlaylistItemId?: string; Items?: Item[]; TotalRecordCount?: number; CanEdit?: boolean;
  AccessToken?: string; User?: { Id: string; Name?: string }; Version?: string;
};
type Deps = { deviceId: string; imageUrl: (id: string) => string; onConnectionChanged?: () => void };
const fields = 'Genres,Tags,MediaSources,MediaStreams,DateCreated,Overview,SortName,ParentId';
const validId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(value)) throw new ServiceError('invalid', 'Invalid library item.');
  return value;
};
const ids = (values: unknown): string[] => {
  if (!Array.isArray(values) || values.length > 100000) throw new ServiceError('invalid', 'Invalid item selection.');
  return values.map(validId);
};
const playlistEntryId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new ServiceError('invalid', 'Invalid playlist entry.');
  return value;
};
const name = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new ServiceError('invalid', 'Enter a name of up to 256 characters.');
  return value.trim();
};
const serverAddress = (value: string): string => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/+$/, '');
  } catch { throw new ServiceError('invalid', 'Enter an HTTP or HTTPS Jellyfin server address.'); }
};
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export class JellyfinService {
  private session: Session | null = null;
  private writes = new Map<string, Promise<unknown>>();
  constructor(private deps: Deps) {}
  connection(): Connection | null {
    const s = this.session;
    return s ? { id: `${s.serverUrl}|${s.userId}`, serverUrl: s.serverUrl, serverVersion: s.serverVersion, userName: s.userName, selectedLibraryIds: [...s.selectedLibraryIds], sessionOnly: s.sessionOnly } : null;
  }
  exportSession(): Session | null { return this.session ? { ...this.session, selectedLibraryIds: [...this.session.selectedLibraryIds] } : null; }
  restore(session: Session | null): void {
    this.session = session ? { ...session, serverUrl: serverAddress(session.serverUrl), userId: validId(session.userId), selectedLibraryIds: ids(session.selectedLibraryIds) } : null;
    this.deps.onConnectionChanged?.();
  }
  setSessionOnly(value: boolean): void { if (this.session) this.session.sessionOnly = value; }
  private requireSession(): Session {
    if (!this.session) throw new ServiceError('unauthorized', 'Sign in to Jellyfin.');
    return this.session;
  }
  private async request(base: string, path: string, init: RequestInit = {}, token?: string): Promise<Response> {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new ServiceError('invalid', 'Invalid server request.');
    const target = new URL(base + path);
    if (target.origin !== new URL(base).origin) throw new ServiceError('invalid', 'Invalid server request.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `MediaBrowser Client="onmywave.fm", Device="Mac", DeviceId="${this.deps.deviceId.replace(/[^a-zA-Z0-9-]/g, '')}", Version="0.1.0"${token ? `, Token="${token}"` : ''}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    const write = init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(target, { ...init, headers, redirect: 'manual', signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
      clearTimeout(timer);
      if (response.status >= 300 && response.status < 400) throw new ServiceError('server', 'Jellyfin redirected the request. Check the server address.');
      if (response.status === 401) throw new ServiceError('unauthorized', 'Your Jellyfin session expired. Sign in again.');
      if (response.status === 403) throw new ServiceError('forbidden', 'Your Jellyfin account cannot perform this action.');
      if (response.status === 404) throw new ServiceError('not-found', 'This Jellyfin item is unavailable.');
      if (!response.ok) throw new ServiceError('server', `Jellyfin could not complete the request (${response.status}).`);
      return response;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (write) throw new ServiceError('uncertain-write', 'The connection was interrupted. Refresh to check whether Jellyfin saved the change before trying again.');
      throw new ServiceError(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'offline', 'Could not reach Jellyfin. Check the connection and try again.');
    } finally { clearTimeout(timer); }
  }
  async authenticatedRequest(path: string, init?: RequestInit): Promise<Response> {
    const session = this.requireSession();
    return this.request(session.serverUrl, path, init, session.token);
  }
  private async json(path: string, init?: RequestInit): Promise<Item> {
    const response = await this.authenticatedRequest(path, init);
    try { return await response.json(); } catch {
      if (init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) throw new ServiceError('uncertain-write', 'Jellyfin did not return a readable confirmation. Refresh before trying again.');
      throw new ServiceError('server', 'Jellyfin returned an unreadable response.');
    }
  }
  async connect(input: { serverUrl: string; username: string; password: string }): Promise<Connection> {
    const base = serverAddress(input.serverUrl);
    if (typeof input.username !== 'string' || !input.username.trim() || typeof input.password !== 'string') throw new ServiceError('invalid', 'Enter your Jellyfin username and password.');
    const info = await (await this.request(base, '/System/Info/Public')).json();
    let auth: Item;
    try { auth = await (await this.request(base, '/Users/AuthenticateByName', { method: 'POST', body: JSON.stringify({ Username: input.username.trim(), Pw: input.password }) })).json(); }
    catch (error) { if (error instanceof ServiceError && error.code === 'unauthorized') throw new ServiceError('unauthorized', 'Jellyfin did not accept your username or password.'); throw error; }
    if (!auth.AccessToken || !auth.User?.Id) throw new ServiceError('server', 'Jellyfin did not return a valid session.');
    this.session = { serverUrl: base, token: auth.AccessToken, userId: validId(auth.User.Id), userName: auth.User.Name || input.username, serverVersion: info.Version || '', selectedLibraryIds: [], sessionOnly: false };
    this.deps.onConnectionChanged?.();
    return this.connection()!;
  }
  async disconnect(): Promise<void> { this.session = null; this.writes.clear(); this.deps.onConnectionChanged?.(); }
  async libraries(): Promise<Library[]> {
    const s = this.requireSession();
    const data = await this.json(`/Users/${s.userId}/Views`);
    return (data.Items || []).filter((item: Item) => item.CollectionType === 'music').map((item: Item) => ({ id: validId(item.Id), name: item.Name || 'Music' }));
  }
  async libraryFilters(): Promise<LibraryFilters> {
    const session = this.requireSession();
    const results = await Promise.all(session.selectedLibraryIds.map(async parentId => {
      const parameters = new URLSearchParams({ UserId: session.userId, ParentId: parentId, IncludeItemTypes: 'Audio', MediaTypes: 'Audio' });
      return this.json(`/Items/Filters?${parameters}`);
    }));
    const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
    return { genres: unique(results.flatMap(value => stringArray(value.Genres))), tags: unique(results.flatMap(value => stringArray(value.Tags))) };
  }
  async selectLibraries(values: string[]): Promise<Connection> {
    const session = this.requireSession();
    const selected = [...new Set(ids(values))];
    const available = new Set((await this.libraries()).map(item => item.id));
    if (this.session !== session) throw new ServiceError('unauthorized', 'The connection changed. Select libraries again.');
    if (selected.some(id => !available.has(id))) throw new ServiceError('forbidden', 'One of these libraries is unavailable to your account.');
    session.selectedLibraryIds = selected;
    return this.connection()!;
  }
  private songItem(item: Item): Song {
    const image = item.ImageTags?.Primary ? item.Id : item.AlbumId;
    const source = item.MediaSources?.[0];
    const streams = source?.MediaStreams ?? item.MediaStreams ?? [];
    const stream = streams.find(value => value.Type === 'Audio' && value.Index === source?.DefaultAudioStreamIndex) ?? streams.find(value => value.Type === 'Audio');
    return { id: item.Id, name: item.Name || 'Untitled song', artists: stringArray(item.Artists), album: item.Album || '', albumId: item.AlbumId, albumArtist: item.AlbumArtist, duration: Math.max(0, (item.RunTimeTicks || 0) / 10000000), year: item.ProductionYear, genres: stringArray(item.Genres), tags: stringArray(item.Tags), trackNumber: item.IndexNumber, discNumber: item.ParentIndexNumber, imageUrl: image ? this.deps.imageUrl(image) : undefined, container: item.Container || source?.Container, codec: stream?.Codec, bitRate: stream?.BitRate ?? source?.Bitrate, sampleRate: stream?.SampleRate, size: source?.Size };
  }
  private albumItem(item: Item): Album {
    return { id: item.Id, name: item.Name || 'Untitled album', artist: item.AlbumArtist || stringArray(item.Artists).join(', '), year: item.ProductionYear, songCount: item.ChildCount, imageUrl: item.ImageTags?.Primary ? this.deps.imageUrl(item.Id) : undefined };
  }
  private async catalog(type: string, query: CatalogQuery): Promise<Page<Item>> {
    const s = this.requireSession();
    const start = query.start ?? 0, limit = query.limit ?? 100;
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500 || start > 1000000) throw new ServiceError('invalid', 'Invalid catalog page.');
    const sort = { name: 'SortName', artist: 'Artist,SortName', album: 'Album,ParentIndexNumber,IndexNumber,SortName', year: 'ProductionYear,SortName' }[query.sort || 'name'];
    if (!sort) throw new ServiceError('invalid', 'Invalid catalog sort.');
    for (const value of [query.search, query.genre, query.tag]) if (value !== undefined && (typeof value !== 'string' || value.length > 500)) throw new ServiceError('invalid', 'Invalid catalog filter.');
    if (!s.selectedLibraryIds.length) return { items: [], total: 0, start };
    if (type === 'Audio' && query.search?.trim()) return this.searchSongs({ ...query, search: query.search.trim() }, sort, start, limit);
    const multiple = s.selectedLibraryIds.length > 1;
    const pages = await Promise.all(s.selectedLibraryIds.map(async parent => {
      const params = new URLSearchParams({ ParentId: parent, Recursive: 'true', IncludeItemTypes: type, Fields: fields, StartIndex: String(multiple ? 0 : start), Limit: String(multiple ? start + limit : limit), SortBy: sort, SortOrder: query.descending ? 'Descending' : 'Ascending', EnableTotalRecordCount: 'true' });
      if (query.search) params.set('SearchTerm', query.search);
      if (query.genre) params.set('Genres', query.genre);
      if (query.tag) params.set('Tags', query.tag);
      return this.json(`/Users/${s.userId}/Items?${params}`);
    }));
    let items: Item[] = pages.flatMap(page => page.Items || []);
    if (multiple) {
      const compareText = (a: unknown, b: unknown) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
      items.sort((a, b) => {
        let value = 0;
        if (query.sort === 'year') value = (a.ProductionYear || 0) - (b.ProductionYear || 0);
        if (query.sort === 'artist') value = compareText(a.Artists?.[0] || a.AlbumArtist, b.Artists?.[0] || b.AlbumArtist);
        if (query.sort === 'album') value = compareText(a.Album, b.Album) || (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0) || (a.IndexNumber || 0) - (b.IndexNumber || 0);
        value ||= compareText(a.SortName || a.Name, b.SortName || b.Name) || compareText(a.Id, b.Id);
        return query.descending ? -value : value;
      });
      items = items.slice(start, start + limit);
    }
    return { items, total: pages.reduce((sum, page) => sum + (page.TotalRecordCount || 0), 0), start };
  }
  private async searchSongs(query: CatalogQuery, sort: string, start: number, limit: number): Promise<Page<Item>> {
    const session = this.requireSession();
    const term = query.search!;
    const maximum = 10000;
    const identity = (id: string) => id.replace(/-/g, '').toLowerCase();
    const matches = new Map<string, Item>();
    const bounded = async (path: string, parameters: Record<string, string>): Promise<Item[]> => {
      const result: Item[] = [];
      while (true) {
        if (this.session !== session) throw new ServiceError('unauthorized', 'The connection changed. Search again.');
        const params = new URLSearchParams({ ...parameters, Fields: fields, EnableTotalRecordCount: 'true', StartIndex: String(result.length), Limit: '500' });
        const page = await this.json(`${path}?${params}`);
        const batch = page.Items || [];
        result.push(...batch);
        if ((page.TotalRecordCount || 0) > maximum || result.length > maximum) throw new ServiceError('unsupported', 'This search matches too much music. Enter a more specific title, artist, or album.');
        if (!batch.length || result.length >= (page.TotalRecordCount ?? result.length)) return result;
      }
    };
    const add = (items: Item[]) => {
      for (const item of items) matches.set(identity(item.Id), item);
      if (matches.size > maximum) throw new ServiceError('unsupported', 'This search matches too much music. Enter a more specific title, artist, or album.');
    };
    const artists = await bounded('/Artists', { UserId: session.userId, SearchTerm: term });
    const artistIds = artists.map(item => validId(item.Id));
    for (const library of session.selectedLibraryIds) {
      const base: Record<string, string> = { ParentId: library, Recursive: 'true', IncludeItemTypes: 'Audio', SortBy: sort, SortOrder: query.descending ? 'Descending' : 'Ascending' };
      if (query.genre) base.Genres = query.genre;
      if (query.tag) base.Tags = query.tag;
      add(await bounded(`/Users/${session.userId}/Items`, { ...base, SearchTerm: term }));
      for (let index = 0; index < artistIds.length; index += 100) {
        add(await bounded(`/Users/${session.userId}/Items`, { ...base, ArtistIds: artistIds.slice(index, index + 100).join(',') }));
      }
      const albums = await bounded(`/Users/${session.userId}/Items`, { ParentId: library, Recursive: 'true', IncludeItemTypes: 'MusicAlbum', SearchTerm: term });
      for (let index = 0; index < albums.length; index += 100) {
        const albumIds = albums.slice(index, index + 100).map(item => validId(item.Id));
        const wanted = new Set(albumIds.map(identity));
        // Jellyfin can also match other albums with the same title when AlbumIds is set.
        const songs = await bounded(`/Users/${session.userId}/Items`, { ...base, AlbumIds: albumIds.join(',') });
        add(songs.filter(item => item.AlbumId && wanted.has(identity(item.AlbumId))));
      }
    }
    const compareText = (a: unknown, b: unknown) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
    const items = [...matches.values()].sort((a, b) => {
      let value = 0;
      if (query.sort === 'year') value = (a.ProductionYear || 0) - (b.ProductionYear || 0);
      if (query.sort === 'artist') value = compareText(a.Artists?.[0] || a.AlbumArtist, b.Artists?.[0] || b.AlbumArtist);
      if (query.sort === 'album') value = compareText(a.Album, b.Album) || (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0) || (a.IndexNumber || 0) - (b.IndexNumber || 0);
      value ||= compareText(a.SortName || a.Name, b.SortName || b.Name) || compareText(a.Id, b.Id);
      return query.descending ? -value : value;
    });
    return { items: items.slice(start, start + limit), total: items.length, start };
  }
  async songs(query: CatalogQuery): Promise<Page<Song>> { const page = await this.catalog('Audio', query); return { ...page, items: page.items.map(item => this.songItem(item)) }; }
  async albums(query: CatalogQuery): Promise<Page<Album>> { const page = await this.catalog('MusicAlbum', query); return { ...page, items: page.items.map(item => this.albumItem(item)) }; }
  private async allItems(path: string, parameters: Record<string, string> = {}): Promise<Item[]> {
    const items: Item[] = [];
    while (true) {
      const params = new URLSearchParams({ ...parameters, StartIndex: String(items.length), Limit: '500', Fields: fields });
      const page = await this.json(`${path}?${params}`);
      const batch = page.Items || [];
      items.push(...batch);
      if (!batch.length || items.length >= (page.TotalRecordCount ?? items.length)) return items;
      if (items.length > 1000000) throw new ServiceError('unsupported', 'This selection is too large to load at once.');
    }
  }
  async albumTracks(value: string): Promise<Song[]> {
    const id = validId(value), s = this.requireSession();
    return (await this.allItems(`/Users/${s.userId}/Items`, { ParentId: id, Recursive: 'true', IncludeItemTypes: 'Audio', SortBy: 'ParentIndexNumber,IndexNumber,SortName' })).map(item => this.songItem(item));
  }
  async song(value: string): Promise<Song> {
    const id = validId(value), s = this.requireSession();
    const item = await this.json(`/Users/${s.userId}/Items/${id}`);
    if (item.Type !== 'Audio') throw new ServiceError('invalid', 'This item is not a song.');
    return this.songItem(item);
  }
  private playlistItem(item: Item): Playlist { return { id: item.Id, name: item.Name || 'Untitled playlist', songCount: item.ChildCount, imageUrl: item.ImageTags?.Primary ? this.deps.imageUrl(item.Id) : undefined }; }
  async playlists(): Promise<Playlist[]> {
    const s = this.requireSession();
    return (await this.allItems(`/Users/${s.userId}/Items`, { Recursive: 'true', IncludeItemTypes: 'Playlist', SortBy: 'SortName' })).filter(item => !item.MediaType || item.MediaType === 'Audio').map(item => this.playlistItem(item));
  }
  private async entries(id: string): Promise<PlaylistEntry[]> {
    const s = this.requireSession();
    return (await this.allItems(`/Playlists/${id}/Items`, { UserId: s.userId })).map(item => ({ entryId: item.PlaylistItemId || '', song: this.songItem(item) }));
  }
  async playlist(value: string): Promise<PlaylistDetail> {
    const id = validId(value), s = this.requireSession();
    const item = await this.json(`/Users/${s.userId}/Items/${id}`);
    let canEdit: boolean | null = null;
    try { const permission = await this.json(`/Playlists/${id}/Users/${s.userId}`); canEdit = permission?.CanEdit === true; }
    catch (error) { if (!(error instanceof ServiceError) || !['not-found', 'forbidden', 'unsupported'].includes(error.code)) throw error; }
    return { ...this.playlistItem(item), canEdit, restriction: canEdit === true ? undefined : canEdit === false ? 'Your account can listen to this playlist but cannot edit it.' : 'Jellyfin could not confirm edit permission. The server will check each change.', entries: await this.entries(id) };
  }
  private serialize<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const session = this.requireSession();
    const prior = this.writes.get(id) || Promise.resolve();
    const current = prior.catch(() => {}).then(() => {
      if (this.session !== session) throw new ServiceError('unauthorized', 'The connection changed. Refresh before editing this playlist.');
      return operation();
    });
    this.writes.set(id, current);
    void current.finally(() => { if (this.writes.get(id) === current) this.writes.delete(id); }).catch(() => {});
    return current;
  }
  async createPlaylist(input: { name: string; trackIds: string[] }): Promise<{ id: string }> {
    const label = name(input.name), tracks = ids(input.trackIds), s = this.requireSession();
    const result = await this.json('/Playlists', { method: 'POST', body: JSON.stringify({ Name: label, Ids: tracks, UserId: s.userId, MediaType: 'Audio', IsPublic: false }) });
    return { id: validId(result.Id) };
  }
  async renamePlaylist(input: { id: string; name: string }): Promise<void> {
    const id = validId(input.id), label = name(input.name);
    return this.serialize(id, async () => { await this.authenticatedRequest(`/Playlists/${id}`, { method: 'POST', body: JSON.stringify({ Name: label }) }); });
  }
  async addPlaylistItems(input: { id: string; trackIds: string[]; skipExisting: boolean }): Promise<void> {
    const id = validId(input.id), selection = ids(input.trackIds), session = this.requireSession();
    return this.serialize(id, async () => {
      let tracks = selection;
      if (input.skipExisting) { const present = new Set((await this.entries(id)).map(entry => entry.song.id)); tracks = selection.filter(track => { if (present.has(track)) return false; present.add(track); return true; }); }
      for (let index = 0; index < tracks.length; index += 100) {
        if (this.session !== session) throw new ServiceError('uncertain-write', 'The connection changed. Refresh this playlist before adding again.');
        const params = new URLSearchParams({ Ids: tracks.slice(index, index + 100).join(','), UserId: this.requireSession().userId });
        try { await this.authenticatedRequest(`/Playlists/${id}/Items?${params}`, { method: 'POST' }); }
        catch (error) { if (index > 0) throw new ServiceError('uncertain-write', 'Some songs were added before the operation stopped. Refresh this playlist before adding again.'); throw error; }
      }
    });
  }
  async removePlaylistEntries(input: { id: string; entryIds: string[] }): Promise<void> {
    const id = validId(input.id), session = this.requireSession();
    if (!Array.isArray(input.entryIds) || input.entryIds.length > 100000) throw new ServiceError('invalid', 'Invalid playlist entries.');
    const entries = input.entryIds.map(playlistEntryId);
    return this.serialize(id, async () => {
      for (let index = 0; index < entries.length; index += 100) {
        if (this.session !== session) throw new ServiceError('uncertain-write', 'The connection changed. Refresh this playlist.');
        const params = new URLSearchParams({ EntryIds: entries.slice(index, index + 100).join(',') });
        try { await this.authenticatedRequest(`/Playlists/${id}/Items?${params}`, { method: 'DELETE' }); }
        catch (error) { if (index > 0) throw new ServiceError('uncertain-write', 'Some entries were removed before the operation stopped. Refresh this playlist.'); throw error; }
      }
    });
  }
  async movePlaylistEntry(input: { id: string; entryId: string; index: number }): Promise<void> {
    const id = validId(input.id), entry = playlistEntryId(input.entryId);
    if (!Number.isSafeInteger(input.index) || input.index < 0) throw new ServiceError('invalid', 'Invalid playlist position.');
    return this.serialize(id, async () => { await this.authenticatedRequest(`/Playlists/${id}/Items/${entry}/Move/${input.index}`, { method: 'POST' }); });
  }
}
