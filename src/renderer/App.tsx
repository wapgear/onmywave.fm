import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query';
import { Disc3, ListMusic, Music2, Radio, Settings, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { Connection, Song } from '../shared/types';
import { unwrap } from './api';
import type { ReadyAppProps, SessionContentProps } from './App.types';
import { AddPlaylist } from './components/AddPlaylist/AddPlaylist.component';
import { IconButton } from './components/IconButton/IconButton.component';
import { Inspector } from './components/Inspector/Inspector.component';
import { LibrarySelectionProvider } from './components/LibrarySelection';
import type { ConnectionTransition } from './components/LibrarySelection.types';
import { Lyrics } from './components/Lyrics/Lyrics.component';
import { Player } from './components/Player/Player.component';
import { ProviderKeyEditsProvider } from './components/ProviderKeys/ProviderKeyEdits';
import { Queue } from './components/Queue/Queue.component';
import { RenderErrorBoundary } from './components/RenderErrorBoundary/RenderErrorBoundary.component';

import './components/Drawer/Drawer.styles.css';
import { ErrorNotice } from './components/Shared';
import { DJPlaybackProvider } from './dj-playback';
import { NewsRecoveryNotice, NewsRecoveryProvider } from './NewsRecovery';
import { AlbumsPage, initialAlbumsView } from './pages/Albums/Albums.page';
import { ConnectionPage } from './pages/Connection/Connection.page';
import { PlaylistsPage, usePlaylistRecovery } from './pages/Playlists/Playlists.page';
import { SettingsPage } from './pages/Settings/Settings.page';
import type { SettingsSection } from './pages/Settings/Settings.types';
import { SettingsEditsProvider } from './pages/Settings/SettingsEdits';
import { SongsPage, initialSongsView } from './pages/Songs/Songs.page';
import { StationsPage } from './pages/Stations/Stations.page';
import type { RoomSetupDraft } from './pages/Stations/Stations.types';
import { PlayerProvider, usePlayer } from './player';
import { useRetryFocus } from './useRetryFocus';

type PageName = 'songs' | 'albums' | 'playlists' | 'stations' | 'settings';

const navigation = [
  { id: 'songs', name: 'All songs', icon: Music2 },
  { id: 'albums', name: 'Albums', icon: Disc3 },
  { id: 'playlists', name: 'Playlists', icon: ListMusic },
  { id: 'stations', name: 'News bucket', icon: Radio },
] as const;

export default function App() {
  const client = useQueryClient();
  const connectionQuery = useQuery({
    queryKey: ['connection'],
    queryFn: async () => unwrap(await window.wave.getConnection()),
    retry: false,
  });
  const connectionRetryFocus = useRetryFocus({
    ownerKey: 'connection-startup',
    target: () => document.querySelector<HTMLElement>('.page-heading h1, .connection-card h1'),
    canFocusSuccess: () => connectionQuery.isSuccess && !connectionQuery.isFetching,
  });
  const [expired, setExpired] = useState(false);
  const deferredExpiry = useRef<number | null>(null);
  const pendingAuthChanges = useIsMutating({ predicate: (mutation) => !!mutation.options.meta?.authAttempt });
  const { retryFrom: transitionWithFocus } = useRetryFocus({
    ownerKey: 'connection-transition',
    target: () => null,
    canFocusSuccess: () =>
      connectionQuery.isSuccess && !connectionQuery.isFetching && !!connectionQuery.data && !expired,
  });
  const runConnectionTransition: ConnectionTransition = (source, operation) => {
    let destination: Connection | undefined;
    return transitionWithFocus(
      source,
      async () => {
        destination = await operation();
        return { isError: !destination };
      },
      () => {
        const current = client.getQueryData<Connection | null>(['connection']);
        const expected = destination;
        if (
          !expected ||
          current?.id !== expected.id ||
          current.selectedLibraryIds.length !== expected.selectedLibraryIds.length ||
          current.selectedLibraryIds.some((id) => !expected.selectedLibraryIds.includes(id))
        )
          return null;
        const heading = document.querySelector<HTMLElement>(
          expected.selectedLibraryIds.length ? '.page-heading h1' : '.connection-card h1',
        );
        return heading?.checkVisibility() ? heading : null;
      },
      undefined,
      () => source,
    );
  };

  useEffect(() => {
    const expire = (event: Event) => {
      const revision = (event as CustomEvent<{ authRevision: number }>).detail?.authRevision;
      if (revision === undefined || client.getQueryData<Connection | null>(['connection'])?.authRevision !== revision)
        return;
      if (client.isMutating({ predicate: (mutation) => !!mutation.options.meta?.authAttempt }))
        deferredExpiry.current = revision;
      else {
        deferredExpiry.current = null;
        setExpired(true);
      }
    };
    window.addEventListener('wave:auth-expired', expire);
    return () => window.removeEventListener('wave:auth-expired', expire);
  }, [client]);

  useEffect(() => {
    if (pendingAuthChanges || deferredExpiry.current === null) return;
    const revision = deferredExpiry.current;
    deferredExpiry.current = null;
    if (client.getQueryData<Connection | null>(['connection'])?.authRevision === revision) setExpired(true);
  }, [pendingAuthChanges, client, connectionQuery.data?.authRevision]);

  async function setConnection(connection: Connection | null, clearExpiry = true) {
    const accountData = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== 'connection' };
    await client.cancelQueries(accountData);
    client.removeQueries(accountData);
    client.setQueryData(['connection'], connection);
    if (clearExpiry) {
      deferredExpiry.current = null;
      setExpired(false);
    }
  }
  const connection = connectionQuery.data ?? null;

  return (
    <>
      <div className="titlebar-drag-region" aria-hidden="true" />
      <ProviderKeyEditsProvider sessionId={connection?.id ?? null}>
        <NewsRecoveryProvider>
          <SettingsEditsProvider>
            {connectionQuery.isPending || connectionQuery.error ? (
              <main className="startup">
                <h1 className="wordmark" tabIndex={-1}>
                  onmywave.fm
                </h1>
                {connectionQuery.isPending && <p role="status">Opening your library…</p>}
                <ErrorNotice
                  error={connectionQuery.error}
                  retryRef={connectionRetryFocus.retryRef}
                  retrying={connectionQuery.isFetching}
                  retry={() => connectionRetryFocus.retry(() => connectionQuery.refetch())}
                />
                <NewsRecoveryNotice focusTarget={() => document.querySelector<HTMLElement>('.startup h1')} />
              </main>
            ) : (
              <SessionContent
                key={connection?.id ?? 'signed-out'}
                connection={connection}
                expired={expired && !!connection}
                setConnection={setConnection}
                runConnectionTransition={runConnectionTransition}
              />
            )}
          </SettingsEditsProvider>
        </NewsRecoveryProvider>
      </ProviderKeyEditsProvider>
    </>
  );
}

