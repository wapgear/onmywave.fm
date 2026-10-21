import type { RoomProfile } from '../../../../shared/types';
import type { WorkflowDraft } from '../../../../shared/workflow';

export type PreparationIssue = { message: string; action?: { label: string; run: () => void } };

export type WorkflowPreferencesProps = {
  active: boolean;
  resuming: boolean;
  resumeError: unknown;
  stopError: unknown;
  room?: RoomProfile;
  value: WorkflowDraft;
  dirty: boolean;
  disabled: boolean;
  saving: boolean;
  saveError: unknown;
  activationReady: boolean;
  statusLoading: boolean;
  statusError: unknown;
  profileStatusUnknown: boolean;
  issues: PreparationIssue[];
  onChange: (patch: Partial<WorkflowDraft>) => void;
  onSave: () => void;
  onResume: () => void;
  onTurnOff: () => void;
  stopping: boolean;
  stopDisabled: boolean;
  onRetryStatus: () => void;
};
