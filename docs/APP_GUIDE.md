# App guide

Development notes and detailed behavior for onmywave.fm. Start with the [README](../README.md) for installation and first use. Dated verification claims below describe their original checks.

## Listening session

Reopening automatically restores the previous queue, song, playback position, volume, shuffle, and repeat. The player is paused and ready to play, with no resume confirmation. Removed songs are skipped during restoration; temporary connection failures preserve the saved session and offer Retry.

## Song lyrics

Select a song, then use the Lyrics button beside Queue in the player. Lyrics and Queue share the same drawer. Closing Lyrics returns focus to its player button. The panel follows song changes and closes when there is no selected song or the account changes.

Timed lyrics highlight against the music position, including while seeking or repeating a song. Lines with the same timestamp highlight together. Scrolling manually pauses automatic following; **Follow current line** resumes it. Plain lyrics retain their line breaks and do not scroll automatically. Lyrics never start, pause, or seek playback and do not follow DJ speech.

Lyrics come from the connected Jellyfin server, version 10.9 or later. To fill missing lyrics, install a compatible [Jellyfin LRCLIB plugin](https://github.com/jellyfin/jellyfin-plugin-lrclib) and download lyrics on the server. Jellyfin also supports [matching local lyric files](https://jellyfin.org/docs/general/server/media/music/#lyrics). The app reads the server's saved lyrics by song ID; it does not search external providers or download lyric files itself.

Missing lyrics, unsupported servers, access restrictions, and loading failures have separate states. Recoverable failures offer **Try again**. Closing the drawer discards its inactive lyric query. Lyrics are not saved to disk or included in the listening queue. Invalid or unordered timing falls back to plain text. The first release uses the server's line start times and has no manual timing adjustment or word-level highlighting.

See the [lyrics verification record](verification/lyrics/README.md) for native fixture checks and live-server verification limits.

## Scope

See [the radio experience and STAR scenarios](RADIO_EXPERIENCE.md), [the requirements](../REQUIREMENTS.md) and [current implemented desktop capture](verification/2026-10-17-implemented-desktop.jpg). The [approved generated visual target](design/macos-production-concept-v4.png) remains a design reference. The implemented capture uses a disposable local catalog; its [verification record](verification/2026-10-17-implemented-desktop.json) identifies the actual desktop framing and remaining Dock/chrome limits. Browse your Jellyfin library, manage playlists, and configure prepared news in News bucket. Uncertain playlist creations, additions, reorders and removals retain recovery across navigation, same-account sign-in and app restarts. Review needed marks affected playlists; open one, refresh and check its contents before acknowledging. An uncertain creation asks you to refresh and check the playlist list before creating another; other playlists remain usable. Startup never repeats these writes. Refresh library updates songs and filter choices, and refreshes cached album, song-detail and playlist data when used. It keeps the current listening queue, search and selection. AI playlist generation remains future work. The player DJ plays saved news on a song interval; a separate workflow prepares it.

## News bucket

News bucket opens on saved news, drafts, and reviewed articles, with profile-specific preparation status, the last scheduled check and reason, daily usage, and a fresh ready count. The player’s DJ controls separately show preparation for its playback profile. Interrupted checks pause until explicitly resumed, and recovered completed recordings are accounted for once. Its Settings tab combines sources, interests, DJ, mood, and news preparation. News creation and DJ delivery use automatic flows; there is no custom story editor, manual audio generator or manual scheduling. Saved audio has its own tab. DJ playback interval, seeking behavior, and voice volume live in app Settings → General. Its DJ transitions section can preview draft timings with sample music and a bundled voice, without a key or provider request. The demo pauses music; later song changes, seeking or playback commands stop it. Changing timings or leaving General settings stops the demo without saving, and finishing never resumes music.

Settings owns shared source/DJ management and provider keys. News preparation controls its hourly checks and daily limits in News bucket → Settings. Morning weather remains planned.

Sources supports RSS/Atom URLs, Twitter / X recent-search queries, and Hacker News Top, New, or Best stories. Hacker News needs no key. Twitter requires a bearer token with recent-search access in Settings → Provider keys. The token stays in the main process and uses encrypted local storage, or session-only storage when encryption is unavailable. Source content is bounded, checked for freshness when dated, and deduplicated. A failed source produces a named warning while remaining sources may still prepare a story.

Twitter setup help is available beside the bearer-token field and in the Twitter source form. It links to the developer console, the [official token guide](https://docs.x.com/fundamentals/authentication/oauth-2-0/bearer-tokens), and [API pricing](https://docs.x.com/x-api/getting-started/pricing). Twitter requires an X developer account and app, recent-search access, and API credits. RSS and Hacker News need no source token.

The adapters follow the [official Hacker News API](https://github.com/HackerNews/API) and [X recent-search documentation](https://docs.x.com/x-api/posts/search/quickstart/recent-search). No live paid provider requests were made for verification. A fixture-backed browser check covered mode switching, saving the prompt, and adding a Twitter source; a focused preparation check covered mixed sources, partial failures, and missing Twitter credentials.

News bucket supports named configurations. Use **Save as new** to keep a separate, inactive copy of your current sources, DJ, mood, news prompt, and workflow preferences. Incomplete configurations can be saved for later. Choose a saved room from the picker to use it; unsaved edits can be saved or discarded before switching. The existing setup migrates into **My room**. Saving and preparing update the active room. Switching rooms retains saved scripts, recordings and history. Sources, DJs, and provider keys are shared across rooms.

Use News bucket → Settings for one combined draft of sources, host, mood, interests, and preparation. Unsaved edits survive music navigation and shared Settings visits. Save setup commits them together; switching profiles offers Save, Discard, or Cancel for all fields. Incomplete setup can be saved with preparation off. Enabling or resuming preparation checks current sources, host, mood, OpenAI/ElevenLabs keys, and an X token only when an X source is selected. Turning preparation off does not require keys. Signing out pauses preparation across profiles and stops active news/voice generation. Saved setup and recordings stay on this Mac; unsaved news edits are discarded. After signing in, use Resume preparation in News bucket → Settings. A request already sent may still finish or incur a charge.

Settings owns provider keys and shared source and DJ management. News bucket owns setup, automation, and testing. Explanations are available from a small number of info buttons.

News preparation has its own opt-in hourly workflow, independent of playback. Configure it in News bucket → Settings. It runs while the app is open and your Mac is awake. Weather, calendar, and reminder workflows remain planned. [Read the workflow plan](LISTENING_ROOM_WORKFLOW.md) for execution, costs, lifecycle, and expected results.

The player’s **DJ** button opens room selection, schedule status, upcoming news and the last news heard this session. Make saved rooms available in News bucket, select one in the popover, then enable DJ. App Settings → General controls the interval from 1 to 100 songs, defaulting to 3. Choose 1 for testing. The switch and selected room persist; song progress starts over on enable, room or interval changes, and relaunch.

Only natural song completions count, including repeat-one. Skips, pause, seeking and playback retries do not count. Seeking to the exact end follows repeat and queue order without counting a completion, keeps paused playback paused, and finishes a retained DJ break before music continues. At the song interval, the DJ checks the saved news pool for a matching fresh recording. If none is available, music continues without a generation request. Played takes are tracked so automatic playback does not repeat them. News generation runs independently on its own switch and hourly cadence, with a daily recording cap and a bounded number of source assessments. Saved audio remains available for audition.

Settings → General → DJ playback controls the song interval, whether seeking preserves the DJ break, and narration volume. Unsaved DJ playback and transition edits stay while you browse or switch music accounts. Save each form explicitly; quitting discards unsaved edits. Pending saves and failures remain visible when you return. Seeking preserves scheduled and speaking DJ breaks by default. The voice defaults to 70% of player volume.

After setup, enable DJ playback in the player popover and play music. Enable News preparation separately to refill the saved pool. Turn off automatic preparation remains available during a check and keeps other unsaved setup edits. Saved takes remain accessible even with incomplete setup or missing keys. Leaving Saved audio stops its audition and leaves music paused. Later music commands, including paused Next/Previous and seeking, also stop and reset an audition. The audition’s own Pause/Resume keeps its position; volume, shuffle and repeat changes keep it playing. Saved audio remains a read-only archive for audition and provenance.

The setup separates named RSS/Atom feeds, Twitter searches, and Hacker News **Sources**, a saved **DJ** with voice and hosting preferences, and **Station mood** for the atmosphere and delivery. Existing station text and DJ feed URLs migrate into this setup.

1. Manage feeds and searches in Settings → Sources and hosts in Settings → DJs. Select up to 20 sources, a DJ, and station mood in News bucket.
2. Configure protected keys in Settings → Provider keys. OpenAI uses `gpt-6-luna` with reasoning disabled to select and prepare stories from your feeds. ElevenLabs is the only voice provider. Create a DJ with a predefined personality and Man/Woman voice, search your available ElevenLabs voices in Simple, or enter a voice ID and tune all preferences in Advanced.
3. Explicitly enable and save automatic preparation in News bucket → Settings. Scheduled checks assess sources and save qualifying scripts and recordings.
4. Enable DJ breaks separately in the player to hear fresh matching recordings near song endings. Playback never starts paid preparation.
5. Use Saved audio to read scripts and source references, inspect preparation settings, and audition existing recordings without provider requests. Script-only and historical manual work remain inspectable; they cannot be edited, regenerated or inserted manually.

Saving setup with preparation off makes no generation request or playback change. Explicitly saving an enabled workflow authorizes its scheduled checks and provider requests. No song needs to be playing during preparation. Prepared news uses the saved mood and DJ settings independently of the current song.

Scripts, MP3 takes, source snapshots, rendering settings, and historical selection data persist under the app's `prepared-news` data directory. Saved recordings play without provider keys. Missing files retain their script and settings and never trigger automatic regeneration. Existing DJ settings migrate to ElevenLabs and `gpt-6-luna`. Saved takes keep their original provenance, provider labels, and audio.

Scheduling measures the clip before arming it for the current song occurrence. Music fades down before narration, then follows the current repeat mode when the clip ends. Repeat one restarts the same song; manual Next still skips. Pause controls both channels. Stop break restores an unfinished song; after its natural ending, Stop follows the same repeat/queue continuation and keeps paused playback paused. Changing songs cancels the scheduled occurrence. Seeking preserves it by default and can be configured in Settings.

Request IDs persist before dispatch. Checking a saved result does not repeat a completed provider call. Interrupted or uncertain requests require an explicit new attempt. A provider may still charge for a request interrupted before its response arrives.

Provider calls use your account and require model access. Keys use protected storage. No paid requests were made during verification of this flow; live provider output and subjective voice quality still need a configured-provider check.

The bundled historical demonstration remains available as reference audio:

- [Listen to the generated MP3](../src/renderer/public/demo/news-break.mp3)
- [Read the transcript and sources](../src/renderer/public/demo/transcript.md)
- [Generation metadata](../src/renderer/public/demo/news-break.json)

Server data is cached through TanStack Query. Playback, selection, form drafts, and local configuration are separate. The Electron main process owns server credentials and exposes explicit domain methods through the preload bridge. Artwork and audio use a token-free application protocol.

The [onmywave.fm desktop project](https://github.com/wapgear/onmywave-desktop-legacy) is an integration reference. This app has its own source and data directory. Branding assets in `resources/` come from the onmywave.fm fork and retain its GPL-3.0 terms. Bundled Google Fonts retain their included font licenses.

### DJ voice previews

Create DJ can audition a voice before saving a host. Predefined voices ship with seven pre-generated Eleven v4 MP3 samples, one per distinct voice ID. Preset and gender changes select the matching sample immediately. The same samples are available when their IDs are entered manually. Playback uses bundled/local audio without provider keys or another synthesis request.

Custom IDs have a Generate sample button when no saved recording exists. Generation validates the ID and saves one fixed English sample per voice ID and sample revision. Editor auditions sharing that voice reuse the recording regardless of host name, personality, or delivery tags. These are neutral voice samples; DJ delivery settings apply to actual breaks. Set how often news plays in Settings → General → DJ playback. Choose the music yourself from the library or queue. Concurrent requests share one generation. Missing files and failed/interrupted attempts require explicit retry; successful samples never regenerate on playback. Neutral samples are separate from saved DJ delivery previews.

Each saved DJ also offers an optional Generate DJ preview action. It records the fixed sample with that DJ's saved voice and delivery tags, stores it per DJ, and does not use the neutral sample as a substitute. Changing voice or delivery marks the saved preview outdated. You can replay it without a key or explicitly regenerate with ElevenLabs; a failed regeneration keeps the previous recording. Missing/failed attempts require explicit retry, including after restart.

Voice preview playback pauses music. A later music command, including choosing another song while paused, seeking or pressing Pause, stops the preview and prevents a pending preview from starting. Its completed recording remains saved for explicit replay. Changing voice, closing the editor or starting another sample also stops it. Volume, repeat and shuffle changes keep the preview available, and it uses the current volume. Saving a DJ does not generate speech.

The bundled samples are in `src/renderer/public/voice-previews/` with generation metadata. To prepare missing assets once, set `ELEVENLABS_API_KEY` and run `node scripts/prepare-voice-previews.mjs`. The script skips completed matching files and makes no automatic retry after a provider error. Replaying those assets does not need a key. Increment `VOICE_SAMPLE_VERSION` when changing the fixed text, model, or rendering settings, then regenerate the bundled assets for that version.

## News bucket and reviewed articles

The News bucket opens on saved stories and the actual DJ playback state. Ready recordings use the same eligibility and ordering rules as the player; they are distinct from a break already scheduled near a song ending. Drafts awaiting audio and reviewed article history remain visible with their original source links. Profile setup and preparation share one Settings tab.

All preparation paths share a permanent article URL history. Known tracking parameters and URL fragments are ignored when comparing links. Articles already submitted for assessment are excluded across profiles before another text-generation request. Completed assessments record selected and unselected articles, including checks where no story qualifies. An interrupted assessment keeps its source links and is excluded to avoid repeating a possibly charged request. Feeds remain enabled and can supply new article URLs. Updates at a previously reviewed URL are also excluded.

Existing saved scripts and recordings seed the history with their known selected articles. Past rejected candidates cannot be recovered because older versions did not save them.
