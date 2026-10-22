# Search and player control fixes

Search focus now uses a 2px inset ring on the rounded field container. The inner input has no separate outline. Filter search shares the same `search-field` styles, 34px height, padding, icon size and focus treatment as library search.

Range thumbs are 12px and use the contrasting player control color. Notice actions have compact focus corners and transparent hover/disabled backgrounds. Skip track is absent when a failed session restore has no current track. At the end of the queue, skipping a failed track clears its stale playback error and leaves playback stopped.

## Verification

Electron 43.7.0 on macOS. The disposable fixture imports the actual PlayerProvider, Player, FilterSelect and production CSS. Only news recovery and the unrelated DJ popover are stubbed; playback preparations return synthetic failures. No private library, provider calls or account writes are involved. Temporary fixture source is in `/private/tmp/wave-control-fixes`.

Before screenshots were captured before source edits. The same synthetic content and viewport sizes were used after editing. The final capture uses Chromium focus emulation to keep the window logically active while testing native keyboard input. This avoids the desktop focus changes that affected early captures. Search screenshots show the overflowing inner ring before and the inset container ring after. Final filter images explicitly show keyboard focus. Captures were visually inspected.

| Theme | Search before / after at 1280 × 800 | Filter before / after at 960 × 640 |
| --- | --- | --- |
| Light | [Before](before-light-1280-search.png) / [After](after-light-1280-search.png) | [Before](before-light-960-filter.png) / [After](after-light-960-filter.png) |
| Coffee | [Before](before-coffee-1280-search.png) / [After](after-coffee-1280-search.png) | [Before](before-coffee-960-filter.png) / [After](after-coffee-960-filter.png) |
| Dark | [Before](before-dark-1280-search.png) / [After](after-dark-1280-search.png) | [Before](before-dark-960-filter.png) / [After](after-dark-960-filter.png) |

Both search and filter were captured at 1280 × 800 and 960 × 640 in all three themes. Player controls and synthetic error notices are visible in the same images. The failed-restore action is recorded [before](before-restore.png) and [after](after-restore.png).

The actual player reproduced the stale final-track error before editing. Native Enter activation of Skip track advanced to the next queue occurrence after a preparation failure. Skipping the final failed track then cleared the error and stopped playback. A failed restore no longer renders an unusable disabled Skip track action.

Volume changed through native ArrowRight and pointer input. Filter search narrowed choices when typing Jazz, selected it with Enter, closed the popover and returned focus to the trigger. Geometry and focus checks confirmed matching field heights, no inner input outline and a -2px container outline offset. Raw results are in [before-results.json](before-results.json) and [after-results.json](after-results.json).

`pnpm run format`, `pnpm run check` and `git diff --check` passed. The check command includes format validation, type-aware lint, TypeScript and production build. Live Jellyfin streaming, DJ playback and screen-reader speech were not exercised.
