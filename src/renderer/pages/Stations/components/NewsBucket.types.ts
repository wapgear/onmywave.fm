import type { ReactNode } from 'react';

import type { newsPreparationStatus } from '../../../../shared/news-preparation-status';
import type { LocalState, PreparedNewsLibrary, PreparedNewsTake } from '../../../../shared/types';

export type NewsBucketDestination = 'upcoming' | 'check' | 'past' | 'favorites' | 'settings';

export type Automation = {
  settings: LocalState['djPlayback'];
  room?: LocalState['roomProfiles'][number];
  preparing: boolean;
  pending: PreparedNewsTake | null;
  error: string | null;
  songsUntilBreak: number;
};

export type NewsBucketProps = {
  library: PreparedNewsLibrary;
  localState: LocalState;
  automation: Automation;
  profileStatusUnknown: boolean;
  savedNewsStale: boolean;
  openSource: (url: string) => void;
  openPreparation: () => void;
  preparation: ReturnType<typeof newsPreparationStatus> | null;
  adjustPreparationLimit: (field: 'recording' | 'check') => void;
  roomSettings?: ReactNode;
  active?: boolean;
  destination: NewsBucketDestination;
  onDestinationChange: (destination: NewsBucketDestination) => void;
};
