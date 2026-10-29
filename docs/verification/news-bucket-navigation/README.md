# News Bucket header and category navigation

The subsequent [editorial refinement](../news-bucket-editorial/README.md) applies the requested frontend-skill direction. The screenshots and measurements below document the initial navigation pass.

Implemented the approved [section concept](concept.png) in the existing renderer. The page heading uses a compact 64px band with a 20px title and the existing room selector. Upcoming, Check news, Past news, Favorites, and Settings form a single horizontal navigation row, with an accent underline and Settings aligned right. At pane widths of 700px or less, the existing labeled category selector replaces the row.

The story list reclaims the former category sidebar's width. The workspace fills the available app surface using flex layout rather than a fixed viewport-height subtraction, so header wrapping and existing notices can consume their actual height. Styling is scoped to News Bucket; the global navigation and music player retain their measured geometry. Existing story eligibility, source checks, history distinctions, saved-audio preview, favorites, and Settings ownership are unchanged.

## Renderer evidence

Before captures were taken from the current working checkout before the UI edits. All before/after pairs use the same viewport, theme, synthetic room and stories. These are actual renderer captures, not generated images.

| Viewport and theme | Before | After |
| --- | --- | --- |
| 1440 × 900 Dark | [Before](before-1440-dark.png) | [After](after-1440-dark.png) |
| 1280 × 800 Light | [Before](before-1280-light.png) | [After](after-1280-light.png) |
| 1280 × 800 Coffee | [Before](before-1280-coffee.png) | [After](after-1280-coffee.png) |
| 1024 × 768 Dark | [Before](before-1024-dark.png) | [After](after-1024-dark.png) |
| 800 × 700 Dark | [Before](before-800-dark.png) | [After](after-800-dark.png) |
| 720 × 450 Light | [Before](before-720-light.png) | [After](after-720-light.png) |

Additional captures include [Settings](after-settings-1440-dark.png), [compact reader](after-reader-800-dark.png), and [200%-equivalent layout](after-200-percent-equivalent.png).

## Checks performed

- [Geometry comparison](after.json) against [the baseline](before.json): unchanged global sidebar, main surface and player rectangles at every viewport; header area reduced from 94px to 64px; navigation is one 47px row, or a 51px selector; no pane has horizontal overflow. Keyboard activation and Settings draft retention were checked while switching between desktop buttons and the narrow selector.
- [Existing flow checks](report.json) passed at all six viewport/theme combinations: category navigation, desktop and compact readers, Escape/Back focus, audio preview pause/resume/cleanup, favorites and source links, listening-history semantics, latest-check coverage, inline Settings, draft preservation, validation and recovery.
- [Existing review checks](review-report.json) passed: sampled text contrast at least 4.5:1 in Dark, Light and Coffee; reduced motion; resize intent; long titles and missing publication dates; preview failure/retry; empty states; compact category navigation and Settings at a 720 × 450 CSS viewport with DPR 2.
- `pnpm run format`, `pnpm run check`, and `git diff --check` passed. No new dependencies or unit tests.

These checks use the actual renderer with the existing disposable bridge and simulated audio. Native macOS window controls, VoiceOver, live provider requests and native audio devices were not exercised. The DPR-2 capture is layout evidence, not OS display-zoom verification.

## Reproduce

Start the existing fixture server from the repository root:

```sh
node docs/verification/playback-progress/server.mjs
```

Connect a disposable Chrome profile exposing CDP at port 9339. Set `WAVE_PLAYWRIGHT_MODULE` to an installed Playwright module if needed. Run:

```sh
node docs/verification/news-bucket-navigation/verify.cjs after
WAVE_VERIFY_OUTPUT_DIR="$PWD/docs/verification/news-bucket-navigation" node docs/verification/news-bucket-craft/verify.cjs
WAVE_VERIFY_OUTPUT_DIR="$PWD/docs/verification/news-bucket-navigation" node docs/verification/news-bucket-craft/review.cjs
```

The `before` mode captures a baseline and must be used before changing the interface; keep the supplied baseline when verifying this change.
