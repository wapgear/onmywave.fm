# Observable acceptance checklist

Opened 16 October 2026 from the current REQUIREMENTS and RADIO_EXPERIENCE contracts. This is the working inventory for requirement-by-requirement review, replacing the seven parent gates as the level at which evidence must be assessed. The parent gates and 27 STAR stories remain mandatory. This checklist does not replace or reduce either source document.

Each row is one observable contract. A row with variants passes only when every named variant is supported. Do not split easy variants to improve a score or treat a sampled page as every page. A candidate evidence record alone is not a current pass. Changes to this inventory must cite a changed or previously omitted source requirement and preserve its history.

Statuses:

- **Review**: inspect the existing implementation and evidence, then replay missing or stale behavior. This does not assert the behavior is absent.
- **Dated**: a specific controlled result is in the state-polling record; confirm its exact scope and affected-source freshness before assigning acceptance.
- **Recorded**: relevant controlled evidence exists in the response-deadline record or detailed acceptance audit, but additional row scope remains to review.
- **Controlled**: the directly reviewed dated runtime evidence covers this row against its recorded source snapshot. This establishes controlled engineering behavior, not live-server or usability acceptance.
- **Live**: the directly reviewed dated evidence covers this row on the named live server/runtime; other environments and listener usability require separate proof.
- **Deferred**: Anton explicitly postponed this check; retain its contract and historical evidence for later, exclude it from current completion claims, and do not rerun it during this goal.
- **External**: named live-server, OS/hardware or listener evidence is still required. Existing controlled evidence may cover a subset.

Proof codes: I source/artifact inspection; N actual native renderer/main/preload interaction; S actual service/storage/fault integration; L connected live source/server/provider; O actual operating-system/hardware behavior; U observed listener or audible-quality session. Combined codes require each applicable kind; they are not interchangeable alternatives. Temporary fixtures stay outside the repository and add no unit-test requirement.

Evidence entry points are [the detailed audit](UX_ACCEPTANCE.md), [the corrected state-polling record](verification/2026-10-16-state-polling.json) and [the complete-response deadline record](verification/2026-10-16-response-deadline.json), and [the native-font record](verification/2026-10-16-native-fonts.json), and [the music-browsing record](verification/2026-10-16-music-browsing.json), and [the DJ-recovery record](verification/2026-10-16-dj-recovery.json), [dialog-heading record](verification/2026-10-16-dialog-headings.json) and [live Jellyfin record](verification/2026-10-16-live-jellyfin.json), and [album-artist search record](verification/2026-10-16-album-artist-search.json), and [device-identity record](verification/2026-10-16-device-identity.json), and [connection-publication record](verification/2026-10-16-connection-publication.json), [first-DJ setup record](verification/2026-10-16-first-dj-setup.json), and [player DJ setup record](verification/2026-10-16-player-dj-setup.json), and [live-playlist record](verification/2026-10-16-live-playlists.json), and [live playlist-additions record](verification/2026-10-16-live-playlist-additions.json), and [playlist-occurrence record](verification/2026-10-16-playlist-occurrences.json), and [playlist-permission record](verification/2026-10-16-playlist-permissions.json), and [source-setup record](verification/2026-10-16-source-setup.json). The [HN coverage record](verification/2026-10-16-hn-coverage.json), [X coverage record](verification/2026-10-16-x-coverage.json) and [live source collection record](verification/2026-10-16-live-news-sources.json) add dated source evidence. The [source-deletion record](verification/2026-10-16-source-deletion.json) adds native multi-profile cleanup and warning evidence. The [listening-controls record](verification/2026-10-16-listening-controls.json) adds native duplicate queue, shuffle/repeat and restart evidence. The [restore-options record](verification/2026-10-16-restore-options.json) adds failed-startup persistence and option-only recovery evidence. The [account player-options record](verification/2026-10-16-account-player-options.json) adds native account-switch, restart and migration evidence. The [playback load-recovery record](verification/2026-10-16-playback-load-recovery.json) adds current native late-load and controlled recovery evidence. The [unknown-duration record](verification/2026-10-16-unknown-duration.json) adds native elapsed-time, seek-availability and finite-total recovery evidence. The [endpoint cadence record](verification/2026-10-16-endpoint-cadence.json) adds current native repeat/queue/intent and visible DJ countdown evidence. The [retained DJ-break record](verification/2026-10-16-retained-dj-break.json) adds native placement, active-rewind/resume and late-start evidence. The [DJ handoff record](verification/2026-10-16-dj-handoff.json) adds 52 native natural-ending cases and preserves an unresolved debugger-associated shutdown diagnostic under Q10. The [current live-player record](verification/2026-10-16-live-player-current.json) adds current controls, occurrence metadata and real server conversion/seek evidence. The [profile drafts and status record](verification/2026-10-16-profile-drafts-status.json) adds complete profile navigation/switch, atomic-write recovery and truthful cached-status evidence. The [automatic-controls record](verification/2026-10-16-automatic-controls.json) adds current native defaults, cap/reset, reserved-run, cancellation and explicit-resume evidence. The records retain their original hashes; later edits never refresh a dated hash without a new run.

The inventory is provisional until every source paragraph and STAR result is reconciled against it. No overall percentage is calculated yet. Human usability and live/OS coverage remain separate from controlled engineering coverage. Every critical invariant must pass regardless of a future percentage.

Current acceptance baseline, requested by Anton on16 October2026:1280×720 at normal100% app zoom. Smaller-window and enlarged-zoom checks are postponed. Existing behavior and historical evidence stay; do not repeat or expand deferred checks. V14/V15 remain as future-work rows.

Current inventory: 187 rows, 185 active and 2 explicitly deferred. 42 Review, 8 Dated, 3 Recorded, 108 Controlled, 15 Live, 9 External, 2 Deferred. These are review dispositions, not an acceptance percentage.

## Platform, scope and presentation

Source: REQUIREMENTS: Product scope, Visual design, Project folder and stack.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| V01 | macOS Electron app in desktop-light remains separate from desktop and ios. | I | Review |
| V02 | Jellyfin provides existing music, permissions and playlists without a new upload/import step. | N+L | Review |
| V03 | Production uses Vite and TanStack Query, with editable drafts separate from server caches. | I | Review |
| V04 | Implemented neutral/rose palette matches the documented tokens in default, selected, disabled and focus states. | N | Review |
| V05 | Bundled Manrope 600 headings and Inter 400/500 interface text render without font network requests. | I+N | Controlled |
| V06 | Sidebar, song table, artwork grid and persistent inset player follow the documented spacing and typography targets. | N+U | Review |
| V07 | Long metadata truncates or wraps without moving or covering essential controls. | N | Review |
| V08 | Hover, pressed, selected, disabled and keyboard focus states remain distinguishable and readable. | N | Review |
| V09 | Motion respects reduced-motion preference. | N | Controlled |
| V10 | Native window chrome, traffic lights and titlebar behavior work in desktop context. | N+O | Review |
| V11 | Actual fonts, translucency and text remain legible at standard and Retina display scales. | N+O | External |
| V12 | Screenshots show implemented desktop context rather than implying a generated concept is the product. | N | Review |
| V13 | Every page remains usable from1280×720 at normal zoom and ordinary larger desktop sizes, including long content and errors. | N | Review |
| V14 | At 100–200% app zoom, navigation scrolls and volume, player and setup Save remain reachable. | N | Deferred |
| V15 | Narrow queue/details replace the main area; covered controls leave keyboard order and closing restores focus. | N | Deferred |
| V16 | Common actions are discoverable and optional radio setup does not obstruct ordinary listening. | N+U | Review |
| V17 | Out-of-scope weather/calendar/song-selection/broadcast/release features do not appear as working controls. | I+N | Review |

