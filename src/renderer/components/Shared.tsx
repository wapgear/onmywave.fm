import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AlertCircle, Music2, X } from 'lucide-react';

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
export function ErrorNotice({ error, retry, retryRef }: { error: unknown; retry?: () => void; retryRef?: RefObject<HTMLButtonElement | null> }) {
  if (!error) return null;
  return <div className="notice error"><AlertCircle size={18} aria-hidden="true" /><span role="alert">{errorMessage(error)}</span>{retry && <button ref={retryRef} onClick={retry}>Try again</button>}</div>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><Music2 size={30} strokeWidth={1.4} /><h2>{title}</h2>{children && <p>{children}</p>}</div>;
}
export function Artwork(props: { url?: string; name: string; className?: string }) {
  return <ArtworkImage key={props.url ?? ''} {...props} />;
}
function ArtworkImage({ url, name, className = '' }: { url?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? <img className={`artwork ${className}`} src={url} alt={name} loading="lazy" onError={() => setFailed(true)} /> : <div className={`artwork artwork-fallback ${className}`} role="img" aria-label={`No artwork for ${name}`}><Music2 size={24} strokeWidth={1.4} /></div>;
}
export function Dialog({ title, children, close, wide = false, initialFocusRef }: { title: string; children: ReactNode; close: () => void; wide?: boolean; initialFocusRef?: { readonly current: HTMLElement | null } }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<HTMLElement | null>(null);
  if (opener.current === null) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.showModal();
    const initialFocus = initialFocusRef?.current;
    if (initialFocus && node.contains(initialFocus) && !initialFocus.matches(':disabled')) initialFocus.focus({ preventScroll: true });
    return () => {
      node?.close();
      requestAnimationFrame(() => {
        if (document.querySelector('dialog[open]')) return;
        const target = opener.current?.isConnected && opener.current !== document.body && !opener.current.matches(':disabled') ? opener.current : Array.from(document.querySelectorAll<HTMLElement>('.page-heading h1')).at(-1);
        target?.focus({ preventScroll: true });
      });
    };
  }, [initialFocusRef]);
  return <dialog ref={ref} aria-labelledby={titleId} className={wide ? 'modal modal-wide' : 'modal'} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); }}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={20} /></button></div>{children}</dialog>;
}
export function PageHeading({ title, subtitle, children, headingRef }: { title: string; subtitle?: string; children?: ReactNode; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  return <header className="page-heading"><div><h1 ref={headingRef} tabIndex={-1}>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{children}</header>;
}
export function duration(seconds: number) { const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0; return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`; }
export function TrackDuration({ seconds }: { seconds: number }) {
  return Number.isFinite(seconds) && seconds > 0 ? duration(seconds) : <span role="img" aria-label="Duration unavailable">—</span>;
}
