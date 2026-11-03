# Expandable song details

Song details now uses the same 320 px listening sidebar, compact heading, inset, rounded surface, and ordered panel transitions as Lyrics, Queue, and DJ. The size control expands it across the content area while preserving navigation and the floating player. Expanded details place the cover on the left and the song title, artist, metadata, and tags on the right. Below 480 px of available body width, these stack in a scrollable column.

The shared expansion state and panel geometry also serve Lyrics. Switching panels or reopening starts compact. Expansion preserves the mounted inspector and makes the covered library inert. Closing restores focus after removing the panel, including when its opener is in the covered library.

## Verification — 3 November 2026

Before and after captures use the actual development renderer with the local playback-progress fixture bridge and queue-editing playback seed, fictional catalog, first song paused at 0:30, light appearance, expanded navigation, and a 1440 × 900 viewport. The existing local song-removal fixture server at port 5207 served this pass; no account, audio provider, or removal operations were used. All screenshots below were visually inspected.

- [Before](before-1440.png) and [shared sidebar after](after-sidebar-1440.png).
- Expanded layouts at [1440 × 900](after-expanded-1440.png), [960 × 700](after-expanded-960.png), [800 × 700](after-expanded-800.png), and [640 × 480](after-expanded-640.png).
- [Dark appearance with a long title at 800 × 700](after-dark-long-title-800.png).

Focused browser checks passed for shared panel width, expansion/collapse, desktop cover/detail column positioning, narrow-window reflow, no horizontal overflow, player clearance, retained size-button focus, mounted inspector preservation, Escape/focus restoration to both player and library openers, reopening compact, Queue switching, Lyrics expansion, reduced motion, Enter/Space activation, and long text. No renderer page errors occurred. Measurements are in [report.json](report.json).

`pnpm run format` and `pnpm run check` passed, including formatting, lint, type checking, and production build. The local runner uses Node 24.4.1 and reports the repository's Node 26 engine warning. Native Electron, VoiceOver, and live Jellyfin were not exercised in this renderer verification.

The composition was previewed with the built-in image generation tool using the before screenshot as the edit target. The implementation deliberately retains the existing compact header, metadata density, and icons rather than the generated header typography.

## Full-screen consistency follow-up

Compared expanded Song details directly with expanded Lyrics at 1440 × 900 in light appearance and 800 × 700 in dark appearance, using the same fictional song paused at 0:30. Captures have a 1× scale and use the local Chrome renderer. This is a focused review of the panel/header and song-content regions, not a whole-app audit.

The panel frame and compact header already matched. The comparison found different body gutters, bottom/scroll spacing, song-title size/leading, and artist spacing. Both modes now use shared expanded-body rules and shared title/artist classes. The details body is also a named keyboard-focusable scroll region, matching Lyrics.

| Rule | Canonical source and expectation |
| --- | --- |
| EXP-01 | Shared panel/header components: equal dimensions, insets, surface, corners, header padding and separator in matched viewports. |
| EXP-02 | Existing expanded Lyrics body: 32 px top, `clamp(24px, 5vw, 80px)` horizontal gutters, 48 px bottom and scroll padding. Both modes now inherit this rule. |
| EXP-03 | Existing Lyrics song heading: equal font family, weight, color, 26 px size and 1.35 leading. Artist: equal muted 14 px text, 1.5 leading and 4 px top margin. |
| EXP-04 | Both expanded bodies: named focusable regions reachable with Tab; covered library is inert; Escape closes the view. |

Intentional task-specific differences: Song details retains its wider cover/metadata composition and responsive stacking. Lyrics retains its 760 px reading column, source label, timed-line controls, and scroll-edge fade. The fade is not applied over album artwork or metadata.

[Before measurements](consistency-before.json) record the differences; [after measurements](consistency-after.json) compare the same properties directly between peers. The executable check also injects a temporary 1 px left gutter, confirms EXP-02 fails, then removes the scratch style. It never changes application source or updates expected values automatically.

Before/after pairs were visually inspected for both modes:

- Lyrics: [desktop before](consistency-before-lyrics-1440-light.png), [desktop after](consistency-after-lyrics-1440-light.png), [narrow dark before](consistency-before-lyrics-800-dark.png), [narrow dark after](consistency-after-lyrics-800-dark.png).
- Details: [desktop before](consistency-before-details-1440-light.png), [desktop after](consistency-after-details-1440-light.png), [narrow dark before](consistency-before-details-800-dark.png), [narrow dark after](consistency-after-details-800-dark.png).

Rerun against the existing local fixture server with an available Playwright module (no new dependency is installed):

```sh
WAVE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright node docs/verification/song-details/verify-consistency.cjs after
```

The default fixture URL is port 5207; `WAVE_FIXTURE_URL` can select another renderer that restores a current fixture song. This check covers finite style/keyboard constraints, not overall aesthetics or assistive-technology certification. Native Electron, live Jellyfin, and VoiceOver remain unverified.

## Cover motion repair

The prior collapse switched the inspector from two columns to a vertical stack while its parent was still full width. At the first sampled collapse frame, the 433.7 px expanded cover became 1072 px before shrinking to its final 280 px sidebar width. [Before frame](motion-before-collapse-0.png) and [before measurements](motion-before.json) reproduce the transient enlargement with a local bundled image.

Song details size changes now use a same-document view transition for the panel, cover, header label/actions, and details. The layout commits at its destination size before the animation; its snapshots animate between the actual source and destination rectangles. The original cover stays visible throughout the move, without a second cover fading over it. Metadata fades out and back in around its layout change. The overlay is clipped above the player and outside navigation. The 220 ms duration/easing and final layout remain consistent with the existing panel. Reduced motion skips the resize transition.

At 1440 × 900, the sampled cover now moves from x316/y122/433.7 px square to x1124/y110/280 px square. Intermediate samples remain between these endpoint sizes and positions. Visually inspected the expanded start and 0/25/50/75/100 percent collapse frames: [start](motion-after-collapse-0.png), [quarter](motion-after-collapse-25.png), [middle](motion-after-collapse-50.png), [three quarters](motion-after-collapse-75.png), [end](motion-after-collapse-100.png). Measurements are in [motion-after.json](motion-after.json).

The focused [motion check](verify-motion.cjs) verifies both directions at 1440 × 900, 960 × 700, 800 × 700, and 640 × 480. It compares transition snapshot bounds with the actual element's measured endpoint bounds, checks intermediate sizes stay between endpoints, and checks the same artwork remains mounted. It also exercises reversal during motion, switching to Queue, Escape/focus restoration during motion, and reduced motion. Results are in [motion-behavior.json](motion-behavior.json). No page errors occurred. The full-screen Lyrics consistency check and `pnpm run check` also passed after the repair.

```sh
WAVE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright node docs/verification/song-details/verify-motion.cjs
```

Verification used the local Chrome renderer and a bundled image as fixture artwork. Native Electron, live library artwork loading, and VoiceOver were not exercised in this pass.
