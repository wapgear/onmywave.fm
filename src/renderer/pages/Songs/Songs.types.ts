import type { CatalogQuery, Song } from '../../../shared/types';

export type SongsView = { search: string; query: CatalogQuery; selected: Map<string, Song> };

export type SongsPageProps = {
  view: SongsView;
  setView: React.Dispatch<React.SetStateAction<SongsView>>;
  add: (songs: Song[]) => void;
  details: (song: Song) => void;
};
