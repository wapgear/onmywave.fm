# Centered macOS traffic lights

Verified on 29 October 2026 in Electron 45 on macOS at 960×700, using the synthetic catalog from `node docs/verification/queue-editing/server.mjs`. An isolated native BrowserWindow used the app's hidden-inset title bar, window constraints, and traffic-light position. Captures include the actual native controls.

Previously, the controls at `y: 22` crossed the main panel's top edge when the sidebar collapsed to 64px. The controls now start at `y: 14` in a 42px top strip, giving the 14px controls equal space above and below. The shared `--titlebar-height` aligns the main panel, drag region, sidebar spacer, resize handle, and listening drawer. Window and sidebar minimum widths are unchanged.

- Collapsed: [before](before-compact-960.png), [after](centered-14-compact-960.png).
- Expanded: [before](before-expanded-960.png), [after](centered-14-expanded-960.png).

Each pair uses the same viewport, Dark theme, synthetic catalog, initial scroll, and paused track at 30 seconds. All captures were visually inspected. Native window focus and shadows differ between some captures.

Collapse/expand between 64px and 208px worked. The main panel and drag region measured 42px from the window top; the sidebar spacer measured 66px. The collapsed layout had no horizontal overflow. The open queue drawer was exercised during spacing refinement and follows the shared title-bar height.

`pnpm run format`, `pnpm run check`, and `pnpm audit` passed. The installed application, fullscreen transitions, VoiceOver, and a live Jellyfin server were not exercised.
