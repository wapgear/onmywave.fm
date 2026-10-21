# DJ clock verification

The reproducible renderer fixture is `docs/verification/playback-progress/server.mjs`. Its fixture bridge counts interval callbacks, substitutes saved news takes and audio events, and exposes player/controller controls. It uses real browser timers and the actual renderer effects. It calls no live server or paid providers.

## Idle measurement

With no song playing, DJ disabled, and no scheduled news, a 1.1-second observation originally recorded 45 callbacks from the 25 ms transition clock and 11 from the 100 ms controller clock. After the change both counts are zero, and neither interval is installed. The unrelated query, recovery-status, and playback-checkpoint timers remain.

See `before-clocks.json` and `after-clocks.json`. This establishes removed callback work, not an estimate of battery or CPU savings.

## Behavior checked

Use `window.__fixtureSeed = { dj: true, everySongs: 1, availableTakes: 2 }` as an initialization script before loading the fixture for consecutive automatic takes. The fixture exposes the latest `window.__fixture.player`, `window.__fixture.automation`, audio objects, call history, and active interval records.

- Two consecutive saved takes at an every-song interval start and mark played exactly once each, advance through two song boundaries, and leave no DJ clocks after the pool is empty. Speech pause/resume remains correct.
- A failed pool request exposes an error; Retry immediately checks again and schedules the saved take. Recovery loss while waiting cancels the plan, releases its claim, and never starts speech.
- If music becomes due while an unchanged settings save is in flight, no pool check starts during the save. Its completion wakes exactly one due check without polling.
- Nonzero 0.12-second fade, lead-in, and tail settings continue with no new media timeupdate events. Pausing freezes fade volume; resuming advances it. Between-song speech waits for the song boundary, and tail completion advances music.
- Unmounting the player during a waiting break clears its active clock.

`scenarios.json` records the assertions and observed outputs. Fixture audio does not produce audible output; native decoding, real background-window behavior, and audible fade quality were not tested. The existing 25 ms active cadence and Electron background-throttling configuration are retained.

Matched idle screenshots at 1280 × 800 and 960 × 700 were visually inspected before and after. The interface is unchanged.
