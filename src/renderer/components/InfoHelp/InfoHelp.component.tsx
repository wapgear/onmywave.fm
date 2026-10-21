import { Info } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

import { IconButton } from '../IconButton/IconButton.component';
import { Dialog } from '../Shared';

import './InfoHelp.styles.css';

export function InfoHelp({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }

  return (
    <>
      <IconButton
        ref={trigger}
        label={label}
        className="info-help"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Info size={17} aria-hidden="true" />
      </IconButton>
      {open && (
        <Dialog title={label} close={close}>
          <div className="info-help-content">{children}</div>
        </Dialog>
      )}
    </>
  );
}
