# Playback relaunch verification

Run after `pnpm run build` on macOS:

```sh
node docs/verification/playback-relaunch/verify.mjs
```

The verifier launches the built Electron main process and production preload, loads the real renderer and `PlayerProvider`, and reads persisted playback from an isolated temporary app-data directory. It seeds a paused queue containing a duplicate song occurrence and an edited shuffle plan, verifies an ordinary queue checkpoint, resumes playback, then changes only the live position. Before quit, it confirms the disk still has the old position; a real app quit must persist the new position and edited plan. A second fresh process must restore the exact paused duplicate occurrence and future order. Finally, a generated test-only main-bundle mutant removes the before-quit checkpoint handler; the same delayed legacy-save setup must leave the old disk position behind.

The test bundle is generated from `out/main/index.js` using exact-once anchors. Instrumentation redirects app data, supplies a synthetic Jellyfin session, disables provider-status lookups, adds a quit signal and controlled write delays, and exposes startup errors. The fixture uses local fake Jellyfin metadata and a deterministic `Audio` substitute. It does not access a real account, keychain, provider, network service, or audio decoder. The test exercises normal quit and relaunch; updater installation ordering is not exercised here.

This is native Electron with the real main/preload/renderer/storage path, but it is not a packaged-app or manual UI test. CI invokes it on macOS after building. A successful run records sanitized evidence in [results.json](./results.json).
