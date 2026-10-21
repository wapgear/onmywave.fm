import type { Album, Song } from '../../../shared/types';

export type AlbumsView = { album: Album | null; draft: string; selected: Map<string, Song> };

export type AlbumsPageProps = {
  onOpenDetail: (id: string, origin: HTMLButtonElement) => void;
  view: AlbumsView;
  setView: React.Dispatch<React.SetStateAction<AlbumsView>>;
  add: (songs: Song[]) => void;
  details: (song: Song) => void;
};

export type AlbumDetailProps = {
  album: Album;
  selected: Map<string, Song>;
  select: (selected: Map<string, Song>) => void;
  back: () => void;
  add: (songs: Song[]) => void;
  details: (song: Song) => void;
};
