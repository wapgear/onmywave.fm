# Implementation and verification

Updated 15 October 2026.

The app lives in `desktop-light/` and uses Electron, Vite, React, and TanStack Query. The existing desktop app informed Jellyfin integration and playlist behavior. The approved v4 concept guides the light interface, bundled Inter and Manrope fonts, native title bar, and inset player.

## Implemented

- Jellyfin sign-in and music-library selection, with encrypted session storage.
- All songs, albums, title/artist/album search, metadata filters and details, and persistent playback with a queue.
- Server playlists: create, rename, add songs or album tracks, move entries, and remove entries when permitted.
- Saved station text drafts and local DJ configurations.
- Manual DJ news previews from configured RSS/Atom feeds, bounded OpenAI text generation, script/source review, and speech playback over quieter music.
- Explicit speech-engine selection: finite OpenAI speech clips, or experimental GPT-Live-1 recording finalized by the listener. No automatic engine substitution.
- Separate protected OpenAI-key storage, cancellation, bounded feed/provider responses, and token-free media URLs.

## Verified

Type checking, ESLint, and production builds pass. The npm production dependency audit reports zero vulnerabilities.

Manual checks against the configured Jellyfin server covered sign-in, library selection, artwork, browsing 475 songs and 424 albums, direct playback, seeking, navigation during playback, and paused restoration after restart. Playlist creation, adding selected songs, renaming while retaining entries, and editable detail views passed in the app. Focused service checks also covered duplicate skipping, entry movement and removal. Temporary verification playlists were cleaned up; the existing music playlist was preserved.

DJ creation, saving, duplication and deletion passed. The packaged app opened through its production `wave-app` protocol, restored the encrypted connection, retained the DJ and station draft, and offered paused session restoration. Artist search for Slava KPSS and album search for Ангельское True both returned Benzo in the packaged app. The library reconnected after a temporary offline state.

The user approved complete speech clips for the initial test and any general news selection. Evening host now has BBC World RSS, English delivery, a warm radio-host personality, 3–5 stories, coral voice, and 20% music level. Reopening the editor confirmed these settings were saved. The feed was reachable and contained 29 stories when checked. Missing-key state prevents news generation and explains the required setup.

The local arm64 macOS bundle built and signed successfully at `release/mac-arm64/onmywave.fm Light.app`. It has not been notarized. Search union, deduplication, totals, sorting, pagination and filter scoping also passed focused service verification.

## Live DJ demo verification

The supplied key was used through hidden process input; no key was saved in the repository. The earlier multi-story reporter-style artifact was replaced after the user's direction changed to one brief, lively music-host intervention near the track end.

Current generation uses exactly one selected source, a 25–45 word target with a 55-word hard cap, bounded Jellyfin metadata resolved from songId, and DJ music preferences. Text and speech prompts describe conversational delivery matching the musical style. The saved upbeat disco/funk demo is 13.92 seconds and its TV-culture fact was checked against the source feed. The MP3, transcript and source metadata are under `src/renderer/public/demo/`.

Steve and Elena independently proposed the track-bound scheduler, challenged readiness and end-of-track races, then implemented and reviewed it. Root chose to finish a short voice tail over silence if music unexpectedly ends; Elena preferred fading speech out and advancing immediately. The normal path reserves time for speech within the closing track seconds. Review also found and fixed premature fade-up before next-song buffering completed, and session restoration failing to cancel an old intervention.

Testing uses local Electron only. The signing job was cancelled at the user's request; no application was published. Earlier release bundles are not the verification target.

Manual verification in local Electron: scheduling at 0:06 waits rather than speaking; pausing preserves waiting; seeking cancels it. Re-arming Funkytown at 7:03 waits until its closing seconds. The short voice was on air at 7:39, active pause/resume passed at 7:45, and the queue advanced once to Gortoz a ran. Typecheck and ESLint pass. The final saved demo is 13.92 seconds; narration style remains a listener-review choice.

## Remaining verification

