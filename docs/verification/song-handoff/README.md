# DJ song announcements

Settings → Playback contains compact, initially collapsed News & voice, Song announcements and DJ transitions subsections. “Play news after” in News & voice sets the saved-news playback range; “Announce after” in Song announcements sets the independent track-introduction range. Both use a shared two-thumb slider limited to 1–10 completed songs. Save news and voice with “Save news & voice settings,” and introductions with “Save announcement settings.” Each form validates and saves its own fields. News playback is enabled and its profile selected in the player's DJ sidebar. Its “DJ settings” shortcut opens Playback and focuses the News & voice summary. These controls must be present in the app build being run; rebuilding source does not replace an installed release.

Settings → Playback → Song announcements has an “Announce the next song” switch, disabled by default, and an inclusive “Announce after” range from 1 to 10 completed songs. New setups default to 2–6; existing single-number settings migrate to equal limits. Previously valid values above 10 clamp to 10 while other preferences remain intact. The lower bound retains the stored `announceEverySongs` field; `announceEverySongsMax` stores the upper bound. Equal limits give a fixed interval. Main validates the pair before saving; older single-number API patches still set both limits.

When enabled, the rule is **the chosen number of completed songs since the last announcement OR always after fact-only news**. A target is drawn once per cycle, then redrawn when the introduction actually starts. Range edits also draw a fresh target while preserving the completed count; connection changes start a new session. Ordinary renders, pause, skips, failed/cancelled preparations and unrelated preference edits do not redraw the target. A standalone introduction is prepared during its target song but cannot play until that song naturally completes. Post-news introductions reset the same counter. The counter and current target belong to the listening session; the saved range persists across restarts.

News has its own inclusive range (`everySongs` / `everySongsMax`), defaulting to 3–3. A target is drawn when its schedule starts or changes and again after a heard bulletin finishes. Unrelated preference edits retain the pending target. Empty-pool retries keep the existing target and retry rules. Equal limits preserve fixed scheduling; older single-number API patches set both limits. These controls change playback cadence, not news preparation frequency.

The pipeline is: select a story → write and record fact-only news → claim a saved take → resolve the actual next queue occurrence → generate/reuse one introduction → play news → introduction → music. Playback owns the only closing transition. The news writer prohibits signoffs, music-return lines and song teasers even when host preferences request them. New scripts and recordings carry a `story-only` ending marker. Older recordings without that marker remain playable as news-only, so an existing closing line cannot be followed by another generated ender. The policy version changes preparation hashes so interrupted older writing checkpoints cannot silently resume under the new policy.

For an eligible break, main generates fresh spoken continuity using the outgoing and actual upcoming Jellyfin tracks, the DJ’s language/personality/instructions/exclusions, room mood, and the last five completed links. Warm & laid-back, Upbeat & playful, Short & simple, and A little of everything shape generated tone rather than selecting preset scripts. The writer automatically varies brief identifications, mood bridges, listening reflections and song stories, avoiding the immediately preceding approach. There is no adjustable probability, fixed sentence sequence or required catchphrase. Minimal and post-news links stay brief. My own lines remains an explicit template option and bypasses text generation. The removed chance preference is ignored when loading old settings and rejected in new API patches.

My own lines accepts up to 12 distinct lines of 200 characters each, within 2,400 characters total. Each line must contain exactly one `{track}`, which becomes the song title and, when available, `by [artist]`. Blank and duplicate lines are ignored. Other placeholders, markup and voice tags are rejected. Custom text may be written in the listener's own language; the built-in phrases and the `by` connector are English. Three text examples update immediately without requesting speech. Custom lines remain saved when switching presets, and style/wording settings persist across restarts. Existing valid playback settings gain the mixed style without changing their schedule, volume or enabled state.

Disabled and legacy-ending news breaks make no introduction request. Eligible fact-only news always gets its introduction, regardless of the interval. Disabling the switch cancels an in-flight introduction request or removes a queued introduction while retaining the news; disabling it during the introduction ends that clip and returns through the normal music transition.

For news, both clips are preloaded, and their combined duration determines the over-music start time and fit checks. The bulletin plays first, the closing clip follows, and the reserved occurrence starts after the configured tail. Shuffle reservations retain the chosen plan so a repeat boundary cannot redraw a different song. Repeat-all resolves library expansion before choosing the song. Repeat-one introduces the repeated song. Queue exhaustion and unavailable title metadata omit the link; missing artist metadata produces a title-only link.

