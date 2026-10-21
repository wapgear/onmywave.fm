# Lyric pointer activation and timing notice

The published 0.1.0 bundle contains the seek handler, but real mouse input reproduced a missed click: pointer-down paused following and inserted its control, moving the target line by 70 pixels before mouse-up. Playback stayed at 0 instead of seeking to the line at 18 seconds. Earlier programmatic click checks bypassed that hit-testing failure.

Pointer-down on a lyric button now leaves following unchanged until its click handler seeks. Blank-area and scrollbar interaction still pause following. Plain nonempty lyrics show a polite status notice explaining that they are not time-synced and cannot seek to a line. Missing and timed lyrics do not show that notice.

Verified real Electron mouse-down/up at the same coordinates: target movement under 2 pixels, playback at 18 seconds, following still enabled. Native fixtures also verified the plain notice and absence of seek buttons at 1280×800 and 960×640, plus no timing notice for timed or missing results. Fictional lyrics, isolated storage and local silent audio were used; external requests were blocked. Before captures use the immutable published 0.1.0 renderer/preload with the same fictional song and paused 0:00 state. After captures use the changed production build. Screenshots were visually inspected.

Format, lint, type and production build checks passed. No new dependencies or unit-test framework were added. The installed 0.1.0 app remains unchanged; this patch requires a later release. Unrelated DJ edits are excluded.
