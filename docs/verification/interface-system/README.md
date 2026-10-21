# Dialogs and native controls

Extended the shared control review on 21 October 2026. See [the renderer design system](../../design-system.md) for reuse contracts and Apple references.

## Changes and evidence

- All nine modal action rows use shared `DialogActions` and `Button`. Five form actions explicitly submit; cancel and auxiliary controls preserve their native types, refs, async guards and accessibility states.
- Shared dialog CSS now keeps full titles readable instead of clamping them. A ResizeObserver measures the sticky heading so keyboard-scrolled fields stay below it. It disconnects on dialog cleanup.
- Action rows wrap and long labels fit the dialog. The original long-title fixture rendered only 55px of a 110px heading. After the change, client and content height are both 110px. Both action buttons fit the 378px content area without horizontal overflow and remain reachable by Tab.
- Native fields share height, radius, background, border and disabled/invalid states. Checkboxes/radios/ranges are excluded from text-field sizing. A search input now fits its 34px container rather than inheriting a 38px minimum.
- The filter, track-action and DJ popovers share one frame class. Their native popover roles, placement and keyboard handlers remain local. Low-specificity frame defaults preserve the DJ's 24px viewport gutter and the filter's 380px maximum height.
- Native title tooltips remain the shared short-help convention, including explicit shortcut overrides. Longer help uses InfoHelp and associated inline descriptions. No separate tooltip timing or positioning implementation was added.
- ConfigurationTabs uses shared spacing/radius/focus tokens and retains its roving keyboard behavior.

## Matched screenshots

| State | Before | After |
| --- | --- | --- |
| Dialog, 960×640 | [Before](before-dialog-960.png) | [After](after-dialog-960.png) |
| Dialog, 1280×800 | [Before](before-dialog-1280.png) | [After](after-dialog-1280.png) |
| Filter popover, 1280×800 | [Before](before-popover-1280.png) | [After](after-popover-1280.png) |

[Focused wrapped actions at 960×640](after-dialog-actions-960.png) shows the dialog scrolled to its footer. All screenshots were visually inspected. Dialog pairs use the same content, initial focus, viewport and starting scroll position. Popover pairs use the same initial selection and content.

The disposable Chromium fixture imports actual Dialog, Button, DialogActions, IconButton, InfoHelp, ConfigurationTabs and FilterSelect implementations, production styles and bundled fonts. The form values are synthetic, and its save action only updates fixture state. No provider, account or production library writes occurred.

## Focused checks

- Initial focus enters the room-name field. While the fixture is saving, Escape and Close do not dismiss the dialog. After unlocking, native keyboard submission invokes the form and restores focus to the opener. Escape also dismisses an unlocked dialog and restores focus.
- At 960×640 and 1280×800, dialog scrollWidth equals clientWidth; full title and wrapped actions fit. Keyboard-focused footer controls stay below the sticky heading and within the viewport.
- End activates/focuses the last configuration tab with tab indices `[-1, -1, 0]`. Filter search → ArrowDown → ArrowDown → Enter selects Ambient, closes the popover and restores focus to its trigger.
- Search shell/input both measure 34px. Avatar radio probes retain a 34×34 target matching their visual mark, absolute positioning and opacity 0. DJ frame max-width remains viewport minus 24px; shared radius is 12px. Filter frame stays within the viewport.
- Accessible-tree inspection confirms dialog heading, field names, invalid/disabled states and the shortcut title on the icon action. Tooltip title forwarding was inspected; native help-tag appearance and VoiceOver speech were not exercised.
- Independent frontend review found no material regression and identified a popover cascade issue, which was corrected before delivery.

Formatting, lint, TypeScript and production build passed. No dependencies were changed. This verifies shared UI behavior with fixtures; real persistence/mutations, full connected-library screens, native Electron chrome and VoiceOver remain outside these checks.
