import type { ComponentPropsWithRef } from 'react';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'secondary' | 'primary' | 'destructive' | 'ghost';
};
