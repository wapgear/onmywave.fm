export type AppMenuCommand =
  | 'settings'
  | 'updates'
  | 'songs'
  | 'artists'
  | 'albums'
  | 'playlists'
  | 'stations'
  | 'queue'
  | 'lyrics'
  | 'play-pause'
  | 'previous'
  | 'next'
  | 'shuffle'
  | 'repeat-off'
  | 'repeat-all'
  | 'repeat-one'
  | 'volume-up'
  | 'volume-down';

export type LibraryMenuState = {
  hasTrack: boolean;
  playing: boolean;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
};