function SessionContent({ connection, expired, setConnection, runConnectionTransition }: SessionContentProps) {
  const playlistRecovery = usePlaylistRecovery();
  const [roomSetupDraft, setRoomSetupDraft] = useState<RoomSetupDraft>({ setup: null, moodDraft: null });
  const librariesSelected = (value: Connection) => setConnection(value, false);
  const content =
    !connection || expired || !connection.selectedLibraryIds.length ? (
      <ConnectionPage
        key={`${connection?.id ?? 'new'}-${expired}`}
        connection={connection}
        expired={expired}
        connected={setConnection}
        librariesSelected={librariesSelected}
        runConnectionTransition={runConnectionTransition}
      />
    ) : (
      <PlayerProvider key={connection.id} connection={connection}>
        <DJPlaybackProvider>
          <ReadyApp
            key={connection.id}
            connection={connection}
            update={(connection) => void librariesSelected(connection)}
            disconnected={() => setConnection(null)}
            playlistRecovery={playlistRecovery}
            roomSetupDraft={roomSetupDraft}
            setRoomSetupDraft={setRoomSetupDraft}
          />
        </DJPlaybackProvider>
      </PlayerProvider>
    );

  return (
    <LibrarySelectionProvider connection={connection} expired={expired}>
      {content}
    </LibrarySelectionProvider>
  );
}

