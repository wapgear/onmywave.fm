# Modal header and contained scrolling

Follow-up to the spacing review on 21 October 2026. This replaces the sticky, whole-dialog scrolling arrangement in the earlier interface-system captures.

The shared Dialog now has a fixed header and a separate `.modal-content` scroll region. Close sits 8px from the top/right edge. Header padding is 20px, its bottom gap is 16px, and title typography is 18px with 1.35 line height. The dialog clips its rounded outer frame; the thin content scrollbar is inset by 8px and starts below the title. Header measurement and ResizeObserver code are no longer needed.

| Viewport | Before | After |
| --- | --- | --- |
| 960×640 | [Before](before-960.png) | [After](after-960.png) |
| 1280×800 | [Before](before-1280.png) | [After](after-1280.png) |

All pairs use identical long-title fixture content, initial focus, starting scroll position and bundled fonts. Both pairs were visually inspected.

Measured checks in Chromium:

- Long-title header height is about 109px, down from 146px. Full title remains visible.
- At 960×640, scrolling the content by 184.5px leaves the header top at 41px and dialog scrollTop at zero.
- The scroll region begins exactly at the header bottom, around 149.9px. Its right and bottom edges stay 9px inside the dialog border. No horizontal content overflow.
- Tab reaches the footer and keeps the focused Save button fully visible within the content region. Enter submits and restores focus to the opener.
- Pending state still blocks Escape dismissal; unlocked Escape and the short InfoHelp dialog remain usable. The short help modal does not gain an unnecessary scrollbar.

The fixture uses actual shared Dialog, InfoHelp, Button and DialogActions with synthetic form data. It does not verify provider writes or a full connected Electron session. Formatting, lint, TypeScript and production build passed.
