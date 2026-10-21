# Shared icon controls

Reviewed and implemented in desktop-light on 21 October 2026. Apple references: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), and [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility). Applied their guidance on consistent related controls, alignment, meaningful labels, hover help, keyboard access, and platform-appropriate sizing. This is not a native AppKit conformance claim.

## Findings and changes

- Queue removal inherited 6px horizontal padding inside a 24px button, squeezing the 14px SVG to 12px wide. It now uses a square 32px compact control with zero padding, retaining the original 14px glyph and focus-recovery selector.
- The selection toolbar mixed 32px text actions with a 34px icon action. Its icon action now uses the shared 32px compact variant. Responsive text-button padding no longer applies to icon buttons.
- Drawer close and track actions used font glyphs (`×` and `•••`), unlike the existing Lucide icon system. They now use X and Ellipsis, with a square 32px track-menu target.
- Shared IconButton supplies a required accessible label, native title tooltip, type=button default, native props/ref forwarding, and existing standard/compact/player/play CSS variants. Dialogs, drawer, source/DJ actions, refresh, help, queue, selection toolbar, track menus and player use it. Shortcut titles and state-specific player labels remain intact.
- Shared size and focus-width tokens reduce drift. Keyboard focus is 2px in the shared base and player controls. Existing text buttons continue to reuse the global button styles; menus, filters and tabs retain their established specialized components.

## Evidence

Matched Chromium screenshots at 2x scale with identical viewport, fixture content and initial state:

| Viewport | Before | After |
| --- | --- | --- |
| 960 × 640 | [Before](before-960.png) | [After](after-960.png) |
| 1280 × 800 | [Before](before-1280.png) | [After](after-1280.png) |

Both pairs were visually inspected. The temporary fixture imports the actual TrackTable, Dialog, InfoHelp, FilterSelect and production styles. Source, queue, drawer and player surrounding markup is a disposable representative fixture; its after state uses the actual IconButton. This checks the control system, not a complete connected-library session. Fixture titles and artwork are synthetic. No account, provider or library writes were performed.

Measured at 1280 × 800 and 1600 × 1000: ordinary icon buttons 34×34, compact/player 32×32, Play 36×36; SVG box center offsets zero except the deliberately preserved +1px Play optical correction. Queue X measures 14×14 after, compared with 12×14 before. Every selection-toolbar button measures 32px high after. No horizontal document overflow at either size.

Focused interaction checks passed: track-menu opening and Escape focus restoration; selected-song queue action dispatch; help dialog opening and Escape restoring focus to its trigger. Accessible-tree inspection confirms button names, disabled state, and supplementary titles. Native button refs and popover attributes remain forwarded. A separate frontend reviewer inspected the migration and reported no actionable regression.

The fixture does not verify real playback, provider mutations, queue-removal focus against a connected library, VoiceOver speech, native Electron window chrome or every app screen. Existing behaviors were preserved in code review. No unit-test framework was added.

`pnpm run format` and `pnpm run check` passed, including formatting, type-aware lint, TypeScript and production build. Dependency audit results are recorded with the PR.
