# onmywave.fm Light

A separate macOS music app for an existing Jellyfin server. Built with Electron, Vite, React, and TanStack Query.

## Development

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Enter the Jellyfin server address and sign in inside the app, then choose accessible music libraries. Credentials are not part of the project. The token is encrypted using Electron safeStorage and stored in the app's separate `onmywave-light` data directory. If protected storage is unavailable, sign-in lasts for the current app session only.

## Checks and local packaging

```sh
npm run typecheck
npm run lint
npm run build
npm run package:mac
```

For local testing use `npm run dev` or `npm run preview`; packaging, signing, and publishing are not part of the test workflow. The optional packaging command creates a local macOS application under `release/`. Signing, notarization, distribution, and automatic updates require a separate release setup.

## Listening session

Reopening automatically restores the previous queue, song, playback position, volume, shuffle, and repeat. The player is paused and ready to play, with no resume confirmation. Removed songs are skipped during restoration; temporary connection failures preserve the saved session and offer Retry.

## Scope

See [the requirements](REQUIREMENTS.md) and [approved design](docs/design/macos-production-concept-v4.png). Browse your Jellyfin library, manage playlists, and configure prepared news in News bucket. AI playlist generation remains future work. The player DJ plays saved news on a song interval; a separate workflow prepares it.

## News bucket

News bucket opens on pending recordings, drafts, and reviewed articles. The Overview tab has a setup checklist for News, Host and mood, Provider access, and Automatic workflow. Preparation shows the automatic workflow status and can save and enable the current room directly. Configure the song interval there. Manual text and audio preparation is available under collapsed testing tools; it is not required for automatic breaks. Saved audio stays accessible in its own tab.

Settings owns shared source/DJ management and provider keys. News preparation controls its own hourly checks and daily limits in Workflows or News bucket. Morning weather remains planned.

Sources supports RSS/Atom URLs, Twitter / X recent-search queries, and Hacker News Top, New, or Best stories. Hacker News needs no key. Twitter requires a bearer token with recent-search access in Settings → Provider keys. The token stays in the main process and uses encrypted local storage, or session-only storage when encryption is unavailable. Source content is bounded, checked for freshness when dated, and deduplicated. A failed source produces a named warning while remaining sources may still prepare a story.

