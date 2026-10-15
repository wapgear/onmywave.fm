# onmywave.fm macOS app requirements

Draft requirements agreed through October 15, 2026.

Build a separate macOS application for onmywave.fm that uses the listener's existing Jellyfin music library. The first version provides music browsing, playback, playlist management, custom DJs with a manual personalized-news test, and a My stations placeholder. Playlist generation from a written vibe and automatic DJ scheduling remain future work.

## Product scope

The app is a new project in `desktop-light/`, separate from the existing Feishin desktop fork in `desktop/`. Use the existing app as a reference for Jellyfin integration, metadata presentation, library browsing, and playlist behavior. Build the new app with the stack defined below.

Support macOS and Jellyfin only in the first version. Jellyfin remains the source of music files, library metadata, access permissions, and server playlists. The new app does not require uploading or importing another copy of the music collection.

The interface should expose the agreed functions directly, with sensible defaults and few customization settings.

## Visual design

Use Apple Music and Yandex Music as visual references for a light, simple macOS interface. Aim for a contemporary 2026 feel with more generous whitespace, softer rounded forms, light controls, and a continuous composition. Keep onmywave.fm's own identity. Avoid chopping the interface into dense rectangular panels.

### Color direction

- Use white or soft off-white for the main background.

- Use pale neutral gray for the sidebar, secondary surfaces, and subtle separators.

- Use near-black primary text and muted gray secondary text.

- Use one primary accent consistently for selected navigation, primary actions, and active controls.

- Explore Apple Music-inspired pink or red and Yandex Music-inspired warm yellow as accent options. Choose one coherent palette during visual design rather than using both as competing primary colors.

- Keep large surfaces neutral so album artwork provides most of the color.

- Final color values will be set during design. These are palette directions, not exact brand color specifications.

### Layout and controls

- Use a compact sidebar with the five agreed categories and a spacious main content area.

- Present songs in a clean table and albums in an artwork grid.

- Keep the player persistent as an inset floating rounded surface, with circular transport controls and enough spacing to distinguish each action. Make secondary playback options available on demand.

- Use generous padding and row spacing, clear typography, softly rounded window corners and artwork, pill-shaped search and filter controls, and rounded selection states. Prefer whitespace and subtle surface changes to hard borders.

- Follow familiar macOS window and interaction conventions, including keyboard navigation and visible focus states.

- Keep common actions easy to find. Reveal secondary actions through row menus or contextual controls.

- Give My stations and DJs simple forms with clear labels.

- Use restrained motion and respect reduced-motion preferences.

### Typography and spacing

