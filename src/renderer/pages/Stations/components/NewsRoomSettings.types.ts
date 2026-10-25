import type { DJ, ListeningRoom, NewsSource, RoomProfile } from '../../../../shared/types';
import type { WorkflowDraft } from '../../../../shared/workflow';

export type NewsRoomSettingsProps = {
  profile: RoomProfile | null;
  sources: NewsSource[];
  djs: DJ[];
  room: ListeningRoom;
  mood: string;
  interests: string;
  workflow: WorkflowDraft;
  preparationStatus: string;
  preparationDetail: string;
  profileStatusUnknown: boolean;
  preparation: { checks: number; checkLimit: number; recordings: number; recordingLimit: number } | null;
  busy: boolean;
  saving: boolean;
  dirty: boolean;
  saveDisabled: boolean;
  saveError: unknown;
  setRoom: (room: ListeningRoom) => void;
  setMood: (mood: string) => void;
  setInterests: (interests: string) => void;
  updateWorkflow: (patch: Partial<WorkflowDraft>) => void;
  configureSources: () => void;
  configureDJ: () => void;
  save: () => void;
};
