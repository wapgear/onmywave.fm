import type { ComponentProps } from 'react';

import { Button } from '../Button/Button.component';

import './SaveButton.styles.css';

export function SaveButton({ className = '', ...props }: ComponentProps<'button'>) {
  return <Button {...props} variant="primary" className={`save-button ${className}`.trim()} />;
}