## Connection and accessible libraries

Source: REQUIREMENTS: Jellyfin connection; RADIO_EXPERIENCE: Entry and first use; M7,M10–M12.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| C01 | First launch accepts Jellyfin address and credentials, lists accessible music libraries and opens All songs. | N+L | Live |
| C02 | Use another account/server remains available during loading, empty discovery and discovery failure. | N | Dated |
| C03 | Account-switch form retains server, clears credentials and Back restores checkbox choices and focus. | N | Controlled |
| C04 | Failed replacement authentication retains the committed account; successful authentication resets checkbox drafts and refreshes selection even for the same account. | N+S | Controlled |
| C05 | Unavailable selected libraries are explained and excluded from saved IDs and selected counts. | N+S | Dated |
| C06 | Empty access disables empty Save and Try again recovers after access is granted without reauthentication. | N+L | Dated |
| C07 | Library saves cannot overlap account switching, sign-in or sign-out; pending state survives music navigation. | N+S | Dated |
| C08 | Expiry during a library save explains the wait and enables sign-in only after that save settles. | N+S | Review |
| C09 | Older success/failure cannot replace a newer account or undo sign-out, including a held pause write, uncommitted credentials and failed sign-out. | N+S | Controlled |
| C10 | Session-only account replacement removes older restorable credentials; restart requires sign-in. | N+S+O | Review |
| C11 | Account/library snapshots and saved credentials become active together; asynchronous failure/cancellation keeps the latest committed account and choices across restart. | S+O | Controlled |
| C12 | Offline reads preserve the session and offer explicit Retry;401 prefills server/username with empty password. | N+L | Review |
| C13 | Same-account reauthentication retains unsaved radio/script/manual-operation state without saving or redispatch; music restores paused. | N+S | Controlled |
| C14 | Different account/server and explicit sign-out clear unsaved radio/script drafts and hide old-account live feedback, including manual completion notices; saved local radio material remains. | N+S | Controlled |
| C15 | A failed newer login supersedes older attempts while retaining the previously committed account. | S | Recorded |
| C16 | Jellyfin sign-in JSON deadlines include stalled bodies; after 20 seconds the form is usable and no account is committed. | N+S | Controlled |
| C17 | Library JSON requests time out through body consumption; the existing single read retry ends in useful error and explicit Retry restores data. | N+S | Controlled |
| C18 | Malformed sign-in/library JSON is distinct from network timeout and sign-in errors never imply a saved playlist change. | S | Controlled |
| C19 | Credentials and tokens never appear in logs, renderer replies or externally opened URLs. | I+S+N | Review |
| C20 | Separate installations use independent persistent Jellyfin identities for API/artwork/audio/transcode, retain them through account changes/sign-out/restart, and signing in from one leaves the other session usable. Unavailable identity storage keeps listening available with session-only replacement and no older-account resurrection. | N+S+L | Live |

## Catalog browsing and refresh

Source: REQUIREMENTS: All songs, Albums, Jellyfin connection; M1,M2,M8,M13.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| B01 | All songs includes music from every selected library without duplicated or missing visible selections. | N+L | Review |
| B02 | Song search finds title, artist and album matches and respects selected libraries. | N+S+L | Live |
| B03 | Sort and genre/tag filters update the displayed rows and preserve coherent paging. | N+S | Review |
| B04 | Single and multiple selection support Play, Queue and Add to playlist in displayed row order rather than click order. | N | Controlled |
| B05 | Song columns and details show available artwork, title, artist, album/album artist, duration, year, genres, tags and track metadata. | N+L | Review |
| B06 | Untitled/Unknown artist and missing optional fields do not prevent browsing or playback. | N | Controlled |
| B07 | Album search finds title and album-artist matches once within selected libraries; artwork and metadata open an ordered track list. | N+L | Live |
| B08 | Album Play, Queue, Add all and individual track selections use the intended ordered tracks. | N+L | Review |
| B09 | Browsing/search/filtering remain responsive for the listener's actual library size, including paging and large selections. | N+L | Live |
| B10 | Refresh library updates songs and genre/tag choices while retaining search, filters, selection and listening queue. | N+S | Controlled |
| B11 | After refresh, song details, albums and playlists read fresh data when used. | N+S | Controlled |
| B12 | Album metadata is fetched by ID even with no tracks; a metadata-only failure leaves available tracks playable. | N+S | Controlled |
| B13 | Current image revision tags update album/song artwork, including album-art fallback. | N+S | Controlled |
| B14 | Read/refresh failure retains available data, offers Retry and never enables/prepares radio. | N+S | Controlled |
| B15 | Changing song search/filter resets selection; ordinary navigation retains song selection and tracks selected in the same open album. Explicit album close/open, library/account changes and restart clear temporary album selection. | N | Controlled |
| B16 | A failed next song/album page retains already loaded music and offers a targeted retry. | N | Controlled |
| B17 | Opening an album and returning restores visible focus to that album, including a deep virtualized tile after a music detour. | N | Controlled |

## Server playlists and uncertain changes