Read-only server permissions, unavailable tracks, converted-audio seeking, hardware media controls and all display scales still need broader manual coverage. Local macOS packaging is available; public distribution and notarization are separate release work.

Automatic DJ scheduling and AI station playlists remain future scope. Metadata and artwork editing are not implemented.


## Desktop interaction review, October 15, 2026

Steve and Elena independently reviewed playback, navigation, scrolling, selection and forms, then challenged the proposals. The decision preserves the approved warm accent and floating player while adopting familiar Music controls. The queue remains a native dialog. Browsing state is lifted into the shell; server entities remain in the query cache. Each page, inspector and dialog owns its own vertical scrolling.

Changes include centered transport above the scrubber, remaining time, visible range fills and mute state, queue occurrence playback, bounded shuffle history, pending-play intent guards, scoped playback/search shortcuts, row range and keyboard selection, native dismissible popovers, URL-aware artwork fallback, and protected station draft edits. Playback notices occupy a separate shell row so they cannot cover list actions. Settings now accurately describes manual AI previews.

Verified in local Electron against the connected Jellyfin library: all six main sections at 960×640 without horizontal overflow; 1280×800 layout; album detail retained across section navigation; Songs scroll restored to 900 after visiting Settings; Shift range selection and menu Escape/focus return; real muted audio loading and advancement, pause, direct seeking, and queue jumping. The long DJ editor scrolls at 960×640 with close and final actions reachable. The bundled 13.92-second demo entered speaking near the track end, controlled both music and speech on pause/resume, and Stop DJ retained the song. No paid generation was invoked.

A separate browser renderer with an in-memory bridge and real bundled audio verified delayed preparation followed by pause, resume, paused seeking, shuffle exhaustion and backward/forward history, repeat-one on natural end, manual Next during repeat-one, repeat-all wrapping, duplicate queue occurrences, removal before the current occurrence without a reload, search focus, offline feedback, and playback error/retry. A 1600×1000 check found no horizontal overflow or controls outside the window. These fixture checks do not verify Jellyfin transcoding or remote write permissions.

Typecheck, ESLint and production build pass. Hardware media keys, actual converted-audio seeking, all display scales and subjective audible transition quality remain outside this pass. Playback was muted during verification. No packaging or publishing was performed.

## Catalog and scrolling revision, October 15, 2026

This revision supersedes the warm-yellow palette and paginated catalog described above. Anton requested the same infinite browsing behavior for All Songs and Albums. Both now use React Query infinite queries and TanStack Virtual, with bounded mounted content, preserved loaded results after next-page errors, inline retry, and no page-number controls. Server requests remain paged internally at 80 songs or 48 albums. Search and filter changes create separate cached result sets and reset the viewport; playback and selection operate on the complete loaded song set.

Steve owned album loading/virtualization; Elena owned song virtualization, shared filters, Settings and LibraryChooser. Independent proposals considered an overlay drawer, which preserves grid columns, and a docked drawer, which keeps background controls visible to keyboard focus. The coordinator chose the docked layout. Details and Playing Next are mutually exclusive in the same slot. Main content remains wheel/keyboard scrollable while its scrollbar is visually suppressed; the drawer has its own thin scrollbar. The floating player remains above both regions. Album resizing now preserves the visible album and focused tile rather than preserving only pixel offset.

The table header is flush at the top of the scrollport, with a distinct neutral background and 34px height. Header cells stay above the macOS drag region. Scrollbars share custom narrow rounded thumbs. Neutral surfaces, restrained red actions/focus indicators and quiet gray selection replace the yellow styling. Settings uses aligned account rows and simple library checkboxes with a selected count; unchanged selections cannot be saved and controls are disabled during saving. Saving libraries keeps Settings open, resets catalog browsing state, and no longer revokes same-account active media resources.

Genre, Tag and Sort share searchable, scrollable native popovers with a common chevron and keyboard behavior. Genre/tag values now come from all selected libraries via Jellyfin's authenticated library-scoped [legacy filter endpoint](https://github.com/jellyfin/jellyfin/blob/master/Jellyfin.Api/Controllers/FilterController.cs), rather than the visible song page. Typed custom values and clearing are supported. The connected library returned 167 genres and zero tags during this pass.

