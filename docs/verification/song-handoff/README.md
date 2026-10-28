# DJ song announcements

Both timing controls are the first section in Settings → General, under “News & song announcements.” “Play news every” sets the saved-news playback interval; “Announce after” sets the independent track-introduction interval. Save both with “Save announcement settings.” News playback is enabled and its profile selected in the player's DJ sidebar. Its “DJ settings” shortcut opens General. These controls must be present in the app build being run; rebuilding source does not replace an installed release.

Settings → General → News & song announcements has an “Announce the next song” switch, disabled by default, and a configurable “Announce after” interval from 1 to 100 completed songs, defaulting to 6 for new and existing settings. When enabled, the rule is **N completed songs since the last announcement OR always after fact-only news**. The interval can produce an introduction without a news bulletin. Every actual announcement resets the shared song count, including a post-news introduction before N is reached. Skips and failed/cancelled preparations do not count as completed songs or reset the counter. The counter belongs to the current listening session; the switch and interval persist across restarts.

The pipeline is: select a story → write and record fact-only news → claim a saved take → resolve the actual next queue occurrence → generate/reuse one introduction → play news → introduction → music. Playback owns the only closing transition. The news writer prohibits signoffs, music-return lines and song teasers even when host preferences request them. New scripts and recordings carry a `story-only` ending marker. Older recordings without that marker remain playable as news-only, so an existing closing line cannot be followed by another generated ender. The policy version changes preparation hashes so interrupted older writing checkpoints cannot silently resume under the new policy.

For an eligible break, main prepares “And now, enjoy [title] by [artist]” using Jellyfin metadata and the recording's saved ElevenLabs voice and delivery tags. The template is English. Disabled and legacy-ending news breaks make no introduction request. Eligible fact-only news always gets its introduction, regardless of the interval. Disabling the switch cancels an in-flight introduction request or removes a queued introduction while retaining the news; disabling it during the introduction ends that clip and returns through the normal music transition.

For news, both clips are preloaded, and their combined duration determines the over-music start time and fit checks. The bulletin plays first, the closing clip follows, and the reserved occurrence starts after the configured tail. Shuffle reservations retain the chosen plan so a repeat boundary cannot redraw a different song. Repeat-all resolves library expansion before choosing the song. Repeat-one introduces the repeated song. Queue exhaustion and unavailable title metadata omit the link; missing artist metadata produces a title-only link.

For the independent interval trigger, the controller prepares an introduction during the Nth song and schedules it between songs. Playout checks that N songs actually completed, so an endpoint seek cannot substitute for a natural completion. When a news check is due, its pool result takes priority: an available fact-only bulletin gets one introduction; an empty pool falls back to the standalone interval announcement. The standalone voice is the selected listening room's saved DJ; a post-news clip uses the recording's saved voice. Queue/shuffle/repeat reservation, pause, seek and cancellation use the same speech player for both paths.

The player loads the saved bulletin and checks its timing before requesting speech for the introduction. Missing audio and an already-late break therefore incur no introduction request. Combined timing is checked again after the introduction loads and after the news claim resolves. Seeking during the introduction retains only that clip's remaining duration; completed news is neither replayed nor counted again in the timing budget.

Queue/order/repeat changes invalidate a break with a song-specific introduction, including paused speech. News-only breaks retain their usual queue behavior. Playback cancellation releases both clips and any pending speech request. Unheard news keeps the existing claim-release rules; history is recorded once when the bulletin starts. Saved-audio auditions and the bundled transition sample keep their original recordings.

Eligible announcements add an ElevenLabs speech request when the introduction is absent from the session cache. The cache holds at most 32 recent attempts and clips, including uncertain failures, to avoid immediate automatic retries of paid requests. Clips stay in memory, and connection changes/quit revoke them.

## Verification

Run from the repository root:

```sh
node --conditions=import docs/verification/song-handoff/verify-main.cjs
WAVE_SCENARIO=song-handoff node_modules/.bin/electron docs/verification/critical-playback/server.mjs
node_modules/.bin/electron docs/verification/critical-playback/server.mjs
node docs/verification/prepared-news-delivery/verify.cjs
node docs/verification/critical-playback/verify-storage.cjs
node --conditions=import docs/verification/news-editorial-pipeline/verify.cjs
WAVE_SCENARIO=song-handoff-settings WAVE_CAPTURE_STAGE=after-rule node_modules/.bin/electron docs/verification/critical-playback/server.mjs
pnpm run format
pnpm run check
pnpm audit
```

The main-process integration check executes the actual handoff module and NewsService with a fixture saved take, Jellyfin metadata and HTTP responses. It verifies exact spoken text, voice/tags, unchanged news text, clip bytes, cache reuse, missing metadata, input validation, cancellation, uncertain-dispatch reuse, generation gating and revocation.

The native Electron fixture uses the actual React player and preload-shaped fixture API. Its 32 scenarios cover automatic DJ scheduling, disabled and legacy-ending playback, unconditional introductions after consecutive fact-only bulletins, standalone introductions at the default six-song or configured interval, coinciding news/interval triggers with one introduction, empty news-pool fallback, disabled interval playback, endpoint seeking without a natural completion, disabling standalone speech during generation or playout, skips, disabling an introduction during generation, while queued or on air, sequential and shuffled selection, repeat-one, repeat-all library expansion, a shuffle cycle boundary, queue exhaustion, edits during news and during the introduction, introduction pause/resume and seek, the combined timing budget, overlong speech, late placement and unavailable news audio before generation, provider failure and cancellation during preparation. Interval scenarios advance actual natural-end events and verify speech begins only after N songs finish; news scenarios verify the independent override before N. The existing playback regression fixture and prepared-news delivery integration check also pass. Storage integration verifies default-off, the default interval of six, and customized intervals with on/off preferences across module reloads. Editorial integration checks the writing policy and ending marker through script and audio publication, including linked-source enrichment and restart. Policy version 4 combines the source-evidence policy from main with the mandatory story-only ending; older policy 2/3 checkpoints cannot resume into paid speech under the changed contract. Main-process speech verification uses the TanStack AI adapter introduced on main, including cancellation and uncertain-attempt reuse.

The before-rule/after-rule, before-discovery/after-discovery and after-main-discovery settings screenshots use the same fixture at 1440×1000 and 960×800; the standalone introduction sidebar is captured at 1440×1000. It identifies the clip as a track introduction and omits news-source placeholders. The settings fixture verifies the default of six, then enables announcements, saves a custom song interval of eight and news interval of four, and confirms both on/off values through the actual form and save controller. The discovery check also verifies the announcement controls are the first General section.

After merging main at `68f2f11`, the announcement scenarios and General settings fixture also pass with Electron 45, React 19.3.1 and Vite 8.3.5. Room-profile integration verifies that editing a room or disabling its news preparation preserves enabled song announcements and a custom interval of eight.

Quality checks include formatting, type-aware lint, TypeScript and the production build. Dependency audit reports no known vulnerabilities. Verification uses fixture speech and metadata, with no live provider calls or personal library data. It establishes sequencing and cancellation behavior; real voice continuity, pronunciation and the perceived pause between the two clips still need a listening check with generated speech.