Source: REQUIREMENTS: Playlists; M5,M6.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| P01 | List only the account's accessible music playlists and open their track lists. | N+L | Review |
| P02 | Create/rename succeeds on Jellyfin and other clients can read the persisted result. | N+L | Live |
| P03 | Add one song, selected songs and an entire album to an existing or newly created playlist. | N+L | Live |
| P04 | Remove and reorder authorized entries; playback of playlist or selected entries preserves intended order. | N+L | Live |
| P05 | Explicit read-only disables editing; unavailable permission lookup explains unknown permission and lets Jellyfin authorize attempts. | N+S+L | Review |
| P06 | Skip existing tracks performs duplicate reads first, preserves chosen order and makes no write/recovery lock for an empty remainder. | N+S | Live |
| P07 | Pending/failed/review state survives navigation, playlist switches, library saves and same-account sign-in. | N+S | Controlled |
| P08 | Create/add/reorder/remove reserve durable account-owned intent before dispatch and retain one addition intent across all batches. | S | Controlled |
| P09 | Lost/malformed creation confirmation remains uncertain and never replays automatically, including when no created ID is known. | N+S | Controlled |
| P10 | Inline uncertain reorder/removal blocks edits until a fresh successful detail read and explicit acknowledgement. | N+S | Controlled |
| P11 | An unresolved creation needs a fresh complete playlist-list read and explicit acknowledgement before any creation, including from Add. | N+S | Controlled |
| P12 | A read begun while the write was pending cannot authorize acknowledgement. | S | Controlled |
| P13 | Unresolved edits survive process restart; affected tiles say Review needed and affected Add destinations are disabled. | N+S | Controlled |
| P14 | Rename and additions respect affected locks while other playlists remain usable. | N+S | Controlled |
| P15 | Unavailable recovery storage rejects edits before dispatch while listening remains available. | N+S | Controlled |
| P16 | Account changes hide old feedback; returning restores that account's review, and late old results cannot alter the new account. | N+S | Controlled |
| P17 | Successful status-only rename/add/remove/move stays confirmed despite a hanging unused body; failure to cancel that unused response body cannot undo confirmation. | S | Controlled |
| P18 | Partial multi-batch changes report uncertainty and are not retried automatically. | S+L | Live |
| P19 | Repeated/missing/invalid server entry IDs never merge occurrence selection or become unsafe Move/Remove requests; explain row restrictions, preserve safe actions/stable selections, and clear unreliable selections when entries change. Preflight rejects ambiguous/absent targets before reservation or dispatch. | N+S+L | Live |

## Music playback and listening-session persistence

Source: REQUIREMENTS: Playback; M1–M4,M8,M9.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| M01 | Play/Pause, Previous/Next, seek, volume, shuffle and repeat operate from the persistent player. | N+L | Live |
| M02 | Current artwork/title/artist, elapsed time and duration follow the actual playing occurrence. | N+L | Live |
| M03 | Expandable queue shows intended upcoming order and supports occurrence-correct changes with duplicates. | N | Controlled |
| M04 | Music continues across browsing/setup and while the app is in the background. | N+O | Controlled |
| M05 | Natural continuation follows repeat/shuffle and preserves converted mode and pause intent after DJ completion/failure/Stop. | N+S | Controlled |
| M06 | Manual Next skips repeat-one; paused Next/Previous changes songs without starting playback. | N | Controlled |
| M07 | Exact-end seek follows queue/repeat without a natural-completion or cadence count and preserves the current play/pause intent. | N | Controlled |
| M08 | A retained break finishes before continuation; seeking back waits for the ending again without replaying heard speech, and explicit replacement cancels placement. | N | Controlled |
| M09 | Missing/invalid catalog duration uses finite current-resource duration plus conversion offset only for that occurrence. | N+S+L | Review |
| M10 | Until duration is known, elapsed time advances, total is unavailable and seeking is disabled without rewriting server metadata. | N | Controlled |
| M11 | Restart restores queue order, duplicate occurrence, song, position, volume, shuffle and repeat paused without a prompt. | N+S | Controlled |
| M12 | Options survive an empty queue, delayed startup and failed-restoration quit/reopen; restore failure explains the retained queue and offers explicit Retry; an options-save failure has its own retry without starting music. | N+S | Controlled |
| M13 | Opening another account alone does not overwrite the saved listening queue; each server/account keeps its player options across restart, and returning to the queue owner restores its own options paused. | N+S | Controlled |
| M14 | Track load failures preserve the song/queue, try supported conversion once, then expose Retry/Skip without an endless loop. | N+L | Review |
| M15 | Late load results cannot replace a newer choice or produce stale errors. | N+S | Controlled |
| M16 | macOS hardware/media controls operate the actual session, including paused commands and active speech. | N+O | External |
| M17 | Converted-codec playback and seeking work against supported live Jellyfin combinations. | N+L+O | External |
| M18 | Shuffle visits each occurrence once per cycle; Previous follows actual history; repeat off stops at exhaustion and all wraps. | N | Controlled |
| M19 | Removing one duplicate or an earlier queue entry preserves the other copy/current occurrence and paused intent. | N | Controlled |

## Radio entry, profiles and setup drafts

Source: REQUIREMENTS: Personal radio behavior, Settings and data; R1–R3,R8,R9,R12.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| R01 | Music works with no AI keys, source requests or forced setup, and both opt-ins default off. | N | Controlled |
| R02 | Player DJ controls explain preparation separately, offer setup and never imply the edited profile controls another playback profile. | N+U | Review |
| R03 | One explicit profile save covers sources, host, mood, interests and workflow preferences atomically. | N+S | Controlled |
| R04 | All draft fields survive music/shared-management navigation and return with appropriate focus. | N | Controlled |
| R05 | Profile switch offers Save and switch, Discard and switch or Cancel for the entire draft. | N | Controlled |
| R06 | Copied profiles do not prepare until made available and explicitly enabled; named profile edits stay correctly attributed. | N+S | Controlled |
| R07 | Preparation activation rechecks saved sources, host/voice, mood and OpenAI/ElevenLabs keys; X token is required only for selected X sources. | N+S | Controlled |
| R08 | Missing prerequisites have direct setup actions; incomplete setup and turning off remain saveable without keys. | N+S | Controlled |
| R09 | Draft activation and saved running state remain visibly distinct and saving ordinary setup never silently enables either opt-in. | N+S | Dated |
| R10 | Pending setup writes retain locks/errors across navigation and cannot save to a newer active profile or erase newer drafts. | N+S | Controlled |
| R11 | An identified automatic run allows future setup editing while profile switching and manual generation stay unavailable. | N+S | Controlled |
| R12 | A run uses its reserved source/host/profile snapshot; cadence edits anchor to its start even if saving finishes after the run. | S | Controlled |
| R13 | Unknown/failed preparation status locks unsafe editing until refreshed, without showing false Off. | N+S | Controlled |

## Scheduled preparation, visibility and stop behavior

