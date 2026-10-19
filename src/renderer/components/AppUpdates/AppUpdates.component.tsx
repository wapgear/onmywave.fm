import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';

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
      return `Downloading version ${status.version}… ${Math.floor(status.percent ?? 0)}%`;
    case 'downloaded':
      return `Version ${status.version} is ready. Restarting stops playback. Restart now to apply it, or keep listening and restart later.`;
    case 'installing':
      return 'Restarting to install the update…';
    case 'error':
      return status.message ?? 'Unable to update. Check your connection and try again.';
    default:
      return 'Updates are checked automatically while the app is open.';
  }
}

function UpdateControls({ status }: { status: UpdateStatus }) {
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

  return (
    <>
      <p role="status">{statusText(status)}</p>
      {status.phase === 'downloading' && (
        <progress aria-label="Update download" max={100} value={status.percent ?? 0} />
      )}
      <ErrorNotice
        error={action.error ?? (status.phase === 'downloaded' && status.message ? new Error(status.message) : null)}
      />
      {status.phase !== 'unsupported' && (
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
      )}
      {status.phase === 'available' && (
        <p className="muted">Download the update, then restart when you are ready. Restarting stops playback.</p>
      )}
    </>
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
  const status = query.data;
  const promptKey = `${status?.version ?? ''}:${status?.phase}`;

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
    <aside className="app-update-notice" aria-label="App update">
      {dismissed === promptKey ? (
        <button onClick={() => setDismissed('')}>
          <Download size={16} />
          {status.phase === 'downloaded' ? 'Update ready' : 'App update'}
        </button>
      ) : (
        <>
          <h2>
            {status.phase === 'downloaded'
              ? 'Ready to restart'
              : status.phase === 'error'
                ? 'Update needs attention'
                : 'App update'}
          </h2>
          <UpdateControls status={status} />
          {!['downloading', 'installing'].includes(status.phase) && (
            <button onClick={() => setDismissed(promptKey)}>
              {status.phase === 'downloaded' ? 'Restart later' : 'Later'}
            </button>
          )}
        </>
      )}
    </aside>
  );
}
