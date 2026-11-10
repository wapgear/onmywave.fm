import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { UpdateStatus } from '../../../shared/update';
import { unwrap } from '../../api';
import { Notice, NoticeAction } from '../Notice/Notice.component';
import { ErrorNotice, errorMessage } from '../Shared';

import './AppUpdates.styles.css';

export const appUpdatesKey = ['appUpdates'];

const updateActionKey = ['appUpdateAction'];

function useUpdates() {
  return useQuery({
    queryKey: appUpdatesKey,
    queryFn: async () => unwrap(await window.wave.getUpdateStatus()),
    staleTime: Infinity,
  });
}

function statusText(status: UpdateStatus) {
  switch (status.phase) {
    case 'unsupported':
      return 'Automatic updates are not available for this build. Install a newer version manually to update.';
    case 'checking':
      return 'Checking for updates…';
    case 'current':
      return 'You have the latest version.';
    case 'available':
      return `Version ${status.version} is available.`;
    case 'downloading':
      return `Downloading version ${status.version}…`;
    case 'downloaded':
      return `Version ${status.version} is ready to install.`;
    case 'installing':
      return 'Restarting to install the update…';
    case 'error':
      return status.message ?? 'Unable to update. Check your connection and try again.';
    default:
      return 'Updates are checked automatically while the app is open.';
  }
}

function useUpdateAction(status?: UpdateStatus) {
  const client = useQueryClient();
  const updating = useIsMutating({ mutationKey: updateActionKey }) > 0;
  const action = useMutation({
    mutationKey: updateActionKey,
    mutationFn: async (command: 'check' | 'download' | 'install') =>
      unwrap(
        await (command === 'install'
          ? window.wave.installUpdate()
          : command === 'download'
            ? window.wave.downloadUpdate()
            : window.wave.checkForUpdates()),
      ),
  });
  const phase = status?.phase;
  const busy = updating || phase === 'checking' || phase === 'downloading' || phase === 'installing';
  const label =
    phase === 'downloaded'
      ? 'Restart now'
      : phase === 'available'
        ? 'Update now'
        : busy
          ? 'Please wait…'
          : phase === 'error'
            ? 'Try again'
            : 'Check for updates';

  return {
    busy,
    label,
    error: action.error ?? (phase === 'downloaded' && status?.message ? new Error(status.message) : null),
    run: () => {
      if (!busy && !client.isMutating({ mutationKey: updateActionKey }))
        action.mutate(phase === 'downloaded' ? 'install' : phase === 'available' ? 'download' : 'check');
    },
  };
}

function UpdateProgress({ status }: { status: UpdateStatus }) {
  const percent = Math.floor(Math.max(0, Math.min(100, status.percent ?? 0)));

  return (
    <div className="app-update-download">
      <div
        className="app-update-progress"
        role="progressbar"
        aria-label="Update download"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="app-update-percent" aria-hidden="true">
        {percent}%
      </span>
    </div>
  );
}

function UpdateControls({ status }: { status: UpdateStatus }) {
  const action = useUpdateAction(status);

  return (
    <div className="app-update-controls">
      <div className="app-update-status" key={status.phase}>
        <p role="status">{statusText(status)}</p>
        {status.phase === 'downloading' && <UpdateProgress status={status} />}
        {['available', 'downloaded'].includes(status.phase) && (
          <p className="app-update-hint">
            {status.phase === 'available'
              ? 'Download now, then restart when you are ready. Restarting stops playback.'
              : 'Restarting stops playback. You can keep listening and restart later.'}
          </p>
        )}
      </div>
      <ErrorNotice error={action.error} />
      {status.phase !== 'unsupported' && (
        <div className="app-update-actions">
          <button
            className={['available', 'downloaded'].includes(status.phase) ? 'primary' : undefined}
            disabled={action.busy}
            onClick={action.run}
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}

export function UpdateSettings() {
  const query = useUpdates();

  return (
    <section className="app-update-settings">
      <h2>About and updates</h2>
      <p className="settings-description">onmywave.fm{query.data ? ` · ${query.data.currentVersion}` : ''}</p>
      <ErrorNotice error={query.error} retry={() => query.refetch()} retrying={query.isFetching} />
      {query.data && <UpdateControls status={query.data} />}
    </section>
  );
}

export function useAppUpdateNotice() {
  const client = useQueryClient();
  const query = useUpdates();
  const [dismissed, setDismissed] = useState('');
  const noticeRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const status = query.data;
  const action = useUpdateAction(status);
  const promptKey = `${status?.version ?? ''}:${status?.phase}`;
  const collapsed = dismissed === promptKey;

  function toggleNotice() {
    restoreFocus.current = true;
    setDismissed(collapsed ? '' : promptKey);
  }

  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    noticeRef.current?.querySelector('button')?.focus();
    restoreFocus.current = false;
  }, [dismissed]);

  useEffect(() => {
    // Subscribe before reading again so events during startup cannot be lost.
    let received = false;
    const unsubscribe = window.wave.onUpdateStatus((value) => {
      received = true;
      client.setQueryData(appUpdatesKey, value);
    });
    void window.wave
      .getUpdateStatus()
      .then((result) => {
        if (!received && result.ok) client.setQueryData(appUpdatesKey, result.value);
      })
      .catch(() => {});
    return unsubscribe;
  }, [client]);

  if (!status || !['available', 'downloading', 'downloaded', 'installing', 'error'].includes(status.phase)) return null;

  const downloaded = status.phase === 'downloaded';
  const failed = status.phase === 'error' || !!action.error;
  const canDefer = status.phase !== 'downloading' && status.phase !== 'installing';
  const message = action.error
    ? errorMessage(action.error)
    : downloaded
      ? `${statusText(status)} Restarting stops playback.`
      : statusText(status);

  return (
    <Notice
      ref={noticeRef}
      header
      tone={collapsed ? 'info' : failed ? 'error' : downloaded ? 'success' : 'info'}
      message={collapsed ? (downloaded ? 'Update ready to install.' : 'App update deferred.') : message}
      details={!collapsed && status.phase === 'downloading' && <UpdateProgress status={status} />}
      actions={
        collapsed ? (
          <NoticeAction aria-expanded={false} onClick={toggleNotice}>
            Show update
          </NoticeAction>
        ) : (
          <>
            <NoticeAction busy={action.busy} onClick={action.run}>
              {action.label}
            </NoticeAction>
            {canDefer && <NoticeAction onClick={toggleNotice}>{downloaded ? 'Restart later' : 'Later'}</NoticeAction>}
          </>
        )
      }
    />
  );
}
