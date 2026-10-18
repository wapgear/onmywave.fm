import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type RetryResult = { isError: boolean };
type RetryFocusOptions = {
  ownerKey: string;
  target: () => HTMLElement | null;
  canFocusSuccess: () => boolean;
};
type Attempt = { ownerKey: string; button: HTMLButtonElement; cancelled: boolean };
type PassiveFocus = { ownerKey: string; button: HTMLButtonElement; scope: HTMLElement | null; scopes: HTMLElement[]; cancelled: boolean };

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
  const passiveFocus = useRef<PassiveFocus | null>(null);
  const removePassiveListeners = useRef<() => void>(() => {});
  const [completion, setCompletion] = useState<{ attempt: FocusAttempt; failed: boolean; target?: () => HTMLElement | null; failureTarget?: () => HTMLElement | null; onComplete?: () => void } | null>(null);

  const cancel = useCallback(() => {
    if (attempt.current) attempt.current.cancelled = true;
    attempt.current = null;
    removeListeners.current();
    removeListeners.current = () => {};
    if (passiveFocus.current) passiveFocus.current.cancelled = true;
    passiveFocus.current = null;
    removePassiveListeners.current();
    removePassiveListeners.current = () => {};
  }, []);

  const clearPassiveFocus = useCallback((current: PassiveFocus) => {
    if (passiveFocus.current !== current) return;
    passiveFocus.current = null;
    removePassiveListeners.current();
    removePassiveListeners.current = () => {};
  }, []);

  const armPassiveFocus = useCallback((button: HTMLButtonElement) => {
    if (attempt.current || retryRef.current !== button || document.activeElement !== button
      || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    removePassiveListeners.current();
    const scopes = openFocusScopes();
    const scope = button.closest<HTMLElement>(focusScopeSelector);
    if (scopes.length && (!scope || scopes.some(openScope => !openScope.contains(button)))) return;
    const current: PassiveFocus = { ownerKey: latest.current.ownerKey, button, scope, scopes, cancelled: false };
    passiveFocus.current = current;
    const cancelIfScopeChanged = () => {
      if (!sameScopes(current.scopes, openFocusScopes())) clearPassiveFocus(current);
    };
    const cancelOnFocusTakeover = (focusEvent: FocusEvent) => {
      if (focusEvent.target !== button && (focusEvent.target !== document.body || button.isConnected)) clearPassiveFocus(current);
    };
    const cancelOnTab = (keyEvent: KeyboardEvent) => { if (keyEvent.key === 'Tab') clearPassiveFocus(current); };
    const cancel = () => clearPassiveFocus(current);
    const scopeObserver = new MutationObserver(cancelIfScopeChanged);
    scopeObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open', 'popover', 'role', 'aria-modal'] });
    document.addEventListener('focusin', cancelOnFocusTakeover, true);
    document.addEventListener('pointerdown', cancel, true);
    document.addEventListener('keydown', cancelOnTab, true);
    document.addEventListener('toggle', cancelIfScopeChanged, true);
    document.addEventListener('close', cancelIfScopeChanged, true);
    document.addEventListener('visibilitychange', cancel);
    window.addEventListener('blur', cancel);
    removePassiveListeners.current = () => {
      scopeObserver.disconnect();
      document.removeEventListener('focusin', cancelOnFocusTakeover, true);
      document.removeEventListener('pointerdown', cancel, true);
      document.removeEventListener('keydown', cancelOnTab, true);
      document.removeEventListener('toggle', cancelIfScopeChanged, true);
      document.removeEventListener('close', cancelIfScopeChanged, true);
      document.removeEventListener('visibilitychange', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [clearPassiveFocus]);

  const ownsPassiveFocus = useCallback((current: PassiveFocus) => {
    const active = document.activeElement;
    return passiveFocus.current === current
      && !current.cancelled
      && current.ownerKey === latest.current.ownerKey
      && (active === current.button || (active === document.body && !current.button.isConnected))
      && document.visibilityState === 'visible'
      && document.hasFocus()
      && sameScopes(current.scopes, openFocusScopes())
      && (!current.scope || current.scope.isConnected);
  }, []);

  // Capture focus synchronously: a cached refetch may finish and remove the
  // focused Retry button before React commits an isFetching render.
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const button = retryRef.current;
      if (event.target === button && button) armPassiveFocus(button);
    };
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, [armPassiveFocus]);

  useLayoutEffect(() => {
    latest.current = options;
    if (ownerKey.current !== options.ownerKey) {
      ownerKey.current = options.ownerKey;
      cancel();
    }
    const pendingPassive = passiveFocus.current;
    if (pendingPassive && !pendingPassive.button.isConnected && ownsPassiveFocus(pendingPassive) && latest.current.canFocusSuccess()) {
      const target = latest.current.target();
      if (focusableTarget(target, pendingPassive.scope)) {
        focusAndReveal(target);
        clearPassiveFocus(pendingPassive);
      }
    }
  }, [cancel, clearPassiveFocus, options, ownsPassiveFocus]);

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
          const retryButton = completion.failureTarget?.() ?? retryRef.current;
          if (focusableTarget(retryButton, completedAttempt.scope) && active !== retryButton) focusAndReveal(retryButton);
        } else if (next.canFocusSuccess()) {
          const target = completion.target?.() ?? next.target();
          if (focusableTarget(target, completedAttempt.scope)) focusAndReveal(target);
        }
      }
    } finally {
      completion.onComplete?.();
      if (attempt.current === completedAttempt) {
        attempt.current = null;
        removeListeners.current();
        removeListeners.current = () => {};
        const retryButton = retryRef.current;
        const stillOwnsRetry = failed && !completedAttempt.cancelled
          && completedAttempt.ownerKey === latest.current.ownerKey
          && sameScopes(completedAttempt.scopes, openFocusScopes())
          && (!completedAttempt.scope || completedAttempt.scope.isConnected);
        if (stillOwnsRetry && retryButton) armPassiveFocus(retryButton);
      }
    }
  }, [armPassiveFocus, completion]);

  const retryFrom = useCallback(async (button: HTMLButtonElement | null, operation: () => Promise<RetryResult>, target?: () => HTMLElement | null, onComplete?: () => void, failureTarget?: () => HTMLElement | null) => {
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
      if (event.target !== button && (event.target !== document.body || button.isConnected)) cancelAttempt();
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
    setCompletion({ attempt: currentAttempt, failed, target, failureTarget, onComplete });
  }, [cancel]);

  const retry = useCallback((operation: () => Promise<RetryResult>, target?: () => HTMLElement | null, onComplete?: () => void) => retryFrom(retryRef.current, operation, target, onComplete), [retryFrom]);
  return { retryRef, retry, retryFrom };
}