Verification in browser fixtures with 5,000 albums and 5,000 songs: album mounting stayed at most 50 tiles while loading over 1,600 records, song mounting stayed about 27 rows while loading over 1,100 records, and physical song rows measured 56px. Song selection and a 30,000px scroll position survived Settings navigation. Album detail/back retained a 20,000px position and focus. Opening/closing the drawer preserved the first visible album during column changes; resizing to 960×640 retained the focused tile fully in view. Arrow traversal kept song rows above the player. Filter lists with 167 options scrolled, supported Home/Escape, applied a genre to the actual query and cleared it. Next-page failures preserved loaded songs/albums and recovered through Retry. Settings fixture saves locked editing, applied selected IDs and stayed on Settings. Drawer content switches start at the top; Escape without an open drawer leaves search focus alone.

Local Electron checks used the real Jellyfin server: subsequent pages loaded for both songs and albums, no pagination remained, and the Playing Next drawer showed 79 upcoming songs beside the library with no modal or second visible scrollbar. Muted playback loaded successfully and was left paused at its prior volume. Build, typecheck and ESLint pass; the production dependency audit reports zero vulnerabilities. No paid generation, packaging, publishing or unit-test framework was introduced. Large multi-library server pagination still uses the existing prefix aggregation strategy; renderer virtualization does not change that server-side cost.


## Prepared Listening Room, October 15, 2026

Reviewed `dj-demo`'s THE DJ LISTENING ROOM, variant library, and server file persistence rather than its landing page. Independent frontend proposals and backend reliability review led to one saved room with Sources, DJ, and Station mood. This reuses the saved vibe and DJ editor without introducing station CRUD or playlist generation.

Steve implemented named feeds, a focused DJ editor, and protected provider-key controls. Boris implemented source migration, queued configuration updates, staged IPC, durable scripts/takes, request reconciliation, and the prepared-audio protocol. Elena implemented audition, selection, provenance, and scheduling. Root integrated room configuration, saved drafts, reviewed-text rendering, progress/cancel, changed-setup notice, and navigation-safe draft guards.

Text preparation explicitly saves setup and reads selected feeds independently of any song. Audio generation renders reviewed text with a finite provider. Matching takes can be reused; another variation requires an explicit action. Completion never auto-selects or auto-plays. Original script provenance remains separate from the DJ used to render audio. Legacy live settings remain readable without silent provider conversion.

The main process persists requests before dispatch, joins identical active requests, rejects conflicting reuse, and reconciles completed IDs before resolving current settings. MP3 files and take metadata survive interrupted manifest publication. Late cancellation during durable publication preserves completed audio. Interrupted requests do not automatically dispatch again. Provider charging exactly once cannot be guaranteed across a lost response.

Verification used an isolated renderer bridge with mocked providers and the actual bundled 13.92-second MP3. Opening, saving setup, choosing a take, auditioning, playing music, and scheduling made no generation calls. Text/audio actions invoked only their intended operations and retained the favorite without a current song. Audition paused music; main resume and navigation stopped audition. Scheduling loaded the selected take and waited near track end. At 960×640 the room had no horizontal overflow. Delayed text completion preserved newer edits and remained accessible through Saved draft. A read-only real Electron check confirmed existing feed migration, DJ selection, and saved mood.

Focused service checks covered concurrent duplicate requests, changed-input rejection, replay after settings changes, restart persistence, selected take retention, missing files, path validation, interrupted request refusal, cancellation during disk publication, recovery after omitted manifest publication, and ElevenLabs rendering without an OpenAI key. Build, typecheck, and ESLint pass. No paid generation or publishing occurred. Live provider output and subjective audible quality remain unverified in this pass.

## Scheduled workflow plan and UI, October 15, 2026

