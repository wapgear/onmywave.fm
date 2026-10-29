import { ChevronDown } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';

import './Select.styles.css';

export function Select(props: ComponentPropsWithRef<'select'>) {
  return (
    <span className="select-field">
      <select {...props} />
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  );
}
