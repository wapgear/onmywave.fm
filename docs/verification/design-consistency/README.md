# Design consistency audit and 0.7.3 integration

The initial audit reviewed 21 logical UI blocks in the actual React renderer, using synthetic library, account and News data. Each block received its own independent review agent. The [condensed review record](review-summary.json) preserves classifications, findings and coordinator decisions. The existing components, typography, spacing, colors and platform behavior remain the reference system. [The imagegen proposal](toolbar-imagegen-proposal.png) informed the sort-control grouping before implementation; it is a concept, not observed UI evidence.

## Coverage and decisions

Reviewed blocks: sidebar navigation, library toolbar, song catalog, music player, queue, albums, playlists, General settings, News & voice, song announcements, DJ transitions, Sources, DJs, provider keys, News workspace, story inspector, room settings, Lyrics, song details, DJ sidebar and Connection. Representative populated, empty, disabled, expanded, narrow and keyboard-focus states were captured. Source review also covered loading, failure, pending and permission branches; those branches were not all exercised at runtime.

Eight bounded repairs followed that review:

1. Sort criterion and direction wrap together.
2. Sidebar resize keyboard focus has a small neutral grip.
3. Queue grip and movement targets are 24×24 CSS pixels with clearance before Remove.
4. Timing edits stop old preview audio while retaining the open disclosure.
5. Both setup flows explain the 20-source cap and recovery; summaries use singular source counts.
6. RSS input uses the existing source normalizer for associated guidance and browser validation.
7. Server input describes and validates the service's HTTP(S) address constraints before login.
8. Expanded Lyrics remains a named, nonmodal complementary pane while covered library content is inert.

Existing hover/focus queue actions, conventional macOS Command selection and the song inspector's full-height variant were retained after review. A permanent extra Remove icon or additional persistent selection instruction was not justified by a demonstrated failure. These are explicit design decisions.

The cumulative work also adds shared preference/navigation/collection components, a dedicated Playback destination, independent form drafts/saves and visible announcement wording choices. Historical synthetic verification for those changes is retained in [Preferences Design](../preferences-design/README.md) and [Song Handoff](../song-handoff/README.md).

## Current-main integration

The PR integrates the cumulative changes onto main `0012ab2` (0.7.2), preserving its centered 760px settings column, shared Select, macOS chrome and updater configuration. The populated News workspace uses available width. Its story inspector switches to one column in a bucket at most 663px wide; categories remain visible and wrap instead of becoming a different navigation control. Story context stays in the reader body.

These screenshot pairs were captured before applying the cumulative patch to that base and after integration, using identical synthetic content, paused transport state and viewport. The settings change intentionally moves playback content from General to Playback; the second after capture shows its new destination.

| Viewport and state | Before 0.7.2 | After integration |
| --- | --- | --- |
| 1280×800, All songs and queue | [Before](pr-before-queue-1280.png) | [After](pr-after-queue-1280.png) |
| 1280×800, Settings General | [Before](pr-before-settings-1280.png) | [General](pr-after-settings-1280.png), [Playback](pr-after-playback-1280.png) |
| 1280×800, saved story selected | [Before](pr-before-news-1280.png) | [After](pr-after-news-1280.png) |
| 960×700, same saved story | [Before](pr-before-news-960.png) | [After](pr-after-news-960.png) |

Supplemental captures: [neutral keyboard grip, 960×700](pr-after-focus-960.png), [compact story reader, 800×800](pr-after-news-800.png), [wrapped categories, 720×900](pr-after-news-720.png). All listed screenshots were visually inspected. Scrollable content can extend beyond a capture; this does not claim all rows or controls are simultaneously visible.

Final integration interactions verified separate News/announcement saves, invalid custom-line recovery, draft persistence across navigation, story dismissal returning focus to the selected story, narrow reader navigation, category wrapping without horizontal page overflow, and keyboard access to the resize grip. The queue targets, sort alignment, 56px song row rhythm and player frame were measured from the live DOM. These checks used the synthetic bridge, without live providers or credentials.

Before integration, the native follow-up also received user confirmation for VoiceOver Volume/Lyrics announcements, clear generated sample speech, a physical Play/Pause key pausing the audit app, and headphone/speaker switching. Those are bounded historical observations, not a claim that every state of the final PR build was retested natively. Private library captures, server metadata repairs, credentials and generated paid audio are excluded from this public evidence.

## Repeatable checks

From the repository root:

```sh
PORT=5227 node docs/verification/design-consistency/server.mjs
```

Open `http://127.0.0.1:5227/?dj&case=review` with UI tooling. Add `&news-library` for populated News, `&source-limit` for the cap, `&disconnected` for Connection, `&no-libraries`, `&catalog-error`, `&no-results`, or `&audio-probe` as needed. Audio probe is an instrumented silent context for lifecycle checks, not a listening test.

Capture fresh affected states and DOM measurements before registering new evidence. Do not silently replace measured values or accept a new baseline. The checked-in [rules](rules.json) pin relevant policy/source bytes; [evidence](pr-evidence.json) pins screenshots/crops and records measurement provenance. The portable checker requires Python 3 and its adjacent classifier:

```sh
python3 docs/verification/design-consistency/check-rules.py \
  docs/verification/design-consistency/rules.json \
  docs/verification/design-consistency/pr-evidence.json \
  --out /tmp/onmywave-design-rules-new.json
pnpm run check
node scripts/verify-behavior.mjs services
node --conditions=import docs/verification/song-handoff/verify-main.cjs
```

Use a fresh output path. [The finite report](pr-rule-results.json) passes six registered obligations. A deliberately reduced queue target in a disposable evidence copy was rejected; this checks the checker without altering the recorded observations. A hash establishes byte identity, not measurement truth. Classification, keyboard behavior, usability and future states still need human or agent review; this is not a Lean proof or a general accessibility certification.

Formatting, type-aware lint, TypeScript, production build, service behavior, fixture speech integration and storage reload checks passed on this integration. The service harness intentionally logs assertion failures from injected mutants while returning success only when the mutations are detected.

`pnpm audit` currently reports four moderate findings for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) in the pre-existing electron-builder packaging chain. A global minimatch 11 override changes the legacy API used by packaging dependencies and was not applied. No advisory suppression or check bypass was introduced. Upstream correction or a compatible packaging-chain update is required before merge. No release was published.
