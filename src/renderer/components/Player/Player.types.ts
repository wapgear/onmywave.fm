export type PlayerProps = {
  queueOpen: boolean;
  lyricsOpen: boolean;
  toggleQueue: (source: HTMLButtonElement) => void;
  toggleLyrics: (source: HTMLButtonElement) => void;
  openDetails: (source: HTMLButtonElement) => void;
  djOpen: boolean;
  toggleDJ: (source: HTMLButtonElement) => void;
  djControlsTarget: HTMLDivElement | null;
};
