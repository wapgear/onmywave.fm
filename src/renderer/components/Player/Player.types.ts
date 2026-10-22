import type { Song } from '../../../shared/types';


export type PlayerProps = {
  details: (song: Song, source: HTMLButtonElement) => void;
  queueOpen: boolean;
  lyricsOpen: boolean;
  toggleQueue: (source: HTMLButtonElement) => void;
  toggleLyrics: (source: HTMLButtonElement) => void;
  openRoom: (source: HTMLButtonElement | null) => void;
  openSettings: (source: HTMLButtonElement | null) => void;
};
