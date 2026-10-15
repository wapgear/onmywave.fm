# News bucket workflows

Status: DJ playback consumes saved news. A separate local news workflow prepares recordings on an hourly schedule. Morning weather remains future work.

## News bucket and review history

The bucket is the default view of saved news. It shows actual scheduled or speaking DJ audio separately from recordings eligible for playback and drafts awaiting audio. The DJ-selected profile can differ from the profile open on this page; playback context is shown explicitly. Source articles retain their original HTTP(S) links. The bucket also shows preparation status. Sources, interests, DJ, mood, and the news workflow share one Settings tab, with manual tools collapsed. DJ playback cadence lives only in app Settings → General.

Review history is global across profiles. The preparation service filters canonical article URLs before a paid assessment, reserves only the candidates sent to the model, and records selected and unselected outcomes, including no-selection results. Submitted requests with an unknown outcome stay excluded and are labeled interrupted. A failed source fetch does not mark unseen articles reviewed. A definitive provider rejection releases its candidate reservations so a later attempt can assess them. Unknown outcomes stay excluded to avoid repeating a possibly charged request. Known selected articles from existing scripts and audio seed the ledger; rejected articles from earlier versions cannot be reconstructed.

There is no expiry or automatic re-review for a URL, even if interests change or an article at that URL is updated. Feeds continue supplying new URLs. The current index retains full review metadata; an indexed store can replace it if history size makes rewrites slow.

## Playback

DJ playback uses the existing music queue and saved news pool. Only natural song completions count toward its song interval. At the interval, it claims a matching, fresh, available recording. An empty pool is skipped, with no generation request. A pending take waits for a suitable song ending. Manual take selection remains independent.

The main process serializes claims and records played takes. A take is marked played when speech starts, including an interrupted break. Known pre-playback cancellations release claims. App startup returns abandoned claims to the ready pool. A crash between voice start and persisting its played marker can replay that recording after restart.

Settings → General → DJ playback includes Keep the DJ when seeking or rewinding, enabled by default. Seeking within a song preserves its scheduled break and lets active speech finish. Explicit song changes cancel the old placement; an unplayed automatic take waits for another suitable ending. DJ voice volume defaults to 70% of player volume, independently of the music bed level.

## Independent news preparation

Each room has a separate News preparation switch in Listening Room → Preparation and Settings → Workflows. It defaults off. Enabling authorizes text and voice provider calls while the app process runs and the Mac is awake, even with DJ playback off or music paused. Closing the window can leave the app running; quitting or sleep prevents execution.

Checks run every 1, 3, or 6 hours. The workflow reserves the next slot before generating, coalesces missed intervals into one fresh check, respects the daily recording cap, and bounds source assessments to 24 divided by the hourly interval per day. Source assessments can cost money without producing a recording. Major-only selection rejects minor updates and promotions. Previously prepared article URLs are excluded. No qualifying story creates a saved skipped outcome without speech. Provider failures pause preparation until Resume preparation is selected. A busy manual preparation finishes first. Disabling a room or its producer requests cancellation. An already-started run uses its saved configuration snapshot; edits affect future runs. A completed recording from the old configuration stays saved, counts toward the daily recording cap, and is excluded from automatic playback when it no longer matches.

The producer saves scripts, audio, provenance, and request history in the existing prepared-news library. Playback never starts this producer or changes its cadence. Provider keys belong to Settings; they are unnecessary for playing an existing saved recording.

## Follow-up workflow design

The remaining plan below describes broader scheduling, budget, weather, and recovery work beyond the current bounded local news runner.

## Future timed workflows

The following design is for a future scheduler. Its preferences remain stored for compatibility but are not exposed as active settings. It must not be confused with the working song-based schedule.

## Background execution

Use a durable, bounded TypeScript workflow in Electron's main process initially. A workflow is an explicit sequence of stored steps; it does not need a general autonomous agent. LangGraph is an option if branching, human review, and recovery grow beyond this small pipeline. Avoid adding it solely for an hourly timer.

News pipeline:

1. Claim a due slot with a durable run ID and a configuration snapshot.
2. Read only the selected RSS/Atom feeds. General web search is a future adapter, not an implied capability.
3. Normalize article URLs, group duplicate stories across feeds, compare meaningful content hashes, and reject stale candidates. Keep evaluated stories separate from spoken stories so ignored items are not reassessed every hour. Reassess substantial updates.
4. If no fresh candidates remain, save a successful no-new-stories outcome without an AI call.
5. Assess new candidates for relevance, significance, freshness, and the listener's interests. Major-only should favor material developments over routine updates or promotions. Return a reason and either a specific qualifying article or nothing-important. The AI assessment can incur text-provider cost even when no audio is produced.
6. Persist the decision and exact candidate snapshot before writing. Write a brief factual script from that same snapshot. Do not refetch and accidentally narrate a different article. Treat feed text as untrusted and retain source links and publication dates.
7. Render finite audio using the chosen DJ. Store script, provider/voice settings, source references, decision reason, content timestamp, and validity period with the completed artifact.
8. Publish to ready audio without starting playback or changing the listener's selected take. Unimportant stories create a history outcome, not a filler clip.

