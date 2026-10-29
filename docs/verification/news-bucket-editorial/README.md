# News Bucket editorial refinement

Applied the requested frontend-skill direction to the existing section: a quiet radio newsroom, with flat surfaces, headline-led reading, and one coral accent for selection and playback. Categories orient; the list indexes stories; the reader holds the spoken text; Listen is the primary action.

## Design changes

- A 48px page header replaces the previous 64px header and explanatory subtitle. The existing room selector stays in place.
- Categories use text and a small selected marker instead of repeated icons and an accent underline. Settings retains its useful gear icon. The row occupies 43px; narrow panes retain the existing category selector.
- Story rows are flat and separated by thin rules. Headlines come before publication metadata. Selection uses a coral headline and a fine leading mark, without a filled rounded card.
- The collection title and short readiness summary share a line. The reader has a larger headline, readable script measure, sentence-case labels, and quieter provenance disclosures.
- Listen uses a round play control with a plain label and host name. Reader entry, category/selection feedback, and playback control changes use short CSS motion with reduced-motion overrides.

The existing app palette and two typefaces remain. No article artwork, new features, provider operations, or news eligibility rules were added. Global navigation and the persistent player were outside this section's styling scope.

## Before and after

These are actual renderer captures using synthetic room/story data and the same viewports. The first pair shows the preceding implementation against the final design. The `refinement-before-*` files capture the flatter working pass immediately before the final list-heading and label adjustments.

| View | Before | Final |
| --- | --- | --- |
| 1440 × 900 Dark | [Before](before-1440-dark.png) | [Final](after-1440-dark.png) |
| 1280 × 800 Light | [Before](before-1280-light.png) | [Final](after-1280-light.png) |
| 1280 × 800 Coffee | [Before](before-1280-coffee.png) | [Final](after-1280-coffee.png) |
| 800 × 700 Dark | [Before](before-800-dark.png) | [Final](after-800-dark.png) |

Additional captures: [compact reader](after-reader-800-dark.png), [Settings](after-settings-1440-dark.png), and [720 × 450 at DPR 2](after-200-percent-equivalent.png).

## Verification

- [Flow report](report.json): all six viewport/theme combinations passed category navigation, reader focus and Back/Escape, audio preview, favorites/source links, history distinctions, latest source checks, Settings drafts, save validation and recovery, and horizontal overflow checks.
- [Geometry report](after.json): the main surface, global sidebar and persistent player retain their baseline rectangles. Desktop header height is 48px and category navigation is 43px. Keyboard activation and draft retention across desktop/narrow navigation passed.
- [Theme and accessibility review](review-report.json): sampled reading/action text met 4.5:1 contrast in Dark, Light and Coffee. Reduced motion, long text, missing dates, audio failures/retry, empty states and the compact layout passed.
- [Motion check](motion-report.json): actual reader/control animation events, play-to-pause state change and hover scaling were observed. With reduced motion enabled, no entrance events fired and control transitions were disabled.
- `pnpm run format`, `pnpm run check`, and `git diff --check` passed. No dependencies or unit tests were added.

The fixture now waits for fonts and two rendering frames before returning, so checks start after initial responsive layout. Concurrent CDP runs showed inconsistent emulated motion preferences; run browser checks sequentially. These renderer checks use a disposable bridge and simulated audio; native macOS controls, VoiceOver, live providers and native audio hardware were not tested.

## Reproduce

Start `node docs/verification/playback-progress/server.mjs` from the repository root, with disposable Chrome exposing CDP at port 9339. Set `WAVE_PLAYWRIGHT_MODULE` when Playwright is not available through normal module resolution. Run these commands sequentially:

```sh
WAVE_VERIFY_OUTPUT_DIR="$PWD/docs/verification/news-bucket-editorial" node docs/verification/news-bucket-navigation/verify.cjs after
WAVE_VERIFY_OUTPUT_DIR="$PWD/docs/verification/news-bucket-editorial" node docs/verification/news-bucket-craft/verify.cjs
WAVE_VERIFY_OUTPUT_DIR="$PWD/docs/verification/news-bucket-editorial" node docs/verification/news-bucket-craft/review.cjs
```
