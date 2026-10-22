# App theme and density review

Reviewed the actual desktop renderer across Light, Coffee and Dark using synthetic local data. This extends the earlier isolated component checks to application navigation, page contexts, dialogs and drawers.

## Changes

- Removed repeated Songs, Albums, DJs and Sources subtitles and static source-list instructions.
- Moved appearance persistence, Jellyfin storage, DJ playback mechanics, voice/mode/delivery guidance and room setup explanations into named help icons. Shortened workflow text while retaining visible costs, request authorization, limits, provider requirements, live status, setup blockers and action consequences.
- Corrected DJ playback input sizing. The old 76px rule widened the checkbox and narrowed the slider; number, checkbox and range inputs now have separate widths. Removed duplicate label margins from the transition grid.
- Put DJ mode help inline with its tabs, avoiding a nearly empty icon row. Simplified the voice-volume label and retained its relative-volume explanation in help and its accessible value.
- Fixed shared-dialog cancel propagation so Escape from nested help closes only the topmost dialog and restores focus to its icon.
- Applied the theme accent to native ranges; strengthened table-row keyboard focus to an inset 2px ring; normalized custom avatar, DJ, history and prepared-take rings to the shared focus token. Removed an unused outline suppression.
- Darkened Coffee accent text to pass on selected/hovered surfaces and slightly darkened Light success text on its status background.

The frontend pair independently proposed and challenged the scope. The decision was to fix demonstrated shared-control defects and remove repetition, keeping paid-service consequences and live operational information visible. Review caught the orphan DJ help row; final screenshots confirm that correction in all themes at 960px.

## Coverage and checks

Electron 43.7.0 on macOS, 21 October 2026. The disposable fixture imports the actual App, providers, pages and production styles. Only the `window.wave` capabilities use synthetic results. No account, library, external service or provider writes occurred. No live content or credentials appear in the captures.

Final coverage includes 32 view/interaction states, rendered in every theme, with dense layouts also checked at 960 × 640. Standard views use 1280 × 800. The route matrix includes Songs and filter/action menus, Albums/list/detail, Playlists/list/detail/new dialog, Settings General/Appearance/DJ playback/transitions, provider keys, Sources/add dialog, DJs/editor/avatar controls, News bucket/setup/preparation/saved-audio empty state, queue/empty/populated, inspector, lyrics, DJ popover, signed-out connection and help dialogs.

The final 144 theme/viewport captures reported no control/text overflow and no contrast failures for the visible text sampled by the renderer scan. The scan uses computed foreground colors and composited ancestor backgrounds, the 4.5:1 normal-text threshold and 3:1 large-text threshold. Disabled controls and hidden/offscreen text are excluded. It is a targeted automated check, not a full accessibility certification.

The baseline composed-text scan reproduced Coffee Sign out at 4.42:1 on its surface; the final scan reports no failures for that pairing.

An independent relative-sRGB luminance calculation checked 84 actual text/focus/control palette pairs. Normal text uses 4.5:1; focus/control indicators use 3:1. The accent-on-selected-row pair is the playing-bars icon, so its threshold is 3:1. All pass. See [contrast.json](contrast.json). Before and after route measurements are in [before-routes.json](before-routes.json) and [after-routes.json](after-routes.json).

Native Space opened nested DJ help and Escape closed only that help, returning focus to its icon, in all three themes. Native arrow navigation selected the next avatar choice. Playback/connection help restored focus; the checkbox measured 16px and the native Settings range used the theme accent. Results are in [checks.json](checks.json) and [keyboard-checks.json](keyboard-checks.json). No renderer console errors were recorded in the final route pass.

`pnpm run format`, `pnpm run check` and `git diff --check` passed. The check command includes format validation, type-aware lint, TypeScript and production build. No dependencies or test frameworks were added.

## Screenshots

Baseline source was preserved before editing. Matched screenshots use the same real renderer, fixture content, viewport and initial focus/scroll targets. Layout changes naturally shift content below those targets. Representative before/after pairs and final controls were visually inspected by the coordinator and frontend reviewers. The retained pairs below cover changed layouts; the complete screenshot sets and disposable capture source are in `/private/tmp/wave-app-audit`.

