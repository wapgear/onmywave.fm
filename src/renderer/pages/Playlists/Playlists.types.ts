import type { Song } from '../../../shared/types';
import type { usePlaylistRecovery } from './Playlists.page';

export type PlaylistsPageProps = {
  onReturnFromDetail: (id: string, origin: HTMLButtonElement) => void;
  onOpenDetail: (id: string, origin: HTMLButtonElement) => void;
  onCreateDetail: (id: string, origin: HTMLElement | null) => void;
  recovery: PlaylistRecovery;
  id: string | null;
  setId: (id: string | null) => void;
  add: (songs: Song[]) => void;
  details: (song: Song) => void;
};

export type PlaylistDetailProps = {
  recovery: PlaylistRecovery;
  id: string;
  listError: unknown;
  back: (origin: HTMLButtonElement) => void;
  add: (songs: Song[]) => void;
  details: (song: Song) => void;
};

export type PlaylistNameDialogProps = {
  title: string;
  initial: string;
  close: () => void;
  save: (name: string) => Promise<string | void>;
  created?: (id: string, origin: HTMLElement | null) => void;
};

export type PlaylistRecovery = ReturnType<typeof usePlaylistRecovery>;
