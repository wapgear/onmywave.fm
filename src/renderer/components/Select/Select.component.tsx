import { NavArrowDown } from 'iconoir-react/regular';
import type { ComponentPropsWithRef } from 'react';

import './Select.styles.css';

export function Select(props: ComponentPropsWithRef<'select'>) {
  return (
    <span className="select-field">
      <select {...props} />
      <NavArrowDown width={16} height={16} aria-hidden="true" />
    </span>
  );
}
