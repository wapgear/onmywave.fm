# News bucket workflows

Current behavior, 19 October 2026. DJ playback consumes saved news. A separate local news workflow prepares recordings on an hourly schedule. The user-facing contract is [Personal radio experience](RADIO_EXPERIENCE.md); [REQUIREMENTS.md](../REQUIREMENTS.md) defines the broader player. Morning weather remains future work.

## News bucket and review history

The bucket is the default view of saved news. It shows actual scheduled or speaking DJ audio separately from recordings eligible for playback and drafts awaiting audio. The DJ-selected profile can differ from the profile open on this page; playback context is shown explicitly. Source articles retain their original HTTP(S) links. The bucket also shows preparation status. Sources, interests, DJ, mood, and the news workflow share one Settings tab, with no manual authoring or insertion controls. DJ playback cadence lives only in app Settings → General.

Review history is global across profiles. The preparation service filters canonical article URLs before a paid assessment, reserves only the candidates sent to the model, and records selected and unselected outcomes, including no-selection results. Submitted requests with an unknown outcome stay excluded and are labeled interrupted. A failed source fetch does not mark unseen articles reviewed. A definitive provider rejection releases its candidate reservations so a later attempt can assess them. Unknown outcomes stay excluded to avoid repeating a possibly charged request. Known selected articles from existing scripts and audio seed the ledger; rejected articles from earlier versions cannot be reconstructed.

There is no expiry or automatic re-review for a URL, even if interests change or an article at that URL is updated. Feeds continue supplying new URLs. The current index retains full review metadata; an indexed store can replace it if history size makes rewrites slow.

## Playback

DJ playback uses the existing music queue and saved news pool. Only natural song completions count toward its song interval. At the interval, it claims a matching, fresh, available recording. An empty pool is skipped, with no generation request. A pending take waits for a suitable song ending. Claims revalidate eligibility after audio I/O and recheck profile compatibility after the durable claim; an obsolete claim is released before returning it. Take selection for playback is automatic; legacy selectedTakeId is retained only as historical data.

The main process serializes claims and records played takes. A take is marked played when speech starts, including an interrupted break. Known pre-playback cancellations release claims. App startup returns abandoned claims to the ready pool. A crash between voice start and persisting its played marker can replay that recording after restart.

Settings → General → DJ playback includes Keep the DJ when seeking or rewinding, enabled by default. Seeking within a song preserves its scheduled break and lets active speech finish. Explicit song changes cancel the old placement; an unplayed automatic take waits for another suitable ending. DJ voice volume defaults to 70% of player volume, independently of the music bed level.

## Independent news preparation

Each room has a separate Automatically prepare news switch in News bucket → Settings. It defaults off. Enabling authorizes text and voice provider calls while the app process runs and the Mac is awake, even with DJ playback off or music paused. Closing the window can leave the app running; quitting or sleep prevents execution.

Checks run every 1, 3, or 6 hours. The workflow reserves the next slot before generating, coalesces missed intervals into one fresh check, respects the daily automatic recording cap, and bounds source assessments to 24 divided by the hourly interval per day. Scheduled checks can use paid text assessment without producing a recording. The counter records started checks, including checks that discover no new candidates; it is not a provider invoice. Host voice previews are separate explicit configuration requests outside these scheduled limits. Their controls disclose provider costs; cached replay makes no request. Major-only selection rejects minor updates and promotions. Previously prepared article URLs are excluded. No qualifying story creates a saved skipped outcome without speech. Source failures with no eligible coverage and provider failures pause preparation until Resume preparation is selected. If readable fresh candidates remain, selection may proceed with named source warnings; a no-selection result retains those warnings. A busy provider operation finishes first. Disabling a room or its producer requests cancellation. The serialized run reservation captures its profile, DJ and source snapshot before publishing the running marker; provider work uses that snapshot after ledger initialization. An identified automatic run permits setup edits and saves for future checks while profile switching stays unavailable. Saving a new cadence while that run is active uses its start time plus the newly saved interval, including a save that started during the run but commits just after completion. It does not clear the next slot or create an extra immediate check. If a check were to outlast its new interval, the next tick can be due under the same start-to-start cadence. Idle setup edits retain their existing next-tick eligibility; turning preparation off clears the next slot. Edits affect future runs. A completed recording from the old configuration stays saved, counts toward the daily recording cap, and is excluded from automatic playback when it no longer matches.

