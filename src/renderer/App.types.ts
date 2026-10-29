import type { Dispatch, SetStateAction } from 'react';

import type { Connection } from '../shared/types';
import type { ConnectionTransition } from './components/LibrarySelection.types';
import type { usePlaylistRecovery } from './pages/Playlists/Playlists.page';
import type { RoomSetupDraft } from './pages/Stations/Stations.types';

export type PageName = 'songs' | 'albums' | 'playlists' | 'stations' | 'settings';

export type SessionContentProps = {
  connection: Connection | null;
  expired: boolean;
  setConnection: (connection: Connection | null, clearExpiry?: boolean) => Promise<void>;
  runConnectionTransition: ConnectionTransition;
};

export type ReadyAppProps = {
  connection: Connection;
  update: (connection: Connection) => void;
  disconnected: () => void | Promise<void>;
  playlistRecovery: ReturnType<typeof usePlaylistRecovery>;
} & RadioDrafts;

export type RadioDrafts = {
  roomSetupDraft: RoomSetupDraft;
  setRoomSetupDraft: Dispatch<SetStateAction<RoomSetupDraft>>;
};