Morning pipeline:

1. Claim one run per configured local calendar date and timezone after the chosen morning time.
2. Resolve the saved city to confirmed coordinates and fetch a forecast from a selected weather provider. Store location, observation/forecast time, units, and attribution.
3. Prepare a short start-of-day weather segment using only fresh supplied data. Skip unavailable or stale weather rather than inventing it. Weather does not need to pass the news importance gate.
4. Save a complete artifact for later listening. Do not replay yesterday's greeting or weather after expiration. Calendar and reminder adapters can later add permitted day-ahead context to this pipeline.

## Scheduling, limits, and recovery

Anton chose execution while the app is open. Initial deployment is local: app process running and Mac awake. Closing the macOS window can leave the process running; quitting or sleep prevents local execution. Startup and resume coalesce missed slots into at most one fresh check, never an hourly backlog. A morning brief is eligible only within a defined morning window, not as an evening catch-up. The final morning window and weather validity must be set before activation.

Default planned cadence is every three hours, major updates only, and at most three news audio clips per local day. Morning weather is one additional artifact. Clip caps do not cap text-assessment spend. Before activation, enforce both a maximum assessment count and a provider budget, display their limits, and stop when a limit is reached. Feed/network retries can be bounded; uncertain paid stages are not automatically resubmitted.

Persist run state and request IDs before each paid stage. One run at a time shares the existing preparation lock. Configuration changes affect future runs; a run uses its claimed immutable snapshot. Existing code resolves some mutable state at each manual stage, so the unattended runner needs explicit snapshot-based service methods before activation. Reuse the existing durable audio/request store rather than duplicating media persistence.

A restart can reconcile a completed artifact. Interrupted paid stages require explicit recovery or a new user-approved attempt. Record failed source checks separately from a genuine nothing-important decision. Show last outcome, reason, and next scheduled check only from real runner state. Pausing automation prevents future dispatch and requests cancellation of pending work; already-completed recordings remain available.

## Listening

Preparation and playback are separate. Initial delivery is prepare for review. Saved recordings can be auditioned and explicitly scheduled near track end using the existing player. No speech synthesis runs in the player. An optional later automatic delivery mode needs its own opt-in, an unplayed-ready inbox, freshness checks, and the existing pause/seek/cancel rules. It must not silently replace the manual favorite.

## Future scheduler UI

Use the three-step required setup wizard in Listening Room and keep configuration management in Settings. Show only the current step and preserve drafts during Settings visits. After setup, show a compact summary and the actual preparation tools. Keep saved takes accessible regardless of key or setup readiness. Move static explanations behind a few accessible info buttons; keep required labels, blockers, errors, and word limits visible.

Keep optional future workflow preferences collapsed in Settings and label them Planned, not running. Never show a fake next run, last success, enabled state, or working calendar connection.

## Future implementation stages and acceptance

1. This phase: saved configuration and clear UI; preserve manual artifacts and verify restart persistence, validation, small-window layout, and no provider requests when saving.
2. News runner: separate collect/assess/write, durable run ledger, scheduler/wake handling, limits, pause, statuses, dedupe, no-story outcome, and source failure handling.
3. Morning weather: provider/location resolution, timezone/DST behavior, morning eligibility window, expiry and forecast attribution.
4. Optional delivery and private day context: explicit automatic playback choice, then calendar/reminders after permissions and data handling are designed.

Before calling automation operational, exercise fake-clock runs, duplicate feeds and article updates, no-new/low-importance outcomes, daily limits, offline/partial-source failure, sleep/resume, DST, changed configuration, interruption after each paid step, durable file recovery, and zero provider calls during playback. Verify live text and voice separately with explicitly enabled provider use.

## Example day

At 08:00, save a fresh weather briefing for the configured city. At 09:00, find no important new stories and generate no voice. At 12:00, a qualifying development produces one saved news clip. The listener auditions or schedules that recording later. If the Mac was asleep, do one fresh check after waking; do not replay all missed hours.

## References

- LangGraph workflow concepts: https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph
- Electron power lifecycle: https://www.electronjs.org/docs/latest/api/power-monitor/
