import type { Song } from '../../../shared/types';

export type TrackRow = { key: string; song: Song; editable?: boolean };

export type TrackTableProps = {
  rows: TrackRow[];
  selected: Map<string, Song>;
  select: (next: Map<string, Song>) => void;
  play: (songs: Song[], index?: number) => void;
  queue: (songs: Song[]) => void;
  add: (songs: Song[]) => void;
  details: (song: Song) => void;
  currentId?: string;
  requestedPlaying: boolean;
  togglePlayback: () => void;
  offset?: number;
  editable?: boolean;
  busy?: boolean;
  remove?: (key: string, source: HTMLButtonElement | null) => void;
  move?: (key: string, index: number) => void;
  rowWindow?: { indices: number[]; rowHeight: number; focusRow: (index: number) => void };
};