The producer saves scripts, audio, provenance, and request history in the existing prepared-news library. Playback never starts this producer or changes its cadence. Provider keys belong to Settings; they are unnecessary for playing an existing saved recording.

## Durable preparation status

Each profile stores its last scheduled request ID, start/finish times, outcome, and reason when available. The marker is persisted before dispatch. Outcomes are running, prepared, no-news, failed, and interrupted. Daily counters and next check remain separate. Reaching a cap does not erase the last actual preparation result.

Only the matching running request can settle or increment a completed-recording count. A run uses a saved configuration snapshot. Edits preserve the in-progress marker so its result can settle without overwriting the newer settings; the UI identifies results from an earlier setup. A new profile copy starts with preparation off and without inherited run history/counters.

At startup, reconcile the marker against recovered prepared-news artifacts. A known completed result settles once. An unresolved/interrupted request pauses future dispatch until explicit Resume preparation. Never automatically retry an uncertain paid request. If the process stops before script or audio publication commits, a paid provider response may be lost; retain the interruption and require an explicit new attempt. Complete audio plus published recovery metadata can be reconciled into the library and settled once. Temporary uncommitted audio stays unavailable. Quitting, canceling, or losing a response cannot guarantee zero provider charges.

Preparation status is refreshed in News bucket and while the player popover is open. Shared status derivation distinguishes off, unavailable room, paused, checking, daily limit, and enabled/waiting. Daily counters use the Mac's local calendar day, and the UI labels their profile and scheduled-preparation scope. Paused failures retain their cause and explain that preparation stays paused until explicitly resumed in News settings. Retain last-known data after refresh failure and expose retry rather than pretending preparation is off.

## Interaction and verification

News bucket is the Listening Room destination and retains its existing name. It opens on saved news and preparation activity. Settings combines sources, interests, host, mood, and preparation; Saved audio remains reachable even with incomplete setup. Custom text editing, manual text/audio generation, take selection and manual scheduling are removed. Saved audio and script-only records retain read-only scripts, provenance, source links, status and historical origins. After restart, an unlinked interrupted request gets a compact notice and a route to expanded preparation history without dispatch. Automatic cancellation targets the stored running request, retains acknowledgement and local errors through navigation, and never claims a stop before the request reaches a terminal state. Shared source/DJ/key management opens app Settings with a return path, preserving the combined setup/preparation draft. An explicit save commits the whole draft; profile switches guard every field with Save, Discard, or Cancel. Activation and Resume recheck prerequisites in both renderer and main process. Incomplete setup and disabling preparation remain saveable without provider keys. Leaving Saved audio stops audition rather than leaving hidden audio playing.

The persistent player shows DJ breaks and a separate preparation summary for the selected playback profile. The profile being edited can differ. Identify that difference and explain which profile the News bucket destination currently shows before editing. Preparation does not start playback; enabling DJ breaks never starts generation.

Use the STAR scenarios in [the radio PRD](RADIO_EXPERIENCE.md) for focused verification. Record actual results and limitations in [implementation notes](IMPLEMENTATION.md). Fixture-backed checks do not establish live provider quality or user comprehension. Routine verification does not package, sign, or publish the app.

## Future extensions

These are not working controls or promises in the current flow:

- Weather briefings require a confirmed location, forecast provider and attribution, timezone/DST rules, a morning eligibility window, and expiration. Calendar and reminders require their own consent and data handling.
- Content-change hashes could allow substantial updates at an existing URL to be reconsidered. The current global review ledger excludes a reviewed URL indefinitely, even if its content or interests change.
- A currency budget needs actual provider accounting/pricing. The current guardrails bound checks and recording counts per profile; they are not an account-wide spend cap.
- A general workflow engine is unnecessary for the current bounded TypeScript runner. Reconsider only when branching/recovery requirements justify it.
- Mood-based song selection and continuous free-form hosting are separate product work. The current DJ uses the listener's chosen music queue and finite saved news.

Turning off automatic preparation uses a targeted profile operation, available while a check is running. It changes only that profile's enabled flag and next check time, preserves unsaved setup edits, and requests cancellation. A stop error names the profile and survives navigation until retry or a successful setup save. Cancel this check leaves the schedule enabled; Turn off automatic preparation disables it. Already dispatched provider work may complete.
