export const MIN_SONG_INTERVAL = 1;

export const MAX_SONG_INTERVAL = 10;

export function isSongIntervalRange(minimum: unknown, maximum: unknown): boolean {
  return (
    typeof minimum === 'number' &&
    typeof maximum === 'number' &&
    Number.isInteger(minimum) &&
    Number.isInteger(maximum) &&
    minimum >= MIN_SONG_INTERVAL &&
    maximum <= MAX_SONG_INTERVAL &&
    minimum <= maximum
  );
}

export function drawSongInterval(minimum: number, maximum: number): number {
  return minimum === maximum ? minimum : minimum + Math.floor(Math.random() * (maximum - minimum + 1));
}