Source: REQUIREMENTS: Personal radio behavior; R3,R5,R6,R9–R11,M15.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| A01 | Preparation defaults to every 3 hours, major stories and maximum 3 automatic recordings per local day, with bounded daily scheduled checks. | N+S | Controlled |
| A02 | Before activation, text-assessment cost without audio, provider requirements and automatic-limit scope are visible. | N+U | Review |
| A03 | Manual text/audio and voice preview remain explicit additional paid actions outside automatic limits. | N+S | Dated |
| A04 | Independent DJ playback never invokes generation; preparation never starts music or replaces the selected take. | N+S | Controlled |
| A05 | Due checks require the app running/Mac awake; return from sleep/quit coalesces missed slots rather than processing a backlog. | S+O | Review |
| A06 | Last outcome/reason, timestamp, next check and daily attempt/recording counts derive from persisted state and name the correct profile. | N+S | Controlled |
| A07 | Status distinguishes preparing, saved, no qualifying story, incomplete coverage, cap, failure, interruption and unavailable profile. | N+S | Controlled |
| A08 | No-story results retain their actual reason and source-coverage failure is not reported as no news. | N+S | Controlled |
| A09 | Daily limits stop scheduled dispatch, explain which cap was hit and resume only when eligible after local midnight. | N+S | Controlled |
| A10 | Failure/interruption preserves cause, avoids paid retry and requires a separate explicit Resume after repair/save. | N+S | Controlled |
| A11 | Player shows named preparation context; News bucket shows detailed activity and global history is labeled global. | N+U | Review |
| A12 | Turn off during a running check saves only named-profile OFF, requests cancellation and retains unrelated unsaved edits/results. | N+S | Controlled |
| A13 | Failed stop survives navigation with visible explicit retry; music pause and Disable DJ never imply preparation is off. | N+S+U | Review |
| A14 | Sign-out confirmation accurately names draft loss, retained local data, paused preparation, cancellation and already-sent possible charges. | N+U | Review |
| A15 | Confirming sign-out immediately closes generation, cancels pending manual/automatic/preview work and prevents late callbacks dispatching after quick reconnect. | S+N | Recorded |
| A16 | Sign-out pauses all enabled profiles durably through restart and completed-artifact recovery; reconnect requires per-profile Resume. | S+N | Controlled |
| A17 | Pause-save failure retains the account; credential-delete failure restores it with recoverable feedback while preparation stays paused. | S+N | Recorded |
| A18 | Delayed setup/Resume cannot clear a newer sign-out pause and signed-out startup makes no automatic dispatch. | S | Controlled |
| A19 | Completed publication remains available and counted once despite late cancellation or restart reconciliation. | S | Controlled |

## Sources, attribution and data boundaries

Source: REQUIREMENTS: Personal radio behavior, Settings and data; R2,R5,R7,R11.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| S01 | Named RSS/Atom sources collect usable entries with dates, original links and safe relative-link resolution. | S+L | Live |
| S02 | Hacker News lists handle partial/invalid entries with honest coverage. | S+L | Live |
| S03 | X recent search explains token/access requirements and retains useful partial results without leaking bearer credentials. | S+L | Review |
| S04 | Source text is untrusted; unsafe links/redirects/entities cannot bypass the intended fetch/open boundaries. | I+S | Controlled |
| S05 | Verified tracking aliases deduplicate assessment/playback across restart while semantic query fields and original historical links/outcomes remain intact. | S | Controlled |
| S06 | Automatic checks skip undated/stale entries with a reason and never claim all news was discovered. | S+N | Controlled |
| S07 | Ready/draft/current/scheduled stories retain named partial-source warnings in News bucket and player without requiring Saved audio. | N+S | Controlled |
| S08 | Missing/invalid publication dates say Date unavailable in history and saved/manual provenance; valid dates and links remain. | N+S | Controlled |
| S09 | Text requests send bounded excerpts, interests and host instructions, never music, Jellyfin secrets, keys as context or the full catalog. | I+S | Controlled |
| S10 | Voice requests send only the intended script/delivery settings and provider credentials remain behind preload. | I+S | Controlled |
| S11 | Source deletion removes active/inactive profile references coherently without losing other setup/history or enabling invalid playback. | N+S | Controlled |
| S12 | Live source/provider output relevance and coverage are observed separately from substituted response checks. | L+U | External |
| S13 | Source deletion confirmation names every affected profile and warns when DJ breaks will turn off; Cancel keeps it and confirmation preserves historical audio provenance. | N+S | Controlled |
| S14 | Saving sources does not prepare a story by itself. | N+S | Controlled |

## Saved scripts, audio and manual recovery

Source: REQUIREMENTS: Personal radio behavior; R7,R8,R10,R11.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| T01 | Advanced manual text preparation stays collapsed by default and discloses provider/cost scope beside its action. | N+U | Review |
| T02 | Manual progress, original profile, request/error/cancel state survive music navigation and later profile switches. | N+S | Controlled |
| T03 | Cancel before dispatch prevents generation even while saving setup; after dispatch it targets the exact request. | N+S | Controlled |
| T04 | Checking a saved result reconciles only an existing request and never generates for an unknown ID; pending text/audio checks are named as checks with the original profile and no new provider request. | S+N | Controlled |
| T05 | After restart latest unlinked interruption has its original profile/time, manual/automatic identity and focused expandable-history action; unknown metadata is not guessed. | N+S | Controlled |
| T06 | A newer request supersedes the compact summary while older history stays reachable with keyboard focus; failed refresh/live error suppress duplicate or misleading summaries. | N+S | Controlled |
| T07 | Scripts are editable; replacing edits through saved loads or new text requires confirmation, cancel prevents dispatch, and failure retains edits. Finite generation reports its saved/reused result with focused review and supports audition/comparison/explicit selection without silently replacing the selected take. | N+S | Controlled |
| T08 | Normal generation reuses a valid matching recording including a later replacement; Generate another take explicitly requests variation. | S+N | Controlled |
| T09 | Immutable script/source/mood/interests/rendering-DJ provenance and selected ID survive restart. | N+S | Controlled |
| T10 | Missing/empty/truncated audio retains provenance/selection, disables play/use/schedule and offers explicit script-based replacement. | N+S | Controlled |
| T11 | Saved audio plays without keys/provider calls; speech remains outside music playlists, favorites and music history. | N+S | Controlled |
| T12 | Request IDs/attempts persist before dispatch; complete artifacts reconcile after interrupted manifest publication and uncertain work never retries automatically. | S | Controlled |
| T13 | Audition pauses music; Pause/Resume retains position even during startup and rapid commands do not reset it or show false error. | N | Controlled |
| T14 | Stop/leaving Saved audio/later music transport, including paused selection/seek/media Pause, ends audition and rejects stale callbacks. | N+S | Controlled |
| T15 | Volume/shuffle/repeat preserve audition; failure remains visible for explicit retry, repaired files reopen after Refresh/Listen or Schedule, and audition never changes selection/opt-ins. | N | Controlled |

## DJ playback, transitions and voice choice

