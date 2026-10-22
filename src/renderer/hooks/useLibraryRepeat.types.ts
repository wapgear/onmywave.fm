import type { Song } from '../../shared/types';

export type LibraryRepeatState = {
  connectionId: string | null;
  enabled: boolean;
  generation: number;
  cache: Song[] | null;
  flight: Promise<Song[]> | null;
};
