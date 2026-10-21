import { AlertCircle, Music2, X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { IconButton } from './IconButton/IconButton.component';
import type { DialogProps, ErrorNoticeProps, PageHeadingProps } from './Shared.types';

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export function ErrorNotice({ error, retry, retryRef, retrying = false }: ErrorNoticeProps) {
  const inFlight = useRef(false);
  const [ownsRetryFocus, setOwnsRetryFocus] = useState(false);
  const [attemptPending, setAttemptPending] = useState(false);
  const [attemptError, setAttemptError] = useState<unknown>(null);
  const [retainedError, setRetainedError] = useState<unknown>(null);
  if (error && retainedError !== error) setRetainedError(error);
  else if (!error && !retrying && !attemptPending && retainedError !== null) setRetainedError(null);
  const visibleError =
    error ?? (attemptPending ? attemptError : null) ?? (retrying && ownsRetryFocus ? retainedError : null);
  if (!visibleError) return null;
  async function retryOnce() {
    if (!retry || retrying || attemptPending || inFlight.current) return;
    inFlight.current = true;
    setAttemptError(visibleError);
    setAttemptPending(true);
    try {
      await retry();
    } catch {
      /* The owner retains the request's error and recovery state. */
    } finally {
      inFlight.current = false;
      setAttemptPending(false);
      setAttemptError(null);
    }
  }
  const busy = retrying || attemptPending;
  const busyLabel = attemptPending ? 'Retrying…' : 'Checking…';

  return (
    <div className="notice error">
      <AlertCircle size={18} aria-hidden="true" />
      <span role="alert">{errorMessage(visibleError)}</span>
      {retry && (
        <>
          <span className="sr-only" role="status">
            {busy ? busyLabel : ''}
          </span>
          <button
            type="button"
            ref={retryRef}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            onFocus={() => {
              setOwnsRetryFocus(true);
              setRetainedError(error ?? visibleError);
            }}
            onBlur={() => setOwnsRetryFocus(false)}
            onClick={() => void retryOnce()}
          >
            {busy ? busyLabel : 'Try again'}
          </button>
        </>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Music2 size={30} strokeWidth={1.4} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Artwork(props: { url?: string; name: string; className?: string }) {
  return <ArtworkImage key={props.url ?? ''} {...props} />;
}

function ArtworkImage({ url, name, className = '' }: { url?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img className={`artwork ${className}`} src={url} alt={name} loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <div className={`artwork artwork-fallback ${className}`} role="img" aria-label={`No artwork for ${name}`}>
      <Music2 size={24} strokeWidth={1.4} />
    </div>
  );
}

const shouldRestoreFocus = (restoreFocusRef?: { readonly current: boolean }) => restoreFocusRef?.current !== false;

export function Dialog({
  title,
  children,
  close,
  wide = false,
  initialFocusRef,
  restoreFocusRef,
  closeDisabled = false,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<HTMLElement | null>(null);
  if (opener.current === null)
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.showModal();
    const heading = node.querySelector<HTMLElement>('.modal-heading');
    const measureHeading = () => {
      if (heading) node.style.setProperty('--dialog-heading-height', `${heading.getBoundingClientRect().height}px`);
    };
    const observer = new ResizeObserver(measureHeading);
    if (heading) observer.observe(heading);
    measureHeading();
    const initialFocus = initialFocusRef?.current;
    if (initialFocus && node.contains(initialFocus) && !initialFocus.matches(':disabled'))
      initialFocus.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      node.close();
      if (!shouldRestoreFocus(restoreFocusRef)) return;
      requestAnimationFrame(() => {
        if (document.querySelector('dialog[open]')) return;
        const target =
          opener.current?.isConnected && opener.current !== document.body && !opener.current.matches(':disabled')
            ? opener.current
            : Array.from(document.querySelectorAll<HTMLElement>('.page-heading h1')).at(-1);
        target?.focus({ preventScroll: true });
      });
    };
  }, [initialFocusRef, restoreFocusRef]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? 'modal modal-wide' : 'modal'}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) close();
      }}
      onClick={(event) => {
        if (closeDisabled || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          close();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <IconButton
          aria-disabled={closeDisabled || undefined}
          onClick={() => {
            if (!closeDisabled) close();
          }}
          label="Close dialog"
        >
          <X size={20} aria-hidden="true" />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="modal-actions">{children}</div>;
}

export function PageHeading({ title, subtitle, children, headingRef }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <div>
        <h1 ref={headingRef} tabIndex={-1}>
          {title}
        </h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function duration(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
}

export function TrackDuration({ seconds }: { seconds: number }) {
  return Number.isFinite(seconds) && seconds > 0 ? (
    duration(seconds)
  ) : (
    <span role="img" aria-label="Duration unavailable">
      —
    </span>
  );
}