Source: REQUIREMENTS: Personal radio behavior, Per-DJ voice previews; R4,R8,M3,M14.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| D01 | Saved-DJ editor exposes name, personality, language, instructions, music preferences, exclusions and supported voice/delivery choices; full bounded editorial fields persist and reach preparation with a visible usage explanation. | N+S | Controlled |
| D02 | Preset setup is generation-free and saving/testing a DJ never enables preparation or playback. | N+S | Dated |
| D03 | Editor explains that the listener chooses music and playback frequency belongs to actual DJ playback settings. | N+U | Dated |
| D04 | DJ defaults off/every 3 songs; natural completions count and skips do not. | N+S | Controlled |
| D05 | Fresh matching eligible recordings wait for suitable endings; empty or unsuitable endings keep music playing. | N+S+U | Review |
| D06 | No duplicate queue advances, heard-news replay or obsolete placement occurs across pause, failure, late callbacks and interruptions. | N+S | Review |
| D07 | Player shows selected profile/host/cadence/current-upcoming script/source references and last heard session status accurately. | N+S | Controlled |
| D08 | Disable DJ stops its pending/active speech, preserves usable music and leaves preparation unchanged. | N+S | Controlled |
| D09 | Music Pause pauses speech/timing; seeking follows Keep the DJ, enabled by default. | N+S | Controlled |
| D10 | Talkover/between-song transition settings use saved audio without regeneration and produce acceptable audible transitions. | N+L+U | External |
| D11 | Preview transition uses bundled voice/sample music with no queue/key/provider requirement and never saves timings or starts music. | N+S | Controlled |
| D12 | Preview own pause does not cancel itself; later transport wins; Stop/finish leaves music paused and volume/shuffle/repeat preserve preview. | N | Controlled |
| D13 | Timing/style change or leaving General stops demo; stale callbacks/errors cannot affect a replacement and genuine failure is retryable. | N | Controlled |
| D14 | Neutral editor sample and saved-DJ delivery preview are separate; generation discloses credits outside automatic limits. | N+S | Controlled |
| D15 | First saved-DJ preview uses one fixed short ElevenLabs-only sample and persists locally; restart/no-key cached replay makes no request. | N+S | Controlled |
| D16 | Saved voice/delivery changes mark preview Outdated; explicit failed regeneration retains the prior playable recording. | N+S | Controlled |
| D17 | Concurrent DJ preview generation deduplicates and durable attempt marker requires explicit regeneration after failure/interruption/missing audio. | S | Controlled |
| D18 | Preview playback is exclusive; delayed results respect later music commands, remain cached for explicit replay and use current volume. | N+S | Controlled |
| D19 | Actual generated host delivery, pronunciation and perceived interruption quality satisfy observed listener sessions. | L+U | External |
| D20 | DJ deletion names affected profiles, warns only when their enabled selected playback turns off, and Cancel preserves choices; long profile names wrap with reachable confirmation actions. | N | Controlled |

## Trust, accessibility and final acceptance

Source: REQUIREMENTS: Design acceptance, stack, settings, acceptance and release verification; R12.

| ID | Observable result | Proof | Status |
| --- | --- | --- | --- |
| Q01 | Context isolation and disabled renderer Node integration accompany a narrow validated sender/frame-aware preload/IPC boundary. | I+S+N | Controlled |
| Q02 | Actual OS protected connection/local-key encryption decrypts in a fresh process and clearing/corrupt/unavailable paths are honest. | S+O | Review |
| Q03 | Actual shared-provider Keychain adapter supports isolated read/write/independent clear without exposing secrets to renderer. | S+O | Review |
| Q04 | Media URLs/handles reject revoked/missing/cross-account resources and off-origin redirects without leaking tokens. | S+N | Controlled |
| Q05 | Local secret/recovery files have appropriate private modes and no inspection/test touches personal entries. | I+S+O | Review |
| Q06 | All essential controls have accessible names, visible focus and keyboard operation; source checkbox groups have names. | N+O | Review |
| Q07 | Filter/song-action Tab/Escape, dialogs and setup detours restore logical focus, including removed-opener fallback to page heading. | N | Controlled |
| Q08 | Interactive recovery actions are outside live status/error announcements; loading/error/empty states remain actionable. | N+O | Review |
| Q09 | Full VoiceOver interaction works through music, setup, pending/failure/recovery and dialogs. | N+O | External |
| Q10 | Supported macOS/architecture/display combinations and hardware integration are explicitly verified. | O | External |
| Q11 | Ordinary listeners complete first music, optional radio setup, understanding both opt-ins and stop/recovery without coaching. | U | External |
| Q12 | Evidence distinguishes controlled fixtures, live provider/server output, audible quality and observed usability. | I | Review |
| Q13 | The complete current requirement denominator and every critical invariant have individually reviewed evidence before completion or a90% claim. | I | Review |
| Q14 | No routine verification packages, signs, notarizes or publishes the application. | I | Review |

## Evidence ledger for controlled rows

