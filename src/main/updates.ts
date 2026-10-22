import { app, autoUpdater as nativeAutoUpdater } from 'electron';
import updater from 'electron-updater';

import type { UpdateStatus } from '../shared/update';

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

const { autoUpdater } = updater;

let status: UpdateStatus;

let publish: ((value: UpdateStatus) => void) | null = null;

let check: Promise<UpdateStatus> | null = null;

let download: Promise<UpdateStatus> | null = null;

function setStatus(next: UpdateStatus) {
  status = next;
  publish?.(next);
}

function isSupported() {
  return app.isPackaged && process.platform === 'darwin' && process.arch === 'arm64';
}

export function startUpdates(onStatus: (value: UpdateStatus) => void, beforeInstall: () => void) {
  status = {
    phase: isSupported() ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
  };
  publish = onStatus;
  if (!isSupported()) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  nativeAutoUpdater.on('before-quit-for-update', beforeInstall);
  autoUpdater.on('checking-for-update', () => setStatus({ ...status, phase: 'checking', message: undefined }));
  autoUpdater.on('update-available', (info) =>
    setStatus({ ...status, phase: 'available', version: info.version, percent: undefined, message: undefined }),
  );
  autoUpdater.on('update-not-available', () => setStatus({ phase: 'current', currentVersion: app.getVersion() }));
  autoUpdater.on('download-progress', (progress) =>
    setStatus({ ...status, phase: 'downloading', percent: Math.max(0, Math.min(100, progress.percent)) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    setStatus({ ...status, phase: 'downloaded', version: info.version, percent: 100, message: undefined }),
  );
  autoUpdater.on('error', () => {
    if (status.phase === 'installing') {
      setStatus({ ...status, phase: 'downloaded', message: 'The update could not be installed. Try again.' });
      return;
    }
    setStatus({
      ...status,
      phase: 'error',
      message:
        status.phase === 'downloading'
          ? 'The update could not be downloaded. Try again.'
          : 'Could not check for updates. Try again.',
    });
  });

  const interval = setInterval(() => void checkForUpdates(), CHECK_INTERVAL);
  interval.unref();
  void checkForUpdates();
}

export function getUpdateStatus(): UpdateStatus {
  return status ?? { phase: 'unsupported', currentVersion: app.getVersion() };
}

export function checkForUpdates(): Promise<UpdateStatus> {
  if (!isSupported()) return Promise.resolve(getUpdateStatus());
  if (check) return check;
  if (['downloading', 'downloaded', 'installing'].includes(status.phase)) return Promise.resolve(status);

  setStatus({ phase: 'checking', currentVersion: app.getVersion() });
  check = autoUpdater
    .checkForUpdates()
    .then((result) => {
      if (status.phase === 'checking') {
        if (result?.isUpdateAvailable)
          setStatus({ phase: 'available', currentVersion: app.getVersion(), version: result.updateInfo.version });
        else setStatus({ phase: 'current', currentVersion: app.getVersion() });
      }
      return status;
    })
    .catch(() => {
      setStatus({
        phase: 'error',
        currentVersion: app.getVersion(),
        message: 'Could not check for updates. Try again.',
      });
      return status;
    })
    .finally(() => {
      check = null;
    });
  return check;
}

export function downloadUpdate(): Promise<UpdateStatus> {
  if (!isSupported() || status.phase !== 'available') return Promise.resolve(status);
  if (download) return download;

  const version = status.version;
  setStatus({ phase: 'downloading', currentVersion: app.getVersion(), version, percent: 0 });
  download = autoUpdater
    .downloadUpdate()
    .then(() => {
      if (status.phase === 'downloading')
        setStatus({ phase: 'downloaded', currentVersion: app.getVersion(), version, percent: 100 });
      return status;
    })
    .catch(() => {
      setStatus({
        phase: 'error',
        currentVersion: app.getVersion(),
        version,
        message: 'The update could not be downloaded. Check your connection and try again.',
      });
      return status;
    })
    .finally(() => {
      download = null;
    });
  return download;
}

export function installUpdate(): UpdateStatus {
  if (!isSupported() || status.phase !== 'downloaded') return status;
  try {
    setStatus({ ...status, phase: 'installing', message: undefined });
    autoUpdater.quitAndInstall();
  } catch {
    setStatus({ ...status, phase: 'downloaded', message: 'The update could not be installed. Try again.' });
  }
  return status;
}
