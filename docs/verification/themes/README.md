# Desktop themes

Added Light, Coffee and Dark in Settings → General → Appearance. Light remains the default. Selection applies to the document immediately, is stored under `wave:theme` in renderer local storage, and restores before React mounts. It is independent of the Jellyfin account. Missing, invalid or unreadable preferences fall back to Light; a failed write leaves the selected theme usable and explains that it was not saved.

CSS variables cover the canvas, sidebar, fields, tables, dialogs, popovers, player, progress track, notices, status colors and controls. Artwork, avatar palettes and media overlays retain their intentional colors. Dark uses separate foreground tokens for filled primary and player buttons. Coffee uses cream surfaces, brown text and a terracotta accent.

## Verification

Electron 43.7.0 on macOS, 21 October 2026. Disposable storage and synthetic catalog content. No account, library or provider writes. The temporary fixture imports the actual AppearanceSettings, TrackTable, Dialog, InfoHelp, FilterSelect and IconButton components with production styles. Queue and player surrounding markup are representative fixtures.

Matched captures use the same state, content and viewport before and after. Baseline captures were made before editing the UI. Images were visually inspected by the coordinator and an independent frontend reviewer.

| Viewport | Before | Light | Coffee | Dark |
| --- | --- | --- | --- | --- |
| 960 × 640 | [Library](before-960.png), [dialog](before-960-dialog.png) | [Library](after-light-960.png), [dialog](after-light-960-dialog.png) | [Library](after-coffee-960.png), [dialog](after-coffee-960-dialog.png) | [Library](after-dark-960.png), [dialog](after-dark-960-dialog.png) |
| 1280 × 800 | [Library](before-1280.png), [dialog](before-1280-dialog.png) | [Library](after-light-1280.png), [dialog](after-light-1280-dialog.png) | [Library](after-coffee-1280.png), [dialog](after-coffee-1280-dialog.png) | [Library](after-dark-1280.png), [dialog](after-dark-1280-dialog.png) |
| 1600 × 1000 | [Library](before-1600.png), [dialog](before-1600-dialog.png) | [Library](after-light-1600.png), [dialog](after-light-1600-dialog.png) | [Library](after-coffee-1600.png), [dialog](after-coffee-1600-dialog.png) | [Library](after-dark-1600.png), [dialog](after-dark-1600-dialog.png) |

Picker captures: [Light](after-light-1280-settings.png), [Coffee](after-coffee-1280-settings.png), [Dark](after-dark-1280-settings.png). Popovers: [Light](after-light-1280-popover.png), [Coffee](after-coffee-1280-popover.png), [Dark](after-dark-1280-popover.png). [Keyboard focus](after-dark-keyboard.png).

Native keyboard arrow keys changed the checked radio, immediately applied the theme and preserved focus. Reloading and creating a new renderer restored Dark. Invalid stored values restored Light. A simulated storage write failure still applied Coffee and displayed the persistence failure. Results are recorded in [checks.json](checks.json).

An independent calculation using relative sRGB luminance checked 39 foreground/background pairs against a 4.5:1 threshold. All pass, with a minimum of 4.65:1. This includes normal/muted text, selection, fields, accent actions, warnings/errors and player controls. See [contrast.json](contrast.json). This is a targeted palette check rather than a full accessibility audit.

Formatting, type-aware lint, TypeScript and production build passed with `pnpm run format` followed by `pnpm run check`. No dependencies or unit-test framework were added.

## Limits

Fixture checks do not cover a complete connected library session, live playback, every page, screen-reader speech or native OS window chrome. Theme persistence depends on retaining the renderer origin and storage partition. The main-process BrowserWindow configuration and OS appearance are unchanged. Existing uncommitted interface changes were preserved.
