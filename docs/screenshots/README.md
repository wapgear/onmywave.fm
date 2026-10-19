# README screenshots

Captured on 19 October 2026 using the production renderer in Electron 43.7.0 on macOS, with a 1280 × 788 content viewport at 2× resolution.

- `library.png` shows All songs.
- `albums.png` shows Albums.

A temporary Electron capture harness loaded the built renderer and existing preload, returned a fictional catalog through IPC, blocked external HTTP(S) requests, and used disposable local storage. The captures include the app's own placeholder icons. No album art, real account data, music files, or live provider calls were used. Existing TrackTable edits in the working tree were included. [Capture metadata](capture.json) records input and image hashes.

These are screenshots of the rendered app, not generated concept art. They document browsing appearance and do not establish live server or playback behavior.

To replace them, build the current app, open the same views with a disposable catalog, and capture the content area. Keep the viewport consistent, use content with known redistribution rights, hide private information, visually inspect both captures, and update the metadata and README captions together.
