import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type RetryResult = { isError: boolean };
type RetryFocusOptions = {
  ownerKey: string;
  target: () => HTMLElement | null;
  canFocusSuccess: () => boolean;
};
type Attempt = { ownerKey: string; button: HTMLButtonElement; cancelled: boolean };

export function useRetryFocus(options: RetryFocusOptions) {
  const retryRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(options);
  const ownerKey = useRef(options.ownerKey);
  const attempt = useRef<Attempt | null>(null);
  const removeListeners = useRef<() => void>(() => {});
  const [completion, setCompletion] = useState<{ attempt: Attempt; failed: boolean; target?: () => HTMLElement | null; onComplete?: () => void } | null>(null);

  const cancel = useCallback(() => {
    if (attempt.current) attempt.current.cancelled = true;
    attempt.current = null;
    removeListeners.current();
    removeListeners.current = () => {};
  }, []);

  useLayoutEffect(() => {
    latest.current = options;
    if (ownerKey.current !== options.ownerKey) {
      ownerKey.current = options.ownerKey;
      cancel();
    }
  }, [cancel, options]);

  useEffect(() => cancel, [cancel]);

  useLayoutEffect(() => {
    if (!completion) return;
    const { attempt: completedAttempt, failed } = completion;
    try {
      const next = latest.current;
      const active = document.activeElement;
      const ownsFocus = active === completedAttempt.button || (active === document.body && !completedAttempt.button.isConnected);
      const environmentAllowsFocus = document.visibilityState === 'visible' && document.hasFocus() && !document.querySelector('dialog[open], :popover-open');
      if (attempt.current === completedAttempt && !completedAttempt.cancelled && completedAttempt.ownerKey === next.ownerKey && ownsFocus && environmentAllowsFocus) {
        if (failed) {
          const retryButton = retryRef.current;
          if (retryButton?.isConnected && active !== retryButton) retryButton.focus({ preventScroll: true });
        } else if (next.canFocusSuccess()) {
          const target = completion.target?.() ?? next.target();
          if (target?.isConnected && !target.matches(':disabled')) target.focus({ preventScroll: true });
        }
      }
    } finally {
      completion.onComplete?.();
      if (attempt.current === completedAttempt) cancel();
    }
  }, [cancel, completion]);

  const retry = useCallback(async (operation: () => Promise<RetryResult>, target?: () => HTMLElement | null, onComplete?: () => void) => {
    const button = retryRef.current;
    const current = latest.current;
    if (!button || document.activeElement !== button || document.visibilityState !== 'visible' || !document.hasFocus() || document.querySelector('dialog[open], :popover-open')) {
      try { await operation(); } catch { /* Query errors remain available through the rendered error state. */ } finally { onComplete?.(); }
      return;
    }

    cancel();
    const currentAttempt: Attempt = { ownerKey: current.ownerKey, button, cancelled: false };
    attempt.current = currentAttempt;
    const cancelAttempt = () => { currentAttempt.cancelled = true; };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target !== button && event.target !== document.body) cancelAttempt();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Tab') cancelAttempt(); };
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('pointerdown', cancelAttempt, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', cancelAttempt);
    window.addEventListener('blur', cancelAttempt);
    removeListeners.current = () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('pointerdown', cancelAttempt, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('visibilitychange', cancelAttempt);
      window.removeEventListener('blur', cancelAttempt);
    };

    let failed = false;
    try {
      failed = (await operation()).isError;
    } catch {
      failed = true;
    }
    if (attempt.current !== currentAttempt) {
      onComplete?.();
      return;
    }
    setCompletion({ attempt: currentAttempt, failed, target, onComplete });
  }, [cancel]);

  return { retryRef, retry };
}
