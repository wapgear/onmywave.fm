import { app, Menu, type MenuItemConstructorOptions, type Tray } from 'electron';

import type { UpdateStatus } from '../shared/update';

type TrayActions = {
  showWindow: () => void;
  showUpdates: () => void;
  check: () => void;
  download: () => void;
  install: () => void;
};

function info(label: string): MenuItemConstructorOptions {
  return { label, enabled: false };
}

export function createTrayMenu(tray: Tray, actions: TrayActions) {
  let current: UpdateStatus | undefined;
  let deferred: string | undefined;

  function updateItems(status: UpdateStatus): MenuItemConstructorOptions[] {
    const check = { label: 'Check for Updates', click: actions.check };
    switch (status.phase) {
      case 'unsupported':
        return [info('Updates Unavailable')];
      case 'idle':
        return [check];
      case 'checking':
        return [info('Checking for Updates…')];
      case 'current':
        return [info('Up to Date'), check];
      case 'downloading':
        return [info('Downloading Update…')];
      case 'installing':
        return [info('Restarting to Install Update…')];
      case 'error':
        return [{ label: 'Update Failed…', click: actions.showUpdates }, check];
      case 'available':
      case 'downloaded': {
        const ready = status.phase === 'downloaded';
        const label = `${status.version ? `Version ${status.version}` : 'Update'} ${ready ? 'Ready to Install' : 'Available'}`;
        const key = `${status.phase}:${status.version ?? ''}`;
        if (deferred === key) return [{ label: `${label}…`, click: actions.showUpdates }];
        return [
          info(status.message ? 'Could Not Restart to Install Update' : label),
          { label: ready ? 'Restart Now' : 'Update Now', click: ready ? actions.install : actions.download },
          {
            label: ready ? 'Restart Later' : 'Update Later',
            click: () => {
              if (current !== status) return;
              deferred = key;
              render(status);
            },
          },
        ];
      }
    }
  }

  function render(status: UpdateStatus) {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Show ${app.name}`, click: actions.showWindow },
        info(`Version ${status.currentVersion}`),
        { type: 'separator' },
        ...updateItems(status),
        { type: 'separator' },
        { label: `Quit ${app.name}`, click: () => app.quit() },
      ]),
    );
  }

  return (status: UpdateStatus) => {
    if (status.phase === current?.phase && status.version === current.version && status.message === current.message)
      return;
    current = status;
    render(status);
  };
}
