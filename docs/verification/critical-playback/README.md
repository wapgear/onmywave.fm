# Critical behavior checks

Run from the repository root after `pnpm install --frozen-lockfile`:

```sh
node scripts/verify-behavior.mjs services
node scripts/verify-behavior.mjs player
```

The services command runs on Node 24, including Linux. It exercises the existing search snapshot verifier, actual prepared-news selection and delivery transitions, and actual local-state storage with disposable files. The player command requires the installed Electron binary and a macOS graphical session. CI runs it in a hidden sandboxed Electron window on `macos-15`; it needs no interaction or audio output device.

All content is synthetic. No Jellyfin login, provider keys, external services, paid calls, or real user data are needed. The runner writes logs and summaries to `$WAVE_VERIFICATION_OUTPUT` or the temporary `wave-behavior` directory. CI uploads that directory on failure for seven days.

## Coverage and limits

Search checks exhaustive pagination, snapshot reuse, refresh and retry, session invalidation, isolated view keys, and ordinary paginated browsing. The deliberate cache mutation disables later-page snapshot reuse and must fail the request-count assertion.

Prepared-news checks use the real service, pool rules, temporary index, and audio files. Played takes and other recordings containing the same canonical story stay excluded. A wrong claim cannot start or release another reservation. Releasing an unstarted claim permits a fresh reservation, and played delivery stays excluded. Removing played exclusion or release-to-ready must produce assertion failures.

Storage checks write the duplicate-containing queue, current occurrence, 44-second position, and shuffle plan through the real storage module, then load them through a fresh module instance. Dropping playback from the disk write must fail the roundtrip assertion. Provider-key functions are replaced with inert fixture methods.

Player checks load the actual React app and player through Vite with the existing synthetic audio and bridge fixture. The Electron test window preserves context isolation, sandboxing, web security, and disabled Node integration. This exercises renderer orchestration; the fake bridge does not verify production preload, IPC sender validation, native media decoding, real-server playback, or audible transitions. The companion storage and prepared-news checks cover their actual service implementations separately.

The player scenarios verify paused restoration at 44 seconds, checkpoint-file readback into a new window, natural song completion, selection of a repeated song's exact queue occurrence, repeat-off exhaustion, repeat-one, a complete shuffle cycle containing 120 distinct occurrences of the same song, and repeat-all cycle reset. The cancellation scenario covers a claim that settles after a music command cancels scheduling. Targeted renderer mutants must reach readiness and fail their matching behavior assertion; failure to load the renderer does not count.

The player command also builds the app and runs the [native quit/relaunch check](../playback-relaunch/README.md). That check uses production main IPC, preload, and storage with an isolated data directory and synthetic Jellyfin metadata/audio. It verifies that the final checkpoint reaches disk before a normal quit and that a fresh process restores it paused.

Native macOS verification remains necessary for audio output and decoding, system media controls, VoiceOver, packaged application permissions, and real Jellyfin transport. Static format, type, lint, build, and audit checks remain enabled in the existing Quality job.

Mutation checks transform source only inside disposable verification loads. They do not edit checked-out production files. A missing mutation anchor, startup failure, or process timeout must fail verification rather than count as a detected regression. After renderer readiness, a bounded wait for an expected transition can fail its named behavior assertion.

## Runtime references

The runner uses Electron's [BrowserWindow security preferences](https://www.electronjs.org/docs/latest/api/browser-window) and [webContents execution API](https://www.electronjs.org/docs/latest/api/web-contents). It adds no test framework or browser dependency.
