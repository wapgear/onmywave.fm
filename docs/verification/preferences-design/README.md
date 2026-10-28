# Settings content and spacing

The General settings controls use the shared spacing scale and form classes documented in `docs/design-system.md`. Announcement and transition rules, defaults, setup explanations and library descriptions now live in the existing named info dialogs. News on/off state, the short ElevenLabs cost notice, save feedback and errors remain visible. Transitions follow announcements; their optional sample is collapsed initially. Collapsing a running sample disposes its audio context.

Sources and DJs use the subsection variant of PageHeading inside Settings, leaving one primary page heading. Appearance, announcements, transitions, library help and provider keys reuse SectionHeading. Settings section defaults apply only to direct children so nested provider forms do not inherit a second set of section margins and separators.

Provider names appear once per credential form, with concise field labels and provider-specific accessible names. DJ preview explanations use the same info dialog; compact saved/missing/error state and a one-line generation/playback consequence remain visible. Its shared help icon retains IconButton sizing instead of inheriting the preview action's padding.

## Verification

Run from the repository root:

```sh
WAVE_SCENARIO=preferences-design WAVE_CAPTURE_STAGE=after node_modules/.bin/electron docs/verification/critical-playback/server.mjs
WAVE_SCENARIO=song-handoff-settings WAVE_CAPTURE_STAGE=after-design-discovery node_modules/.bin/electron docs/verification/critical-playback/server.mjs
pnpm run format
pnpm run check
```

The fixture renders the actual App, settings components and shared controls in native Electron 45 with synthetic state. General settings and transitions are captured at 1440×1000 and 960×800. General also has matching dark-theme captures. Sources, DJs and provider keys have matching 960×800 captures. `before-sections` records those tab views before changing their heading hierarchy; the `before` General and transition captures precede this cleanup. No personal library content or live provider calls are used.

The checks cover 16px gaps between announcement rows, no repeated settings headings, one primary heading per settings tab, no repeated inline announcement/transition explanations, the visible cost description, and the initially closed preview. Native key events verify Enter opens contextual help, focus enters Close dialog, Escape dismisses it and focus returns to the trigger. Enter also expands/collapses the native preview disclosure. Its cancellation check renders the actual preview component with fixture audio/Web Audio transport and verifies that collapsing it closes the active context. It does not establish listening quality.

The existing settings flow verifies the disabled default interval of six, enables introductions, saves song interval eight and news interval four, then disables introductions while preserving both intervals. Loading, errors, recovery blockers and save-state logic remain in their existing owners.

Screenshot pairs use identical fixture data and viewport sizes. The `after-help-960.png` capture shows the relocated explanation and visible keyboard focus. Real account sign-out, provider credentials, connected-library changes and VoiceOver are not exercised by this fixture.