For the independent interval trigger, the controller prepares an introduction during the Nth song and schedules it between songs. Playout checks that N songs actually completed, so an endpoint seek cannot substitute for a natural completion. When a news check is due, its pool result takes priority: an available fact-only bulletin gets one introduction; an empty pool falls back to the standalone interval announcement. The standalone voice is the selected listening room's saved DJ; a post-news clip uses the recording's saved voice. Queue/shuffle/repeat reservation, pause, seek and cancellation use the same speech player for both paths.

The player loads the saved bulletin and checks its timing before requesting speech for the introduction. Missing audio and an already-late break therefore incur no introduction request. Combined timing is checked again after the introduction loads and after the news claim resolves. Seeking during the introduction retains only that clip's remaining duration; completed news is neither replayed nor counted again in the timing budget.

Queue/order/repeat changes invalidate a break with a song-specific introduction, including paused speech. News-only breaks retain their usual queue behavior. Playback cancellation releases both clips and any pending speech request. Unheard news keeps the existing claim-release rules; history is recorded once when the bulletin starts. Saved-audio auditions and the bundled transition sample keep their original recordings.

New preset links use one writing request to the connected GPT-6 model and one ElevenLabs speech request. The same writer can draw on its own music knowledge for an occasional song fact or writing/recording story; song links make no Wikipedia or other external article lookup. The prompt requires matching the exact song and artist, avoiding confusion between recordings, skipping uncertain recollections, and never inventing anecdotes, dates, quotes or sources to fill a break. A library release year must not be presented as a writing/recording date. Model knowledge is not presented as retrieved or independently verified evidence. These instructions constrain claims but cannot guarantee factual accuracy.