Anton requested a periodic workflow rather than a manual text/render sequence and chose execution while the app is open. The plan is recorded in `docs/LISTENING_ROOM_WORKFLOW.md`. Steve preferred implementing a real local scheduler as the complete future behavior, then accepted this plan-plus-UI phase with the reservation that it must never appear active. Elena and Boris supported a saved draft with prominent Not running yet status. Root chose that scope for this request. No LangChain dependency was added; the planned bounded TypeScript workflow can later move to LangGraph if its branching and recovery requirements justify it.

The UI now starts with content, DJ/mood, and rhythm. It saves a future cadence of one, three, or six hours, an importance preference, a daily news clip cap, and optional weather city/time/timezone/units. Calendar and reminders are labelled future integrations. The primary action saves a workflow draft atomically with room sources/DJ and mood. Existing manual generation remains under collapsed manual tools; actual saved takes remain accessible. Planned importance/cadence/clip settings do not govern manual generation. The UI explicitly discloses this.

Boris owns shared configuration, validation, migration, preload and atomic save. Steve owns the three-step UI. Root owns the workflow plan, vocabulary, integration and runtime checks. Elena reviewed actual changes and identified pending configuration lost during management navigation and hidden weather validation after disabling weather. Steve fixed both, lifted configuration edits into the shell, pruned removed selections, and guarded saves against clearing newer edits. Elena confirmed the fixes in source.

Backend configuration checks used the actual IPC handler and storage with temporary app data: legacy normalization, atomic save, restart persistence with existing DJ/playback intact, and invalid cadence/cap/importance/city/time/timezone/IDs/mood rejected without disk changes. No provider calls were made. Renderer fixture checks confirmed weather city validation, hourly/weather saving, saved-state restoration after navigation, selected-take preservation, unchanged generation counters, and Load script opening manual tools with editor focus. Real Electron read-only checks confirmed migration defaults and the 960×640 layout without horizontal overflow.

The runner, importance assessment, weather lookup and activation are not implemented in this phase. The existing manual service always selects a story and must be split into collection, deduplication, assessment with a no-story outcome, and writing from the approved immutable snapshot before unattended use. A timer wrapping manual generation would not meet the requested behavior. The plan defines startup/resume coalescing, daily limits, independent morning weather, source provenance, costs, and interruption handling. Playback will continue to use complete saved files with no synthesis on demand.

Final workflow UI verification replayed both review fixes: an unsaved Barcelona weather city survived Manage DJs navigation; clearing morning time, entering an invalid timezone, then disabling weather restored valid hidden values and saved successfully. The selected take and provider counters were unchanged. The final production build, TypeScript check, and full ESLint pass.


## Automatic listening-session restoration, October 15, 2026

Replaced the opt-in session banner with automatic startup hydration. The queue, current occurrence, position, volume, shuffle and repeat return directly to the player, paused and ready. Song hydration skips not-found tracks, retains the saved snapshot on temporary failures, and exposes Retry even before a current song exists. Generation guards prevent delayed startup results from replacing a newer explicit selection. Saved playback settings apply before track hydration, preserving subsequent user adjustments. The obsolete resume/dismiss controls and banner styling are removed.

Verification with the actual PlayerProvider under React StrictMode and real local audio covered duplicate queue occurrences, position restoration at 7 seconds, seek/save/remount at 9 seconds, missing-track index adjustment, an explicit new selection during delayed hydration, and offline failure followed by successful Retry. The real Electron app automatically restored Benzo by Slava KPSS at 3.1 seconds, paused, without the banner. Build, typecheck and full ESLint pass. No provider requests or packaging.


## Checklist and configuration tabs, 15 October 2026

Listening Room now defaults to an actionable setup checklist, with News, Host & mood, Prepare, and Saved audio tabs. Steve and Elena independently recommended hiding whole page sections and keeping Listening Room as the active setup editor; Morgan chose that approach. Existing source, DJ, and credential management remains in Settings. Planned news automation and morning weather have their own Settings tabs. The shared tab control supports arrow keys, Home/End, roving focus, and linked tab panels.

