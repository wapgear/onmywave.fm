# DJ song announcements

Settings → General → DJ playback has an “Occasionally announce the next song” switch, disabled by default, including for existing saved settings. When enabled, an introduction is eligible only at a news break after at least 12 naturally completed songs since the last introduction started playing. Skips, failed preparations and cancelled breaks do not advance or reset that cadence. The song count belongs to the current listening session; the switch persists across restarts.

The pipeline is: select a story → write and record fact-only news → claim a saved take → check announcement eligibility → resolve the actual next queue occurrence → optionally generate a short introduction → play news → optional introduction → music. Playback owns the only closing transition. The news writer prohibits signoffs, music-return lines and song teasers even when host preferences request them. New scripts and recordings carry a `story-only` ending marker. Older recordings without that marker remain playable as news-only, so an existing closing line cannot be followed by another generated ender. The policy version changes preparation hashes so interrupted older writing checkpoints cannot silently resume under the new policy.

For an eligible break, main prepares “And now, enjoy [title] by [artist]” using Jellyfin metadata and the recording's saved ElevenLabs voice and delivery tags. The template is English. Disabled, not-yet-due and legacy-ending breaks make no introduction request. Disabling the switch cancels an in-flight introduction request or removes a queued introduction while retaining the news; disabling it during the introduction ends that clip and returns through the normal music transition.

Both clips are preloaded, and their combined duration determines the over-music start time and fit checks. The bulletin plays first, the closing clip follows, and the reserved occurrence starts after the configured tail. Shuffle reservations retain the chosen plan so a repeat boundary cannot redraw a different song. Repeat-all resolves library expansion before choosing the song. Repeat-one introduces the repeated song. Queue exhaustion and unavailable title metadata omit the link; missing artist metadata produces a title-only link.

The player loads the saved bulletin and checks its timing before requesting speech for the introduction. Missing audio and an already-late break therefore incur no introduction request. Combined timing is checked again after the introduction loads and after the news claim resolves. Seeking during the introduction retains only that clip's remaining duration; completed news is neither replayed nor counted again in the timing budget.

Queue/order/repeat changes invalidate a break with a song-specific introduction, including paused speech. News-only breaks retain their usual queue behavior. Playback cancellation releases both clips and any pending speech request. Unheard news keeps the existing claim-release rules; history is recorded once when the bulletin starts. Saved-audio auditions and the bundled transition sample keep their original recordings.

Eligible announcements add an ElevenLabs speech request when the introduction is absent from the session cache. The cache holds at most 32 recent attempts and clips, including uncertain failures, to avoid immediate automatic retries of paid requests. Clips stay in memory, and connection changes/quit revoke them.

## Verification

Run from the repository root:

```sh
node docs/verification/song-handoff/verify-main.cjs
WAVE_SCENARIO=song-handoff node_modules/.bin/electron docs/verification/critical-playback/server.mjs
node_modules/.bin/electron docs/verification/critical-playback/server.mjs
node docs/verification/prepared-news-delivery/verify.cjs
node docs/verification/critical-playback/verify-storage.cjs
node docs/verification/news-editorial-pipeline/verify.cjs
WAVE_SCENARIO=song-handoff-settings WAVE_CAPTURE_STAGE=after node_modules/.bin/electron docs/verification/critical-playback/server.mjs
pnpm run format
pnpm run check
pnpm audit
```

The main-process integration check executes the actual handoff module and NewsService with a fixture saved take, Jellyfin metadata and HTTP responses. It verifies exact spoken text, voice/tags, unchanged news text, clip bytes, cache reuse, missing metadata, input validation, cancellation, uncertain-dispatch reuse, generation gating and revocation.

The native Electron fixture uses the actual React player and preload-shaped fixture API. Its 23 scenarios cover automatic DJ scheduling, disabled and legacy-ending playback, rare cadence across consecutive news breaks, disabling an introduction during generation, while queued or on air, sequential and shuffled selection, repeat-one, repeat-all library expansion, a shuffle cycle boundary, queue exhaustion, edits during news and during the introduction, introduction pause/resume and seek, the combined timing budget, overlong speech, late placement and unavailable news audio before generation, provider failure and cancellation during preparation. Each announcement scenario advances actual natural-end events to establish eligibility. The existing playback regression fixture and prepared-news delivery integration check also pass. Storage integration verifies default-off and subsequent on/off preferences across module reloads. Editorial integration checks the writing policy and ending marker through script and audio publication.

Settings screenshots use the same fixture at 1440×1000 and 960×800 before and after. The settings fixture also toggles, saves and confirms both values through the actual form and save controller.

Quality checks include formatting, type-aware lint, TypeScript and the production build. Dependency audit reports no known vulnerabilities. Verification uses fixture speech and metadata, with no live provider calls or personal library data. It establishes sequencing and cancellation behavior; real voice continuity, pronunciation and the perceived pause between the two clips still need a listening check with generated speech.