Use [Manrope from Google Fonts](https://fonts.google.com/specimen/Manrope) at weight 600 for the wordmark and headings, and [Inter from Google Fonts](https://fonts.google.com/specimen/Inter) at weights 400 and 500 for interface text. Keep the macOS system font for native operating-system chrome. Bundle the chosen app fonts rather than requiring a runtime network request.

Use these initial design targets in logical points, adjusting only where actual font metrics and window resizing require it:

| Element | Target |
| --- | --- |
| Page title | 28 pt, weight 600 |
| Song title and navigation | 14 pt with 20 pt line height |
| Secondary artist text | 12 pt with 18 pt line height |
| Column headers | 11 pt with 16 pt line height |
| Metadata values | 13 pt with 20 pt line height |
| Spacing scale | Multiples of 8 pt, with 4 pt optical adjustments |
| Main content padding | 24 to 32 pt |
| Control gaps | 12 to 16 pt |
| Sidebar width | Approximately 208 pt |
| Song rows | Approximately 52 pt high |
| Row artwork | 36 pt with 8 pt corner radius |
| Search and filter controls | 32 to 36 pt high |
| Floating player | Approximately 72 pt high |

Align text baselines, table columns, icons, control centers, and outer insets consistently. Keep icon stroke weights consistent, reserve adequate hit areas, and show hover, focus, pressed, selected, and disabled states. Long titles must truncate or wrap deliberately without moving adjacent controls.

### macOS presentation

Use normal macOS window proportions, traffic lights, titlebar behavior, window shadow, and system integration. Keep content legible over a translucent sidebar or playback surface. Screenshots and design reviews should show the app in desktop context with wallpaper, menu bar, and Dock, rather than only an isolated concept board.

Keep the app airy at realistic desktop text sizes. Verify spacing and typography using the actual bundled fonts at standard and Retina display scales. Check minimum window size, resized layouts, and long metadata so production screenshots reflect an implemented layout rather than generated-image approximations.

### Design acceptance

The first version must feel light and simple across library pages, playlists, forms, and playback. Use readable text and sufficient contrast, including selected, disabled, hover, and focus states. Preserve essential controls and readable content when the window is resized.

A dark theme, elaborate animations, decorative gradients, and extensive appearance customization are outside the initial design scope.

### Interface concept

Concept v4 presents the All songs view as an app window on a macOS desktop, including wallpaper, system menu bar, Dock, and native window controls. The app retains the light palette, rounded controls, airy library rows, open metadata area, and floating player. The image is a generated visual target with illustrative music data; the actual application will implement and verify the font and layout specifications below.

![macOS desktop presentation concept v4](docs/design/macos-production-concept-v4.png)

### Pinterest inspiration

- [Airy desktop player reference](https://in.pinterest.com/pin/208010077668840252/) inspires the large artwork, generous spacing, and quiet track list.

- [Apple Music dashboard concept](https://kr.pinterest.com/pin/515732594846289618/) inspires the rounded application shell, small filter pills, and separate playback surface. Use those layout ideas with our light palette.

- [Music UI desktop design by Khandaker Rasel](https://in.pinterest.com/pin/644788871650256226/) offers a reference for artwork hierarchy and a quiet library sidebar.

These are visual references rather than current Apple product specifications. Use gentle translucency only where it keeps content readable, especially the sidebar and player. Apply the same spacing, corner shapes, and control treatment to every app page.

## Project folder and stack

The new app lives in `desktop-light/` at the workspace root, alongside the existing `desktop/` and `ios/` projects. Treat `desktop-light/` as the implementation destination for these requirements. Keep the existing desktop app available as a reference.

| Component | Choice and responsibility |
| --- | --- |
| Desktop runtime | Electron for the macOS app window and native integration |
| Development and build | Vite |
| Server data | TanStack Query for library queries, caching, loading and error states, and playlist mutations |
| Music server | The existing Jellyfin server for authentication, music catalog, artwork, streaming, and playlists |

Use the existing Jellyfin server directly as the music backend. The first version does not require a new music server or a separate custom backend service. Keep local player state, selection state, and editable form drafts separate from cached server data.

Keep Electron native capabilities behind a narrow preload interface, with context isolation and renderer Node integration disabled. Store authentication secrets through operating-system protected storage. Playlist mutations must refresh or update affected cached data and clearly report failed saves.

The workspace requirements copy is `desktop-light/REQUIREMENTS.md`. The approved visual direction is the macOS desktop concept v4, saved under `desktop-light/docs/design/`.

## Navigation

Provide five main categories: All songs, Albums, Playlists, My stations, and DJs. Keep Settings accessible separately. A persistent player remains available across categories, with an expandable queue.

Search and metadata filters belong within library pages. A separate full music discovery homepage is not required.

## Jellyfin connection

- Accept a server address and authenticate the listener.

- Let the listener select the music libraries accessible to their account.

- Remember the connection securely across launches.

- Load catalog information and artwork from Jellyfin and provide a way to refresh library changes.

- Respect account permissions for every read and playlist change.

- Distinguish an unreachable server, expired authentication, an empty library, and a failed operation. Offer an appropriate retry or sign-in action.

- Keep credentials and authentication tokens out of logs.

## All songs

- Show all songs in the selected music libraries.

- Search by song title, artist, and album.

- Sort the list and filter by available metadata, including genre and tags.

- Select one song or multiple songs.

- Play a song or the selected songs, add them to the queue, or add them to a playlist.

- Display useful columns such as title, artist, album, and duration.

- Open a details panel for additional metadata.

- Keep browsing responsive for the listener's actual library size.

Metadata includes artwork, title, artist, album artist, album, duration, year, genre, tags, track number, and other fields available from Jellyfin. Missing fields must not prevent browsing or playback. Metadata display and filtering are included; editing tags, metadata, and artwork is an open scope decision.

## Albums

- Browse albums with their artwork, title, and artist.

- Search albums and open an album to see its metadata and ordered track list.

- Play an album, add its tracks to the queue, or add all its tracks to a playlist.

- Allow selecting individual tracks within an album.

## Playlists

- Show the connected account's accessible playlists.

- Create a playlist, rename an editable playlist, and open its track list.

- Add one song, multiple selected songs, or all tracks from an album.

- During an add operation, choose an existing playlist or create a new one.

- Remove tracks from editable playlists and reorder them.

- Play a playlist or selected tracks within it.

- Save playlist changes to Jellyfin so other clients can access them.

- Explain permission restrictions and report failed saves accurately.

- Handle duplicate additions consistently, with an option to skip tracks already present.

Playlist deletion, sharing, and smart playlist editing are not part of the agreed first version.

## Playback

- Provide play, pause, previous, next, seeking, volume, shuffle, and repeat.

- Show the current track, artist, artwork, playback position, and duration.

- Provide an expandable queue showing upcoming music.

- Keep playback running while the listener navigates and when the app is in the background.

- Support macOS media controls.

- Automatically restore the last queue, song, position, volume, shuffle and repeat after relaunch, paused and ready to play, without a resume prompt.

- Handle unavailable tracks and interrupted connections without endless retries or silently losing the listening session.

The exact recovery and queue persistence behavior must be verified with the connected server during implementation.

## Workflow planning revision, October 15, 2026

Listening Room uses a setup wizard showing one step at a time: required sources, required DJ and mood, then review provider requirements and save. Provider keys, source and DJ management, and optional planned cadence, importance, clip limits, and morning weather belong in Settings. Preserve wizard drafts and the current step across Settings visits, with explicit return navigation. After setup, show a compact room summary and working preparation/review/audio tools. Keep saved takes accessible even with incomplete setup or missing keys. Use a few accessible info buttons for static explanations while keeping required labels, errors, and blockers visible. Label automation as unavailable and future preferences as Planned, not running; saving starts no feeds, provider requests, or playback.

The next implementation stages are a durable news workflow with a no-important-update outcome, a separate morning weather workflow, then optional delivery and calendar/reminders integrations. See [the workflow plan](docs/LISTENING_ROOM_WORKFLOW.md). Default planned delivery prepares audio for review. Only qualifying news produces a new recording; AI assessment can still incur costs when no recording is made. Anton chose local execution while the app runs and the Mac is awake.

## Listening Room revision, October 15, 2026

This revision supersedes the My stations placeholder and per-DJ preview flow in the historical requirements below. Main navigation includes Listening Room; source and DJ management are under Settings.

- Separate named RSS/Atom sources, reusable DJ settings, and station mood. Preserve the saved vibe and migrate existing DJ feed URLs into Sources.
- Explicitly prepare one news script from selected feeds, mood, and DJ preferences without requiring a current song. Review and edit text before generating finite audio.
- Persist immutable audio takes with the exact script, original source/mood provenance, and rendering DJ settings. Use ElevenLabs for all new voice audio. Migrate existing DJ settings to ElevenLabs while preserving saved recordings and their original provenance.
- Audition, compare, and explicitly select saved takes. Configuration edits, navigation, and music playback never generate news or automatically replace the selected take.
- Persist a request ledger before dispatch. Reconcile completed request IDs before resolving mutable configuration. Do not automatically retry interrupted provider requests. Preserve completed audio across late cancellation and recover it after interrupted manifest publication.
- Replay saved recordings without provider keys. Keep manually armed near-track-end scheduling. Missing files retain provenance and require an explicit action to prepare replacement audio.
- Keep keys protected and explain provider use at each generation action. Distinguish mocked-provider verification from actual paid-provider output.

Mood-based music selection, multiple named stations, and continuous automatic hosting remain future work.

## Historical station and DJ requirements

## My stations

### First version

Provide a page with a text field for the listener's vibe, such as "Calm electronic music for working, mostly instrumental."

The page is a placeholder. Clearly state that playlist generation is coming later. Do not simulate generation or display a successful result when no generation has occurred.

### Future generation

- Use the written vibe to select songs from the connected Jellyfin library.

- Preview the generated selection.

- Allow playing the selection or saving it as a Jellyfin playlist.

- Honor explicit musical constraints and explain when the library cannot satisfy them.

- Avoid immediate track repeats and excessive consecutive tracks by the same artist.

- Allow the listener to change direction during a session without interrupting the current track.

Whether stations can be named, saved, edited, and reused is an open decision for that milestone.

## DJs

### First version

A DJ is a reusable configuration describing how a listening session should be run.

- Provide a list of custom DJs.

- Create, edit, duplicate, and delete a DJ.

- Store a name, optional description, and written instructions.

- Store music preferences, including genres, artists, playlists, and exclusions.

- Store optional hosting preferences, including personality, language, and speaking frequency.

- Preserve configurations across launches.

- Provide manual news generation and playback tests. Clearly mark automatic hosting and music selection as future functionality.

Saving a DJ does not start generation or playback. The listener explicitly generates a preview, reviews its script and sources, and chooses when to play the news break.

### Future behavior

A station defines what the listener wants to hear. A DJ defines how the session runs. Allow assigning a DJ to a station when DJ execution is implemented.

Define supported actions and their limits before building execution. Free-form instructions alone do not establish permission to change music files, account settings, or server data.

### Manual news test

- Configure RSS or Atom source URLs for each DJ, personal news interests, language, delivery personality, and voice.

- Deliver exactly one short story per intervention, about 10–20 seconds and roughly 25–45 spoken words. This replaces the earlier multi-story bulletin requirement.

- Fetch bounded feed content, preserve source links and publication dates, deduplicate stories, and show source failures or insufficient coverage.

- Use OpenAI `gpt-6-luna` with reasoning disabled to select one relevant story and write a lively music-radio segue. Adapt delivery using current-track metadata and DJ music preferences: playful for fun music, relaxed for mellow music. Treat metadata as a style hint, not audio analysis. Avoid formal newsreader introductions, roundups, and signoffs. Treat source text as untrusted data. Do not invent stories or citations.

- Generate audio only after the listener requests a preview. Show the script, the selected sources, warnings, and an AI-generated voice label.

- ElevenLabs is the only voice provider. OpenAI handles information selection and script preparation only. Do not offer OpenAI speech or live capture.

- Keep preparation independent of music playback. Cancel must prevent pending work from dispatching later and reject stale results.

- Schedule the prepared clip for the current track occurrence near its end, never at the beginning. Measure clip duration and trigger with about clip duration plus two seconds remaining, inside the last 25 seconds and past the midpoint. Reject late preparation. Fade music down over about one second to a barely audible bed (5% default, 8% maximum) before the voice starts. Never replay the track intro. If the track unexpectedly ends during speech, finish the short voice tail and advance once.

- At the finite clip's actual end, advance to the next song exactly once and fade that song up when playback actually starts. Stop or narration failure restores the current music without advancing it.

- Pause and resume control both channels. Seeking, explicit next, previous, new playback, queue replacement, or account changes cancel scheduled and active news and restore normal volume.

- Keep spoken segments outside the music queue, Jellyfin playlists, music favorites, and music history.

- Verify the complete generated-news and voice handoff with configured OpenAI and ElevenLabs accounts before treating the feature as verified.

## Optional spoken news

Manual spoken-news tests are included in the DJs tab. Automatic scheduling between tracks remains future work.

- Let the listener choose news sources and enable or disable news breaks.

- Let the listener choose how frequently briefings occur and use a music-only mode.

- Play briefings between music tracks.

- Support pause and skip during speech, then return to music.

- Continue music if a briefing is unavailable, fails, or is late.

- Show the source links and publication dates used for a briefing.

- Treat spoken briefings separately from songs. They must not enter music favorites, playlists, or music scrobbling.

## Settings and data

Keep first-version settings limited to the Jellyfin connection, selected music libraries, basic playback preferences, and essential app settings.

Jellyfin owns the music catalog and server playlists. The app stores its connection information, local preferences, session state, and DJ configurations. Storage for saved stations will be decided with station generation.

Use OpenAI for the initial news service. Generating a preview sends bounded feed excerpts, the listener's news interests, and hosting instructions to OpenAI. Explain this at the Generate action. Do not send music files, Jellyfin credentials, API keys, or the music catalog as model context. Keep provider keys in operating-system protected storage and expose only configuration status to the renderer.

## Outside the first version

- Windows, Linux, mobile, and a hosted web app.

- Other music servers.

- Offline music downloads or music uploads.

- Tag, metadata, and artwork editing unless explicitly added to scope.

- Visualizers, custom themes, Discord integration, and remote control.

- Playlist sharing and smart playlist editing.

- AI playlist generation and automatically scheduled DJ execution. Manual news generation and spoken previews are included.

- Automatic continuous station selection and adaptive feedback.

Favorites and "less like this" feedback remain candidates for the future station milestone rather than requirements for this first version.

## Acceptance criteria

1. On macOS, connect to the existing Jellyfin server, authenticate, and select accessible music libraries.

2. Browse all songs and albums, search and filter using available metadata, and open item details.

3. Select one or multiple songs and add them to a new or existing playlist. Add an entire album in one operation.

4. Rename an editable playlist, remove tracks, reorder them, and confirm changes in another Jellyfin client.

5. Play a song, album, playlist, or song selection. Verify seeking, shuffle, repeat, queue visibility, background playback, and macOS media controls.

6. Relaunch the app and retain the connection, preferences, and DJ configurations. Restore the previous listening context automatically, paused and ready to play.

7. Open My stations, enter a vibe, and see an honest placeholder state with no simulated generation.

8. Create, edit, duplicate, and delete a DJ configuration. Verify that saved instructions do not trigger automated actions.

9. Handle missing metadata, an empty library, a read-only playlist, an unavailable track, and a temporary server failure with understandable states and useful recovery actions.

## Decisions still open

- Does the app need to edit Jellyfin tags, metadata, or artwork, or only display and filter them?

- Should the My stations placeholder preserve its text between launches?

- Which DJ actions should be supported first when execution begins?

- Which macOS versions and processor architectures must the first release support?

- What library size and playback formats must be used for acceptance testing?

Electron, Vite, TanStack Query, the existing Jellyfin server, OpenAI for news generation, and the `desktop-light/` project folder are decided. Mood-based playlist generation, automatic hosting schedules, and additional speech providers will be defined separately.

Source Page: https://chatgpt.com/space/page_7c3eaab6677c8191abceccbc99513fe5



## Local verification

Use Electron development or production-preview mode for testing. Do not package, sign, notarize, or publish the app as part of routine verification.

### Per-DJ voice previews

- Offer voice preview and explicit regeneration for each saved DJ. First generation uses a fixed short sample with ElevenLabs only and persists the recording locally.
- Replay cached previews across restarts without provider requests or keys. Settings changes mark the cached voice as outdated without automatic regeneration.
- Deduplicate concurrent generation for the same DJ. Persist an attempt marker before dispatch and require explicit regeneration after missing audio, failure, or interruption. Preserve the last successful recording if regeneration fails.
- Keep preview playback exclusive with other previews and music. A delayed generation result must not interrupt a newer playback choice.
