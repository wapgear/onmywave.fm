# Linux support verification — 3 November 2026

Adapted Egor Kovetskiy's Linux patch to current main. The patch referenced binary screenshots without including their image data; none of those original images could be recovered. These captures were made locally and are not evidence of a native Linux session.

## Checks performed

- `pnpm run format` and `pnpm run check` passed with Node 26.13.0 and pnpm 10.34.7, including formatting, type-aware lint, TypeScript, and the production build.
- `pnpm audit` reported no known vulnerabilities.
- `pnpm run package:linux` produced `release/onmywave-0.7.5-linux-x86_64.AppImage` on macOS. The artifact is an x86-64 Linux ELF executable. Packaging is also included in the Ubuntu Quality job.
- The real development renderer, with fictional Jellyfin catalog/IPC/audio fixtures, passed keyboard checks using both Linux and macOS platform detection. Verified modifier-click selection/toggling, select-all for the 80 loaded songs, Escape, search focus, next/previous track, editable-field guards, shortcut labels, and Space playback. Verified no horizontal overflow at 1280 × 800 and 960 × 640, and no renderer errors. See [results](renderer-results.json).

The browser checks used macOS Chrome with `navigator.platform` overridden to `Linux x86_64` or `MacIntel`. They do not verify native Linux keyboard event delivery, window controls, audio decoding, X11/Wayland, GNOME Secret Service, KWallet, or credential restoration across restarts. No live Jellyfin or paid provider requests were made.

The storage guard follows [Electron's documented Linux backends](https://www.electronjs.org/docs/latest/api/safe-storage): persist credentials only with a supported system secret store; reject the `basic_text` and `unknown` backends. Native persistence and session-only behavior still require Linux verification.

## Visually inspected captures

All pairs use 1280 × 800, light appearance, the same fictional catalog, and the first song paused at 0:00. The player pair applies the same Ctrl-click to the second song; the after image shows the resulting selection. Help dialogs are open in both corresponding captures.

| View | Before | After |
| --- | --- | --- |
| Player and Ctrl selection | [Before](before-player.png) | [After](after-player.png) |
| About and updates | [Before](before-about.png) | [After](after-about.png) |
| Provider-key help | [Before](before-providers.png) | [After](after-providers.png) |
| Connection help | [Before](before-connection.png) | [After](after-connection.png) |

## Integration with 0.7.6

Merged current main (`3f31359`) while preserving its asynchronous credential encryption, song removal, title-click focus, double-click playback, and track-number width. The Linux backend guard now awaits asynchronous encryption availability before allowing persistence.

`pnpm run check` passed and `pnpm run package:linux` produced `onmywave-0.7.6-linux-x86_64.AppImage`. The focused renderer checks passed again for Linux and macOS platform detection at 1280 × 800 and 960 × 640, including single-title-click focus without playback and double-click playback. See [integration results](merge-renderer-results.json). Native Linux limitations above still apply.

The [current-main baseline](merge-before-player.png) and [integrated result](merge-after-player.png) use the same fictional catalog, light appearance, 1280 × 800 viewport, first track paused at 0:00, and Ctrl-click on the second row. Both captures were visually inspected.
