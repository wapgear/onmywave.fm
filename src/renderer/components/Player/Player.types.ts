export type PlayerProps = {
  queueOpen: boolean;
  lyricsOpen: boolean;
  toggleQueue: (source: HTMLButtonElement) => void;
  toggleLyrics: (source: HTMLButtonElement) => void;
  openRoom: (source: HTMLButtonElement | null) => void;
  openSettings: (source: HTMLButtonElement | null) => void;
};
