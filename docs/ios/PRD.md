# onmywave iOS product requirements

Draft for implementation planning, 21 October 2026. Product owner: Anton. Implementation plan: [Expo and shared code](IMPLEMENTATION_PLAN.md).

Build an iPhone music player in React Native with Expo that preserves the current desktop's music and personal radio capabilities in an interface designed for iOS. Share portable TypeScript rules with Electron and extract reusable service logic incrementally. Existing Electron storage, media transport, scheduling and browser playback require platform adapters. Build phone screens and native integrations separately.

The fastest proposed release uses direct Jellyfin access and local, user-supplied provider keys. It needs no onmywave account or hosted backend. Its material difference is that news preparation runs while the app is active and pauses in the background. This is a proposed platform adaptation requiring Anton's decision before release, not an accepted reduction of the parity goal. Reliable unattended preparation requires the backend option in the implementation plan.

## Users and outcomes

The first audience is a listener who already has a Jellyfin music library and wants it on their iPhone, including optional prepared DJ news. Music must work without AI keys, a subscription, a news setup, or an onmywave cloud account.

The listener can connect, choose libraries, find music, start a queue, lock the phone, and keep listening. They can maintain server playlists, read lyrics, configure personal radio, and hear saved news without generating anything during playback.

The music-only milestone is an internal delivery checkpoint. It does not complete this PRD. Final release scope includes rooms, sources, DJs, provider settings, news preparation, saved audio, and DJ delivery.

## Desktop baseline

The source baseline is desktop-light commit `88e62183af980467f09ad5f1a1bd176db317e6d6`. Existing uncommitted desktop work is outside this document's baseline. The current implementation, [app guide](../APP_GUIDE.md), [requirements](../../REQUIREMENTS.md), [radio scenarios](../RADIO_EXPERIENCE.md), and [workflow contract](../LISTENING_ROOM_WORKFLOW.md) define the behavior to carry forward. Desktop verification does not establish iOS correctness.

| Capability | Required iOS behavior | Adaptation |
| --- | --- | --- |
| Jellyfin connection | Server URL, sign-in, accessible music libraries, secure saved connection, account switching and expiry recovery | Native forms and local-network guidance |
| Songs and albums | Search, song sorting, genre/tag filters, paged catalog, artwork, album detail and refresh | Lists and artwork grids instead of desktop tables |
| Playlists | Browse, create, rename, add songs, remove occurrences and reorder when permitted | Edit mode and action menus; preserve duplicate-entry identity and uncertain-write recovery |
| Listening queue | Play now/next/later, reorder/remove/clear, shuffle, repeat, seek and restore paused | Native player, persistent mini-player and queue screen |
| Lyrics | Timed highlighting and line seeking, manual scroll/follow, plain-text fallback and separate error states | Now Playing destination; VoiceOver and Reduce Motion support |
| Rooms | Named profiles, combined setup draft, save/copy/switch, preparation opt-in and status | News tab with saved content and a setup screen |
| Sources | RSS/Atom, Hacker News and X configuration, validation and affected-room warnings | Shared management under Settings |
| DJs | Reusable identities, avatar, personality, language, simple/advanced voice setup, voice search and previews | Native editor screens; retain bundled keyless auditions |
| Provider keys | Save/remove/status for OpenAI, ElevenLabs and X | iOS Keychain; music remains independent |
| News preparation | Source checks, editorial assessment, script/audio creation, caps, history, partial coverage and recovery | Active-app scheduling proposed; no hourly promise during suspension |
| Saved news | Scripts, reviewed articles/source links, takes, missing-file states, auditions and selected take | Local durable files and metadata |
| DJ delivery | Song interval, eligible fresh takes, no automatic repeats, both transition placements, seek retention and adjustable voice level | Native audio scheduling must pass the device gate |
| Transition previews | Keyless sample music/voice preview, draft timings and stop rules | Native audition using the same playback service |
| App settings | Account/libraries, playback, transitions, sources, DJs, keys, data recovery and version | App Store updates replace Electron's updater |

