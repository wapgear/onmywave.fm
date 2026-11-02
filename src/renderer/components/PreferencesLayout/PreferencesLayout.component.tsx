import type { ReactNode } from 'react';

import './PreferencesLayout.styles.css';

export function PreferencesLayout({
  children,
  className = '',
  constrained = true,
}: {
  children: ReactNode;
  className?: string;
  constrained?: boolean;
}) {
  return <div className={`${constrained ? 'preferences-layout' : ''} ${className}`.trim()}>{children}</div>;
}
