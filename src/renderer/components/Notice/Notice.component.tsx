import { CheckCircle, InfoCircle, WarningCircle, WarningTriangle } from 'iconoir-react/regular';
import type { ComponentProps, ReactNode, Ref } from 'react';

import './Notice.styles.css';

const icons = { error: WarningCircle, warning: WarningTriangle, info: InfoCircle, success: CheckCircle };

export type NoticeTone = keyof typeof icons;

export function AppNoticeGroup({ children }: { children: ReactNode }) {
  return (
    <div className="app-notices" role="region" aria-label="App notices">
      {children}
    </div>
  );
}

export function Notice({
  tone,
  message,
  actions,
  details,
  header = false,
  ref,
}: {
  tone: NoticeTone;
  message: string;
  actions?: ReactNode;
  details?: ReactNode;
  header?: boolean;
  ref?: Ref<HTMLDivElement>;
}) {
  const Icon = icons[tone];

  return (
    <div ref={ref} className={`notice ${tone}${header ? ' app-notice' : ''}`} data-tone={tone}>
      <Icon width={18} height={18} aria-hidden="true" />
      <div className="notice-copy">
        <span role={tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
          {message}
        </span>
        {details}
      </div>
      {actions && <div className="notice-actions">{actions}</div>}
    </div>
  );
}

export function NoticeAction({ busy = false, onClick, ...props }: ComponentProps<'button'> & { busy?: boolean }) {
  return (
    <button
      {...props}
      type="button"
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={(event) => {
        if (!busy) onClick?.(event);
      }}
    />
  );
}
