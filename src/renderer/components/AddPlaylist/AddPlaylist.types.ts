import type { Song } from '../../../shared/types';


export type AddPlaylistProps = {
  connectionId: string;
  songs: Song[];
  close: () => void;
  checkPlaylists: () => void;
};
