import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron';

import type { AppMenuCommand, LibraryMenuState } from '../shared/app-menu';

const libraryCommands = [
  'settings',
  'songs',
  'artists',
  'albums',
  'playlists',
  'stations',
  'queue',
  'shuffle',
  'repeat',
  'repeat-off',
  'repeat-all',
  'repeat-one',
  'volume-up',
  'volume-down',
] as const;

const trackCommands = ['lyrics', 'play-pause', 'previous', 'next'] as const;

function showAboutPanel() {
  app.focus({ steal: true });
  app.showAboutPanel();
}

export function installMacMenu(
  send: (command: AppMenuCommand) => void,
  checkForUpdates: () => void,
  showWindow: () => void,
) {
  const command = (id: AppMenuCommand, label: string, accelerator?: string): MenuItemConstructorOptions => ({
    id,
    label,
    accelerator,
    enabled: false,
    click: () => send(id),
  });
  const openHelp = (url: string) => () => void shell.openExternal(url).catch(() => {});
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { label: `About ${app.name}`, click: showAboutPanel },
        { label: 'Check for Updates…', click: checkForUpdates },
        { type: 'separator' },
        command('settings', 'Settings…', 'Command+,'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'File', submenu: [{ role: 'close' }] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        command('songs', 'All Songs'),
        command('artists', 'Artists'),
        command('albums', 'Albums'),
        command('playlists', 'Playlists'),
        command('stations', 'News Bucket'),
        { type: 'separator' },
        command('queue', 'Playing Next', 'Option+Command+U'),
        command('lyrics', 'Lyrics'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Playback',
      submenu: [
        command('play-pause', 'Play'),
        command('next', 'Next Track'),
        command('previous', 'Previous Track'),
        { type: 'separator' },
        { ...command('shuffle', 'Shuffle'), type: 'checkbox' },
        {
          id: 'repeat',
          label: 'Repeat',
          enabled: false,
          submenu: [
            { ...command('repeat-off', 'Off'), type: 'radio', checked: true },
            { ...command('repeat-all', 'All'), type: 'radio' },
            { ...command('repeat-one', 'One'), type: 'radio' },
          ],
        },
        { type: 'separator' },
        command('volume-up', 'Volume Up'),
        command('volume-down', 'Volume Down'),
      ],
    },
    {
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { label: `Show ${app.name}`, accelerator: 'Command+0', click: showWindow },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' },
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: `${app.name} Help`, click: openHelp('https://github.com/wapgear/onmywave.fm#readme') },
        { label: 'Report an Issue', click: openHelp('https://github.com/wapgear/onmywave.fm/issues') },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
}

export function updateLibraryMenu(state: LibraryMenuState | null) {
  if (process.platform !== 'darwin') return;
  const menu = Menu.getApplicationMenu();
  if (!menu) return;

  for (const id of libraryCommands) {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = state !== null;
  }
  for (const id of trackCommands) {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = state?.hasTrack ?? false;
  }

  const play = menu.getMenuItemById('play-pause');
  const shuffle = menu.getMenuItemById('shuffle');
  if (play) play.label = state?.playing ? 'Pause' : 'Play';
  if (shuffle) shuffle.checked = state?.shuffle ?? false;
  for (const mode of ['off', 'all', 'one']) {
    const item = menu.getMenuItemById(`repeat-${mode}`);
    if (item) item.checked = mode === (state?.repeat ?? 'off');
  }
}
