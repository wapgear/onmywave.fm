import type { ReactNode } from 'react';

import type { Connection } from '../../shared/types';


export type ConnectionTransition = (
  source: HTMLButtonElement | null,
  operation: () => Promise<Connection | undefined>,
) => Promise<void>;

export type LibrarySelectionDone = (connection: Connection) => void | false | Promise<void | false>;

export type LibrarySelectionProviderProps = {
  connection: Connection | null;
  expired: boolean;
  children: ReactNode;
};
