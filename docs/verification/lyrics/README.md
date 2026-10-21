# Song lyrics verification

Checked on 21 October 2026 for [issue 168](https://github.com/wapgear/onmywave.fm/issues/168). The feature reads saved Jellyfin lyrics and displays them in the player drawer. Live library coverage remains unverified. The initial drawer layout recorded here is superseded by the [full-width overlay update](../lyrics-overlay/README.md); the service checks still apply.

## Implementation and review

Steve and Elena independently proposed reusing the listening drawer. Morgan chose to extend its existing view state instead of replacing the drawer model, and implemented the service adapter. Steve implemented the frontend. Elena reviewed the result and identified the need for a single accessible current marker for simultaneous lines. The final UI highlights the whole timestamp group and marks its first line as current. Nadia reviewed the service normalization and session behavior. Unknown server versions now preserve an unsupported outcome for ambiguous route 404s.

The first native screenshot review exposed a heading that consumed the available lyrics space at 200 percent zoom. The song heading now scrolls away, only Follow current line stays sticky, and short windows use a compact drawer heading. Rechecked screenshots show the active lyric above the player at both supported window sizes.

## API contract

The adapter uses authenticated `GET /Audio/{itemId}/Lyrics`. IDs pass the existing Jellyfin item validator. The main process bounds responses to 1,000,000 streamed bytes and 10,000 lines. It preserves text and converts safe, nonnegative `Start` ticks to seconds by dividing by 10,000,000. Only explicit `Metadata.IsSynced: false` forces plain text. Missing metadata is allowed because the current Jellyfin LRC parser returns timed lines without setting it. Mixed, unsafe, negative, or unordered timing falls back to plain text.

Jellyfin versions before 10.9 return unsupported before a request. A lyric-route 404 on a known supported server becomes an empty result. The service retains permission, authentication, network, timeout, and malformed-response errors. Each new lyrics request cancels the previous one. Account changes cancel pending reads, and the existing session guard rejects late results. Renderer queries are scoped to connection and song, with no inactive query retention or disk persistence.

Primary references checked during implementation:

- [Jellyfin lyrics controller](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/LyricsController.cs)
- [Jellyfin 10.11 LRC parser](https://github.com/jellyfin/jellyfin/blob/v10.11.0/MediaBrowser.Providers/Lyric/LrcLyricParser.cs)
- [Lyric line and tick-valued Start](https://github.com/jellyfin/jellyfin/blob/master/MediaBrowser.Model/Lyrics/LyricLine.cs)
- [Jellyfin music and local lyric files](https://jellyfin.org/docs/general/server/media/music/#lyrics)
- [Jellyfin LRCLIB plugin](https://github.com/jellyfin/jellyfin-plugin-lrclib)

## Service verification

An ephemeral Node HTTP fixture exercised the bundled production JellyfinService through its real authenticated HTTP request path. Eighteen checks passed:

- Timed tick conversion, simultaneous timestamps, exact item route, and authentication header.
- Plain Unicode, blank stanza lines, repeated text, and literal markup.
- Mixed, invalid, unsafe, and unordered timing; explicitly plain metadata; blank/empty results.
- Missing lyrics, old/unknown server capability, 401, 403, and server errors.
- Malformed JSON and lyric shapes, oversized streaming response, excessive line count, and invalid IDs.
- New-item cancellation and account-change rejection of pending responses.
- Actual network failure and the existing 20-second request timeout.

This fixture used fictional credentials and local loopback HTTP. It made no external lyric requests.

## Native verification

The production renderer and preload ran in Electron 43.7.0 on macOS, with disposable app storage, a fictional catalog, synthetic lyric text, and a local silent WAV file. IPC fixtures supplied deterministic outcomes. External HTTP and HTTPS requests were blocked.

Verified on the final build:

- Lyrics load only after opening the drawer. A restored paused song stays paused.
- Opening focuses the close button; closing restores the actual Lyrics button. Space opens Lyrics without starting music.
- Exact boundary seeks highlight simultaneous lines together with one accessible marker. Forward/backward seeks update immediately, including clearing the highlight before the first timestamp.
- Programmatic following stays enabled. Manual wheel and keyboard scrolling pause it; Follow current line resumes it. The named scroll region is keyboard focusable.
- Queue and Lyrics replace each other without changing paused playback.
- Plain text retains Unicode, blank lines, and literal markup without rendering HTML.
- Missing lyrics explains server LRCLIB setup. Unsupported capability has no retry loop; a network error offers explicit retry and recovers.
- Rapid song changes retain the open drawer, switch to the current song, and discard delayed results.
- A duplicate queue occurrence resets position and following. An empty player disables Lyrics.
- Sign-out during a slow request removes lyrics; the delayed response does not repopulate the signed-out screen.
- At 960 by 640 and 200 percent app zoom, the active lyric, close button, and player remain visible with no horizontal document overflow. Keyboard scrolling and Follow current line work at that zoom.
- No renderer console errors occurred.

## Screenshots

The before images were captured from `origin/main` at `fdf69f9` before UI edits. Each comparison below uses the same fictional catalog, paused Evening tide track at 0:00, playback preferences, and viewport. Images retain the native 2x pixel scale.

| View | Before | After |
| --- | --- | --- |
| Library and player, 1280 by 800 | [Before](before-1280.png) | [After](after-1280.png) |
| Queue drawer, 1280 by 800 | [Before](before-drawer-1280.png) | [After](after-drawer-1280.png) |
| Queue drawer, 960 by 640 | [Before](before-drawer-960.png) | [After](after-drawer-960.png) |

New states were captured and visually inspected at [1280 by 800](lyrics-1280.png), [960 by 640](lyrics-960.png), [1280 by 800 at 200 percent zoom](lyrics-1280-zoom200.png), and [960 by 640 at 200 percent zoom](lyrics-960-zoom200.png). Additional captures show [manual follow](manual-follow-960.png), [plain lyrics](plain-960.png), [missing lyrics](missing-960.png), and [network failure](error-960.png).

## Checks and remaining work

`pnpm run format`, `pnpm run check`, `pnpm audit --prod`, and `pnpm audit` pass. No dependency or test-framework changes were needed. The original checkout's unrelated DJ edits remain untouched.

Before release, check the target Jellyfin version and LRCLIB installation, download lyrics on that server, and sample timed/plain/missing songs from the real library. No live Jellyfin or LRCLIB service was used here, so these checks do not establish real catalog coverage. Actual macOS VoiceOver interaction, native scrollbar dragging, and live DJ speech alongside lyrics also remain to be checked. Highlighting uses only the existing music position; no audio-control code changed. Separate metadata offsets and word-level cues are not applied in this release.