| View | Light | Coffee | Dark |
| --- | --- | --- | --- |
| settings-general · 1280px | [Before](before-settings-general-light-1280.png) / [After](after-settings-general-light-1280.png) | [Before](before-settings-general-coffee-1280.png) / [After](after-settings-general-coffee-1280.png) | [Before](before-settings-general-dark-1280.png) / [After](after-settings-general-dark-1280.png) |
| settings-playback · 960px | [Before](before-settings-playback-light-960.png) / [After](after-settings-playback-light-960.png) | [Before](before-settings-playback-coffee-960.png) / [After](after-settings-playback-coffee-960.png) | [Before](before-settings-playback-dark-960.png) / [After](after-settings-playback-dark-960.png) |
| settings-transitions · 1280px | [Before](before-settings-transitions-light-1280.png) / [After](after-settings-transitions-light-1280.png) | [Before](before-settings-transitions-coffee-1280.png) / [After](after-settings-transitions-coffee-1280.png) | [Before](before-settings-transitions-dark-1280.png) / [After](after-settings-transitions-dark-1280.png) |
| dj-editor · 960px | [Before](before-dj-editor-light-960.png) / [After](after-dj-editor-light-960.png) | [Before](before-dj-editor-coffee-960.png) / [After](after-dj-editor-coffee-960.png) | [Before](before-dj-editor-dark-960.png) / [After](after-dj-editor-dark-960.png) |
| room-preparation · 1280px | [Before](before-room-preparation-light-1280.png) / [After](after-room-preparation-light-1280.png) | [Before](before-room-preparation-coffee-1280.png) / [After](after-room-preparation-coffee-1280.png) | [Before](before-room-preparation-dark-1280.png) / [After](after-room-preparation-dark-1280.png) |
| connection · 960px | [Before](before-connection-light-960.png) / [After](after-connection-light-960.png) | [Before](before-connection-coffee-960.png) / [After](after-connection-coffee-960.png) | [Before](before-connection-dark-960.png) / [After](after-connection-dark-960.png) |
| sources · 1280px | [Before](before-sources-light-1280.png) / [After](after-sources-light-1280.png) | [Before](before-sources-coffee-1280.png) / [After](after-sources-coffee-1280.png) | [Before](before-sources-dark-1280.png) / [After](after-sources-dark-1280.png) |
| table-keyboard · 1280px | [Before](before-table-keyboard-light-1280.png) / [After](after-table-keyboard-light-1280.png) | [Before](before-table-keyboard-coffee-1280.png) / [After](after-table-keyboard-coffee-1280.png) | [Before](before-table-keyboard-dark-1280.png) / [After](after-table-keyboard-dark-1280.png) |
| avatar-keyboard · 1280px | [Before](before-avatar-keyboard-light-1280.png) / [After](after-avatar-keyboard-light-1280.png) | [Before](before-avatar-keyboard-coffee-1280.png) / [After](after-avatar-keyboard-coffee-1280.png) | [Before](before-avatar-keyboard-dark-1280.png) / [After](after-avatar-keyboard-dark-1280.png) |

Nested help: [Light](after-dj-mode-help-light-1280.png), [Coffee](after-dj-mode-help-coffee-1280.png), [Dark](after-dj-mode-help-dark-1280.png).

## Limits

These checks cover synthetic normal, empty, editing and selected/focused states. Live Jellyfin streaming, provider-generated news/voice, all recovery/error permutations, populated saved-news history, OS-native chrome and screen-reader speech were not exercised. Existing uncommitted interface work was preserved.

## Release integration check

On 22 October 2026, after merging main through `c0d82be`, rebuilt the fixture and repeated the 144 theme/viewport captures. No renderer errors, sampled-text contrast failures or control/text overflow were reported. Repeated library, album, playlist and player cover checks, including native Enter/Space and focus restoration; all passed. The retained after captures and route measurements reflect this integrated build. `pnpm run check` and `pnpm audit` passed.