AI playlist generation, weather, calendar and reminders remain future features because they are not implemented desktop capabilities. Android, CarPlay, widgets, Siri integration, offline music downloads, multi-server concurrency, and cross-device queue/profile/audio sync are outside this release. Jellyfin playlists already live on the server; this does not imply local app settings synchronize.

## iPhone navigation and presentation

Use four stable destinations: Library, Playlists, News, Settings. Library contains Songs and Albums with search and filters in context. Each tab retains its own navigation state. Sources, DJs and provider keys remain shared settings; room-specific preparation stays in News. Apple recommends stable, labeled navigation tabs rather than action buttons. [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)

A mini-player sits above the tab bar when a song is selected. Tapping it opens Now Playing with artwork, title/artist, transport, scrubber, shuffle/repeat, queue, lyrics and DJ controls. Queue and Lyrics are secondary player destinations; opening them never changes playback. Preserve the orange brand accent and cover art. Use system typography, semantic colors, native navigation bars, sheets, alerts and action menus. Avoid recreating the desktop sidebar, title bar or dense song table.

Settings forms use clear section names and standard controls. Rooms offer one combined draft and Save action. Switching a dirty room offers Save and switch, Discard and switch, or Cancel. Prevent gesture dismissal during a committing write. Async completion must not unexpectedly move VoiceOver focus or reopen a dismissed screen.

Product accessibility requirements are at least 44 by 44 point interactive targets, Dynamic Type through accessibility sizes, VoiceOver names/values/actions, adequate contrast, non-color status cues and Reduce Motion. Supply alternatives to swipe/drag operations for queue and playlist edits. Seek exposes adjustable accessibility actions. With large text, controls reflow or scroll instead of clipping. Validate these against [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility) during design review.

Support light and dark appearance, safe areas, keyboard avoidance, interrupted form edits, small supported iPhones and landscape playback. The minimum iOS version follows the selected stable Expo SDK and is recorded in the first implementation milestone. iPad-specific layouts are a later scope; any device family included in the build still needs a usable layout.

## Account and music requirements

Assign a persistent installation identity independently of account identity. Preserve the desktop's session ordering rules: late work from an old authentication cannot replace a newer session, invalidate it, or restore removed credentials. Library selection does not create a new authentication. Signing out cancels pending account changes, music and new preparation. Provider keys remain app-local across music accounts, matching desktop behavior; entered key drafts clear on account changes.

Secure-store failures must never fall back to plaintext secrets. Offer explicit session-only connection where feasible and explain that relaunch requires sign-in. Distinguish unavailable server, permission denial, expired credentials, invalid configuration and transport security failures. Keep drafts and offer an appropriate retry.

Playlist edits honor server permissions. A timeout after a mutation may mean it succeeded. Persist recovery markers, require a fresh server read and listener review, and never replay an uncertain write on startup. Duplicate songs use playlist-entry identities rather than song IDs. Refresh does not replace the queue or discard search, selection and drafts.

Cold launch restores the saved queue, current occurrence, position, shuffle and repeat paused. Missing songs may be removed after a definitive response; temporary network failure preserves the session for retry. System output volume follows iOS controls; the independent DJ voice mix remains configurable. Desktop volume values must not overwrite the phone's system volume.

## Playback and DJ requirements

Native audio owns playback progression while the phone is locked. App navigation and React component unmounting must not stop music. Support background queue continuation, lock-screen and Control Center metadata/transport, headset commands and normal Bluetooth/system route selection. Expose the system route picker where supported. Do not build a desktop-style output device selector.

Calls, Siri and route changes must never create duplicate playback or restart an old DJ take. Headphone disconnection pauses playback. Resume after an interruption only when the system permits it and the listener has not subsequently paused or changed playback. Force quit ends playback; reopening restores paused.

