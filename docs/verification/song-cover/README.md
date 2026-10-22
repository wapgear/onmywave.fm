# Song cover details

Library song covers now open the existing Song details drawer instead of triggering playback. This shared TrackTable behavior also applies to album and playlist tracks. The hover icon and accessible name describe Song details. The player cover is now a named button that opens the current song in the same drawer; it is disabled without a current song.

The earlier Git HEAD had cover-to-play wiring in TrackTable and a plain noninteractive player cover, matching the behavior reproduced before this fix. The theme/polish changes did not remove a details callback from either location.

Verified in the actual renderer with synthetic data in Electron 43.7.0. Cover activation opens the drawer without changing the queue or starting playback, closing restores cover focus, Enter opens library-cover details, and Space opens player-cover details. Album and playlist track covers were also exercised. Existing play controls, row Enter/double-click and action-menu playback remain available. Native callbacks were exercised through the actual App and Player components; no external accounts or provider calls were used. Results are in [before checks](cover-before-checks.json) and [after checks](cover-after-checks.json).

Screenshots were captured in Light, Coffee and Dark at 1280 × 800 and 960 × 640. Representative screenshots were visually inspected and retained below. Before/after library shots use identical content and state; the player baseline contains the extra queued songs caused by its old cover-to-play behavior.

- Library: [Before](cover-before-library-light-1280.png), [after](cover-after-library-light-1280.png), [open details](cover-after-library-details-light-1280.png).
- Player: [Before](cover-before-player-dark-960.png), [after](cover-after-player-dark-960.png), [open details](cover-after-player-details-dark-960.png).

`pnpm run format`, `pnpm run check` and `git diff --check` passed. Live streaming and provider operations were not exercised. Complete temporary captures and the focused fixture are in `/private/tmp/wave-app-audit`.
