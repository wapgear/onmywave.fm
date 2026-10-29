# News controls and settings polish

Verified on 29 October 2026 with the production renderer and synthetic fixture data. No live Jellyfin or paid provider calls were made.

The global button hover previously painted a second rectangle over the news-row hover and behind the circular audition control. Story and star buttons now retain the shared row highlight, while the audition button has a padded 48px target and a transparent background. Native selects retain their behavior and refs inside a shared wrapper with symmetric 12px text/icon insets. Native and custom select chevrons rotate on open and respect reduced motion. General and News settings center their headings and forms within a 760px maximum width, with no narrower inner body cap.

## Before and after

Paired captures use matching synthetic content, Dark theme, viewport and state. These screenshots were captured during implementation before the scoped changes were transferred onto current main.

| View | Before | After |
| --- | --- | --- |
| Story hover, 1280×900 | [Before](before-news-1280.png) | [After](after-news-1280.png) |
| Pause hover, 1280×900 | [Before](before-play-1280.png) | [After](after-play-1280.png) |
| General settings, 1600×900 | [Before](before-settings-1600.png) | [After](after-settings-1600.png) |
| News settings, 1600×900 | [Before](before-news-settings-1600.png) | [After](after-news-settings-1600.png) |

[Native select open](after-native-select-open.png) shows the rotated chevron in the visible Chromium browser. The native operating-system popup is outside the page screenshot.

## Behavior

[Recorded measurements](behavior.json) cover 800×900, 1280×800 and 1600×900 in Dark, and 1280×800 in Light and Coffee. All reported cases had no page errors or horizontal overflow. The settings body fills its centered column; News settings have equal left/right spacing. Text padding and the chevron box's right inset both measure 12px.

The fixture exercised listen, pause, resume using Enter, stop, native-select opening, custom-select opening and Escape focus restoration, local transition selection, and reduced-motion styles. Native picker animation was checked in visible Chromium because its headless native popup closes immediately. Native picker dismissal used blur for deterministic cleanup; operating-system Escape handling was not asserted.

Formatting, lint, TypeScript and production build passed with `pnpm run format` and `pnpm run check` during implementation. Release-branch quality and dependency checks are reported in the PR.

This does not establish audible output, live provider delivery, native VoiceOver, or an installed-version update cycle.

## Independent release review

Elena independently verified the isolated release branch against the requested behavior and returned **PASS**, with no actionable UI issues. [Independent measurements](independent-results.json), [open-select capture](independent-open-select.png) and [settings capture](independent-settings.png) cover the actual release-branch renderer. The same viewport/theme cases passed with symmetric insets, centered forms and no page errors; visible Chromium confirmed native and custom chevron animation, keyboard playback, Escape focus return and reduced motion.
