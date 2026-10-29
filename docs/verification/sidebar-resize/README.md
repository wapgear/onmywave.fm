# Resizable navigation sidebar

The sidebar resizes from 64–208px and switches to icons below 160px. Its icon-only toggle sits beside onmywave.fm when expanded and above navigation when compact. It restores the last expanded width; both widths survive reload. The connection status and its dot are removed.

Drag the right edge to resize. Its neutral 1px line appears on pointer entry or during dragging and clears on release, cancellation, or pointer exit. Focus alone leaves no outline or highlight. Keyboard resizing supports Left/Right (8px), Shift+Left/Right (24px), Home (64px), and End (208px). Compact navigation and the toggle have hover/focus tooltips with Escape dismissal.

## Matched screenshots

All captures use the production renderer, the synthetic catalog fixture, Light theme, initial scroll, and track 1 paused at 30 seconds. Run `node docs/verification/queue-editing/server.mjs` and open `http://127.0.0.1:5205/?case=sidebar-resize`. The fixture makes no provider requests.

| Viewport | Before | Expanded | Compact |
| --- | --- | --- | --- |
| 1280×800 | [Before](before-1280.png) | [After](after-1280.png) | [Compact](compact-1280.png) |
| 960×700 | [Before](before-960.png) | [After](after-960.png) | [Compact](compact-960.png) |

## Verification

- Dragging reaches both bounds, releases pointer capture, and leaves no persistent indicator. A click released on the edge also clears the line.
- All navigation labels fit at 160px and disappear below it. Collapse, reload, and expand preserve a chosen expanded width.
- Compact Albums, Playlists, Settings, and All songs navigation show the correct headings and active items.
- Keyboard access, tooltip rendering and Escape dismissal, and the existing queue layout were exercised with the synthetic bridge.
- Formatting, type-aware lint, TypeScript, production builds, and dependency audit passed for the submitted tree; dependency audit reported no known vulnerabilities.

Native macOS window controls, VoiceOver, and a connected Jellyfin server were not exercised.
