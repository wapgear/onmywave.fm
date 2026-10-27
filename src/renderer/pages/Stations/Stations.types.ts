import type { ListeningRoom } from '../../../shared/types';
import type { WorkflowDraft } from '../../../shared/workflow';
import type { NewsBucketDestination } from './components/NewsBucket.types';

export type RoomSetupDraft = {
  preparationCancellation?: { requestId: string; acknowledged: boolean };
  setup: ListeningRoom | null;
  moodDraft: string | null;
  newsInterests?: string;
  workflow?: { roomId: string; patch: Partial<WorkflowDraft> };
  bucketDestination?: NewsBucketDestination;
  stopError?: string;
  stopErrorOrigin?: 'settings' | 'progress';
  operationError?: string;
  operationErrorTarget?: 'setup' | 'resume' | 'availability';
  preparationCancelError?: string;
  tab?: string;
};

export type StationsPageProps = {
  configDraft: RoomSetupDraft;
  setConfigDraft: React.Dispatch<React.SetStateAction<RoomSetupDraft>>;
  configureSources: () => void;
  configureDJ: () => void;
  configureSettings: () => void;
  openDJControls: () => void;
};