Twitter setup help is available beside the bearer-token field and in the Twitter source form. It links to the developer console, the [official token guide](https://docs.x.com/fundamentals/authentication/oauth-2-0/bearer-tokens), and [API pricing](https://docs.x.com/x-api/getting-started/pricing). Twitter requires an X developer account and app, recent-search access, and API credits. RSS and Hacker News need no source token.

The adapters follow the [official Hacker News API](https://github.com/HackerNews/API) and [X recent-search documentation](https://docs.x.com/x-api/posts/search/quickstart/recent-search). No live paid provider requests were made for verification. A fixture-backed browser check covered mode switching, saving the prompt, and adding a Twitter source; a focused preparation check covered mixed sources, partial failures, and missing Twitter credentials.

News bucket supports named configurations. Use **Save as new** to keep a separate, inactive copy of your current sources, DJ, mood, news prompt, and workflow preferences. Incomplete configurations can be saved for later. Choose a saved room from the picker to use it; unsaved edits can be saved or discarded before switching. The existing setup migrates into **My room**. Saving and preparing update the active room. Switching rooms keeps your script and selected audio. Sources, DJs, and provider keys are shared across rooms.

Use the Overview checklist or configuration tabs to edit news, host, and mood. Setup progress survives visits to Settings. Saving room setup requires no provider key. Automatic news preparation runs only after its separate workflow is enabled.

Settings owns provider keys and shared source and DJ management. News bucket owns setup, automation, and testing. Explanations are available from a small number of info buttons.

News preparation has its own opt-in hourly workflow, independent of playback. Configure it in News bucket → Preparation or Settings → Workflows. It runs while the app is open and your Mac is awake. Weather, calendar, and reminder workflows remain planned. [Read the workflow plan](docs/LISTENING_ROOM_WORKFLOW.md) for execution, costs, lifecycle, and expected results.

The player’s **DJ** button opens room selection, schedule status, upcoming news and the last news heard this session. Make saved rooms available in News bucket, select one in the popover, then enable DJ. News bucket → Preparation controls the interval from 1 to 100 songs, defaulting to 3. Choose 1 for testing. The switch and selected room persist; song progress starts over on enable, room or interval changes, and relaunch.

Only natural song completions count, including repeat-one. Skips, pause, seeking and playback retries do not count. At the song interval, the DJ checks the saved news pool for a matching fresh recording. If none is available, music continues without a generation request. Played takes are tracked so automatic playback does not repeat them. News generation runs independently on its own switch and hourly cadence, with a daily recording cap and a bounded number of source assessments. Manual saved-take selection remains independent.

Settings → General → DJ playback controls the song interval, whether seeking preserves the DJ break, and narration volume. Seeking preserves scheduled and speaking DJ breaks by default. The voice defaults to 70% of player volume.

After setup, enable DJ playback in Preparation and play music. Enable News preparation separately to refill the saved pool. Saved takes remain accessible even with incomplete setup or missing keys. The optional steps below describe the manual testing tools.

The setup separates named RSS/Atom feeds, Twitter searches, and Hacker News **Sources**, a saved **DJ** with voice and hosting preferences, and **Station mood** for the atmosphere and delivery. Existing station text and DJ feed URLs migrate into this setup.

1. Manage feeds and searches in Settings → Sources and hosts in Settings → DJs. Select up to 20 sources, a DJ, and station mood in News bucket.
2. Configure protected keys in Settings → Provider keys. OpenAI uses `gpt-6-luna` with reasoning disabled to select and prepare stories from your feeds. ElevenLabs is the only voice provider. Create a DJ with a predefined personality and Man/Woman voice, search your available ElevenLabs voices in Simple, or enter a voice ID and tune all preferences in Advanced.
3. **Prepare news text** saves the setup, reads bounded feed excerpts, and generates one short story. Review and edit its script and inspect references.
4. **Generate audio take** renders the reviewed text. Matching saved audio is reused. **Generate another take** explicitly requests a new render.
5. Audition recordings and explicitly choose **Use this take**. New preparation and configuration edits never replace your selected take automatically.
6. Start music and choose **Schedule near track end** to play the selected saved recording. This makes no provider request.

Saving setup does not fetch feeds, generate news, or start audio. No song needs to be playing during preparation. Prepared news uses the saved mood and DJ settings independently of the current song.

Scripts, MP3 takes, source snapshots, rendering settings, and selection persist under the app's `prepared-news` data directory. Saved recordings play without provider keys. Missing files retain their script and settings and never trigger automatic regeneration. Existing DJ settings migrate to ElevenLabs and `gpt-6-luna`. Saved takes keep their original provenance, provider labels, and audio.

Scheduling measures the clip before arming it for the current song occurrence. Music fades down before narration, then the next song starts when the clip ends. Pause controls both channels. Stop break restores the current song without advancing it. Changing songs cancels the scheduled occurrence. Seeking preserves it by default and can be configured in Settings.

Request IDs persist before dispatch. Checking a saved result does not repeat a completed provider call. Interrupted or uncertain requests require an explicit new attempt. A provider may still charge for a request interrupted before its response arrives.

Provider calls use your account and require model access. Keys use protected storage. No paid requests were made during verification of this flow; live provider output and subjective voice quality still need a configured-provider check.

The bundled historical demonstration remains available as reference audio:

- [Listen to the generated MP3](src/renderer/public/demo/news-break.mp3)
- [Read the transcript and sources](src/renderer/public/demo/transcript.md)
- [Generation metadata](src/renderer/public/demo/news-break.json)

Server data is cached through TanStack Query. Playback, selection, form drafts, and local configuration are separate. The Electron main process owns server credentials and exposes explicit domain methods through the preload bridge. Artwork and audio use a token-free application protocol.

The previous `../desktop/` project is an integration reference. This app has its own source and data directory. Branding assets in `resources/` come from the onmywave.fm fork and retain its GPL-3.0 terms. Bundled Google Fonts retain their included font licenses.

### DJ voice previews

Create DJ can audition a voice before saving a host. Predefined voices ship with seven pre-generated Eleven v4 MP3 samples, one per distinct voice ID. Preset and gender changes select the matching sample immediately. The same samples are available when their IDs are entered manually. Playback uses bundled/local audio without provider keys or another synthesis request.

Custom IDs have a Generate sample button when no saved recording exists. Generation validates the ID and saves one fixed English sample per voice ID and sample revision. DJs sharing that voice reuse the recording regardless of name, personality, or delivery tags. These are neutral voice samples; DJ delivery settings apply to actual breaks. Concurrent requests share one generation. Missing files and failed/interrupted attempts require explicit retry; successful samples never regenerate on playback. Existing per-DJ recordings remain playable and are not copied into the neutral sample cache.

Voice preview playback pauses music. Starting music, changing voice, closing the editor, or starting another sample stops it. A sample completing after the user changes voice must not play unexpectedly. Saving a DJ does not generate speech.

The bundled samples are in `src/renderer/public/voice-previews/` with generation metadata. To prepare missing assets once, set `ELEVENLABS_API_KEY` and run `node scripts/prepare-voice-previews.mjs`. The script skips completed matching files and makes no automatic retry after a provider error. Replaying those assets does not need a key. Increment `VOICE_SAMPLE_VERSION` when changing the fixed text, model, or rendering settings, then regenerate the bundled assets for that version.

## News bucket and reviewed articles

The News bucket opens on saved stories and the actual DJ playback state. Ready recordings use the same eligibility and ordering rules as the player; they are distinct from a break already scheduled near a song ending. Drafts awaiting audio and reviewed article history remain visible with their original source links. Profile setup and preparation remain available in secondary tabs.

All preparation paths share a permanent article URL history. Known tracking parameters and URL fragments are ignored when comparing links. Articles already submitted for assessment are excluded across profiles before another text-generation request. Completed assessments record selected and unselected articles, including checks where no story qualifies. An interrupted assessment keeps its source links and is excluded to avoid repeating a possibly charged request. Feeds remain enabled and can supply new article URLs. Updates at a previously reviewed URL are also excluded.

Existing saved scripts and recordings seed the history with their known selected articles. Past rejected candidates cannot be recovered because older versions did not save them.