| Check | Reviewed evidence | Scope limit |
| --- | --- | --- |
| B06,B10–B14 | [Catalog recovery record](verification/2026-10-16-catalog-recovery.json):13 native cases for sparse metadata playback, active-filter refresh, fresh song/album/playlist caches, revisioned artwork, empty albums and cached/uncached read recovery | Actual renderer/service/HTTP/native media with a controlled localhost catalog. No live metadata/cache timing, actual-library performance, playlist mutation or observed-listener claim. |
| Q07 song actions | [Song actions record](verification/2026-10-16-song-actions.json):native forward/backward Tab, Escape, external scroll and explicit queue action at1280×720 normal zoom | Shared popup behavior only; broader catalog/playlist acceptance remains separate. |
| Q07 | [Filter keyboard record](verification/2026-10-16-filter-keyboard.json):reproduced Tab focus rewind, shared-handler fix, native filter/scroll/selection, modal containment, removed-opener fallback and setup detours at1280×720 normal zoom | User deferred smaller/enlarged cases after earlier tests. This focused journey does not establish all controls, VoiceOver or observed usability. |
| Q01,Q04 | [Trust-boundary record](verification/2026-10-16-trust-boundaries.json):actual native isolation/CSP/navigation, second-window IPC denial, eight malformed mutations, opaque range playback, redirect limits and revoked/cross-account handles | Dynamic media cases exercise music; artwork shares the inspected proxy. Local saved news remains shared by contract. Focused checks do not establish exhaustive fuzzing, OS Keychain or a penetration test. |
| T09,T10 | [Listener journey record](verification/2026-10-16-listener-journey.json):native immutable writing/rendering provenance after setup edits/restart; missing, empty and truncated audio controls plus explicit replacement and durable selection | Includes a controlled full first-radio journey and two inspected captures. Provider responses are substituted; first sign-in, live quality, audible transitions and observed listener comprehension remain separate. |
| A19,T12 | [Recording recovery record](verification/2026-10-16-recording-recovery.json):12 native cases covering durable dispatch reservation, four publication/settlement boundaries, two restarts, late cancel/OFF/sign-out, incomplete-file rejection, manual replay and unknown-request reconciliation | Actual stores/IPC/services with substituted providers. Controlled quit/reopen and two incomplete-file variants do not establish arbitrary forced termination, power loss, disk faults or live billing. |
| A08 | [Partial coverage record](verification/2026-10-16-partial-coverage.json):22 native outcomes, held-settlement quit/reopen, two restarts, same-ID automatic/manual replay, normal cadence continuation and three layout cases | Actual stores/IPC/services with substituted providers; physical crash/sleep, broader late cancellation, live quality and observed comprehension remain separate. |
| A06,A07 | [News outcomes record](verification/2026-10-16-news-outcomes.json):22 native variants covering all named automatic states, persisted reason/time/cadence/counts, both named summaries and corrected key recovery; three layouts | Actual parsing/services/storage with substituted source/provider responses. A08 partial-coverage classification, live quality, audible continuity and observed comprehension remain separate. |
| R10 | [Setup save-order record](verification/2026-10-16-setup-save-order.json): five native cases covering pending/error detours, success/failure versus newer fields, profile changes before entry/commit and sign-out/new-session isolation | Two production-renderer cases; three actual-source cases expose only the real root draft setter for controlled stress injection. No observed listener or live auth-failure claim. |
| R06 | [Copied profiles record](verification/2026-10-16-copied-profiles.json): draft copy/cancel, restart, two opt-in gates, named edits/run, stale-target rejection, metadata reset, keyless incomplete copy and three dialog layouts | One controlled native runtime with source/provider substitutes; observed listener comprehension and broader historical/manual attribution remain separate. |
| R07,R08 | [Activation and keys record](verification/2026-10-16-activation-keys.json): 19 ordering variants, nine rejected prerequisites, two positive saves, two native setup journeys and cadence/Resume regressions | Shared Keychain adapter and provider HTTP are substituted; actual typed IPC, protected storage and native UI run. No observed listener usability or cross-application key transaction claim. |
| M08 | Retained DJ-break record:40 native variants across both transition styles, retained endpoint completion, paused/active rewind, natural endings, duplicate replacement, pre-speech/tail/cancel phases and delayed initial/resume starts;3 status-layout/focus cases | Real muted saved MP3 and controlled media-start adapters; audible mid-sentence continuity and live/provider/OS acceptance remain separate. |
| M07 | Endpoint cadence record:18 exact-end repeat/shuffle/intent/conversion-route variants,4 queue-end wrap/stop variants and a real near-end native completion positive control | Cadence asserted through visible DJ countdown; muted WAV conversion-route response is modeled, not live codec compatibility. Retained-break behavior remains M08. |
| M10 | Unknown-duration record: missing/negative/malformed catalog durations, infinite/zero/NaN media totals, elapsed/unknown-total UI, disabled seek registration, later finite recovery and paused slider/media seeking | Media duration property and recovery notification are controlled; actual native WAV/time/IPC/storage remain real. Physical OS controls and live conversion remain M16/M17. |
| M15 | Playback load-recovery record: late preparation success/failure, newer playing/paused choice, same-song duplicate replacement, Pause during preparation and confirmed old audio HTTP request followed by a newer playing song | Controlled localhost accounts/resources and delayed replies; M14 live conversion/recovery and M17 real codecs remain separate. |
| V05 | Native-font record: three loaded font faces, computed body/label/heading weights, request events and built-file existence | Signed-out native screen; other page layout and OS display-scale acceptance remain separate. |
| C09 | Connection-publication record:18 service cases,12 prior actual-main auth-order cases, three native pre-publication sign-out outcomes and protected restart after failures | Controlled request/storage checkpoints and local server; no live auth failure probability inferred. |
| C11 | Connection-publication record: staged/canonical encrypted-file comparison, canceled-temp cleanup, session-only clear/failure/retry, native replacement/restart and playing library save | Actual safeStorage on the named macOS machine; other OS/hardware storage conditions remain separate. |
| C16 | Response-deadline record: native public-info and authentication stalls, plus unchanged production-deadline reproduction | Owned local HTTP server and disposable credential substitutes. |
| C17 | Response-deadline record: native album stall through existing one-read retry, playing queue retained, explicit Retry restores catalog | Per-request deadline is20 seconds; two read attempts take approximately41 seconds. |
| C18 | Response-deadline record: actual-service HTTP matrix, malformed versus partial/absent/truncated body cases for info/auth/library | Fault matrix shortens only its fixture timer to100ms; production native checks retain20 seconds. |
| B15 | Music-browsing record: song/search/genre/tag and open-album navigation, explicit close/open/Clear/album/library/account/restart boundaries | Local catalog; selected-track queue action checked in row order without autoplay. |
| B16 | Music-browsing record: song and album next-page503 preserve loaded data/playing session and explicit targeted Retry succeeds | Modeled local server, not live-server failure probability or latency. |
| B17 | Music-browsing record: first and deep album tiles, page detour, keyboard Back and visible focus; minimum-size200% sample | Broader all-page/OS display-scale acceptance remains separate. |
| D20 | DJ-recovery record: enabled/off/unrelated/unused cases, Cancel/readback, valid80-character profile name, three sizes/200% with screenshots | Idle preparation and disposable local server; running-work and artifact-provenance behavior remain separate. |
| S14 | Source-setup record: RSS/X/HN saves, validation recovery, selected-source edit, explicit setup save and fresh-process persistence; zero external exercise fetches and empty preparation library | Preparation off; this does not establish live feed collection, X entitlement, provider quality or independently enabled profiles stopping. |

P17 initially remained Recorded because the earlier record lacked an injected cancellation-cleanup failure. The current playlist-storage record supplies all four operations in both modes and establishes Controlled coverage.

P02 is Live after native create/rename, independent authenticated server reads bypassing application caches, and fresh-process reopen. The temporary playlist was deleted and its absence re-read. See the live-playlist record for the tested account/server scope and script corrections. P03 and P06 are also Live after the later additions record covers all six single/selection/album destination variants and mixed/all-present duplicate handling. P04/P05 remain Review because selected-entry playback, other order variants and read-only/unknown permissions still need acceptance.

## STAR traceability

These links are navigation aids, not extra denominator rows. Each story requires all active linked checks plus its current exact STAR result in RADIO_EXPERIENCE. Cross-cutting accessibility, security and evidence obligations apply throughout.

| Story | Main checks |
| --- | --- |
| R1 | C01,M01,B07,B08,R01 |
| R2 | R03,R04,R06,R08,R09,D01,D02,S01–S03 |
| R3 | R07,R08,A01,A02,A04,A06 |
| R4 | D04–D07,A04 |
| R5 | A07,A08,S06 |
| R6 | A01–A03,A07,A09,A10 |
| R7 | A04,A13,D08,T11 |
| R8 | S07,S08,T07,T09–T11,T13–T15 |
| R9 | R02,R05,R10,R13,A06,A11,D07 |
| R10 | A10,A19,T02–T06,T12 |
| R11 | R11,R12,A12,A19,D05,D20,T09 |
| R12 | V07–V16,Q06–Q11 |
| M1 | M03,M19 |
| M2 | M06,D18 |
| M3 | M01,M03,M05–M08,M18,D06,D09 |
| M4 | M14,M15,C12 |
| M5 | B02–B04,B07,B09,B15–B17 |
| M6 | P06–P19 |
| M7 | C12–C14,T02 |
| M8 | B06,M09,M10 |
| M9 | M11–M13 |
| M10 | C05,C06 |
| M11 | C02–C08 |
| M12 | C09–C11,C15,C16,C18,C20 |
| M13 | B10–B14 |
| M14 | D11–D13 |
| M15 | A14–A19,C09,C14 |

## Critical invariants

Completion requires no lost committed or unsaved edits within the documented lifetime; no unrequested paid work; no credential exposure; no silent replacement of a selected take; no automatic retry of uncertain paid work or playlist mutation; no duplicate queue advance or heard-news replay; and keyboard access to every essential action. Relevant rows must be reviewed together across cancellation, navigation, account change and process restart. A green build does not prove these invariants.

## Next evidence review

