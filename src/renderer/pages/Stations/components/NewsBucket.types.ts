import type { LocalState, PreparedNewsLibrary, PreparedNewsTake } from '../../../../shared/types';


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
};
