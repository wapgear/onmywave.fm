import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Disc3, ListMusic, Music2, Radio, Settings } from 'lucide-react';
import type { Connection, Song } from '../shared/types';
import { unwrap } from './api';
import { useRetryFocus } from './useRetryFocus';
import { PlayerProvider } from './player';
import { DJPlaybackProvider } from './dj-playback';
import { Player } from './components/Player/Player.component';
import { AddPlaylist } from './components/AddPlaylist/AddPlaylist.component';
import { Queue } from './components/Queue/Queue.component';
import './components/Drawer/Drawer.styles.css';
import { Inspector } from './components/Inspector/Inspector.component';
import { LibrarySelectionProvider, type ConnectionTransition } from './components/LibrarySelection';
import { SettingsEditsProvider } from './pages/Settings/SettingsEdits';
import { ProviderKeyEditsProvider } from './components/ProviderKeys/ProviderKeyEdits';
import { ErrorNotice } from './components/Shared';
import { ConnectionPage } from './pages/Connection/Connection.page';
import { SongsPage, initialSongsView } from './pages/Songs/Songs.page';
import { AlbumsPage, initialAlbumsView } from './pages/Albums/Albums.page';
import { PlaylistsPage, usePlaylistRecovery } from './pages/Playlists/Playlists.page';
import { StationsPage, type RoomDraft, type RoomSetupDraft } from './pages/Stations/Stations.page';
import { SettingsPage, type SettingsSection } from './pages/Settings/Settings.page';
import { NewsRecoveryNotice, NewsRecoveryProvider } from './NewsRecovery';
type PageName = 'songs' | 'albums' | 'playlists' | 'stations' | 'settings';
const navigation = [{ id: 'songs', name: 'All songs', icon: Music2 }, { id: 'albums', name: 'Albums', icon: Disc3 }, { id: 'playlists', name: 'Playlists', icon: ListMusic }, { id: 'stations', name: 'News bucket', icon: Radio }] as const;
export default function App() {
  const client = useQueryClient();
  const connectionQuery = useQuery({ queryKey: ['connection'], queryFn: async () => unwrap(await window.wave.getConnection()), retry: false });
  const connectionRetryFocus = useRetryFocus({ ownerKey: 'connection-startup', target: () => document.querySelector<HTMLElement>('.page-heading h1, .connection-card h1'), canFocusSuccess: () => connectionQuery.isSuccess && !connectionQuery.isFetching });
  const [expired, setExpired] = useState(false);
  const { retryFrom: transitionWithFocus } = useRetryFocus({ ownerKey: 'connection-transition', target: () => null, canFocusSuccess: () => connectionQuery.isSuccess && !connectionQuery.isFetching && !!connectionQuery.data && !expired });
  const runConnectionTransition: ConnectionTransition = (source, operation) => {
    let destination: Connection | undefined;
    return transitionWithFocus(source, async () => {
      destination = await operation();
      return { isError: !destination };
    }, () => {
      const current = client.getQueryData<Connection | null>(['connection']);
      const expected = destination;
      if (!expected || current?.id !== expected.id || current.selectedLibraryIds.length !== expected.selectedLibraryIds.length
        || current.selectedLibraryIds.some(id => !expected.selectedLibraryIds.includes(id))) return null;
      const heading = document.querySelector<HTMLElement>(expected.selectedLibraryIds.length ? '.page-heading h1' : '.connection-card h1');
      return heading?.checkVisibility() ? heading : null;
    }, undefined, () => source);
  };
  useEffect(() => { const expire = () => setExpired(true); window.addEventListener('wave:auth-expired', expire); return () => window.removeEventListener('wave:auth-expired', expire); }, []);
  async function setConnection(connection: Connection | null, clearExpiry = true) {
    const accountData = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== 'connection' };
    await client.cancelQueries(accountData);
    client.removeQueries(accountData);
    client.setQueryData(['connection'], connection);
    if (clearExpiry) setExpired(false);
  }
  const connection = connectionQuery.data ?? null;
  return <ProviderKeyEditsProvider sessionId={connection?.id ?? null}><NewsRecoveryProvider><SettingsEditsProvider>{connectionQuery.isPending || connectionQuery.error
      ? <main className="startup"><h1 className="wordmark" tabIndex={-1}>onmywave.fm</h1>{connectionQuery.isPending && <p role="status">Opening your library…</p>}<ErrorNotice error={connectionQuery.error} retryRef={connectionRetryFocus.retryRef} retrying={connectionQuery.isFetching} retry={() => connectionRetryFocus.retry(() => connectionQuery.refetch())} /><NewsRecoveryNotice focusTarget={() => document.querySelector<HTMLElement>('.startup h1')} /></main>
      : <SessionContent key={connection?.id ?? 'signed-out'} connection={connection} expired={expired && !!connection} setConnection={setConnection} runConnectionTransition={runConnectionTransition} />}</SettingsEditsProvider></NewsRecoveryProvider></ProviderKeyEditsProvider>;
}
type RadioDrafts = {
  roomDraft: RoomDraft; setRoomDraft: Dispatch<SetStateAction<RoomDraft>>;
  roomSetupDraft: RoomSetupDraft; setRoomSetupDraft: Dispatch<SetStateAction<RoomSetupDraft>>;
};
function SessionContent({ connection, expired, setConnection, runConnectionTransition }: { connection: Connection | null; expired: boolean; setConnection: (connection: Connection | null, clearExpiry?: boolean) => Promise<void>; runConnectionTransition: ConnectionTransition }) {
  const playlistRecovery = usePlaylistRecovery();
  const [roomDraft, setRoomDraft] = useState<RoomDraft>(null);
  const [roomSetupDraft, setRoomSetupDraft] = useState<RoomSetupDraft>({ setup: null, moodDraft: null });
  const librariesSelected = (value: Connection) => setConnection(value, false);
  const content = !connection || expired || !connection.selectedLibraryIds.length ? <ConnectionPage key={`${connection?.id ?? 'new'}-${expired}`} connection={connection} expired={expired} connected={setConnection} librariesSelected={librariesSelected} runConnectionTransition={runConnectionTransition} />
    : <PlayerProvider key={connection.id} connection={connection}><DJPlaybackProvider><ReadyApp key={connection.id} connection={connection} update={librariesSelected} disconnected={() => setConnection(null)} playlistRecovery={playlistRecovery} roomDraft={roomDraft} setRoomDraft={setRoomDraft} roomSetupDraft={roomSetupDraft} setRoomSetupDraft={setRoomSetupDraft} /></DJPlaybackProvider></PlayerProvider>;
  return <LibrarySelectionProvider connection={connection} expired={expired}>{content}</LibrarySelectionProvider>;
}
function ReadyApp({ connection, update, disconnected, playlistRecovery, roomDraft, setRoomDraft, roomSetupDraft, setRoomSetupDraft }: { connection: Connection; update: (connection: Connection) => void; disconnected: () => void; playlistRecovery: ReturnType<typeof usePlaylistRecovery> } & RadioDrafts) {
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [songsView, setSongsView] = useState(initialSongsView);
  const [albumsView, setAlbumsView] = useState(initialAlbumsView);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const main = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const collectionFocus = useRef<{ location: string; origin: HTMLElement; playlistId?: string } | null>(null);
  function requestCollectionFocus(location: string, origin: HTMLButtonElement, playlistId?: string) {
    collectionFocus.current = document.activeElement === origin && main.current?.contains(origin)
      && origin.matches(playlistId ? '.back-button' : '.album-tile, .playlist-tile')
      ? { location, origin, playlistId } : null;
  }
  function requestCreatedPlaylistFocus(id: string, origin: HTMLElement | null) {
    const scope = origin?.closest('dialog[open]');
    collectionFocus.current = origin && document.activeElement === origin && scope
      && document.visibilityState === 'visible' && document.hasFocus()
      && [...document.querySelectorAll('dialog[open], :popover-open')].every(open => open === scope)
      ? { location: `playlists-${id}`, origin } : null;
  }
  const [page, setPage] = useState<PageName>('songs');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [returnToSetup, setReturnToSetup] = useState(false);
  const setupReturnTarget = useRef('');
  const restoreSetupFocus = useRef(false);
  const [drawer, setDrawer] = useState<Song | 'queue' | null>(null);
  const drawerTrigger = useRef<HTMLElement | null>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  function openDrawer(value: Song | 'queue') {
    drawerTrigger.current = value === 'queue' ? document.querySelector<HTMLElement>('[aria-controls="listening-drawer"]') : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawer(value);
  }
  function closeDrawer() { if (!drawer) return; setDrawer(null); const trigger = drawerTrigger.current; drawerTrigger.current = null; if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }
  const closeDrawerRef = useRef(closeDrawer);
  useLayoutEffect(() => { closeDrawerRef.current = closeDrawer; });
  useLayoutEffect(() => { if (drawer) drawerClose.current?.focus({ preventScroll: true }); }, [drawer]);
  const [adding, setAdding] = useState<Song[] | null>(null);
  function updateLibraries(value: Connection) {
    if (!active.current || value?.id !== connection.id) return;
    setSongsView(initialSongsView()); setAlbumsView(initialAlbumsView()); setPlaylistId(null); setDrawer(null); scrollPositions.current.clear();
    update(value);
  }
  const client = useQueryClient();
  const networkError = useSyncExternalStore(
    notify => client.getQueryCache().subscribe(notify),
    () => client.getQueryCache().getAll().some(query => { const error = query.state.error as { code?: string } | null; return error?.code === 'offline' || error?.code === 'timeout'; }),
  );
  const location = page === 'songs' ? `songs-${songsView.query.search ?? ''}-${songsView.query.genre ?? ''}-${songsView.query.tag ?? ''}-${songsView.query.sort}-${songsView.query.descending}` : page === 'albums' ? `albums-${albumsView.album?.id ?? albumsView.draft}` : page === 'playlists' ? `playlists-${playlistId ?? 'list'}` : page === 'settings' ? `settings-${settingsSection}` : page;
  useLayoutEffect(() => {
    const node = main.current;
    if (!node || !content.current) return;
    const positions = scrollPositions.current;
    const entry = collectionFocus.current;
    collectionFocus.current = null;
    const ownsCollectionFocus = entry?.location === location
      && (document.activeElement === entry.origin || document.activeElement === document.body)
      && document.visibilityState === 'visible' && document.hasFocus()
      && !document.querySelector('dialog[open], :popover-open');
    const target = ownsCollectionFocus && !entry.playlistId ? 0 : positions.get(location) ?? 0;
    let restoring = true;
    const observer = new ResizeObserver(restore);
    function restore() {
      if (!restoring) return;
      node!.scrollTop = target;
      if (node!.scrollHeight - node!.clientHeight >= target) { restoring = false; observer.disconnect(); }
    }
    observer.observe(content.current);
    restore();
    if (ownsCollectionFocus) {
      restoring = false;
      observer.disconnect();
      const focusTarget = entry.playlistId
        ? [...node.querySelectorAll<HTMLElement>('[data-playlist-id]')].find(tile => tile.dataset.playlistId === entry.playlistId) ?? node.querySelector<HTMLElement>('.page-heading h1')
        : node.querySelector<HTMLButtonElement>('.back-button');
      focusTarget?.focus({ preventScroll: true });
      if (entry.playlistId) focusTarget?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const save = () => { if (!restoring) positions.set(location, node.scrollTop); };
    const stop = () => { restoring = false; observer.disconnect(); };
    node.addEventListener('scroll', save, { passive: true });
    node.addEventListener('wheel', stop, { passive: true });
    node.addEventListener('pointerdown', stop);
    node.addEventListener('keydown', stop);
    return () => { observer.disconnect(); node.removeEventListener('scroll', save); node.removeEventListener('wheel', stop); node.removeEventListener('pointerdown', stop); node.removeEventListener('keydown', stop); };
  }, [location]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('dialog[open]') || document.querySelector(':popover-open')) return;
      if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') { const input = main.current?.querySelector<HTMLInputElement>('.search-field input'); if (input) { event.preventDefault(); input.focus(); input.select(); } }
      if (event.key === 'Escape') closeDrawerRef.current();
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  function navigate(next: PageName) { setPage(next); setDrawer(null); setReturnToSetup(false); }
  function openNewsSettings() {
    setRoomSetupDraft(current => ({ ...current, tab: 'settings' }));
    setPage('stations'); setDrawer(null); setReturnToSetup(false);
  }
  function configureRoom(section: SettingsSection) {
    setupReturnTarget.current = section === 'sources' ? '#manage-room-sources' : section === 'djs' ? '#manage-room-djs' : '.news-workflow-toggle input';
    setSettingsSection(section); setReturnToSetup(true); setPage('settings'); setDrawer(null);
  }
  useLayoutEffect(() => {
    if (page !== 'stations' || !restoreSetupFocus.current) return;
    restoreSetupFocus.current = false;
    const frame = requestAnimationFrame(() => {
      const preferred = main.current?.querySelector<HTMLElement>(setupReturnTarget.current);
      const target = preferred && !preferred.matches(':disabled') ? preferred : document.getElementById('room-tab-settings');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [page]);

  return <div className={`app-shell ${drawer ? 'has-drawer' : ''}`}><aside className="sidebar"><div className="traffic-light-space" /><div className="wordmark">onmywave.fm</div><nav aria-label="Main navigation">{navigation.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={21} strokeWidth={1.7} />{item.name}</button>)}</nav><div className="sidebar-bottom"><button className={`settings-nav ${page === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')} aria-current={page === 'settings' ? 'page' : undefined}><Settings size={20} strokeWidth={1.7} />Settings</button><p className={`connection-status ${networkError ? 'unreachable' : ''}`}><span />{networkError ? 'Server unreachable' : 'Jellyfin connected'}</p></div></aside>
    <div className="titlebar-drag-region" /><main ref={main} className="main-content" id="main-content"><div ref={content} className="page-content"><NewsRecoveryNotice onOpenSettings={openNewsSettings} focusTarget={() => content.current?.querySelector<HTMLElement>('.page-heading h1') ?? null} settingsTarget={() => content.current?.querySelector<HTMLElement>('#room-panel-settings') ?? null} />{page === 'songs' && <SongsPage view={songsView} setView={setSongsView} add={setAdding} details={openDrawer} />}{page === 'albums' && <AlbumsPage onOpenDetail={(id, origin) => requestCollectionFocus(`albums-${id}`, origin)} view={albumsView} setView={setAlbumsView} add={setAdding} details={openDrawer} />}{page === 'playlists' && <PlaylistsPage onCreateDetail={requestCreatedPlaylistFocus} onReturnFromDetail={(id, origin) => requestCollectionFocus('playlists-list', origin, id)} onOpenDetail={(id, origin) => requestCollectionFocus(`playlists-${id}`, origin)} recovery={playlistRecovery} id={playlistId} setId={setPlaylistId} add={setAdding} details={openDrawer} />}{page === 'stations' && <StationsPage draft={roomDraft} setDraft={setRoomDraft} configDraft={roomSetupDraft} setConfigDraft={setRoomSetupDraft} configureSources={() => configureRoom('sources')} configureDJ={() => configureRoom('djs')} configureSettings={() => configureRoom('keys')} />}{page === 'settings' && <SettingsPage section={settingsSection} onSectionChange={setSettingsSection} returnToSetup={returnToSetup ? () => { restoreSetupFocus.current = true; setRoomSetupDraft(current => ({ ...current, tab: 'settings' })); setPage('stations'); setReturnToSetup(false); } : undefined} connection={connection} update={updateLibraries} disconnected={() => { if (active.current) disconnected(); }} />}</div></main>
    {drawer && <aside id="listening-drawer" className="side-drawer" aria-labelledby="drawer-title"><header className="drawer-heading"><h2 id="drawer-title">{drawer === 'queue' ? 'Playing Next' : 'Song details'}</h2><button ref={drawerClose} className="icon-button" onClick={closeDrawer} aria-label={drawer === 'queue' ? 'Close queue' : 'Close song details'}><span aria-hidden="true">×</span></button></header><div key={drawer === 'queue' ? 'queue' : drawer.id} className="drawer-body">{drawer === 'queue' ? <Queue /> : <Inspector key={drawer.id} song={drawer} />}</div></aside>}<Player openRoom={() => navigate('stations')} openSettings={() => configureRoom('general')} queueOpen={drawer === 'queue'} toggleQueue={() => drawer === 'queue' ? closeDrawer() : openDrawer('queue')} />{adding && <AddPlaylist songs={adding} close={() => setAdding(null)} checkPlaylists={() => { setAdding(null); setPlaylistId(null); navigate('playlists'); }} />}
  </div>;
}
