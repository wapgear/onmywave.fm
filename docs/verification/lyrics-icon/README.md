# Icon-only lyrics button

On 21 October 2026, Anton requested removing the visible Lyrics text. The player now uses the standard 32 by 32 microphone icon button. The Lyrics tooltip, Show/Hide lyrics accessible label, active state, focus treatment, and full-list overlay remain available.

Before images were captured from commit 995d3f1 with the same fictional catalog, restored paused song at 0:00, and viewport as the after images. Both pairs were visually inspected.

| Viewport | Before | After |
| --- | --- | --- |
| 1280 by 800 | [Before](before-1280.png) | [After](after-1280.png) |
| 960 by 640 | [Before](before-960.png) | [After](after-960.png) |

Native Electron fixture checks confirmed no visible button text, a microphone SVG, standard button dimensions, tooltip and accessible name, opening the overlay without starting playback, and focus restoration after closing. Current overlay captures are available at [1280 by 800](after-overlay-1280.png) and [960 by 640](after-overlay-960.png).

`pnpm run format` and `pnpm run check` pass. Retrieval and playback code did not change. Live-server coverage remains pending as recorded in the earlier verification notes.