Preserve direct-play and Jellyfin-converted playback with accurate duration and seek offsets. Do not assume desktop codec behavior carries to AVFoundation. Authenticated audio/artwork requests must not leak tokens through URLs, logs, remote metadata or cross-origin redirects. Network loss exposes recoverable state and retains the queue. Read retries cannot become playlist writes or generation requests.

DJ behavior must retain the desktop rules, including:

- Only natural song completions count toward the configured interval. Skips, retries and seeking to the end do not count. Repeat-one natural endings do count.
- Playback consumes saved fresh takes for the chosen room. Enabling DJ or reaching an interval never starts provider generation. No available take means music continues.
- Reserve a take and its canonical article URLs durably before placement. Persist delivery-start intent before invoking speech. Uncertain delivery remains excluded from automatic replay; explicit audition remains available.
- Preserve Over music and Between songs placement, fade/gap preferences, independent speech level, complete speech and waiting-state feedback. A take that cannot fit a suitable ending must not be truncated.
- Pause freezes the active break. Skip, track replacement and account changes cancel old placement. Preserve the current Keep the DJ when seeking behavior, including retained remaining speech after rewind, using the desktop scenarios as the acceptance reference.
- Audition and keyless transition previews stop conflicting playback as on desktop and never resume music automatically or alter delivery history.

These are release requirements, not claims about Expo Audio. Native queues alone do not prove reliable overlapping music and speech. If the device spike requires a small Swift Expo module for timed mixing and delivery persistence, that module is part of the scope. Removing background DJ behavior is a product change, not an implementation shortcut.

## Preparation lifecycle and paid requests

The proposed local release retains automatic checks while the app is active. It does not add a manual script editor or manual generation workflow to replace desktop automation. Enabling or resuming a saved configuration authorizes due checks subject to existing intervals and daily caps. Incomplete setups may save with preparation off. Playing music, a take, or a bundled preview never authorizes paid preparation.

On background entry, stop starting source/model/speech work, persist run identity and stage, and request cancellation of active work. A request already sent may incur charges. On return, show whether a run completed, was interrupted, or has an uncertain provider outcome. Never automatically repeat a submitted paid request after uncertain termination. Completed local audio commits once; incomplete files never become ready takes. Explicit Resume is required after interrupted-run recovery. No burst of missed hourly checks runs on return.

Display "Preparation paused while the app is in the background", the last check time, coverage warnings, next eligible active-app check and daily usage. An OS background task is optional best-effort work, not the source of an hourly guarantee. iOS schedules such tasks at its discretion and can interrupt them. [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)

If unattended preparation is required, ship a backend worker with the same authorization, caps, deduplication, uncertainty and history contracts. Push notifications do not themselves provide reliable scheduling. This choice must settle before describing release parity or committing to a delivery date.

## Data and privacy

Jellyfin owns catalog and playlists. The phone owns queue state, settings, rooms, source definitions, DJ definitions, preparation/review/delivery history and saved audio. Keep secrets in Keychain-backed storage, metadata in a versioned transactional local database and complete recordings in durable app files. Cache artwork separately. A missing audio file does not erase its provenance or history.

Expose local storage usage and deliberate removal of recordings/app data with clear consequences. No automatic transfer of desktop local data or shared Keychain entries is implied. The phone requires its own setup; any future import must use a validated schema and exclude secrets by default.

Music opens even if news storage recovery fails. Block new generation/claims until repair succeeds, preserve existing files, and offer a single durable recovery notice. Retry repairs local state without repeating provider calls. Sign-out pauses preparation and retains local rooms/takes as desktop does; deleting local data is a separate explicit action.

