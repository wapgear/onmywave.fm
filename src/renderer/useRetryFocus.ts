import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type RetryResult = { isError: boolean };
type RetryFocusOptions = {
  ownerKey: string;
  target: () => HTMLElement | null;
  canFocusSuccess: () => boolean;
};
type Attempt = { ownerKey: string; button: HTMLButtonElement; cancelled: boolean };

const focusScopeSelector = 'dialog[open], [popover]:popover-open, [role="dialog"][aria-modal="true"]';

function openFocusScopes() {
  return [...document.querySelectorAll<HTMLElement>(focusScopeSelector)];
}

function sameScopes(left: HTMLElement[], right: HTMLElement[]) {
  return left.length === right.length && left.every(scope => right.includes(scope));
}

function focusableTarget(target: HTMLElement | null, scope: HTMLElement | null): target is HTMLElement {
  return !!target?.isConnected && target.checkVisibility() && !target.matches(':disabled') && (!scope || scope.contains(target));
}

function focusAndReveal(target: HTMLElement) {
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

type FocusAttempt = Attempt & { scope: HTMLElement | null; scopes: HTMLElement[] };

export function useRetryFocus(options: RetryFocusOptions) {
  const retryRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(options);
  const ownerKey = useRef(options.ownerKey);
  const attempt = useRef<FocusAttempt | null>(null);
  const removeListeners = useRef<() => void>(() => {});
  const [completion, setCompletion] = useState<{ attempt: FocusAttempt; failed: boolean; target?: () => HTMLElement | null; onComplete?: () => void } | null>(null);

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
      const environmentAllowsFocus = document.visibilityState === 'visible'
        && document.hasFocus()
        && sameScopes(completedAttempt.scopes, openFocusScopes())
        && (!completedAttempt.scope || completedAttempt.scope.isConnected);
      if (attempt.current === completedAttempt && !completedAttempt.cancelled && completedAttempt.ownerKey === next.ownerKey && ownsFocus && environmentAllowsFocus) {
        if (failed) {
          const retryButton = retryRef.current;
          if (focusableTarget(retryButton, completedAttempt.scope) && active !== retryButton) focusAndReveal(retryButton);
        } else if (next.canFocusSuccess()) {
          const target = completion.target?.() ?? next.target();
          if (focusableTarget(target, completedAttempt.scope)) focusAndReveal(target);
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
    if (!button || document.activeElement !== button || document.visibilityState !== 'visible' || !document.hasFocus()) {
      try { await operation(); } catch { /* Query errors remain available through the rendered error state. */ } finally { onComplete?.(); }
      return;
    }

    const scopes = openFocusScopes();
    const scope = button.closest<HTMLElement>(focusScopeSelector);
    if (scopes.length && (!scope || scopes.some(openScope => !openScope.contains(button)))) {
      try { await operation(); } catch { /* Query errors remain available through the rendered error state. */ } finally { onComplete?.(); }
      return;
    }

    cancel();
    const currentAttempt: FocusAttempt = {
      ownerKey: current.ownerKey,
      button,
      cancelled: false,
      scope,
      scopes,
    };
    attempt.current = currentAttempt;
    const cancelAttempt = () => { currentAttempt.cancelled = true; };
    const cancelIfScopeChanged = () => {
      if (!sameScopes(currentAttempt.scopes, openFocusScopes())) cancelAttempt();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target !== button && event.target !== document.body) cancelAttempt();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Tab') cancelAttempt(); };
    const scopeObserver = new MutationObserver(cancelIfScopeChanged);
    scopeObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open', 'popover', 'role', 'aria-modal'] });
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('pointerdown', cancelAttempt, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('toggle', cancelIfScopeChanged, true);
    document.addEventListener('close', cancelIfScopeChanged, true);
    document.addEventListener('visibilitychange', cancelAttempt);
    window.addEventListener('blur', cancelAttempt);
    removeListeners.current = () => {
      scopeObserver.disconnect();
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('pointerdown', cancelAttempt, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('toggle', cancelIfScopeChanged, true);
      document.removeEventListener('close', cancelIfScopeChanged, true);
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
