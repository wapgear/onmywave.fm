import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode, type Ref } from 'react';

import './PreferenceSection.styles.css';

type PreferenceSectionProps = {
  id: string;
  title: string;
  description: string;
  className?: string;
  dirty?: boolean;
  defaultOpen?: boolean;
  keepMounted?: boolean;
  status?: string;
  ref?: Ref<HTMLElement>;
  children: ReactNode;
};

export function PreferenceSection({
  id,
  title,
  description,
  className = '',
  dirty = false,
  defaultOpen = dirty,
  keepMounted = false,
  status,
  ref,
  children,
}: PreferenceSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className={`preference-section ${className}`}
      open={open}
      onToggle={(event) => {
        if (event.target === event.currentTarget) setOpen(event.currentTarget.open);
      }}
    >
      <summary id={id} ref={ref}>
        <span className="preference-section-heading">
          <span className="preference-section-title">{title}</span>
          <span className="preference-section-description">{description}</span>
        </span>
        <span className="preference-section-status" role="status">
          {status ?? (dirty ? 'Unsaved changes' : '')}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      {(open || keepMounted) && <div className="preference-section-content">{children}</div>}
    </details>
  );
}