Before enabling AI, explain what source content, preferences and optional listening context go to OpenAI, and what scripts/voice settings go to ElevenLabs. Obtain explicit consent for the disclosed sharing; show third-party source access and potential provider charges. Never bundle developer provider keys or put secrets in public Expo environment variables. Review privacy labels, provider terms and review access before submission. [Apple App Review Guidelines, privacy and third-party services](https://developer.apple.com/app-store/review/guidelines/)

## Release acceptance

| ID | Scenario and observable pass condition |
| --- | --- |
| IOS-01 | Fresh install signs into a disposable Jellyfin account and explicitly selects accessible libraries. Music plays with no AI keys. Denied local-network permission offers recovery. |
| IOS-02 | Search, sorting, filtering, album browsing and refresh match the server catalog; navigation preserves browsing state and the active queue. |
| IOS-03 | Create/edit playlists with duplicate occurrences, permission denial and injected timeout. Uncertain mutations require read/review and never repeat after relaunch. |
| IOS-04 | A 60-minute physical-iPhone session crosses at least ten track boundaries while locked. Metadata, pause/resume, next/previous and seek remain correct from remote controls. |
| IOS-05 | Call/Siri interruption, headphones removed, Bluetooth change and Wi-Fi loss/recovery preserve user intent. No unsolicited resume or duplicate completion is observed. |
| IOS-06 | MP3, AAC/M4A and FLAC/other server-converted fixtures play and seek against known audible markers. Target seek error is at most one second where the stream supports seeking; unsupported cases explain the limitation. |
| IOS-07 | Process termination then relaunch restores paused at the checkpoint with stable occurrence identity. Deleted songs reconcile; offline restoration retains intent. Target checkpoint loss is at most five seconds during normal playback. |
| IOS-08 | Timed/plain/missing/malformed lyrics, seeking and manual-follow work without starting playback or following speech. |
| IOS-09 | Room/source/DJ/key management preserves drafts, validation and confirmed save state across navigation. Simple/advanced voice setup and bundled/provider previews behave distinctly. |
| IOS-10 | Fixture preparation covers selected/no-story/partial-source/failure/cap outcomes. Background termination at each paid stage cannot double-submit or falsely mark audio ready. A separately authorized live run validates provider transport before release. |
| IOS-11 | Both DJ placements pass audible foreground and locked-device sessions, including natural endings, skip, repeat-one, retained seek, pause and uncertain delivery recovery. Interrupt a locked-device transition at speech start and during speech with a call and route change; verify pause intent, complete remaining speech and no duplicate delivery. Automatic playback never repeats a claimed take. |
| IOS-12 | VoiceOver and largest supported Dynamic Type allow sign-in, browse/play, queue/playlist editing and room setup without clipping, inaccessible actions or stolen focus. Reduce Motion disables animated following. |
| IOS-13 | Logs, SQLite, URLs, exports and remote metadata contain no credentials. Sign-out and stale-auth races preserve the currently committed account. News corruption does not prevent music. |
| IOS-14 | TestFlight installation/upgrade preserves state and recordings. Reviewers receive a working legal demo catalog and instructions covering optional AI, keys, background playback and scheduling limits. |

Performance targets for implementation verification are a usable shell within two seconds of warm launch and four seconds of cold launch, and audio start within three seconds on a controlled healthy Wi-Fi/Jellyfin fixture. Record device, OS, library size, server and network conditions. These are proposed targets, not measured desktop baselines. Use a 10,000-song fixture to assess list responsiveness and bounded paging.

Release requires every parity row and acceptance scenario to pass or an explicit product decision on the exception. Screenshots, simulation and a successful build cannot replace audible device evidence. Deferred desktop features do not become mobile commitments.

## Decisions still required

1. Choose active-app automatic due checks that pause on background, without adding a manual Prepare flow, or backend execution for unattended checks. The former is the only planned capability reduction; the latter changes scope and estimates.
2. Confirm the minimum iOS version/device range after the SDK/audio spike, and confirm whether iPad is included in the first App Store listing.
3. Resolve distribution rights for the existing GPL-3.0-only code, dependencies and bundled media before App Store submission. Source publication alone must not be assumed to settle distribution compatibility.
4. Confirm the optional BYOK AI flow and any future monetization against current provider and App Review terms. This plan introduces no subscription, billing flow or embedded service key.
