// Chromium can reuse a previous media result across new Audio elements.
// Give each new playback attempt its own URL so a repaired file can be retried.
export function freshAudioUrl(value: string): string {
  const url = new URL(value);
  url.searchParams.set('play', crypto.randomUUID());
  return url.href;
}
