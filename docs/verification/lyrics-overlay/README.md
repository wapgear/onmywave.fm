# Lyrics overlay and visible player icon

On 21 October 2026, Anton requested a clear icon for opening lyrics and an overlay using the full song-list area. This replaces the initial narrow lyrics drawer from PR 169.

The player now has a microphone icon labeled Lyrics beside Queue. Opening it covers the complete list area without shrinking the library layout. The sidebar and player stay usable. Larger lyric text sits in a centered reading column. The covered main content is inert and hidden from screen readers until the overlay closes. Close or Escape restores the same list scroll position and focuses the Lyrics button. Queue and Lyrics remain mutually exclusive.

The overlay has a named nonmodal dialog role. Its scroll region reserves space above the floating player so automatic following does not put the current line underneath playback controls, including at 200 percent zoom. Existing lyrics retrieval, timing, retry, and account behavior are unchanged.

## Verification

The before screenshots were captured from commit f745302 before editing this UI. Before and after comparisons use the same production Electron renderer and preload, fictional catalog, restored paused Evening tide track at 0:00, viewport, and playback preferences. Disposable storage and local silent audio were used; external network requests were blocked.

| View | Before | After |
| --- | --- | --- |
| Player icon, 1280 by 800 | [Before](before-player-1280.png) | [After](after-player-1280.png) |
| Lyrics open, 1280 by 800 | [Before](before-lyrics-1280.png) | [After](after-lyrics-1280.png) |
| Player icon, 960 by 640 | [Before](before-player-960.png) | [After](after-player-960.png) |
| Lyrics open, 960 by 640 | [Before](before-lyrics-960.png) | [After](after-lyrics-960.png) |

Visually inspected the matched captures and the [960 by 640 capture at 200 percent zoom](after-lyrics-960-zoom200.png). The zoom capture shows the active lyric after seeking to 0:50.

Native checks passed for the visible Lyrics label, overlay/list boundary alignment at both widths, unchanged paused playback, player-control layout, covered-list focus exclusion, exact scroll-position restoration, Escape/focus restoration, Queue switching, keyboard scrolling and Follow current line, and current-line visibility above the player at 200 percent zoom. There was no horizontal document overflow or renderer console error.

The existing native lyric acceptance flow was rerun against this layout with screenshots written to temporary storage, preserving the initial dated captures. It covered timed boundaries and simultaneous lines, forward/backward seeks, plain Unicode/text safety, missing and unsupported states, retry recovery, rapid song changes, duplicate queue occurrences, empty-player behavior, keyboard opening, and sign-out during loading.

An initial fixed-delay retry assertion failed during concurrent fixture runs. An isolated rerun passed the complete flow, with a diagnostic confirming the expected network error and retry control. No production retry code changed.

`pnpm run format` and `pnpm run check` pass. No backend, dependency, provider, or audio-control changes were made. Live Jellyfin/LRCLIB coverage and VoiceOver remain unverified, as recorded in the [initial service verification](../lyrics/README.md).