Reconcile each Review/Dated/Recorded row with its source and existing evidence before choosing the next implementation round. Record a concrete contradiction or missing interaction and its smallest useful reproduction. Keep external proof requirements visible. Do not rerun already sufficient checks merely to increase counts.


Inventory revision,16 October2026: added D20 for the newly explicit shared-DJ deletion impact contract in REQUIREMENTS → Settings and data and RADIO_EXPERIENCE → Done criteria and evidence. This adds one requirement rather than removing or splitting an existing obligation to improve a score. Prior dated184-row records remain unchanged.


Inventory revision,16 October2026: P19 makes the newly observed server-entry identity limitation explicit in REQUIREMENTS → Playlists and story M6. This adds a contract; it does not remove ordinary authorized remove/reorder from P04. The inventory is now187 rows. P04/P19 remain Review: live duplicate selection/playback, safe unique edits and14 controlled guard cases pass, but ambiguous occurrence editing has no verified server route and native missing/invalid-ID variants still need acceptance. Earlier186-row evidence retains its dated scope and hashes.


P05 evidence update,16 October2026: the playlist-permission record covers21 actual-service cases and native read-only/unknown controls, explicit allowed/denied rename and a production20-second permission timeout with continuous music. It fixes missing/non-boolean data being mislabeled read-only and optional lookup failures hiding available entries. P05 stays Review because live read-only/unavailable permission configurations remain unverified. Inventory remains187 rows and its dispositions are unchanged.

The [current playlist-recovery record](verification/2026-10-16-playlist-recovery-current.json) covers P12 against the recorded source snapshot. It also rechecks uncertain reorder navigation, Review needed tiles, three launches with exactly one mutation, stale receipts, sibling edit guards and account isolation. That replay alone left P07/P10/P13/P14/P16 in Review; the17 October playlist-boundary record below adds the missing variants. P17 concerns cancellation of the unused HTTP response body. A failed durable-journal clear deliberately retains review and blocks another write even when Jellyfin confirmed the operation.

The [Add recovery-action record](verification/2026-10-16-playlist-add-review.json) adds current native uncertain-addition restart and direct keyboard review/acknowledgement evidence for M6/P13, plus a creation-path regression check for P11. The newly opened Add dialog now offers Review playlists for unavailable destinations. The existing creation message stays singular and healthy lists show no recovery hint. These are controlled variants; the wider playlist rows retain their existing dispositions.

The [current playlist-storage record](verification/2026-10-16-playlist-storage-current.json) establishes P15 and P17. Native corrupt-journal checks reject all five mutation types before HTTP dispatch while music progresses; explicit refresh restores editing after fixture repair. Eight response-body cases preserve confirmed writes despite hanging bodies or failed cancellation. Separate reserve/clear/account faults retain their exact dispatch/recovery boundaries. Physical disk failure and listener comprehension remain unverified.

The [current catalog-union record](verification/2026-10-16-catalog-union-current.json) adds sampled live B02/B07 search, all1,311 live songs and1,157 albums paged, a paused1,311-song selection queue, and controlled B04 action order. B01 remains Review: its reproduced overlap/count defect is fixed with native partial/full overlap, alias, tie, end-page, refresh and race coverage, but live overlapping-root configuration was unavailable. Cold multi-root read latency remains explicit; warmed native paging is16–24ms in the fixture. B03/B05/B08 keep their broader review scope.

The [long-text/native behavior record](verification/2026-10-16-long-text-layout.json) closes R01, M04 and V09 with fresh keyless listening, page navigation plus actual hidden-window playback, and native reduced-motion spinner evidence. It fixes DJ heading/preview-label and recovery-message overflow at1280×720. The18-case matrix predates only the final preview-label CSS fix, which has its own focused replay and inspected capture. V07/V13 retain their broader Review scope.

The [saved-audio retry record](verification/2026-10-16-saved-audio-retry.json) establishes T13–T15 for the named native runtime with real muted MP3 playback, delayed play settlements, transport commands, explicit missing-file recovery and unchanged selection/opt-ins. T11 remains Review for its broader music playlist/favorites/history scope.

The [script-replacement record](verification/2026-10-16-script-replacement.json) reproduces lost edited wording and verifies all three saved-load paths, guarded text preparation, cancel/no dispatch, failed preparation plus music navigation, focus restoration and direct clean preparation. That round left T07 in Review for its wider finite-generation/comparison scope; the later combined evidence below establishes the updated disposition.

The [manual-audio result record](verification/2026-10-16-manual-audio-result.json) establishes native generation/comparison, explicit selection, normal reuse and variation, including a later valid matching take. Together with the [script-replacement record](verification/2026-10-16-script-replacement.json), T07/T08 are Controlled for the recorded runtime. It also verifies truthful completion, focused review, missing/read-failure recovery, and original-profile attribution through music navigation and completion while the page is unmounted.

The [current connection-recovery record](verification/2026-10-16-connection-recovery-current.json) establishes C03/C04 with native Back/failure draft preservation, focus restoration, repeated same-account reset and different-account fresh selection/save. C13 now has native pending/error/cancellation recovery with unsaved setup/script retention and no implicit save/redispatch. The controlled offline/401 cases add evidence for C12, which remains Review for live-server recovery.

The [current account-boundary record](verification/2026-10-16-account-boundary-current.json) establishes C14 with independent native different-account, different-server and sign-out cases. It checks source/DJ/mood/interests/script clearing, old live feedback removal, a late old-account failure, sign-out Cancel preservation and saved-recording retention. It does not claim deletion of shared durable radio history or concurrent provider operation availability.

The [saved-result check record](verification/2026-10-17-saved-result-check.json) establishes T04 with current native text/audio lookup labels, original-profile retention, known/unknown/mismatched requests, unavailable files, interrupted requests and both provider statuses unconfigured. The two explicit initial generations are the only provider calls; no check reserves or dispatches a new paid request.

T05 evidence: [request context record](verification/2026-10-17-request-context.json) and [restart summary](verification/2026-10-17-request-context-summary.png). Native restart, rename/profile switch, focused history, no-dispatch reconciliation, legacy/malformed metadata and long names pass. Automatic context uses the explicit profile and supplied snapshot, tested with pre-dispatch validation failures. T06's remaining suppression/refresh and older-history scope is covered by the manual recovery record below.

T02/T03/T06 evidence: [manual recovery record](verification/2026-10-17-manual-recovery.json). Seven native cases cover stale status suppression/retry, a newer completed request, manual text/audio cancellation and navigation, before-dispatch setup-save cancellation, and linked automatic-status suppression. Older-history checks reproduce the inaccessible eleventh attempt, then verify all35 entries across three keyboard-focused batches.

A04/T11 evidence: [provider-free saved-radio record](verification/2026-10-17-keyless-radio.json). Native saved audition/resume, manual breaks and automatic DJ playback pass with all provider statuses unconfigured, including a fresh-process keyless restart. Speech stays outside the music queue and playlist, with zero Jellyfin writes or session/favorite/history requests. A separate explicit text/audio preparation leaves music paused, the selected take and opt-ins unchanged.

