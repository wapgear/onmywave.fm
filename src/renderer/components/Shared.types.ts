import type { ReactNode, RefObject } from 'react';


export type ErrorNoticeProps = {
  error: unknown;
  retry?: () => void | Promise<unknown>;
  retryRef?: RefObject<HTMLButtonElement | null>;
  retrying?: boolean;
};

export type DialogProps = {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  initialFocusRef?: { readonly current: HTMLElement | null };
  restoreFocusRef?: { readonly current: boolean };
  closeDisabled?: boolean;
};

export type PageHeadingProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
};
