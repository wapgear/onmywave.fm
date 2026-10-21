# Player cover opens song details

The bottom-left player artwork now opens the existing Song details drawer for the current song. It is a named native button, disabled when no song is selected, with the existing button focus styling. Closing the drawer restores focus to the cover.

## Screenshots

Captured and visually inspected production Electron renderer/preload screenshots using fictional catalog data, disposable storage, a paused Evening tide track at 0:00, and blocked external requests. Before captures were taken from main at f52f17c before editing.

| Viewport | Before | After | After clicking the cover |
| --- | --- | --- | --- |
| 1280 × 800 | [Before](before-1280.png) | [After](after-1280.png) | [Song details](after-open-1280.png) |
| 960 × 640 | [Before](before-960.png) | [After](after-960.png) | [Song details](after-open-960.png) |

## Verification

Native pointer clicks, Enter and Space open Song details at both viewport sizes. The displayed song matches the current track, playback stays paused, opening replaces Queue, and Escape or Close returns focus to the cover. No horizontal document overflow was observed. Selecting Paper lanterns and clicking the cover opens Paper lanterns details.

The optional Tab/focus-outline fixture lost native window focus, so it did not establish visible keyboard-focus rendering. Enter and Space passed after explicitly activating the fixture window. Live Jellyfin and VoiceOver were not exercised.

`pnpm run format`, `pnpm run check`, and `pnpm audit` passed. The audit found no known vulnerabilities.
