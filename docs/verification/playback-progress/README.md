# Playback progress isolation

Run `node docs/verification/playback-progress/server.mjs` from the repository root, then open `http://127.0.0.1:5199`. The server renders the real application with fixture IPC and audio objects. Its development-only Vite transform counts component function invocations and exposes the current player as `window.__fixture.player`. These counters and fixture services are never included in the production build.

## Render measurement

At 1280 × 800, play the first fixture song, reset `window.__renders = {}`, and send ten distinct progress events. Wait one animation frame between events:

```js
for (let position = 1; position <= 10; position++) {
  window.__fixture.tick(position);
  await new Promise(requestAnimationFrame);
}
console.log(window.__renders);
```

React Strict Mode invokes rendering twice in this development fixture. Before the change, ten events produced 20 invocations each of PlayerProvider, ReadyApp, SongsPage, Player, and DJPopover. After the change, only PlayerTimeline recorded 20 invocations. The open Queue also remained unchanged. With lyrics open, a progress event rendered PlayerTimeline and Lyrics twice each and advanced the highlighted line without rendering the app/library.

These are component function invocation counts, not production CPU measurements or a count of committed DOM changes. See `before-counts.json`, `after-counts.json`, and `behavior-results.json`.

## Behavior exercised

- Native range input and keyboard commit seek to 45 seconds.
- Seeking while paused updates the timeline without starting music.
- Next/Previous preserve pause intent and reset the timeline on track changes.
- Queue-open progress remains isolated; timed lyrics follow progress.
- Audio fallback and Retry both use the latest 37-second position.
- A periodic checkpoint records the latest position; beforeunload records the latest seek.
- A fixture news break schedules, starts at a song boundary, pauses, resumes, completes, and advances music with position reset.
- A saved three-song queue restores the second song at 44 seconds, paused; removing all entries resets progress to zero.

The fixtures exercise actual renderer effects and handlers. They do not verify native media decoding, audible fades, live Jellyfin latency, or main-process disk persistence. No paid providers are called.

Matched screenshots at 1280 × 800 and 960 × 700 show the same first song playing at 10 seconds. All four images were visually inspected; the composition and controls remain unchanged.
