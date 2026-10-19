export type PlayerProps = {
  queueOpen: boolean;
  toggleQueue: () => void;
  openRoom: (source: HTMLButtonElement | null) => void;
  openSettings: (source: HTMLButtonElement | null) => void;
};
