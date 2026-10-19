import type { ListeningRoom } from '../../../shared/types';
import type { WorkflowDraft } from '../../../shared/workflow';


export type RoomSetupDraft = {
  preparationCancellation?: { requestId: string; acknowledged: boolean };
  setup: ListeningRoom | null;
  moodDraft: string | null;
  newsInterests?: string;
  workflow?: { roomId: string; patch: Partial<WorkflowDraft> };
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
};