The cache holds at most 32 recent attempts and clips, including uncertain failures, to avoid immediate automatic retries of paid requests. Its key includes the outgoing playback occurrence, both tracks, news context, voice, DJ preferences, room mood and wording settings. Retries at one boundary reuse the attempt; later plays of the same song generate fresh continuity. Clips and recent-link history stay in memory, and connection changes/quit revoke them.

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
WAVE_SCENARIO=song-handoff-settings WAVE_CAPTURE_STAGE=after-variety node_modules/.bin/electron docs/verification/critical-playback/server.mjs
pnpm run format
pnpm run check
pnpm audit
```

The main-process integration check executes the actual handoff module and NewsService with a fixture saved take, Jellyfin metadata and HTTP responses. It verifies exact spoken text, voice/tags, unchanged news text, clip bytes, cache reuse, missing metadata, input validation, cancellation, uncertain-dispatch reuse, generation gating and revocation.

The native Electron fixture uses the actual React player and preload-shaped fixture API. Its 32 scenarios cover automatic DJ scheduling, disabled and legacy-ending playback, unconditional introductions after consecutive fact-only bulletins, standalone introductions at the default six-song or configured interval, coinciding news/interval triggers with one introduction, empty news-pool fallback, disabled interval playback, endpoint seeking without a natural completion, disabling standalone speech during generation or playout, skips, disabling an introduction during generation, while queued or on air, sequential and shuffled selection, repeat-one, repeat-all library expansion, a shuffle cycle boundary, queue exhaustion, edits during news and during the introduction, introduction pause/resume and seek, the combined timing budget, overlong speech, late placement and unavailable news audio before generation, provider failure and cancellation during preparation. Interval scenarios advance actual natural-end events and verify speech begins only after N songs finish; news scenarios verify the independent override before N. The existing playback regression fixture and prepared-news delivery integration check also pass. Storage integration verifies default-off, the default interval of six, and customized intervals with on/off preferences across module reloads. Editorial integration checks the writing policy and ending marker through script and audio publication, including linked-source enrichment and restart. Policy version 4 combines the source-evidence policy from main with the mandatory story-only ending; older policy 2/3 checkpoints cannot resume into paid speech under the changed contract. Main-process speech verification uses the TanStack AI adapter introduced on main, including cancellation and uncertain-attempt reuse.

The before-rule/after-rule, before-discovery/after-discovery and after-main-discovery settings screenshots use the same fixture at 1440×1000 and 960×800; the standalone introduction sidebar is captured at 1440×1000. It identifies the clip as a track introduction and omits news-source placeholders. The settings fixture verifies the default of six, then enables announcements, saves a custom song interval of eight and news interval of four, and confirms both on/off values through the actual form and save controller. The discovery check also verifies the announcement controls are the first General section.

After merging main at `68f2f11`, the announcement scenarios and General settings fixture also pass with Electron 45, React 19.3.1 and Vite 8.3.5. Room-profile integration verifies that editing a room or disabling its news preparation preserves enabled song announcements and a custom interval of eight.

Quality checks include formatting, type-aware lint, TypeScript and the production build. Dependency audit reports no known vulnerabilities. Verification uses fixture speech and metadata, with no live provider calls or personal library data. It establishes sequencing and cancellation behavior; real voice continuity, pronunciation and the perceived pause between the two clips still need a listening check with generated speech.

## Announcement variety verification, 29 October 2026

The main-process → actual NewsService → fixture ElevenLabs integration passes with all four preset selections, 12 distinct songs per selection, exact song metadata, and no phrase repeated inside the previous five new recordings. It also covers custom wording in Spanish, blank/duplicate lines, a one-line custom pool, retries without another provider request, changed style/wording replacing stale audio, missing artist metadata, cancellation, uncertain dispatch and revocation. The actual storage module preserves custom lines and style across fresh module reloads with announcements both on and off.

The native Electron settings fixture exercises all style options, live examples, persistence through the actual settings save controller, invalid placeholders, repeated placeholders, unsupported voice tags, the line-count limit, retained custom text after changing presets, keyboard tab order and disabled controls. Text examples make no speech request. Before/after screenshots at 1440×1000 and 960×800 use identical default-off fixture settings and content (`before-variety-settings-*` / `after-variety-settings-*`). Additional custom-line screenshots (`after-variety-custom-*`) cover the enabled editor at both viewports. All six images were visually inspected; custom controls have no horizontal overflow. The existing 32 native playback scenarios also pass. `pnpm run format` and `pnpm run check` pass. This verification uses fixture audio; no new live voice audition or dependency audit was performed for this change.

The settings reorganization fixture (`WAVE_SCENARIO=song-handoff-settings WAVE_CAPTURE_STAGE=after-subsections`) also verifies custom drafts survive collapsing and switching tabs, an invalid announcement draft does not block saving news timing, and the two saves send disjoint field patches without overwriting each other. `preferences-design` covers compact initial disclosures, keyboard Enter/Space support, cleanup when the parent DJ transitions subsection closes, and the player shortcut’s destination/focus. Current General contains appearance, account, libraries and updates. Earlier General/discovery screenshots above document the previous layout.


## Wording style redesign

The dropdown is now a native radio group with five visible choices. Each preset shows its description and a text example from the existing templates; the mixed option explicitly explains the three styles. The saved DJ voice appears once above the group. Selecting My own lines keeps the existing editor, validation, and three formatted examples. Generation, timing, persistence, and independent settings drafts remain in their existing owners.

```sh
WAVE_FIXTURE_PORT=0 WAVE_SCENARIO=song-handoff-settings WAVE_CAPTURE_STAGE=after-wording-subsections node_modules/.bin/electron docs/verification/critical-playback/server.mjs
pnpm run format
pnpm run check
```

The fixture checks row clicks, native Tab/arrow selection with visible focus, tabbing into the custom editor, invalid-line rejection, valid formatted examples, draft preservation across collapse/navigation and style changes, independent news/announcement saves, disabled controls, and absence of speech requests. Layout captures cover 1440×1000, 960×800, and 720×900; desktop includes a dark-theme capture. Before/after disabled-state pairs use the same fixture data at 1440×1000 and 960×800. All screenshots use synthetic data. These checks do not establish speech quality or VoiceOver behavior. Set WAVE_FIXTURE_PORT=0 to choose an available local port without disrupting an existing server.

[Before](before-wording-subsections-settings-1440.png) · [After](after-wording-subsections-settings-1440.png) · [Enabled choices](after-wording-subsections-styles-1440.png) · [Narrow layout](after-wording-subsections-styles-720.png) · [Dark theme](after-wording-subsections-styles-dark-1440.png) · [Custom editor](after-wording-subsections-custom-960.png) · [Keyboard focus](after-wording-subsections-keyboard-960.png)


## Dynamic continuity verification, 4 November 2026

The updated main-process integration runs the actual handoff module and NewsService against fixture GPT-6 Responses and ElevenLabs audio. It covers both song contexts, host preferences, fresh repeat boundaries, recent-link memory, brief post-news/minimal links, model-written song stories, allowing the writer to skip trivia, exact upcoming metadata, invalid-text rejection before speech, cancellations and uncertain attempts in both paid phases, custom lines without a text request, and revocation. It verifies the configured GPT-6 model is used, no retrieved source is required and no external article request occurs. No personal library metadata or live provider credentials are used.

The previous implementation passed all 32 native Electron song-handoff scenarios, including queue edits, shuffle/repeat, standalone cadence, pause/seek and cancellation. Wikipedia retrieval has since been removed at the user’s request. The current implementation passed focused native checks for normal handoffs, a configured announcement interval, repeat-one and queue edits, plus `pnpm run format` and `pnpm run check` on Node 26.13.0. Live model prose, factual accuracy, pronunciation and conversational quality still need a listening audition; fixture responses prove orchestration and validation. Earlier phrase-pool checks above document the former generation behavior.


## Presenter links with room for a story, 4 November 2026

The initial live audition produced 5–9 second clips, including an incorrect title-track claim and a requested story reduced to a plain introduction. The fuller-link target is now 45–55 words, approximately 15–20 seconds at the observed delivery pace. Main rejects standalone bridge, reflection and song-story drafts under 40 words before dispatching speech. If the model skips uncertain trivia, it must still develop a substantive conversational bridge. Minimal, explicitly brief and post-news links remain eligible for shorter text. The mixed approach pool gives brief identifications one slot rather than two; custom lines are unchanged. These are writing constraints, not exact audio duration controls or factual verification.

Radio.co’s [writing guide](https://blog.radio.co/radio-script) distinguishes concise speech from shortening a link for its own sake and recommends writing naturally, setting a scene and developing a point. RadioKing’s [music-radio example](https://www.radioking.com/blog/wp-content/uploads/2023/11/Template_-Music-Radio-Script.pdf) leaves room for prepared song/artist notes. Zeno’s [presenter script examples](https://zeno.fm/blog/write-radio-script/) demonstrate an outgoing reference, one piece of content and a handoff. These inform craft and pacing; none is a compulsory sentence template, and the application does not copy their scripts.

Three original revised text drafts for actual library songs are in the workspace’s `dj-auditions/2026-11-04/revised-scripts.json`, including word counts, estimated timing and sources used to check the two anecdotes. Those references are manual audition QA; they do not reintroduce Wikipedia or a runtime article lookup. The focused main-process integration accepts a developed no-trivia bridge and rejects an undersized fuller link before paid speech. No new live provider calls or audio renders were made for this revision.


## Configurable probability and song range, 4 November 2026 (superseded below)

The main-process → real writer/speech adapter fixture checks 0%, 100%, and the exact 50% selection boundary, short links without outgoing context, and a changed probability invalidating stale cached wording. The actual settings IPC handler and storage integration reject inverted/out-of-range limits and invalid percentages, preserve a legacy fixed interval and legacy single-number patches, and persist 2–6 plus 65% through fresh module reloads without overwriting news timing.

All 33 native playback scenarios passed. The new scenario deterministically draws the inclusive endpoints 2 and 6, verifies unrelated renders/preferences do not redraw a pending target, and observes a new draw when speech starts. Existing scenarios cover natural completion, skips, seek, cancellation, news override and shuffled/repeated queues. The settings fixture verifies invalid-range rejection, independent saves, percentage endpoints, native arrow/Home/End keys with visible focus, style overrides, retained drafts and disabled controls. The existing custom wording, keyboard navigation and independent draft/save regressions also pass. No provider requests were dispatched. `pnpm run format` and `pnpm run check` pass on Node 26.13.0.

Matched default-off captures use the same synthetic state at 1440×1000 and 960×800: `before-chance-range-settings-*` and `after-chance-range-settings-*`. Enabled captures use 2–6 songs and 65% at 1440×1000, 960×800 and 720×900, with a dark-theme 1440 capture. Controls reuse the existing number-input, slider, settings disclosure and save patterns.

[Before](before-chance-range-settings-1440.png) · [After](after-chance-range-settings-1440.png) · [Range and chance enabled](after-chance-range-enabled-1440.png) · [Narrow](after-chance-range-enabled-720.png)


## Shared interval sliders, 4 November 2026

The probability preference has been removed. News playback and song announcements each use the same two-thumb slider, bounded to inclusive whole counts from 1 to 10. Lower and upper thumbs cannot cross, retain a stable tab order and expose their dynamic bounds to assistive technology. Equal values produce a fixed interval. Automatic short/story variation remains in the writer.

The native settings fixture passes pointer dragging for both thumbs, separating equal values, Arrow/Home/End keys, visible keyboard focus, dynamic ARIA bounds, disabled controls, independent saves, retained drafts and custom wording. Captures cover 1440×1000, 960×800 and 720×900, plus dark theme at 1440. News before/after captures use the same default 3–3 state (`before-dual-sliders-news-*` / `after-dual-sliders-subsections-news-*`). The preceding valid announcement UI is in `after-chance-range-settings-*`; the new matched default-off state is in `after-dual-sliders-subsections-settings-*`. The later `before-dual-sliders-settings-*` captures show the old control after its probability field had been removed from the model, so its percentage display is incomplete. Visual inspection confirmed clear handles and values, no horizontal overflow, and continuity with existing settings controls.

All 34 native playback scenarios pass. The added news-range scenario draws 2 and 5 in successive cycles, verifies unrelated preference changes do not reroll the target, and observes a fresh two-song draw after the second bulletin. The existing announcement-range scenario covers 2 and 6. Storage and the actual settings handler preserve both ranges across reloads, retain legacy fixed intervals, reject inverted, null and out-of-range input, remove the obsolete probability field, and clamp previously valid counts above 10 without discarding other preferences. The main writer/speech integration passes with automatic wording variation and no source lookups. `pnpm run format` and `pnpm run check` pass on Node 26.13.0. These checks use fixture data and audio; no live writing or speech requests were made.

```sh
WAVE_FIXTURE_PORT=0 WAVE_SCENARIO=song-handoff-settings WAVE_CAPTURE_STAGE=after-dual-sliders-subsections node_modules/.bin/electron docs/verification/critical-playback/server.mjs
WAVE_FIXTURE_PORT=0 WAVE_SCENARIO=song-handoff node_modules/.bin/electron docs/verification/critical-playback/server.mjs
node docs/verification/critical-playback/verify-storage.cjs
node --conditions=import docs/verification/song-handoff/verify-main.cjs
pnpm run format
pnpm run check
```

[News before](before-dual-sliders-news-960.png) · [News after](after-dual-sliders-subsections-news-960.png) · [Announcement before](after-chance-range-settings-960.png) · [Announcement after](after-dual-sliders-subsections-settings-960.png) · [Enabled range](after-dual-sliders-subsections-enabled-settings-720.png) · [Dark theme](after-dual-sliders-subsections-enabled-dark-1440.png)


## Merged fixed-interval handle, 4 November 2026

Equal limits now render as one handle. Pressing it keeps the value fixed until the drag moves to another song count: left selects the minimum, right selects the maximum. The selected endpoint then remains attached to that drag. Moving either endpoint back to the other merges the visuals again. Native keyboard controls keep their existing logical endpoints, focus and tab order.

The native settings fixture reproduced the previous center-drag failure, then passed for both news and announcements: clicking without moving, expanding left/right, merging from either side, and expanding from the boundaries 1 and 10. Existing keyboard, disabled-state, independent-save, custom-line and retained-draft checks pass. Before/after fixed-at-five captures use identical data at 1440×1000, 960×800 and 720×900 (`before-dual-sliders-merged-handle-fixed-*` / `after-dual-sliders-merged-handle-subsections-fixed-*`). Visual inspection confirmed a single centered handle and preserved layout. `pnpm run format` and `pnpm run check` pass. No provider requests were made.

Run with `WAVE_SCENARIO=song-handoff-settings WAVE_CAPTURE_STAGE=after-dual-sliders-merged-handle-subsections WAVE_FIXTURE_PORT=0 node_modules/.bin/electron docs/verification/critical-playback/server.mjs`.

[Before](before-dual-sliders-merged-handle-fixed-news-960.png) · [After](after-dual-sliders-merged-handle-subsections-fixed-news-960.png) · [Announcement handle](after-dual-sliders-merged-handle-subsections-fixed-announcements-720.png)
