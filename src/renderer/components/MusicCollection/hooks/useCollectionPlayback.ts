import { useState } from 'react';

import type { PlaybackScope, Song } from '../../../../shared/types';
import { usePlayer } from '../../../player';

export function useCollectionPlayback(kind: PlaybackScope['kind'], id: string, songs: Song[]) {
  const player = usePlayer();
  const [mix, setMix] = useState(false);
  const playingHere = player.queue.length > 0 && player.playbackScope?.kind === kind && player.playbackScope.id === id;
  const mixWithLibrary = playingHere ? player.playbackScope!.mixWithLibrary : mix;
  const scope: PlaybackScope = { kind, id, mixWithLibrary };

  return {
    mixWithLibrary,
    changeMix: (value: boolean) => {
      setMix(value);
      if (playingHere) player.setCollectionMix({ ...scope, mixWithLibrary: value }, songs);
    },
    play: (tracks: Song[], index?: number) => player.play(tracks, index, scope),
    toggle: () => {
      if (playingHere) player.toggle();
      else {
        const index = songs.findIndex((song) => song.id === player.current?.id);
        player.play(songs, Math.max(0, index), scope);
      }
    },
  };
}
