# Playback checkpoint verification

Start the existing renderer fixture with `node docs/verification/playback-progress/server.mjs`. Initialize it with a paused three-song playback snapshot at 44 seconds before loading. The actual renderer uses fixture IPC; all app data and audio are synthetic.

## Paused writes

Over a 5.4-second observation, the original renderer sent two identical checkpoint IPC calls. The optimized renderer sends one successful snapshot and skips the identical periodic snapshot. See `before-checkpoints.json` and `after-checkpoints.json`.

## Slow and failing storage

After the initial restored snapshot settles, import `verifyCheckpointCoalescing` from `browser-check.mjs` in the fixture browser and call it. It replaces only `window.wave.savePlayback` with controlled asynchronous replies and exercises the real player commands, effects, and five-second timer.

`scenarios.json` records these checks:

- Three edits during a slow save send the active snapshot and only the latest pending snapshot, with one normal IPC request in flight.
- A saved value A, active value B, and latest value A restore A after B succeeds. If B fails, A is already durable and no extra write is sent or stale checkpoint error retained.
- Failed current snapshots expose an error and retry on the periodic trigger, without a tight loop. A successful retry clears only the checkpoint error.
- Returning to a failed active payload does not immediately retry it; a new state change remains saveable.
- Live position 90 is checkpointed while playing; unchanged paused playback sends no additional writes.
- Unload force-dispatches the newest position 95 and volume, even with a normal request active. Older pending work does not drain afterward. This is a deliberate shutdown-only overlap.
- A delayed old-session failure after unmount and reconnect to the same connection ID cannot overwrite a newly restored song/position or expose an error in the new player.

The separate lifecycle check uses the fixture's exposed QueryClient to remove and restore the connection, and a delayed save response. Production code does not expose that client.

These checks count renderer IPC calls and resulting fixture snapshots. They do not measure real disk latency or guarantee persistence during forced termination. The five-second interval is a checkpoint attempt; slow storage can delay completion. The main process retains serialized atomic writes, and unload remains best effort. No JSX, styling, or visible layout changed in this item.
