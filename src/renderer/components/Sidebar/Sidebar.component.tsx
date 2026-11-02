import type { ComponentProps, ReactNode } from 'react';

import './Sidebar.styles.css';

type SidebarHeadingProps = {
  title: ReactNode;
  titleId?: string;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function SidebarHeading({ title, titleId, actions, compact = false, className = '' }: SidebarHeadingProps) {
  return (
    <header className={`drawer-heading ${compact ? 'sidebar-heading-compact' : ''} ${className}`.trim()}>
      <h2 id={titleId}>{title}</h2>
      <div className="drawer-heading-actions">{actions}</div>
    </header>
  );
}

export function SidebarBody({ className = '', ...props }: ComponentProps<'div'>) {
  return <div {...props} className={`sidebar-body ${className}`.trim()} />;
}
