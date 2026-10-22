import type { ComponentPropsWithRef } from 'react';

export type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'aria-label'> & {
  label: string;
  variant?: 'standard' | 'compact' | 'player' | 'play';
};
