import { useLayoutEffect, useMemo, useRef } from 'react';

import { drawSongInterval } from '../../shared/song-intervals';

export function useAnnouncementCadence(minimum: number, maximum: number, connectionId: string | null) {
  const cycle = useRef({ minimum, maximum, connectionId, completed: 0, target: minimum, initialized: false });

  useLayoutEffect(() => {
    const current = cycle.current;
    if (
      current.initialized &&
      current.minimum === minimum &&
      current.maximum === maximum &&
      current.connectionId === connectionId
    )
      return;
    if (current.connectionId !== connectionId) current.completed = 0;
    current.minimum = minimum;
    current.maximum = maximum;
    current.connectionId = connectionId;
    current.target = drawSongInterval(minimum, maximum);
    current.initialized = true;
  }, [minimum, maximum, connectionId]);

  return useMemo(
    () => ({
      completeSong() {
        cycle.current.completed += 1;
      },
      isDue(pendingSongs = 0) {
        return cycle.current.completed + pendingSongs >= cycle.current.target;
      },
      reset() {
        const current = cycle.current;
        current.completed = 0;
        current.target = drawSongInterval(current.minimum, current.maximum);
      },
    }),
    [],
  );
}
