import type { DJ, ListeningRoom, NewsSource } from '../../../../shared/types';


export type RoomSetupProps = {
  sources: NewsSource[];
  djs: DJ[];
  room: ListeningRoom;
  mood: string;
  newsInterests: string;
  busy: boolean;
  setSetup: (room: ListeningRoom) => void;
  setMoodDraft: (mood: string) => void;
  setNewsInterests: (interests: string) => void;
  configureSources: () => void;
  configureDJ: () => void;
};