function ReadyApp({
  connection,
  update,
  disconnected,
  playlistRecovery,
  roomSetupDraft,
  setRoomSetupDraft,
}: ReadyAppProps) {
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const [songsView, setSongsView] = useState(initialSongsView);
  const [albumsView, setAlbumsView] = useState(initialAlbumsView);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const main = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const collectionFocus = useRef<{ location: string; origin: HTMLElement; playlistId?: string } | null>(null);
  function requestCollectionFocus(location: string, origin: HTMLButtonElement, playlistId?: string) {
    collectionFocus.current =
      document.activeElement === origin &&
      main.current?.contains(origin) &&
      origin.matches(playlistId ? '.back-button' : '.album-tile, .playlist-tile')
        ? { location, origin, playlistId }
        : null;
  }
  function requestCreatedPlaylistFocus(id: string, origin: HTMLElement | null) {
    const scope = origin?.closest('dialog[open]');
    collectionFocus.current =
      origin &&
      document.activeElement === origin &&
      scope &&
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      [...document.querySelectorAll('dialog[open], :popover-open')].every((open) => open === scope)
        ? { location: `playlists-${id}`, origin }
        : null;
  }
  const [page, setPage] = useState<PageName>('songs');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [returnToSetup, setReturnToSetup] = useState(false);
  const managementSection = useRef<SettingsSection | null>(null);
  const playerDestination = useRef<'stations' | 'settings' | null>(null);
  const setupReturnTarget = useRef('');
  const restoreSetupFocus = useRef(false);
  const player = usePlayer();
  const [drawer, setDrawer] = useState<Song | 'queue' | 'lyrics' | null>(null);
  const drawerTrigger = useRef<HTMLElement | null>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  if (drawer === 'lyrics' && !player.current) setDrawer(null);
  const visibleDrawer = drawer === 'lyrics' && !player.current ? null : drawer;
  function openDrawer(value: Song | 'queue' | 'lyrics', source?: HTMLElement | null) {
    drawerTrigger.current = source ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setDrawer(value);
  }
  function closeDrawer() {
    if (!drawer) return;
    setDrawer(null);
    const trigger = drawerTrigger.current;
    drawerTrigger.current = null;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  }
  const closeDrawerRef = useRef(closeDrawer);

  useLayoutEffect(() => {
    closeDrawerRef.current = closeDrawer;
  });

  useLayoutEffect(() => {
    if (visibleDrawer) drawerClose.current?.focus({ preventScroll: true });
  }, [visibleDrawer]);

  const [adding, setAdding] = useState<Song[] | null>(null);
  function updateLibraries(value: Connection) {
    if (!active.current || value?.id !== connection.id) return;
    setSongsView(initialSongsView());
    setAlbumsView(initialAlbumsView());
    setPlaylistId(null);
    setDrawer(null);
    scrollPositions.current.clear();
    update(value);
  }
  const client = useQueryClient();
  const networkError = useSyncExternalStore(
    (notify) => client.getQueryCache().subscribe(notify),
    () =>
      client
        .getQueryCache()
        .getAll()
        .some((query) => {
          const error = query.state.error as { code?: string } | null;
          return error?.code === 'offline' || error?.code === 'timeout';
        }),
  );
  const location =
    page === 'songs'
      ? `songs-${songsView.query.search ?? ''}-${songsView.query.genre ?? ''}-${songsView.query.tag ?? ''}-${songsView.query.sort}-${songsView.query.descending}`
      : page === 'albums'
        ? `albums-${albumsView.album?.id ?? albumsView.draft}`
        : page === 'playlists'
          ? `playlists-${playlistId ?? 'list'}`
          : page === 'settings'
            ? `settings-${settingsSection}`
            : page;

  useLayoutEffect(() => {
    const node = main.current;
    if (!node || !content.current) return;
    const positions = scrollPositions.current;
    const entry = collectionFocus.current;
    collectionFocus.current = null;
    const ownsCollectionFocus =
      entry?.location === location &&
      (document.activeElement === entry.origin || document.activeElement === document.body) &&
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      !document.querySelector('dialog[open], :popover-open');
    const target = ownsCollectionFocus && !entry.playlistId ? 0 : (positions.get(location) ?? 0);
    let restoring = true;
    const observer = new ResizeObserver(restore);
    function restore() {
      if (!restoring) return;
      node!.scrollTop = target;
      if (node!.scrollHeight - node!.clientHeight >= target) {
        restoring = false;
        observer.disconnect();
      }
    }
    observer.observe(content.current);
    restore();
    if (ownsCollectionFocus) {
      restoring = false;
      observer.disconnect();
      const focusTarget = entry.playlistId
        ? ([...node.querySelectorAll<HTMLElement>('[data-playlist-id]')].find(
            (tile) => tile.dataset.playlistId === entry.playlistId,
          ) ?? node.querySelector<HTMLElement>('.page-heading h1'))
        : node.querySelector<HTMLButtonElement>('.back-button');
      focusTarget?.focus({ preventScroll: true });
      if (entry.playlistId) focusTarget?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const save = () => {
      if (!restoring) positions.set(location, node.scrollTop);
    };
    const stop = () => {
      restoring = false;
      observer.disconnect();
    };
    node.addEventListener('scroll', save, { passive: true });
    node.addEventListener('wheel', stop, { passive: true });
    node.addEventListener('pointerdown', stop);
    node.addEventListener('keydown', stop);
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', save);
      node.removeEventListener('wheel', stop);
      node.removeEventListener('pointerdown', stop);
      node.removeEventListener('keydown', stop);
    };
  }, [location]);

  const { retryFrom: enterManagement } = useRetryFocus({
    ownerKey: 'setup-management',
    target: () =>
      settingsSection === 'keys'
        ? (content.current?.querySelector<HTMLElement>('.settings-sections [aria-current="page"]') ?? null)
        : (Array.from(content.current?.querySelectorAll<HTMLElement>('.page-heading h1') ?? []).at(-1) ?? null),
    canFocusSuccess: () => page === 'settings' && returnToSetup && settingsSection === managementSection.current,
  });
  const { retryFrom: enterPlayerDestination } = useRetryFocus({
    ownerKey: 'player-navigation',
    target: () =>
      page === 'settings'
        ? (content.current?.querySelector<HTMLElement>('#dj-playback-title') ?? null)
        : (content.current?.querySelector<HTMLElement>('.page-heading h1') ?? null),
    canFocusSuccess: () =>
      page === playerDestination.current && !returnToSetup && (page !== 'settings' || settingsSection === 'general'),
  });

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('dialog[open]') || document.querySelector(':popover-open'))
        return;
      if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
        const input = main.current?.querySelector<HTMLInputElement>('.search-field input');
        if (input) {
          event.preventDefault();
          input.focus();
          input.select();
        }
      }
      if (event.key === 'Escape') closeDrawerRef.current();
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  function navigate(next: PageName) {
    setPage(next);
    setDrawer(null);
    setReturnToSetup(false);
  }
  function openPlayerDestination(next: 'stations' | 'settings', source: HTMLButtonElement | null) {
    void enterPlayerDestination(source, async () => {
      playerDestination.current = next;
      scrollPositions.current.delete(next === 'settings' ? 'settings-general' : 'stations');
      if (next === 'settings') setSettingsSection('general');
      navigate(next);
      return { isError: false };
    });
  }
  function openNewsSettings() {
    setRoomSetupDraft((current) => ({ ...current, tab: 'settings' }));
    setPage('stations');
    setDrawer(null);
    setReturnToSetup(false);
  }
  function configureRoom(section: SettingsSection) {
    const focused = document.activeElement;
    const source =
      page === 'stations' && focused instanceof HTMLButtonElement && content.current?.contains(focused)
        ? focused
        : null;
    void enterManagement(source, async () => {
      managementSection.current = section;
      if (source) scrollPositions.current.delete(`settings-${section}`);
      setupReturnTarget.current =
        section === 'sources'
          ? '#manage-room-sources'
          : section === 'djs'
            ? '#manage-room-djs'
            : '.news-workflow-toggle input';
      setSettingsSection(section);
      setReturnToSetup(true);
      setPage('settings');
      setDrawer(null);
      return { isError: false };
    });
  }

  useLayoutEffect(() => {
    if (page !== 'stations' || !restoreSetupFocus.current) return;
    restoreSetupFocus.current = false;
    const frame = requestAnimationFrame(() => {
      const preferred = main.current?.querySelector<HTMLElement>(setupReturnTarget.current);
      const target =
        preferred && !preferred.matches(':disabled') ? preferred : document.getElementById('room-tab-settings');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [page]);

  return (
    <div className={`app-shell ${visibleDrawer && visibleDrawer !== 'lyrics' ? 'has-drawer' : ''}`}>
      <aside className="sidebar">
        <div className="traffic-light-space" />
        <div className="wordmark">onmywave.fm</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={21} strokeWidth={1.7} />
              {item.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`settings-nav ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
            aria-current={page === 'settings' ? 'page' : undefined}
          >
            <Settings size={20} strokeWidth={1.7} />
            Settings
          </button>
          <p className={`connection-status ${networkError ? 'unreachable' : ''}`}>
            <span />
            {networkError ? 'Server unreachable' : 'Jellyfin connected'}
          </p>
        </div>
      </aside>
      <main
        ref={main}
        className="main-content"
        id="main-content"
        inert={visibleDrawer === 'lyrics'}
        aria-hidden={visibleDrawer === 'lyrics' || undefined}
      >
        <div ref={content} className="page-content">
          <NewsRecoveryNotice
            onOpenSettings={openNewsSettings}
            focusTarget={() => content.current?.querySelector<HTMLElement>('.page-heading h1') ?? null}
            settingsTarget={() => content.current?.querySelector<HTMLElement>('#room-panel-settings') ?? null}
          />
          <RenderErrorBoundary scope="page" resetKey={location}>
            {page === 'songs' && (
              <SongsPage view={songsView} setView={setSongsView} add={setAdding} details={openDrawer} />
            )}
            {page === 'albums' && (
              <AlbumsPage
                onOpenDetail={(id, origin) => requestCollectionFocus(`albums-${id}`, origin)}
                view={albumsView}
                setView={setAlbumsView}
                add={setAdding}
                details={openDrawer}
              />
            )}
            {page === 'playlists' && (
              <PlaylistsPage
                onCreateDetail={requestCreatedPlaylistFocus}
                onReturnFromDetail={(id, origin) => requestCollectionFocus('playlists-list', origin, id)}
                onOpenDetail={(id, origin) => requestCollectionFocus(`playlists-${id}`, origin)}
                recovery={playlistRecovery}
                id={playlistId}
                setId={setPlaylistId}
                add={setAdding}
                details={openDrawer}
              />
            )}
            {page === 'stations' && (
              <StationsPage
                configDraft={roomSetupDraft}
                setConfigDraft={setRoomSetupDraft}
                configureSources={() => configureRoom('sources')}
                configureDJ={() => configureRoom('djs')}
                configureSettings={() => configureRoom('keys')}
              />
            )}
            {page === 'settings' && (
              <SettingsPage
                section={settingsSection}
                onSectionChange={setSettingsSection}
                returnToSetup={
                  returnToSetup
                    ? () => {
                        restoreSetupFocus.current = true;
                        scrollPositions.current.delete('stations');
                        setRoomSetupDraft((current) => ({ ...current, tab: 'settings' }));
                        setPage('stations');
                        setReturnToSetup(false);
                      }
                    : undefined
                }
                connection={connection}
                update={updateLibraries}
                disconnected={() => (active.current ? disconnected() : undefined)}
              />
            )}
          </RenderErrorBoundary>
        </div>
      </main>
      {visibleDrawer && (
        <aside
          id="listening-drawer"
          className={`side-drawer ${visibleDrawer === 'lyrics' ? 'lyrics-drawer' : ''}`}
          role={visibleDrawer === 'lyrics' ? 'dialog' : undefined}
          aria-labelledby="drawer-title"
        >
          <header className="drawer-heading">
            <h2 id="drawer-title">
              {visibleDrawer === 'queue' ? 'Playing Next' : visibleDrawer === 'lyrics' ? 'Lyrics' : 'Song details'}
            </h2>
            <IconButton
              ref={drawerClose}
              onClick={closeDrawer}
              label={
                visibleDrawer === 'queue'
                  ? 'Close queue'
                  : visibleDrawer === 'lyrics'
                    ? 'Close lyrics'
                    : 'Close song details'
              }
            >
              <X size={20} aria-hidden="true" />
            </IconButton>
          </header>
          <div
            key={visibleDrawer === 'queue' || visibleDrawer === 'lyrics' ? visibleDrawer : visibleDrawer.id}
            className="drawer-body"
            role={visibleDrawer === 'lyrics' ? 'region' : undefined}
            tabIndex={visibleDrawer === 'lyrics' ? 0 : undefined}
            aria-label={visibleDrawer === 'lyrics' ? 'Song lyrics' : undefined}
          >
            {visibleDrawer === 'queue' ? (
              <Queue />
            ) : visibleDrawer === 'lyrics' ? (
              <Lyrics key={player.currentKey} connectionId={connection.id} song={player.current!} />
            ) : (
              <Inspector key={visibleDrawer.id} song={visibleDrawer} />
            )}
          </div>
        </aside>
      )}
      <Player
        openDetails={(source) => {
          if (player.current) openDrawer(player.current, source);
        }}
        openRoom={(source) => openPlayerDestination('stations', source)}
        openSettings={(source) => openPlayerDestination('settings', source)}
        queueOpen={visibleDrawer === 'queue'}
        lyricsOpen={visibleDrawer === 'lyrics'}
        toggleQueue={(source) => (visibleDrawer === 'queue' ? closeDrawer() : openDrawer('queue', source))}
        toggleLyrics={(source) => (visibleDrawer === 'lyrics' ? closeDrawer() : openDrawer('lyrics', source))}
      />
      {adding && (
        <AddPlaylist
          connectionId={connection.id}
          songs={adding}
          close={() => setAdding(null)}
          checkPlaylists={() => {
            setAdding(null);
            setPlaylistId(null);
            navigate('playlists');
          }}
        />
      )}
    </div>
  );
}
