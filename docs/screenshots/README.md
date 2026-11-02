# README screenshots

Captured on 2 November 2026 from this checkout's production renderer after `pnpm run check`, using a disposable browser fixture and the existing public example catalog. All images are 1440 × 900 pixels at 1×, with the Light theme, expanded sidebar, initial scroll position, and playback paused at 30 seconds.

- `library.png`: All songs, including the Artists sidebar destination.
- `albums.png`: the album library with matching release covers.
- `artists.png`: the Artists collection grid. This example has no artist portraits, so it shows the standard artwork fallback.

The fixture supplies the typed renderer bridge with example catalog and playback responses. It reuses the playback verification fixture's local state and the existing website capture artwork cache; no account, private library, server credentials, provider calls, or music recordings are included. These captures show current renderer appearance, not live-server or playback verification. Native macOS window controls are not included in browser captures.

The titles and artists are real catalog metadata. [Artwork sources](artwork-sources.json) records the release pages and original image URLs used for the website example. Artwork rights remain with the respective rights holders; the application license does not relicense the covers.

[Capture metadata](capture.json) records dimensions and SHA-256 hashes. [Artists verification](../verification/artists/README.md) includes the collection-browser comparison and interaction checks.