A16/A18 evidence: [current sign-out record](verification/2026-10-17-signout-current.json). Native publication/sign-out, signed-out restart, reconnect and named per-profile Resume pass. Twenty-one actual-main/service/storage lifecycle cases cover stale setup/Resume, failure boundaries and automatic/manual/preview key/in-flight/publication checkpoints. No new provider dispatch follows the sign-out boundary or signed-out startup.

P07/P10/P13/P14/P16 evidence: [playlist-boundary record](verification/2026-10-17-playlist-boundaries.json). Native uncertain move/removal and definite rejection cover navigation, playlist switches, library saves and same-account sign-in. Restart retains tile/Add locks; failed detail reads cannot authorize acknowledgement; healthy sibling playlists remain usable. A late old-account mutation leaves the new account untouched and return restores the original review. Existing addition-restart and late-read evidence was reviewed against unchanged affected source methods.

P08/P09/P11/P18 evidence: [creation and batch record](verification/2026-10-17-playlist-creation-batches.json). Four native creation-confirmation variants retain a global lock through restart and both entry points; a failed second list page cannot authorize acknowledgement. Actual on-disk account-owned markers precede create/add/reorder/remove dispatch and stay singular across100/100/50 batches. Local and live later-batch confirmation loss retain uncertainty and prevent blind replay. The one live private test playlist was deleted and its absence confirmed.

Playlist identity acceptance,17 October2026: [current record](verification/2026-10-17-playlist-identities.json) closes P19 with current native missing/empty/invalid/repeated-ID controls, independent selections, decoded selected playback, eight pre-dispatch IPC rejections and stable-selection retention after a safe edit. Fourteen current service cases pass. The prior live repeated-ID record supplies the real-server branch; playlist method/helper/page freshness was checked explicitly, not inferred from whole-file hashes. P04 and P05 retain Review. Inventory:187 rows,185 active,2 Deferred;63 Review,8 Dated,3 Recorded,88 Controlled,14 Live,9 External.83 active checks remain.

P04 evidence,17 October2026: [fresh live playlist order](verification/2026-10-17-live-playlist-order.json). Five current native cases verify full playlist playback, selected duplicate occurrences in display order, paused Next to the second copy, persisted safe reorder/removal without changing the existing queue, and fresh playback in edited order. Independent live reads verify edits; guarded cleanup confirms deletion and404 absence. P04 covers safely identified entries under the existing PRD restriction; P19 separately proves ambiguous-handle behavior. P01/P05 remain Review. Inventory:187 rows,185 active,2 Deferred;62 Review,8 Dated,3 Recorded,88 Controlled,15 Live,9 External.82 active checks remain.

D14–D18 evidence,17 October2026: [current DJ-preview lifecycle](verification/2026-10-17-dj-previews.json). Five native journeys cover first fixed-sample generation and cost disclosure, distinct neutral/saved identity, saved-delivery Outdated state, failed regeneration retaining audio, fresh-process no-key replay, SIGKILL after reservation with explicit-only retry, missing-file recovery and two-DJ exclusivity. Current actual-service integration adds concurrent deduplication, voice changes, corrupt-cache recovery and media ranges.28 actual-player cases cover delayed command precedence, cached replay, current volume and preview-preserving preferences. All providers are substituted and audio muted. Inventory:187 rows,185 active,2 Deferred;57 Review,8 Dated,3 Recorded,93 Controlled,15 Live,9 External.77 active checks remain.

D11–D13 evidence,17 October2026: [current transition demo](verification/2026-10-17-transition-demo.json). Seven native cases and32 current production-renderer cases cover keyless/empty-queue use, both styles, real decoded completion, paused state, newer transport, current volume and preferences, unchanged persisted settings, active timing/mode/preset changes, navigation cleanup, stale callbacks/errors and explicit failure/retry. Provider output and audio quality are not inferred from muted demo execution. Inventory:187 rows,185 active,2 Deferred;54 Review,8 Dated,3 Recorded,96 Controlled,15 Live,9 External.74 active checks remain.

S04/S05/S09/S10 evidence,17 October2026: [current source boundaries](verification/2026-10-17-source-boundaries.json). Actual service/store/pool checks verify safe redirects/entities, bounded text and voice request allowlists, fixed provider credential destinations, tracking aliases, historical migration and fresh-process assessment/playback deduplication. Seven native source-link cases reject unsafe URLs before a captured OS-open call; seven request/redirect cases pass. Native freshness/warning/date scope remains under S06–S08 Review. Inventory:187 rows,185 active,2 Deferred;50 Review,8 Dated,3 Recorded,100 Controlled,15 Live,9 External.70 active checks remain.

S06–S08 evidence,17 October2026: [current source presentation](verification/2026-10-17-source-presentation.json). Eight native cases cover automatic stale/undated no-request reasons, ready/draft/scheduled/on-air named warnings, missing/invalid/valid dates in history and saved/manual provenance, original links and actual main/service warning persistence. A small configured-feed spacing fix passes a rebuilt native keyboard/spacing/overflow check. Build/TypeScript and full ESLint pass. Inventory:187 rows,185 active,2 Deferred;47 Review,8 Dated,3 Recorded,103 Controlled,15 Live,9 External.67 active checks remain.

D04/D08/D09 evidence,17 October2026: [current DJ listening controls](verification/2026-10-17-dj-listening-controls.json).43 native cases cover defaults/countdown/natural completions, Disable with preparation on/off in both styles, retained or canceled seek behavior, heard-position resume, delayed callbacks and pause across transition phases. Prepared state, queue contents and selection remain correct; ended-song continuation follows normal intent. D05/D06/D07 and Q10 retain their wider open scope. Inventory:187 rows,185 active,2 Deferred;44 Review,8 Dated,3 Recorded,106 Controlled,15 Live,9 External.64 active checks remain.

D01 evidence,17 October2026: [saved DJ editorial preferences](verification/2026-10-17-dj-editorial-preferences.json). Fixed omitted exclusions and silently truncated instructions/preferences.13 service cases verify complete bounded fields and pre-dispatch validation; four native cases cover save/cancel/restart and manual/automatic requests. Seven current request/redirect checks revalidate S09 privacy with the larger payload. Inventory:187 rows,185 active,2 Deferred;43 Review,8 Dated,3 Recorded,107 Controlled,15 Live,9 External.63 active checks remain. D07 remains Review; actual model adherence, latency and input cost are not established by controlled replies.

D07 evidence,17 October2026: [current player DJ status](verification/2026-10-17-player-dj-status.json). Ten native cases verify selected-versus-edited profile attribution, host/cadence/preparation, upcoming/current script and source dates/warnings, actual heard/paused/completed/interrupted session state, profile switching, and pool failure/loading/retry. PRD clarifies the observed behavior. No production code change was needed. Inventory:187 rows,185 active,2 Deferred;42 Review,8 Dated,3 Recorded,108 Controlled,15 Live,9 External.62 active checks remain. Broader timing, audible and observed-user acceptance remain open.