Implementation keeps inactive panels mounted so switching tabs preserves editing and audition lifecycles. Preparation progress and cancellation remain visible across tabs. Unsaved setup has a save action outside editing tabs. Saved audio stays accessible with incomplete setup. Optional news interests do not count as missing; mixed RSS/Hacker News sources can prepare without a Twitter key while the checklist still identifies missing Twitter access.

Verification used isolated fixture data, with no provider charges or personal settings changed. Browser checks covered checklist navigation, editing across tabs, saving setup, keyboard arrow navigation, preparing and reviewing a fixture script, draft preservation through Saved audio, planned preference drafts and saving, and access to Saved audio with an incomplete setup. Build, TypeScript, and ESLint passed. Live provider output and actual audio audition were not exercised for this UI change.


## Saved room configurations and Twitter setup (2026-10-15)

Outcome: keep multiple named configurations and choose one for manual preparation. Room profiles contain source/DJ IDs, mood, news interests, and workflow preferences. Migration retains the previous singleton setup in My room, including incomplete setup. Local-state writes synchronize the active profile; global source and DJ deletion cleans references across all profiles. Script drafts, recordings, selected take, and playback stay independent.

Decision: Steve and Elena proposed named profiles independently. Steve initially preferred explicit snapshots separate from preparation saves; Elena favored a synchronized active projection. After challenge both accepted the active projection, with the UI stating that preparation saves setup. Save as new creates an inactive copy, and switching with unsaved renderer edits offers save, discard, or cancel. Incomplete setup may be saved, while preparation retains readiness requirements. No background execution is enabled.

Ownership: Steve implemented shared contracts, storage, IPC validation, and preload methods; Elena implemented the room picker and save/switch flow; Morgan added reusable Twitter help, integrated changes, and verified them. Twitter help explains developer setup, which credential to copy, access and credit requirements, and links to official documentation from both provider keys and source editing.

Validation: production build/typecheck and full ESLint passed. Isolated real-filesystem storage checks covered legacy migration, inactive copies, active synchronization, activation and reload persistence, source/DJ deletion across profiles, and unchanged playback. Browser fixture checks covered naming a copy without activating it, switching to incomplete setup, save-before-switch and restoration, and Twitter help in both locations with correct external-link routing. No live paid provider request or native Electron playback check was made.

## DJ creation modes, 15 October 2026

Create a DJ now begins with Predefined, Simple, and Advanced tabs. Predefined stages five personality presets and Man/Woman voice choices, using the existing demo voice catalog. Apply preset explicitly replaces personality, description, voice and delivery while retaining other host preferences and any entered name. Simple calls ElevenLabs v2 account voice search through a validated main-process IPC method, returns named provider results, and applies the chosen voice ID plus the entered host description. It uses provider keyword search, without semantic prompt interpretation or voice generation. Existing hosts start in Advanced; switching modes preserves draft settings.

Steve and Elena independently proposed provider search for both preset and prompt discovery. In the challenge round both accepted fixed local preset mappings so the easiest creation path can save without a key or search request, with a reservation about provider voice access. Morgan implemented the change and chose explicit Apply preset and result selection. Elena reviewed the artifact and found no actionable issues. Fixed voices use existing demo IDs; account access and subjective delivery remain unverified with a live provider.

Verification: a fixture-backed browser flow covered all five presets with both voice choices, preset save/reopen, editing, preservation across modes, keyboard tab navigation, successful search selection and persistence, empty results, missing-key errors, and small-window layout. A separately bundled final editor passed visual and save-flow checks at 1000px and 480px, including updating a manual voice after preset selection. Focused TypeScript and ESLint checks passed for the editor, shared contract, preload and main integration. Initial full build and lint passed before unrelated concurrent Listening Room edits; final full build/typecheck/lint are blocked by mismatched JSX tags in Stations.page.tsx around lines 206–219. That page was not changed for this task. No live ElevenLabs request, paid generation, or personal configuration write was made for verification.
