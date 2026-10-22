import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { UpdateStatus } from '../../../shared/update';
import { unwrap } from '../../api';
import { ErrorNotice } from '../Shared';

import './AppUpdates.styles.css';


const queryKey = ['appUpdates'];

function useUpdates() {
  return useQuery({ queryKey, queryFn: async () => unwrap(await window.wave.getUpdateStatus()), staleTime: Infinity });
}

function statusText(status: UpdateStatus) {
  switch (status.phase) {
    case 'unsupported':
      return 'Automatic updates are available in the installed Apple silicon macOS app.';
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

function UpdateControls({ status, onDefer }: { status: UpdateStatus; onDefer?: () => void }) {
  const action = useMutation({
    mutationFn: async (command: 'check' | 'download' | 'install') =>
      unwrap(
        await (command === 'install'
          ? window.wave.installUpdate()
          : command === 'download'
            ? window.wave.downloadUpdate()
            : window.wave.checkForUpdates()),
      ),
  });
  const busy = action.isPending || ['checking', 'downloading', 'installing'].includes(status.phase);
  const percent = Math.floor(Math.max(0, Math.min(100, status.percent ?? 0)));

  return (
    <div className="app-update-controls">
      <div className="app-update-status" key={status.phase}>
        <p role="status">{statusText(status)}</p>
        {status.phase === 'downloading' && (
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
        )}
        {['available', 'downloaded'].includes(status.phase) && (
          <p className="app-update-hint">
            {status.phase === 'available'
              ? 'Download now, then restart when you are ready. Restarting stops playback.'
              : 'Restarting stops playback. You can keep listening and restart later.'}
          </p>
        )}
      </div>
      <ErrorNotice
        error={action.error ?? (status.phase === 'downloaded' && status.message ? new Error(status.message) : null)}
      />
      {status.phase !== 'unsupported' && (
        <div className="app-update-actions">
          <button
            className={['available', 'downloaded'].includes(status.phase) ? 'primary' : undefined}
            disabled={busy}
            onClick={() =>
              action.mutate(
                status.phase === 'downloaded' ? 'install' : status.phase === 'available' ? 'download' : 'check',
              )
            }
          >
            {status.phase === 'downloaded'
              ? 'Restart now'
              : status.phase === 'available'
                ? 'Update now'
                : busy
                  ? 'Please wait…'
                  : status.phase === 'error'
                    ? 'Try again'
                    : 'Check for updates'}
          </button>
          {onDefer && !['downloading', 'installing'].includes(status.phase) && (
            <button onClick={onDefer}>{status.phase === 'downloaded' ? 'Restart later' : 'Later'}</button>
          )}
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
      <p className="settings-description">onmywave.fm for macOS{query.data ? ` · ${query.data.currentVersion}` : ''}</p>
      <ErrorNotice error={query.error} retry={() => query.refetch()} retrying={query.isFetching} />
      {query.data && <UpdateControls status={query.data} />}
    </section>
  );
}

export function AppUpdates() {
  const client = useQueryClient();
  const query = useUpdates();
  const [dismissed, setDismissed] = useState('');
  const noticeRef = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const status = query.data;
  const promptKey = `${status?.version ?? ''}:${status?.phase}`;
  const collapsed = dismissed === promptKey;

  function toggleNotice() {
    restoreFocus.current = true;
    setDismissed(collapsed ? '' : promptKey);
  }

  useEffect(() => {
    if (!restoreFocus.current) return;
    noticeRef.current?.querySelector('button')?.focus();
    restoreFocus.current = false;
  }, [dismissed]);

  useEffect(() => {
    // Subscribe before reading again so events during startup cannot be lost.
    let received = false;
    const unsubscribe = window.wave.onUpdateStatus((value) => {
      received = true;
      client.setQueryData(queryKey, value);
    });
    void window.wave
      .getUpdateStatus()
      .then((result) => {
        if (!received && result.ok) client.setQueryData(queryKey, result.value);
      })
      .catch(() => {});
    return unsubscribe;
  }, [client]);

  if (!status || !['available', 'downloading', 'downloaded', 'installing', 'error'].includes(status.phase)) return null;

  return (
    <aside
      ref={noticeRef}
      className={`app-update-notice${collapsed ? ' app-update-notice-collapsed' : ''}`}
      aria-label="App update"
    >
      {collapsed ? (
        <button className="app-update-reopen" onClick={toggleNotice} aria-expanded={false}>
          <Download size={16} aria-hidden="true" />
          {status.phase === 'downloaded' ? 'Update ready' : 'App update'}
        </button>
      ) : (
        <div className="app-update-card">
          <div className="app-update-heading">
            <span className="app-update-icon" aria-hidden="true">
              {status.phase === 'downloaded' ? <Check size={20} /> : <Download size={20} />}
            </span>
            <h2>
              {status.phase === 'downloaded'
                ? 'Ready to restart'
                : status.phase === 'error'
                  ? 'Update needs attention'
                  : status.phase === 'downloading'
                    ? 'Downloading update'
                    : status.phase === 'installing'
                      ? 'Restarting app'
                      : 'App update'}
            </h2>
          </div>
          <UpdateControls status={status} onDefer={toggleNotice} />
        </div>
      )}
    </aside>
  );
}
