import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, Radio, RotateCw } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import type { NewsRecoveryStatus } from '../shared/types';
import { unwrap } from './api';
import type { NewsRecoveryNoticeProps, RecoveryContextValue } from './NewsRecovery.types';
import { useRetryFocus } from './useRetryFocus';

import './NewsRecovery.styles.css';

const RecoveryContext = createContext<RecoveryContextValue | null>(null);

export function NewsRecoveryProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [status, setStatus] = useState<NewsRecoveryStatus>({ phase: 'recovering' });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const previousPhase = useRef<NewsRecoveryStatus['phase']>('recovering');
  const retryRequested = useRef(false);

  const applyStatus = useCallback(
    (next: NewsRecoveryStatus) => {
      if (next.phase === 'ready' && previousPhase.current !== 'ready') {
        if (retryRequested.current) {
          setRecovered(true);
          retryRequested.current = false;
        }
        void client.invalidateQueries({ queryKey: ['localState'] });
        void client.invalidateQueries({ queryKey: ['preparedNews'] });
      }
      previousPhase.current = next.phase;
      setStatus((previous) => (previous.phase === next.phase ? previous : next));
    },
    [client],
  );

  useEffect(() => {
    let active = true;
    let checking = false;
    const read = async () => {
      if (checking) return;
      checking = true;
      try {
        const next = unwrap(await window.wave.getNewsRecoveryStatus());
        if (active) applyStatus(next);
      } catch {
        if (active) applyStatus({ phase: 'unavailable' });
      } finally {
        checking = false;
      }
    };
    void read();
    const timer = window.setInterval(() => {
      void read();
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [applyStatus]);

  const retry = useCallback(() => {
    if (status.phase === 'recovering' || retrying) return;
    retryRequested.current = true;
    setRetrying(true);
    setRetryError(false);
    setDismissed(false);
    applyStatus({ phase: 'recovering' });
    void window.wave
      .retryNewsRecovery()
      .then((result) => applyStatus(unwrap(result)))
      .catch(() => {
        setRetryError(true);
        applyStatus({ phase: 'unavailable' });
      })
      .finally(() => setRetrying(false));
  }, [applyStatus, retrying, status.phase]);

  const value = { status, retrying, retryError, recovered, dismissed, retry, dismiss: () => setDismissed(true) };

  return <RecoveryContext.Provider value={value}>{children}</RecoveryContext.Provider>;
}

export function useNewsRecovery() {
  const value = useContext(RecoveryContext);
  if (!value) throw new Error('News recovery state requires NewsRecoveryProvider');
  return value;
}

export function NewsRecoveryNotice({ onOpenSettings, focusTarget, settingsTarget }: NewsRecoveryNoticeProps) {
  const recovery = useNewsRecovery();
  const { retryRef, retry: focusAfterAction } = useRetryFocus({
    ownerKey: 'news-recovery-notice',
    target: focusTarget,
    canFocusSuccess: () => recovery.status.phase === 'ready',
  });
  const success = recovery.status.phase === 'ready' && recovery.recovered && !recovery.dismissed;
  if (recovery.status.phase === 'ready' && !success) return null;
  const checking = recovery.status.phase === 'recovering';
  const message = success
    ? 'News data is available again. Review preparation in News settings.'
    : checking
      ? 'Recovering news data. Music remains available.'
      : recovery.retryError
        ? 'News data is still unavailable. Music remains available; you can retry recovery.'
        : 'News and DJ features are unavailable. You can keep listening and browsing music.';
  const action = success
    ? onOpenSettings
      ? 'Open News settings'
      : 'Dismiss'
    : checking
      ? recovery.retrying
        ? 'Retrying…'
        : 'Recovering…'
      : 'Retry news recovery';

  return (
    <aside className="news-recovery-notice" aria-label="News and DJ availability">
      <Radio size={17} aria-hidden="true" />
      <p role="status" aria-live="polite" aria-atomic="true">
        {message}
      </p>
      <button
        ref={retryRef}
        type="button"
        aria-disabled={checking}
        onClick={() => {
          if (checking) return;
          if (success) {
            void focusAfterAction(
              async () => {
                if (onOpenSettings) onOpenSettings();
                else recovery.dismiss();
                return { isError: false };
              },
              onOpenSettings ? settingsTarget : undefined,
            );
          } else recovery.retry();
        }}
      >
        {checking ? (
          <LoaderCircle size={14} className="spinning" aria-hidden="true" />
        ) : success && onOpenSettings ? null : (
          <RotateCw size={14} aria-hidden="true" />
        )}
        {action}
      </button>
    </aside>
  );
}

export function NewsRecoveryPanel() {
  const { status } = useNewsRecovery();

  return (
    <section className="news-recovery-panel" aria-labelledby="news-recovery-heading">
      <Radio size={22} aria-hidden="true" />
      <h2 id="news-recovery-heading">
        {status.phase === 'recovering' ? 'News data is recovering' : 'News data is unavailable'}
      </h2>
      <p>
        News preparation, saved recordings, and DJ breaks are temporarily unavailable. Your music library and listening
        controls remain available. Use the recovery notice above to retry.
      </p>
    </section>
  );
}
