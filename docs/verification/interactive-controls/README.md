# Interactive controls — 2026-11-02

Reviewed hover feedback, padding and hit areas across the desktop renderer. Changes retain the existing spacing, theme and compact desktop control system.

## Repairs and continuing rules

- `LINK_TARGET`: shared `Button variant="link"` uses a 32px minimum height, 4px vertical and 8px horizontal padding, and a 4px icon gap. Longer labels wrap. The news bucket's existing 34px room-link profile remains intentional.
- `LINK_HOVER`: link actions stay transparent, change accent color and underline on hover/focus. Pressing a link does not move it or add a filled-button background. Existing action handlers, refs, disabled and busy attributes remain intact.
- `DISABLED_STATES`: shared hover/press feedback excludes native disabled and aria-disabled buttons; disabled links remain muted and transparent. Application handlers still own aria-disabled activation guards.
- `KEYBOARD_FOCUS`: link buttons retain the shared 2px focus outline and gain underline feedback. Existing controls retain their keyboard semantics.
- `VARIANT_HOVER`: primary and destructive buttons retain their semantic colors and have distinct hover/press colors. Destructive buttons previously had no distinct hover color.
- Disclosures receive a compact target, horizontal inset and background feedback. Preference sections and previews retain their roomier vertical padding.
- Enabled theme, library and avatar choices gain hover feedback without replacing selected/disabled styling. Text fields/selects/textareas gain a hover border. Player range hit areas increase from 20px to 24px, with a hover/focus thumb ring.

The existing 34px standard controls, 32px icon/player controls, 24px queue actions, padded list/menu rows and artwork overlays remain purposeful variants. Inline links and dense controls need context-specific review; this is not a claim of whole-app WCAG compliance. Sources: [existing control tokens](../../../src/renderer/styles.css), [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [hover/focus guidance](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html), consulted 2026-11-02.

## Evidence and coverage

Actual renderer screenshots use the existing synthetic-library bridge, 1280×720 CSS-pixel viewport, DPR 2, and 1280×720 screenshot pixels (capture scale 1). Matched before/after captures cover songs/navigation/player, General settings, expanded Provider keys, hovered provider link, DJ creation dialog, news empty state and news settings. Additional after captures cover Dark and Coffee settings; the Light theme was restored. Captures contain no account credentials or live provider data.

Three independent review agents covered library/navigation/player, settings/forms/dialogs, and the news workspace. They inspected source and screenshots before/after. The coordinator restored readiness links' original block grouping after catching a migration regression. Source links were moved to the shared variant after review caught a remaining filled press state.

The component-state fixture renders the real Button and production styles. Pointer clicks on inert actions established actual hover states. Keyboard Tab established link focus. Recorded DOM measurements in `button-states.json` cover targets, hover colors, disabled states, wrapping, focus and layout stability. `broken-link` deliberately has a 12px target; the target predicate rejects it. `report.json` records nine passing checks, including that rejection. The fixture is a component check, separate from the actual application screenshots.

Runtime coverage is finite. Source review also covered sources, DJ deletion, menus, collections, queue, playback, preference panels and relevant disabled/busy styles; populated provider/news states were not all exercised. No live Jellyfin/provider operations, native Electron window/VoiceOver verification, or narrow viewport result is claimed. The browser viewport override did not take effect (DOM remained 1280×720), so narrow screenshots were discarded. The recorded default/hover/focus checks do not dynamically capture a held pointer-down state; press styles were checked in source.

## Recheck

Start from the repository root:

```sh
node docs/verification/playback-progress/server.mjs
```

Open `http://127.0.0.1:5199/` for the real renderer, or `/@fs/ABSOLUTE_REPO_PATH/docs/verification/interactive-controls/controls.html` on that origin for the inert component fixture. Recapture affected screens and fresh DOM measurements whenever a shared token/component changes. Do not treat archived screenshots as current evidence.

Recheck the archived measurements:

```sh
node docs/verification/interactive-controls/check.mjs
```

This command validates recorded evidence; it does not drive a browser or create fresh measurements. Formatting, type-aware lint, TypeScript and the production build are verified with `pnpm run format` followed by `pnpm run check`. These passed; the available Node 24 runtime emitted an engine warning because the project requests Node 26.

## Source-link follow-up

The user reported a filled hover behind a saved story reference. Shared filled-button hover/press selectors now explicitly exclude `.link`; older saved-audio feed and article buttons also use `Button variant="link"`. In the actual dark renderer, the matching story reference stays transparent and changes from `rgb(237, 113, 130)` to `rgb(242, 139, 153)` on pointer hover, with no translation. See `source-link-idle.png`, `source-link-hover.png`, and `source-link-hover.json`. The supplied screenshot was used as reported before evidence; the committed verification screenshots use synthetic fixture data. Fresh source/evidence hashes are in `source-link-evidence.json`; the earlier audit manifest remains historical.

Reproduce with `node docs/verification/interactive-controls/source-links-server.mjs`, then open News bucket → Past news → the saved story → Source details and hover the source. All data is synthetic; source activation uses an inert fixture bridge.

## News-settings alignment follow-up

Provider keys already used the transparent link variant. The remaining centered form offset and padded link-label inset were corrected: the form keeps its 760px reading width but aligns with the News settings introduction, and compact links/disclosure retain their hit padding while their content starts on that edge. The provider-cost disclosure now uses a transparent background and accent-color change on hover/focus.

The enabled-state fixture is `http://127.0.0.1:5199/?settings-links` from `source-links-server.mjs`. Measured heading/form positions changed from x=238/352 to x=238/238 at 1280×720 in Dark. The usage disclosure hover changed from rgb(48,52,60) fill to transparent, with accent color feedback. Keyboard Shift+Tab retained the provider link's 2px focus outline. Four checks passed in `news-settings-offset-results.json`; before/after captures are prefixed `news-settings-`. `news-settings-after-hover-top.png` shows the corrected section in context with the disclosure hovered. The fixture reports configured providers and enables preparation only in synthetic local state; it makes no provider calls. Formatting, lint, TypeScript and production build passed.
