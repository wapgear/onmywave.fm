# Click a lyric line to seek

Timed nonempty lyric lines are native buttons. Click, Enter, or Space calls the existing player seek command and resumes following. Plain and empty lines have no seek controls. The progress bar's pause/play and DJ seek behavior also applies to lyrics.

Verified with the production renderer and preload in a disposable Electron fixture using fictional tracks, synthetic lyrics and a 185-second silent WAV. Network requests were blocked. Checked the actual media element time as well as the displayed position: pointer seek to 18 seconds while paused, Enter backwards to a shared 10-second timestamp, Space to 22 seconds, and continued playback after seeking to 26 seconds within a 2-second tolerance. Both lines at 10 seconds highlighted together. Manual following resumed. Plain lyrics retained literal markup and no buttons; empty timed lines had no unnamed buttons.

The first keyboard fixture omitted Electron's character event for Enter and failed. The complete native key sequence passed without production changes.

Before/after images use the same fictional song and paused position at 1280×800 and 960×640. All four were visually inspected. The 960-wide baseline is the preexisting icon-only fixture capture from `lyrics-icon/after-overlay-960.png`; the initial new baseline capture did not repaint completely after resize. The reading layout remains unchanged. Build, type, lint and format checks passed. Live Jellyfin streaming and DJ speech were not exercised for this change.
