import type { ReactNode } from 'react';

import './SectionNavigation.styles.css';

type SectionNavigationProps<Value extends string> = {
  label: string;
  className?: string;
  items: readonly { id: Value; label: string; count?: number }[];
  value: Value;
  onChange: (value: Value) => void;
  children?: ReactNode;
};

export function SectionNavigation<Value extends string>({
  label,
  className = '',
  items,
  value,
  onChange,
  children,
}: SectionNavigationProps<Value>) {
  return (
    <nav className={`section-navigation ${className}`.trim()} aria-label={label}>
      {children}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-section={item.id}
          aria-current={value === item.id ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          <span>{item.label}</span>
          {item.count !== undefined && <span className="section-navigation-count">{item.count}</span>}
        </button>
      ))}
    </nav>
  );
}
