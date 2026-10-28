# DJ song announcements

News recordings remain reusable. When a saved take is scheduled, the player resolves the next queue occurrence and asks main to prepare a separate closing clip: “And now, enjoy [title] by [artist].” Main reads metadata from Jellyfin and uses the recording's saved ElevenLabs voice and delivery tags. The initial closing template is English; this change does not add model-written or translated links.

Both clips are preloaded, and their combined duration determines the over-music start time and fit checks. The bulletin plays first, the closing clip follows, and the reserved occurrence starts after the configured tail. Shuffle reservations retain the chosen plan so a repeat boundary cannot redraw a different song. Repeat-all resolves library expansion before choosing the song. Repeat-one introduces the repeated song. Queue exhaustion and unavailable title metadata omit the link; missing artist metadata produces a title-only link.

The player loads the saved bulletin and checks its timing before requesting speech for the introduction. Missing audio and an already-late break therefore incur no introduction request. Combined timing is checked again after the introduction loads and after the news claim resolves. Seeking during the introduction retains only that clip's remaining duration; completed news is neither replayed nor counted again in the timing budget.

Queue/order/repeat changes invalidate the scheduled break, including paused speech. Playback cancellation releases both clips and any pending speech request. Unheard news keeps the existing claim-release rules; history is recorded once when the bulletin starts. Saved-audio auditions and the bundled transition sample keep their original recordings.

Song announcements add an ElevenLabs speech request when the introduction is absent from the session cache. The cache holds at most 32 recent attempts and clips, including uncertain failures, to avoid immediate automatic retries of paid requests. Clips stay in memory, and connection changes/quit revoke them. No persistent news artifacts or editorial prompts are changed.

## Verification

Run from the repository root:

```sh
node docs/verification/song-handoff/verify-main.cjs
WAVE_SCENARIO=song-handoff node_modules/.bin/electron docs/verification/critical-playback/server.mjs
node_modules/.bin/electron docs/verification/critical-playback/server.mjs
node docs/verification/prepared-news-delivery/verify.cjs
pnpm run format
pnpm run check
pnpm audit
```

The main-process integration check executes the actual handoff module and NewsService with a fixture saved take, Jellyfin metadata and HTTP responses. It verifies exact spoken text, voice/tags, unchanged news text, clip bytes, cache reuse, missing metadata, input validation, cancellation, uncertain-dispatch reuse, generation gating and revocation.

The native Electron fixture uses the actual React player and preload-shaped fixture API. Its 17 scenarios cover automatic DJ scheduling, sequential and shuffled selection, repeat-one, repeat-all library expansion, a shuffle cycle boundary, queue exhaustion, edits during news and during the introduction, introduction pause/resume and seek, the combined timing budget, overlong speech, late placement and unavailable news audio before generation, provider failure and cancellation during preparation. The existing playback regression fixture and prepared-news delivery integration check also pass.

Quality checks include formatting, type-aware lint, TypeScript and the production build. Dependency audit reports no known vulnerabilities. Verification uses fixture speech and metadata, with no live provider calls or personal library data. It establishes sequencing and cancellation behavior; real voice continuity, pronunciation and the perceived pause between the two clips still need a listening check with generated speech.
